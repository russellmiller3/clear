// Tests for mintEvalAuthToken — the helper that lets the eval runner
// probe auth-walled endpoints without hitting the 401 wall.
//
// The compiled apps the eval runner tests use `jsonwebtoken` (HS256 JWT)
// with `JWT_SECRET` from env, NOT the runtime/auth.js HMAC format. So the
// helper must emit a standard RFC 7519 JWT signed with EVAL_JWT_SECRET,
// which the parent injects as the child's JWT_SECRET at spawn.
//
// Standard JWT shape: header.payload.signature (3 dot-separated base64url
// parts). header = {alg:"HS256",typ:"JWT"}. signature = HMAC-SHA256 of
// `header.payload` with the secret.

import crypto from 'crypto';
import { mintEvalAuthToken, EVAL_JWT_SECRET, EVAL_USER } from './eval-auth.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}

console.log('\n🔑 eval-auth — constants');
{
  assert(typeof EVAL_JWT_SECRET === 'string', 'EVAL_JWT_SECRET is a string');
  assert(EVAL_JWT_SECRET.length >= 16, 'EVAL_JWT_SECRET is at least 16 chars (brute-force resistance)');
  assert(EVAL_USER && typeof EVAL_USER.id === 'string', 'EVAL_USER has an id');
  assert(EVAL_USER.email && EVAL_USER.email.includes('@'), 'EVAL_USER has a valid-looking email');
}

console.log('\n🔑 eval-auth — mintEvalAuthToken default user');
{
  const token = mintEvalAuthToken();
  assert(typeof token === 'string', 'returns a string');
  const parts = token.split('.');
  assert(parts.length === 3, 'token has header.payload.signature shape (3 parts — RFC 7519)');

  const [headerB64, payloadB64, signature] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  assert(header.alg === 'HS256', 'header.alg is HS256');
  assert(header.typ === 'JWT', 'header.typ is JWT');

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  assert(payload.id === EVAL_USER.id, 'default user id matches EVAL_USER.id');
  assert(payload.email === EVAL_USER.email, 'default email matches EVAL_USER.email');
  assert(payload.role === 'user', 'default role is "user"');
  // jsonwebtoken uses SECONDS since epoch for iat/exp, not milliseconds.
  const nowSec = Math.floor(Date.now() / 1000);
  assert(typeof payload.iat === 'number' && Math.abs(payload.iat - nowSec) < 5, 'iat is seconds-since-epoch near now');
  assert(typeof payload.exp === 'number' && payload.exp > nowSec, 'exp is in the future (seconds)');

  // Signature proves jsonwebtoken.verify in the child (loaded with
  // JWT_SECRET=EVAL_JWT_SECRET) will accept this token.
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(signingInput).digest('base64url');
  assert(signature === expected, 'signature is HMAC-SHA256 of header.payload with EVAL_JWT_SECRET');
}

console.log('\n🔑 eval-auth — mintEvalAuthToken custom user');
{
  const token = mintEvalAuthToken({ id: 'admin-42', email: 'admin@test.local', role: 'admin' });
  const [, payloadB64] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  assert(payload.id === 'admin-42', 'custom user id threaded through');
  assert(payload.email === 'admin@test.local', 'custom email threaded through');
  assert(payload.role === 'admin', 'custom role threaded through');
}

console.log('\n🔑 eval-auth — mintLegacyEvalAuthToken (runtime/auth.js format)');
{
  // The legacy format used by blog-api, lead-scorer, page-analyzer and any
  // other template that compiles `require('./clear-runtime/auth')`. Token
  // shape: base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret)).
  // Two parts, not three — runtime/auth.js verifyToken splits on '.' and
  // rejects anything that isn't exactly [payload, signature].
  const { mintLegacyEvalAuthToken } = await import('./eval-auth.js');
  const token = mintLegacyEvalAuthToken();
  assert(typeof token === 'string', 'returns a string');
  const parts = token.split('.');
  assert(parts.length === 2, 'legacy token has payload.signature shape (2 parts)');
  const [payloadB64, signature] = parts;
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  assert(payload.id === EVAL_USER.id, 'payload has EVAL_USER.id');
  // runtime/auth.js uses MILLISECONDS for exp (not seconds like jsonwebtoken).
  assert(typeof payload.exp === 'number' && payload.exp > Date.now(), 'exp is in the future (ms)');
  const expected = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(payloadB64).digest('base64url');
  assert(signature === expected, 'signature is HMAC-SHA256 of payload (no header) with EVAL_JWT_SECRET');
}

console.log('\n🔑 eval-auth — tampered payload cannot reuse signature');
{
  const token = mintEvalAuthToken();
  const [headerB64, payloadB64, signature] = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ id: 'attacker', role: 'admin', iat: 1, exp: 9e12 })).toString('base64url');
  const tamperedSigningInput = `${headerB64}.${tamperedPayload}`;
  const tamperedSig = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(tamperedSigningInput).digest('base64url');
  assert(tamperedSig !== signature, 'attacker cannot reuse the original signature with a tampered payload');
  const originalSigningInput = `${headerB64}.${payloadB64}`;
  const originalSig = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(originalSigningInput).digest('base64url');
  assert(originalSig === signature, 'original payload signature still verifies (control)');
}

// Session 44 Track 2: verifyLegacyEvalAuthToken closes the Phase A Security
// TODO — the Studio-side liveEditAuth used to parse Bearer JWT payloads
// WITHOUT verifying the HMAC signature. Anyone who knew the payload shape
// could forge an owner session. Wiring this verify path prevents that;
// plus the assertions below lock the contract (valid, tampered, expired,
// malformed) so no future refactor silently drops the signature check.
console.log('\n🔑 eval-auth — verifyLegacyEvalAuthToken (live-edit owner gate)');
{
  const { mintLegacyEvalAuthToken, verifyLegacyEvalAuthToken } = await import('./eval-auth.js');

  // Happy path: valid token round-trips to its payload.
  const goodToken = mintLegacyEvalAuthToken();
  const verified = verifyLegacyEvalAuthToken(goodToken);
  assert(verified && verified.id === EVAL_USER.id,
    `valid token verifies and returns payload (got ${verified ? 'id=' + verified.id : 'null'})`);
  assert(verified && typeof verified.exp === 'number' && verified.exp > Date.now(),
    'verified payload carries future ms-expiry');

  // Tampered payload: signature doesn't match → reject.
  const [, signature] = goodToken.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({
    id: 'attacker', role: 'owner', exp: Date.now() + 3600e3,
  })).toString('base64url');
  const tamperedToken = tamperedPayload + '.' + signature;
  assert(verifyLegacyEvalAuthToken(tamperedToken) === null,
    'tampered payload rejected (attacker cannot reuse signature to elevate to role=owner)');

  // Forged signature: attacker signs with the wrong secret.
  const [payloadB64] = goodToken.split('.');
  const forgedSig = crypto.createHmac('sha256', 'wrong-secret').update(payloadB64).digest('base64url');
  const forgedToken = payloadB64 + '.' + forgedSig;
  assert(verifyLegacyEvalAuthToken(forgedToken) === null,
    'forged signature rejected (attacker without secret cannot mint a valid token)');

  // Expired token: valid signature but payload.exp in the past → reject.
  const expiredPayload = { id: EVAL_USER.id, role: 'owner', exp: Date.now() - 1000 };
  const expiredB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const expiredSig = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(expiredB64).digest('base64url');
  const expiredToken = expiredB64 + '.' + expiredSig;
  assert(verifyLegacyEvalAuthToken(expiredToken) === null,
    'expired token rejected even with a valid signature');

  // Malformed inputs: null, empty, one-part, three-part, non-string.
  assert(verifyLegacyEvalAuthToken(null) === null, 'null token rejected');
  assert(verifyLegacyEvalAuthToken('') === null, 'empty-string token rejected');
  assert(verifyLegacyEvalAuthToken('one-part') === null, '1-part token rejected');
  assert(verifyLegacyEvalAuthToken('h.p.s') === null, '3-part token rejected (this verifier handles 2-part only)');
  assert(verifyLegacyEvalAuthToken(12345) === null, 'non-string token rejected');

  // Garbage in payload (valid signature over non-JSON) → reject.
  const garbageB64 = Buffer.from('not-json').toString('base64url');
  const garbageSig = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(garbageB64).digest('base64url');
  const garbageToken = garbageB64 + '.' + garbageSig;
  assert(verifyLegacyEvalAuthToken(garbageToken) === null,
    'token with signed non-JSON payload rejected');
}

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
