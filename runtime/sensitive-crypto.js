// =============================================================================
// CLEAR RUNTIME — SENSITIVE FIELD ENCRYPTION (AES-256-GCM)
// =============================================================================
//
// Helpers for the OWASP Piece 3 `sensitive` field tag. When a Clear data-shape
// field is tagged `sensitive`, the compiler wires:
//   - `_encryptSensitive(record, table)` before every db.insert / db.update
//   - `_decryptSensitive` invoked from inside `_revive` after every read
//
// Format: `enc:v1:<iv-base64>:<ciphertext-base64>:<authTag-base64>`. v1
// uses AES-256-GCM with a 12-byte IV and 16-byte auth tag (the Node default).
// The version prefix lets us migrate keys / algorithms later without
// breaking existing rows.
//
// KEY MANAGEMENT:
//   The key is read from `process.env.SENSITIVE_KEY` at first use, derived
//   via `crypto.scryptSync(SENSITIVE_KEY, 'clear-sensitive-v1', 32)`. If the
//   env var is not set, the helpers FAIL CLOSED at write time (refuse to
//   insert) and decrypt to `'[encrypted — set SENSITIVE_KEY]'` placeholder
//   on read so an operator hitting the app sees a clear signal that the
//   key is missing rather than silently storing plaintext.
//
//   Operators set `SENSITIVE_KEY` to a 32+ char random string. A future
//   cycle will add explicit key rotation; today it's single-key.
//
// =============================================================================

'use strict';

const crypto = require('crypto');

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const SCRYPT_SALT = 'clear-sensitive-v1'; // not secret — domain separator
const SCRYPT_KEY_BYTES = 32;
const PREFIX = 'enc:' + VERSION + ':';

let _cachedKey = null;

function _deriveKey() {
  if (_cachedKey) return _cachedKey;
  const raw = process.env.SENSITIVE_KEY;
  if (!raw) return null; // caller decides how to handle missing key
  if (raw.length < 16) {
    throw new Error('SENSITIVE_KEY must be at least 16 characters (recommended: 32+ random chars)');
  }
  _cachedKey = crypto.scryptSync(raw, SCRYPT_SALT, SCRYPT_KEY_BYTES);
  return _cachedKey;
}

// Encrypt one value. Returns the v1-prefixed string. Pass-through for
// null/undefined (so optional fields don't get encrypted-undefined). Pass-
// through for non-strings (so number/boolean/etc. types don't get
// double-encoded). The compiler only registers TEXT fields as sensitive,
// so this should rarely fire on non-strings — but the guard is cheap.
function _encryptValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  // Already encrypted? Don't double-encrypt on update.
  if (value.startsWith(PREFIX)) return value;
  const key = _deriveKey();
  if (!key) {
    // Fail closed: refuse to write plaintext to disk when the operator
    // hasn't set the key. Better to error loudly at insert time than to
    // silently leak.
    throw new Error('Cannot save sensitive field: SENSITIVE_KEY env var is not set. Sensitive fields refuse to write plaintext to disk.');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString('base64') + ':' + ct.toString('base64') + ':' + tag.toString('base64');
}

function _decryptValue(value) {
  if (typeof value !== 'string') return value;
  if (!value.startsWith(PREFIX)) return value; // not an encrypted blob, leave alone
  const key = _deriveKey();
  if (!key) {
    // Don't crash on read — show a placeholder so operators notice.
    return '[encrypted — set SENSITIVE_KEY]';
  }
  try {
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return '[encrypted — malformed]';
    const iv = Buffer.from(parts[0], 'base64');
    const ct = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) return '[encrypted — malformed]';
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (_e) {
    // Auth tag mismatch (tampered data) or wrong key — return placeholder
    // rather than throwing so a single bad row doesn't 500 the response.
    return '[encrypted — wrong key or tampered]';
  }
}

// Encrypt every field listed in `sensitiveFields` on a record (mutates the
// returned copy, leaves the input untouched). Called from the compiler-
// emitted insert / update path.
function _encryptSensitive(record, sensitiveFields) {
  if (!record || !Array.isArray(sensitiveFields) || sensitiveFields.length === 0) return record;
  const out = Object.assign({}, record);
  for (const field of sensitiveFields) {
    if (field in out) out[field] = _encryptValue(out[field]);
  }
  return out;
}

// Decrypt every field listed in `sensitiveFields` on a record.
function _decryptSensitive(record, sensitiveFields) {
  if (!record || !Array.isArray(sensitiveFields) || sensitiveFields.length === 0) return record;
  const out = Object.assign({}, record);
  for (const field of sensitiveFields) {
    if (field in out) out[field] = _decryptValue(out[field]);
  }
  return out;
}

module.exports = {
  _encryptValue,
  _decryptValue,
  _encryptSensitive,
  _decryptSensitive,
  PREFIX,
  VERSION,
};
