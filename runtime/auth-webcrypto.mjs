// =============================================================================
// CLEAR RUNTIME — AUTH (Web Crypto variant for Cloudflare Workers)
// =============================================================================
//
// PURPOSE: Password hashing + verification for Clear apps running on the
// Cloudflare Workers runtime. Workers has NO bcryptjs (native module) and
// NO Node crypto.pbkdf2Sync — only globalThis.crypto.subtle, the same
// PBKDF2 implementation browsers expose.
//
// This module mirrors the shape of runtime/auth.js (hashPassword, checkPassword/
// verifyPassword) but replaces every Node-ism with a Web Crypto call:
//
//   Node auth.js                    │ Workers auth-webcrypto.mjs
//   ───────────                     │ ──────────────────────────
//   crypto.randomBytes(16)          │ crypto.getRandomValues(new Uint8Array(16))
//   crypto.pbkdf2Sync(...)          │ await crypto.subtle.deriveBits(...)
//   crypto.timingSafeEqual(a, b)    │ manual XOR-sum constant-time compare
//
// Hash format: `v1:<salt-hex>:<hash-hex>`
//   v1 = PBKDF2-SHA-256, 600000 iterations, 128-bit random salt, 256-bit hash.
// The version prefix is the forward-compat hook — when a future Cloudflare
// feature unlocks Argon2 (or when compute gets cheap enough to justify
// PBKDF2 1M+ iterations), we add a `v2:` branch to verifyPassword and the
// old v1 rows keep working. No breaking migration.
//
// OWASP 2024 PBKDF2-SHA-256 recommendation: ≥600,000 iterations.
// Reference: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

// ─── Parameters (single source of truth) ───────────────────────────────────
// Change THESE numbers to retune. The constants flow through to every call,
// so a bump here lands everywhere without edits.
export const PBKDF2_ITERATIONS = 600000;  // OWASP 2024 floor
export const SALT_BYTES = 16;             // 128-bit salt
export const HASH_BITS = 256;             // 256-bit output hash (SHA-256 block size)
export const HASH_VERSION = 'v1';         // bump when changing algorithm

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Hash a password for storage. Returns a versioned string that
 * verifyPassword can later parse.
 *
 * @param {string} plain  The plaintext password.
 * @returns {Promise<string>}  Versioned hash in `v1:<salt-hex>:<hash-hex>` form.
 */
export async function hashPassword(plain) {
	if (typeof plain !== 'string' || plain.length === 0) {
		throw new Error('hashPassword: password must be a non-empty string');
	}
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hashBytes = await _pbkdf2(plain, salt, PBKDF2_ITERATIONS, HASH_BITS);
	return `${HASH_VERSION}:${_bytesToHex(salt)}:${_bytesToHex(hashBytes)}`;
}

/**
 * Verify a password against a stored hash. Constant-time comparison of the
 * final digest so timing attacks can't peel off the hash byte-by-byte.
 *
 * @param {string} plain   Plaintext password the user typed.
 * @param {string} stored  Versioned hash string produced by hashPassword.
 * @returns {Promise<boolean>}  true when the password matches, false otherwise.
 */
export async function verifyPassword(plain, stored) {
	if (typeof plain !== 'string' || typeof stored !== 'string') return false;

	// Parse: `<version>:<salt-hex>:<hash-hex>`
	const parts = stored.split(':');
	if (parts.length !== 3) return false;
	const [version, saltHex, hashHex] = parts;

	if (version !== HASH_VERSION) {
		// Future versions branch here. v2 could be a different iteration count,
		// Argon2, or a different hash function. Unknown version -> fail closed.
		return false;
	}

	// v1 specifics: 32 hex (16 bytes) salt, 64 hex (32 bytes) hash.
	if (saltHex.length !== SALT_BYTES * 2) return false;
	if (hashHex.length !== HASH_BITS / 4) return false;
	if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;

	const salt = _hexToBytes(saltHex);
	const storedBytes = _hexToBytes(hashHex);
	const computedBytes = await _pbkdf2(plain, salt, PBKDF2_ITERATIONS, HASH_BITS);

	return _ctEqualBytes(storedBytes, computedBytes);
}

// ─── Internals ─────────────────────────────────────────────────────────────

// Run PBKDF2 via the Web Crypto API. Returns the derived bits as a Uint8Array.
async function _pbkdf2(plain, salt, iterations, bits) {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		enc.encode(plain),
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);
	const derived = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
		keyMaterial,
		bits
	);
	return new Uint8Array(derived);
}

// Constant-time byte-array compare. Workers has no crypto.timingSafeEqual,
// so we roll the classic XOR-sum. Return once after examining every index.
export function _ctEqualBytes(a, b) {
	if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

// Hex helpers. Exported with underscore prefix so external callers know
// they're internals — but exported for unit-test coverage of round-tripping.
export function _bytesToHex(bytes) {
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i];
		hex += (b < 16 ? '0' : '') + b.toString(16);
	}
	return hex;
}

export function _hexToBytes(hex) {
	if (hex.length % 2 !== 0) throw new Error('_hexToBytes: odd-length hex string');
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.substr(i * 2, 2), 16);
	}
	return out;
}
