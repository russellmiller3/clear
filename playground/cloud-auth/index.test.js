// =============================================================================
// CC-2a — Clear Cloud auth tests
// =============================================================================
// Tests for signup/login/session/reset flows against a mock pg-compatible
// DB (in-memory rows + a simple query matcher). Real Postgres tests come
// after Phase 85a.
//
// Run: node playground/cloud-auth/index.test.js
// =============================================================================

import {
  hashPassword, verifyPassword,
  generateSessionToken, hashSessionToken, normalizeEmail,
  signupUser, loginUser, validateSession, revokeSession, logoutAllSessions,
  issueEmailVerifyToken, verifyEmailToken,
  issuePasswordResetToken, resetPassword,
  loadMigration001,
} from './index.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MockDb: minimum pg-compatible surface for our helpers
// Stores users + sessions as JS arrays; matches on the exact SQL strings
// our helpers emit. Brittle but tight — any helper SQL change breaks
// tests loudly, which is the right failure mode for a scaffold.
// ─────────────────────────────────────────────────────────────────────────────
function makeMockDb() {
  const users = [];
  const sessions = [];
  let nextUserId = 1;
  let nextSessionId = 1;
  return {
    users, sessions,
    async query(text, params = []) {
      const t = text.replace(/\s+/g, ' ').trim();

      if (t.startsWith('INSERT INTO users')) {
        const [email, password_hash, name, email_verify_token] = params;
        // Simulate unique_violation
        if (users.find(u => u.email === email)) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        const row = {
          id: nextUserId++, email, password_hash, name,
          status: 'active', role: 'member',
          email_verified_at: null, email_verify_token,
          password_reset_token: null, password_reset_expires_at: null,
          last_login_at: null,
          created_at: new Date(), updated_at: new Date(),
        };
        users.push(row);
        return { rows: [{ id: row.id, email, name, status: row.status, role: row.role, email_verified_at: null, email_verify_token, created_at: row.created_at }] };
      }

      if (t.includes('SELECT id, email, password_hash, name, status, role, email_verified_at') && t.includes('FROM users WHERE email')) {
        const [email] = params;
        const u = users.find(x => x.email === email);
        if (!u) return { rows: [] };
        return { rows: [{ id: u.id, email: u.email, password_hash: u.password_hash, name: u.name, status: u.status, role: u.role, email_verified_at: u.email_verified_at }] };
      }

      if (t.startsWith('INSERT INTO sessions')) {
        const [user_id, token_hash, ip_address, user_agent, expires_at] = params;
        sessions.push({
          id: nextSessionId++, user_id, token_hash, ip_address, user_agent,
          last_seen_at: new Date(),
          expires_at: new Date(expires_at),
          revoked_at: null,
          created_at: new Date(),
        });
        return { rows: [], rowCount: 1 };
      }

      if (t.startsWith('UPDATE users SET last_login_at')) {
        const [id] = params;
        const u = users.find(x => x.id === id);
        if (u) u.last_login_at = new Date();
        return { rows: [], rowCount: u ? 1 : 0 };
      }

      if (t.includes('SELECT s.id AS session_id') && t.includes('FROM sessions s JOIN users u')) {
        const [tokenHash] = params;
        const s = sessions.find(x => x.token_hash === tokenHash);
        if (!s) return { rows: [] };
        const u = users.find(x => x.id === s.user_id);
        if (!u) return { rows: [] };
        return { rows: [{
          session_id: s.id, last_seen_at: s.last_seen_at, expires_at: s.expires_at, revoked_at: s.revoked_at,
          id: u.id, email: u.email, name: u.name, status: u.status, role: u.role, email_verified_at: u.email_verified_at,
        }] };
      }

      if (t.startsWith('UPDATE sessions SET last_seen_at')) {
        const [id] = params;
        const s = sessions.find(x => x.id === id);
        if (s) s.last_seen_at = new Date();
        return { rows: [], rowCount: s ? 1 : 0 };
      }

      if (t.startsWith('UPDATE sessions SET revoked_at') && t.includes('WHERE token_hash')) {
        const [tokenHash] = params;
        const s = sessions.find(x => x.token_hash === tokenHash && !x.revoked_at);
        if (s) s.revoked_at = new Date();
        return { rows: [], rowCount: s ? 1 : 0 };
      }

      if (t.startsWith('UPDATE sessions SET revoked_at') && t.includes('WHERE user_id')) {
        const [userId] = params;
        let count = 0;
        for (const s of sessions) {
          if (s.user_id === userId && !s.revoked_at) {
            s.revoked_at = new Date();
            count++;
          }
        }
        return { rows: [], rowCount: count };
      }

      if (t.startsWith('UPDATE users SET email_verify_token')) {
        const [token, id] = params;
        const u = users.find(x => x.id === id);
        if (u) u.email_verify_token = token;
        return { rows: [], rowCount: u ? 1 : 0 };
      }

      if (t.includes('UPDATE users SET email_verified_at = NOW(), email_verify_token = NULL')) {
        const [token] = params;
        const u = users.find(x => x.email_verify_token === token);
        if (!u) return { rows: [], rowCount: 0 };
        u.email_verified_at = new Date();
        u.email_verify_token = null;
        return { rows: [{ id: u.id }], rowCount: 1 };
      }

      if (t.includes('UPDATE users') && t.includes('password_reset_token = $1')) {
        const [token, expiresAt, email] = params;
        const u = users.find(x => x.email === email && x.status === 'active');
        if (!u) return { rows: [], rowCount: 0 };
        u.password_reset_token = token;
        u.password_reset_expires_at = new Date(expiresAt);
        return { rows: [{ id: u.id }], rowCount: 1 };
      }

      if (t.includes('SET password_hash = $1') && t.includes('password_reset_token = $2')) {
        const [newHash, token] = params;
        const u = users.find(x => x.password_reset_token === token &&
                                  x.password_reset_expires_at &&
                                  x.password_reset_expires_at > new Date() &&
                                  x.status === 'active');
        if (!u) return { rows: [], rowCount: 0 };
        u.password_hash = newHash;
        u.password_reset_token = null;
        u.password_reset_expires_at = null;
        return { rows: [{ id: u.id }], rowCount: 1 };
      }

      throw new Error(`MockDb: unhandled query — ${t.slice(0, 100)}`);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🔑 Password hashing (bcryptjs)\n');
// ─────────────────────────────────────────────────────────────────────────────

{
  let bcryptAvailable = true;
  try {
    await hashPassword('testpassword');
  } catch (err) {
    if (err.message.includes('bcryptjs')) {
      bcryptAvailable = false;
      assert(err.message.includes('npm install'),
        'missing bcryptjs error names the install command');
      console.log('  (skipping bcrypt-dependent tests — install bcryptjs to run them)\n');
    } else {
      throw err;
    }
  }
  if (bcryptAvailable) {
    const hash = await hashPassword('correct-horse-battery-staple');
    assert(hash.startsWith('$2'), `hash starts with bcrypt prefix (got ${hash.slice(0, 5)}…)`);
    assert(hash.length >= 50, `hash is long enough (got ${hash.length} chars)`);
    assert(await verifyPassword('correct-horse-battery-staple', hash) === true,
      'verifyPassword returns true for correct password');
    assert(await verifyPassword('wrong-password', hash) === false,
      'verifyPassword returns false for wrong password');

    let threw;
    try { await hashPassword('short'); } catch (e) { threw = e.message; }
    assert(threw && threw.includes('at least 8'),
      'hashPassword rejects too-short passwords');
  }
}

console.log('\n🎲 Session tokens\n');

{
  const a = generateSessionToken();
  const b = generateSessionToken();
  assert(typeof a === 'string' && a.length === 64, `token is 64-char hex (got ${a.length})`);
  assert(a !== b, 'tokens are unique per call');
  assert(hashSessionToken(a) !== a, 'hashSessionToken is not identity');
  assert(hashSessionToken(a) === hashSessionToken(a), 'hashSessionToken is deterministic');
  assert(hashSessionToken(a).length === 64, 'hashSessionToken returns 64-char hex (SHA-256)');
}

console.log('\n📧 normalizeEmail\n');

assert(normalizeEmail('  Marcus@Example.COM ') === 'marcus@example.com',
  'lowercases + trims email');
assert(normalizeEmail(null) === '', 'null email → empty string');
assert(normalizeEmail(42) === '', 'non-string email → empty string');

console.log('\n📝 Migration loader\n');

{
  const sql = loadMigration001();
  assert(sql.length > 500, `migration SQL loads (${sql.length} bytes)`);
  assert(sql.toLowerCase().includes('create table if not exists users'),
    'migration contains users table');
  assert(sql.toLowerCase().includes('create table if not exists sessions'),
    'migration contains sessions table');
}

// Stop here if bcrypt isn't available — signup/login depend on it
let bcryptAvailable = true;
try { await hashPassword('anything123'); }
catch (err) { if (err.message.includes('bcryptjs')) bcryptAvailable = false; }

if (bcryptAvailable) {
  console.log('\n👤 signupUser\n');

  {
    const db = makeMockDb();
    const user = await signupUser(db, {
      email: 'MARCUS@widgetco.com',
      password: 'marcuspass123',
      name: 'Marcus',
    });
    assert(user.id === 1, `signup returns user with id (got ${user.id})`);
    assert(user.email === 'marcus@widgetco.com',
      `signup lowercases email (got ${user.email})`);
    assert(user.password_hash === undefined,
      'signup strips password_hash from return');
    assert(typeof user.email_verify_token === 'string' && user.email_verify_token.length === 64,
      'signup returns an email_verify_token for the verification email');

    // Duplicate email → clean error
    let threw;
    try {
      await signupUser(db, { email: 'marcus@widgetco.com', password: 'otherpass', name: 'Other' });
    } catch (err) { threw = err.message; }
    assert(threw && threw.includes('already exists'),
      `duplicate email surfaces clean error (got "${threw?.slice(0, 80)}")`);
  }

  {
    const db = makeMockDb();
    let threw;
    try { await signupUser(db, { email: 'not-an-email', password: 'x'.repeat(12), name: 'X' }); }
    catch (err) { threw = err.message; }
    assert(threw && threw.includes('Invalid email'),
      'bad email rejected');
  }

  {
    const db = makeMockDb();
    let threw;
    try { await signupUser(db, { email: 'a@b.co', password: 'x'.repeat(12), name: '   ' }); }
    catch (err) { threw = err.message; }
    assert(threw && threw.includes('Name'),
      'missing name rejected');
  }

  console.log('\n🔐 loginUser\n');

  {
    const db = makeMockDb();
    await signupUser(db, { email: 'marcus@widgetco.com', password: 'marcuspass123', name: 'Marcus' });
    const session = await loginUser(db, {
      email: 'marcus@widgetco.com',
      password: 'marcuspass123',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
    assert(session.user.email === 'marcus@widgetco.com',
      'login returns user row');
    assert(typeof session.token === 'string' && session.token.length === 64,
      'login returns a raw token');
    assert(db.sessions.length === 1, 'login persists a session row');
    assert(db.sessions[0].token_hash === hashSessionToken(session.token),
      'session row stores the SHA-256 hash (not the raw token)');
  }

  {
    const db = makeMockDb();
    await signupUser(db, { email: 'marcus@widgetco.com', password: 'correct1234', name: 'Marcus' });
    let threw;
    try {
      await loginUser(db, { email: 'marcus@widgetco.com', password: 'wrongpass1' });
    } catch (err) { threw = err.message; }
    assert(threw && threw.includes('Invalid email or password'),
      'wrong password surfaces generic error (no enumeration)');

    try {
      await loginUser(db, { email: 'nobody@example.com', password: 'whatever12' });
    } catch (err) { threw = err.message; }
    assert(threw && threw.includes('Invalid email or password'),
      'nonexistent user surfaces the SAME error as wrong password (prevents enumeration)');
  }

  {
    const db = makeMockDb();
    await signupUser(db, { email: 'frozen@example.com', password: 'pass1234', name: 'Fro' });
    db.users[0].status = 'frozen';
    let threw;
    try { await loginUser(db, { email: 'frozen@example.com', password: 'pass1234' }); }
    catch (err) { threw = err.message; }
    assert(threw && threw.includes('frozen'),
      'frozen account surfaces frozen-specific error');
  }

  console.log('\n✅ validateSession\n');

  {
    const db = makeMockDb();
    await signupUser(db, { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' });
    const { token } = await loginUser(db, { email: 'marcus@widgetco.com', password: 'pass1234' });

    const user = await validateSession(db, token);
    assert(user && user.email === 'marcus@widgetco.com',
      'validateSession returns the user for a valid token');

    assert(await validateSession(db, 'bogus-token') === null,
      'invalid token returns null');
    assert(await validateSession(db, null) === null,
      'null token returns null');

    // Expire the session
    db.sessions[0].expires_at = new Date(Date.now() - 1000);
    assert(await validateSession(db, token) === null,
      'expired session returns null');

    // Revoke
    db.sessions[0].expires_at = new Date(Date.now() + 60_000);
    db.sessions[0].revoked_at = new Date();
    assert(await validateSession(db, token) === null,
      'revoked session returns null');

    // Frozen user
    db.sessions[0].revoked_at = null;
    db.users[0].status = 'frozen';
    assert(await validateSession(db, token) === null,
      'frozen user returns null even with live session');
  }

  console.log('\n🚪 revokeSession / logoutAllSessions\n');

  {
    const db = makeMockDb();
    await signupUser(db, { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' });
    const a = await loginUser(db, { email: 'marcus@widgetco.com', password: 'pass1234' });
    const b = await loginUser(db, { email: 'marcus@widgetco.com', password: 'pass1234' });
    assert(db.sessions.length === 2, 'two sessions created');

    assert(await revokeSession(db, a.token) === true,
      'revokeSession returns true on success');
    assert(await revokeSession(db, a.token) === false,
      'revokeSession is idempotent — second call returns false');
    assert(db.sessions[0].revoked_at !== null, 'first session revoked');
    assert(db.sessions[1].revoked_at === null, 'second session still live');

    const count = await logoutAllSessions(db, db.users[0].id);
    assert(count === 1,
      `logoutAllSessions revokes just the remaining live session (got ${count})`);
    assert(db.sessions.every(s => s.revoked_at !== null),
      'both sessions revoked after logoutAllSessions');
  }

  console.log('\n📨 Email verification\n');

  {
    const db = makeMockDb();
    const user = await signupUser(db, { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' });
    assert(db.users[0].email_verified_at === null, 'new user starts unverified');
    const verifiedId = await verifyEmailToken(db, user.email_verify_token);
    assert(verifiedId === user.id,
      `verifyEmailToken returns the user id on success (got ${verifiedId})`);
    assert(db.users[0].email_verified_at !== null,
      'email_verified_at set after verification');
    assert(db.users[0].email_verify_token === null,
      'email_verify_token cleared after verification');
    assert(await verifyEmailToken(db, 'bogus') === null,
      'bogus verify token returns null');

    // Re-issue for resending the verification email
    const newToken = await issueEmailVerifyToken(db, user.id);
    assert(typeof newToken === 'string' && newToken.length === 64 && newToken !== user.email_verify_token,
      'issueEmailVerifyToken rotates the token');
  }

  console.log('\n🔄 Password reset\n');

  {
    const db = makeMockDb();
    await signupUser(db, { email: 'marcus@widgetco.com', password: 'oldpass123', name: 'Marcus' });
    // Log in twice to create two sessions
    await loginUser(db, { email: 'marcus@widgetco.com', password: 'oldpass123' });
    await loginUser(db, { email: 'marcus@widgetco.com', password: 'oldpass123' });
    assert(db.sessions.length === 2, 'two active sessions before reset');

    const resetToken = await issuePasswordResetToken(db, 'marcus@widgetco.com');
    assert(typeof resetToken === 'string' && resetToken.length === 64,
      'issuePasswordResetToken returns a token for registered email');

    // Non-existent email → null (no enumeration)
    assert(await issuePasswordResetToken(db, 'ghost@nobody.com') === null,
      'issuePasswordResetToken returns null for unknown email (no enumeration)');

    // Reset
    await resetPassword(db, resetToken, 'newpass1234');
    assert(db.users[0].password_hash !== null,
      'password_hash updated after reset');

    // Old password no longer works
    let threw;
    try { await loginUser(db, { email: 'marcus@widgetco.com', password: 'oldpass123' }); }
    catch (err) { threw = err.message; }
    assert(threw && threw.includes('Invalid'),
      'old password rejected after reset');

    // New password works
    const { token } = await loginUser(db, { email: 'marcus@widgetco.com', password: 'newpass1234' });
    assert(typeof token === 'string',
      'new password grants a session');

    // All pre-reset sessions revoked
    const preResetSessions = db.sessions.slice(0, 2);
    assert(preResetSessions.every(s => s.revoked_at !== null),
      'reset invalidates all previous sessions (stolen-session mitigation)');

    // Expired reset token
    const newToken2 = await issuePasswordResetToken(db, 'marcus@widgetco.com');
    db.users[0].password_reset_expires_at = new Date(Date.now() - 1000);
    threw = null;
    try { await resetPassword(db, newToken2, 'evenneweer123'); }
    catch (err) { threw = err.message; }
    assert(threw && threw.includes('expired'),
      'expired reset token rejected');
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
