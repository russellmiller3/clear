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

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
