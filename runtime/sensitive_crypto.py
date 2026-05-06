"""
CLEAR RUNTIME — SENSITIVE FIELD ENCRYPTION (AES-256-GCM)

Python port of runtime/sensitive-crypto.js. Helpers for the OWASP Piece 3
`sensitive` field tag. When a Clear data-shape field is tagged `sensitive`,
the Python compile path wires:
  - _encrypt_sensitive(record, sensitive_fields) before every db insert/update
  - _decrypt_sensitive invoked from inside the read coercer

Format: "enc:v1:<iv-base64>:<ciphertext-base64>:<authTag-base64>". v1 uses
AES-256-GCM with a 12-byte IV and 16-byte auth tag. Matches the JS port byte
for byte — a row encrypted by the JS runtime can be decrypted by this Python
module provided both share the same SENSITIVE_KEY env var.

KEY MANAGEMENT:
  Key read from os.environ['SENSITIVE_KEY'] at first use, derived via
  scrypt(SENSITIVE_KEY, salt='clear-sensitive-v1', length=32,
  n=16384, r=8, p=1). Matches Node's crypto.scryptSync defaults so a key
  derived in JS and a key derived here from the same input string come out
  byte-identical.

  If env var is not set:
  - _encrypt_value FAILS CLOSED (raises RuntimeError — refuses to write
    plaintext)
  - _decrypt_value returns '[encrypted - set SENSITIVE_KEY]' placeholder
    so an operator hitting the app sees a clear signal rather than a crash

Operators set SENSITIVE_KEY to a 32+ char random string. A future cycle
will add explicit key rotation; today it's single-key.
"""

import base64
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

VERSION = "v1"
IV_BYTES = 12
AUTH_TAG_BYTES = 16
SCRYPT_SALT = b"clear-sensitive-v1"  # not secret — domain separator
SCRYPT_KEY_BYTES = 32
SCRYPT_N = 16384  # matches Node crypto.scryptSync default
SCRYPT_R = 8
SCRYPT_P = 1
PREFIX = "enc:" + VERSION + ":"

_cached_key = None


def _derive_key():
    global _cached_key
    if _cached_key is not None:
        return _cached_key
    raw = os.environ.get("SENSITIVE_KEY")
    if not raw:
        return None  # caller decides how to handle missing key
    if len(raw) < 16:
        raise ValueError(
            "SENSITIVE_KEY must be at least 16 characters "
            "(recommended: 32+ random chars)"
        )
    kdf = Scrypt(
        salt=SCRYPT_SALT,
        length=SCRYPT_KEY_BYTES,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
    )
    _cached_key = kdf.derive(raw.encode("utf-8"))
    return _cached_key


def _encrypt_value(value):
    """Encrypt one value. Returns the v1-prefixed string. Pass-through for
    None and non-strings (so number/boolean fields don't get double-encoded).
    Already-encrypted values pass through unchanged so updates don't
    double-encrypt."""
    if value is None:
        return value
    if not isinstance(value, str):
        return value
    if value.startswith(PREFIX):
        return value
    key = _derive_key()
    if key is None:
        raise RuntimeError(
            "Cannot save sensitive field: SENSITIVE_KEY env var is not set. "
            "Sensitive fields refuse to write plaintext to disk."
        )
    iv = secrets.token_bytes(IV_BYTES)
    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext+tag concatenated (last 16 bytes are
    # the auth tag). Split them so the on-disk format matches the JS port.
    ct_with_tag = aesgcm.encrypt(iv, value.encode("utf-8"), None)
    ct = ct_with_tag[:-AUTH_TAG_BYTES]
    tag = ct_with_tag[-AUTH_TAG_BYTES:]
    return PREFIX + (
        base64.b64encode(iv).decode("ascii")
        + ":"
        + base64.b64encode(ct).decode("ascii")
        + ":"
        + base64.b64encode(tag).decode("ascii")
    )


def _decrypt_value(value):
    """Decrypt one value. Pass-through for non-strings or strings without
    the encryption prefix."""
    if not isinstance(value, str):
        return value
    if not value.startswith(PREFIX):
        return value
    key = _derive_key()
    if key is None:
        return "[encrypted - set SENSITIVE_KEY]"
    try:
        parts = value[len(PREFIX):].split(":")
        if len(parts) != 3:
            return "[encrypted - malformed]"
        iv = base64.b64decode(parts[0])
        ct = base64.b64decode(parts[1])
        tag = base64.b64decode(parts[2])
        if len(iv) != IV_BYTES or len(tag) != AUTH_TAG_BYTES:
            return "[encrypted - malformed]"
        aesgcm = AESGCM(key)
        # Re-concatenate ciphertext + tag because that's what AESGCM.decrypt
        # expects, even though the on-disk format keeps them separate.
        pt = aesgcm.decrypt(iv, ct + tag, None)
        return pt.decode("utf-8")
    except Exception:
        # Auth tag mismatch (tampered) or wrong key — return placeholder
        # rather than raising so a single bad row doesn't 500 the response.
        return "[encrypted - wrong key or tampered]"


def _encrypt_sensitive(record, sensitive_fields):
    """Encrypt every field in `sensitive_fields` on a record. Returns a copy;
    leaves the input untouched. Called from the compiler-emitted insert /
    update path."""
    if not record or not sensitive_fields:
        return record
    out = dict(record)
    for field in sensitive_fields:
        if field in out:
            out[field] = _encrypt_value(out[field])
    return out


def _decrypt_sensitive(record, sensitive_fields):
    """Decrypt every field in `sensitive_fields` on a record. Returns a copy."""
    if not record or not sensitive_fields:
        return record
    out = dict(record)
    for field in sensitive_fields:
        if field in out:
            out[field] = _decrypt_value(out[field])
    return out


def _reset_cached_key():
    """Test helper. Forces re-derivation on next call. Used by unit tests
    that flip SENSITIVE_KEY between cases."""
    global _cached_key
    _cached_key = None
