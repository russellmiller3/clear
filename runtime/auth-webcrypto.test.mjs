// runtime/auth-webcrypto.test.mjs
// Phase 3 cycles 3.5–3.6 — password hashing + verification via Web Crypto.
//
// The Workers runtime has no bcryptjs (native module), no crypto.pbkdf2Sync
// (Node-only), no crypto.timingSafeEqual. It DOES have globalThis.crypto.subtle
// — the same PBKDF2 implementation browsers expose. Node 20+ ships
// globalThis.crypto.subtle natively, so these tests run in pure Node with
// the exact same API surface that Workers provides at runtime.
//
// Hash format: `v1:<salt-hex>:<hash-hex>`.
//   - v1 = PBKDF2-SHA-256, 600000 iterations, 128-bit salt, 256-bit hash.
//   - The version prefix is the cheap insurance that lets us upgrade to
//     Argon2 / stronger PBKDF2 params without breaking stored passwords —
//     verifyPassword branches on the prefix.
//
// OWASP 2024 recommendation for PBKDF2-SHA-256: ≥600,000 iterations.

import { describe, it, expect, testAsync } from '../lib/testUtils.js';
import { hashPassword, verifyPassword, _bytesToHex, _hexToBytes, PBKDF2_ITERATIONS } from './auth-webcrypto.mjs';

// ─────────────────────────────────────────────────────────────────────────
// Cycle 3.5 — hashPassword
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3 cycle 3.5 — hashPassword via Web Crypto PBKDF2', () => {
	testAsync('returns a versioned v1 string', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(typeof hash).toBe('string');
		expect(hash.startsWith('v1:')).toBe(true);
	});

	testAsync('format is v1:<salt-hex>:<hash-hex>', async () => {
		const hash = await hashPassword('hunter2');
		const parts = hash.split(':');
		expect(parts.length).toBe(3);
		expect(parts[0]).toBe('v1');
		// Salt: 128 bits = 16 bytes = 32 hex chars
		expect(parts[1].length).toBe(32);
		expect(/^[0-9a-f]+$/.test(parts[1])).toBe(true);
		// Hash: 256 bits = 32 bytes = 64 hex chars
		expect(parts[2].length).toBe(64);
		expect(/^[0-9a-f]+$/.test(parts[2])).toBe(true);
	});

	testAsync('produces different hashes for the same password (random salt)', async () => {
		const a = await hashPassword('same-password');
		const b = await hashPassword('same-password');
		expect(a).not.toEqual(b);
	});

	testAsync('uses at least 600000 PBKDF2 iterations (OWASP 2024)', async () => {
		// The exported constant IS the source of truth. If a future refactor
		// silently drops it, this test goes red.
		// testUtils.expect has toBeGreaterThan but no *OrEqual — use 599999
		// as the "floor-minus-one" so the assertion matches the OWASP floor
		// of 600000 exactly.
		expect(PBKDF2_ITERATIONS).toBeGreaterThan(599999);
	});

	testAsync('empty password is rejected (defensive guard)', async () => {
		try {
			await hashPassword('');
			throw new Error('expected hashPassword to reject empty string');
		} catch (err) {
			expect(String(err.message)).toContain('password');
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 3.6 — verifyPassword + constant-time compare
// ─────────────────────────────────────────────────────────────────────────
//
// verifyPassword parses the stored `<version>:<salt>:<hash>` form, runs the
// same PBKDF2 derivation over the provided plaintext, and compares the
// two digests constant-time (XOR-sum). Workers has no crypto.timingSafeEqual
// so the manual compare is the only option that ships.
//
// Version-awareness: unknown prefixes fail closed so an attacker can't
// downgrade by supplying a fake `v0:…` string. Future `v2:…` support is
// additive — adds a branch, preserves v1 verification.

describe('Phase 3 cycle 3.6 — verifyPassword is constant-time + version-aware', () => {
	testAsync('verifies the password that was just hashed', async () => {
		const plain = 'open sesame';
		const stored = await hashPassword(plain);
		const ok = await verifyPassword(plain, stored);
		expect(ok).toBe(true);
	});

	testAsync('rejects the wrong password', async () => {
		const stored = await hashPassword('the real one');
		const ok = await verifyPassword('NOT the real one', stored);
		expect(ok).toBe(false);
	});

	testAsync('rejects an empty / malformed stored value', async () => {
		expect(await verifyPassword('whatever', '')).toBe(false);
		expect(await verifyPassword('whatever', 'no-version')).toBe(false);
		expect(await verifyPassword('whatever', 'v1:nothashanything')).toBe(false);
	});

	testAsync('rejects a stored value with an unknown version prefix', async () => {
		const ok = await verifyPassword('x', 'v99:ab:cd');
		expect(ok).toBe(false);
	});

	testAsync('hex helpers round-trip', () => {
		const bytes = new Uint8Array([0, 1, 2, 3, 255, 170]);
		const hex = _bytesToHex(bytes);
		expect(hex).toBe('00010203ffaa');
		const roundTripped = _hexToBytes(hex);
		expect(Array.from(roundTripped)).toEqual([0, 1, 2, 3, 255, 170]);
	});
});
