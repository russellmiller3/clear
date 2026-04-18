// playground/ai-proxy/auth.js
// HS256 JWT verify using only Node's built-in crypto. We don't pull in a
// jsonwebtoken dep because the proxy's build is tiny and every npm package
// we ship is another thing to audit. Signatures are compared constant-time.

import { createHmac, timingSafeEqual } from 'crypto';

function b64urlDecode(s) {
	s = s.replace(/-/g, '+').replace(/_/g, '/');
	while (s.length % 4) s += '=';
	return Buffer.from(s, 'base64');
}

export function verifyTenantJwt(token, secret) {
	if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
	const parts = token.split('.');
	if (parts.length !== 3) return { ok: false, reason: 'malformed' };
	const [h, p, s] = parts;

	let header;
	try { header = JSON.parse(b64urlDecode(h).toString('utf8')); }
	catch { return { ok: false, reason: 'bad header' }; }
	if (header.alg !== 'HS256') return { ok: false, reason: 'unsupported alg' };

	const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
	const actual = b64urlDecode(s);
	if (expected.length !== actual.length) return { ok: false, reason: 'bad signature' };
	if (!timingSafeEqual(expected, actual)) return { ok: false, reason: 'bad signature' };

	let payload;
	try { payload = JSON.parse(b64urlDecode(p).toString('utf8')); }
	catch { return { ok: false, reason: 'bad payload' }; }

	const now = Math.floor(Date.now() / 1000);
	if (payload.exp && now > payload.exp) return { ok: false, reason: 'expired' };
	if (!payload.sub) return { ok: false, reason: 'missing sub' };
	return { ok: true, payload };
}

export function signTenantJwt(tenantSlug, secret, expSeconds = 90 * 24 * 3600) {
	const header = { alg: 'HS256', typ: 'JWT' };
	const now = Math.floor(Date.now() / 1000);
	const payload = { sub: tenantSlug, iat: now, exp: now + expSeconds };
	const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
	const h = enc(header);
	const p = enc(payload);
	const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
	return `${h}.${p}.${sig}`;
}
