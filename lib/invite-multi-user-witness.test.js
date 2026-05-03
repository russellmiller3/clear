// =============================================================================
// MULTI-USER-PER-TENANT INVITE WITNESS (2026-05-03 night)
// =============================================================================
//
// PURPOSE
//   The default tenant-isolation behavior — every signup creates a brand-new
//   tenant_id — means a team that all signs up at the same site lands in
//   separate silos. They can't see each other's records. That's correct for
//   single-customer apps, wrong for actual teams.
//
//   The invite flow fixes this: an existing user generates a token, hands it
//   to a teammate, and the teammate's signup joins the inviter's tenant.
//   Both users now see the same rows.
//
// METHOD
//   Compile a tiny app with shared scope. Spawn the server. Run the full
//   flow over real HTTP:
//     - Alice signs up → tenant_id=1
//     - Alice POSTs /auth/invite → gets a token
//     - Bob signs up with invite_token → tenant_id=1 (joined Alice)
//     - Alice POSTs a deal → tenant_id=1
//     - Bob GETs /api/deals → SEES Alice's deal (same tenant)
//     - Carol signs up without invite → tenant_id=3 (new silo)
//     - Carol GETs /api/deals → empty (different tenant)
//     - Try to reuse Alice's first invite → 400 (single-use)
//
// WHY THIS SHIPS
//   This is the load-bearing proof for any team trial: "how do my coworkers
//   join my workspace?" The answer used to be "they can't — every signup
//   forks a fresh tenant." Tonight it's "send them an invite link." The
//   test runs the actual HTTP, not just the compile output.
// =============================================================================

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { describe, it, expect, describeAsync, itAsync } from './testUtils.js';
import { compileProgram } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = resolve(dirname(__filename), '..');

const SRC = `target: backend
database is shared with tenant scope
allow signup and login

create a Deals table:
  status

when user requests data from /api/deals:
  requires login
  found = look up all Deals
  send back found

when user sends deal to /api/deals:
  requires login
  saved = save deal as new Deal
  send back saved
`;

function ensureClearRuntime() {
  const dir = join(REPO_ROOT, 'clear-runtime');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) writeFileSync(pkgPath, '{\n  "type": "commonjs"\n}\n');
  copyFileSync(join(REPO_ROOT, 'runtime', 'db.js'), join(dir, 'db.js'));
}

function findFreePort() {
  return new Promise((resolveP, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolveP(port));
    });
  });
}

async function startCompiledServer(serverJS, port) {
  const stamp = Date.now() + '-' + process.pid + '-' + Math.random().toString(36).slice(2, 8);
  const tempPath = join(REPO_ROOT, `_invite-witness-${stamp}.cjs`);
  // Per-test DB path so tests don't share state. On Windows the previous
  // server's SIGTERM doesn't immediately release the SQLite file lock,
  // and the next test's unlinkSync fails silently — leaving stale users
  // around to break uniqueness checks. Unique paths per spawn solve it.
  const dbPath = join(REPO_ROOT, `_invite-witness-${stamp}.db`);
  writeFileSync(tempPath, serverJS, 'utf8');
  const proc = spawn(process.execPath, [tempPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', JWT_SECRET: 'invite-witness-secret', CLEAR_DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdoutBuf = '';
  let stderrBuf = '';
  proc.stdout.on('data', d => { stdoutBuf += d.toString(); });
  proc.stderr.on('data', d => { stderrBuf += d.toString(); });
  const ready = await new Promise((res) => {
    const timer = setTimeout(() => res({ ok: false, reason: 'timeout' }), 5000);
    const check = () => {
      if (stdoutBuf.includes(`Server running on port ${port}`)) {
        clearTimeout(timer);
        res({ ok: true });
      }
    };
    proc.stdout.on('data', check);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      res({ ok: false, reason: `process exited with code ${code}`, stdout: stdoutBuf, stderr: stderrBuf });
    });
    check();
  });
  const cleanup = () => {
    try { proc.kill('SIGTERM'); } catch {}
    try { unlinkSync(tempPath); } catch {}
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + '-shm'); } catch {}
    try { unlinkSync(dbPath + '-wal'); } catch {}
  };
  if (!ready.ok) {
    cleanup();
    throw new Error(`server failed to boot: ${ready.reason}\nstdout: ${ready.stdout || stdoutBuf}\nstderr: ${ready.stderr || stderrBuf}`);
  }
  return { proc, cleanup, port };
}

describe('multi-user-per-tenant invites — design sanity', () => {
  it('source declares shared tenant scope', () => {
    expect(SRC).toContain('shared with tenant scope');
  });
  it('compiled JS contains the invite endpoint when shared scope is on (durable storage)', () => {
    const compiled = compileProgram(SRC);
    expect(compiled.errors.length).toBe(0);
    const js = compiled.serverJS || compiled.javascript;
    expect(js).toContain("app.post('/auth/invite'");
    expect(js).toContain("db.createTable('_auth_invites'");
    expect(js).toContain('invite_token');
  });
  it('compiled JS does NOT contain invite endpoint without shared scope (gated correctly)', () => {
    const noScopeSrc = `target: backend\nallow signup and login\n\ncreate a Deals table:\n  status\n`;
    const compiled = compileProgram(noScopeSrc);
    const js = compiled.serverJS || compiled.javascript;
    expect(js).not.toContain("app.post('/auth/invite'");
    expect(js).not.toContain("db.createTable('_auth_invites'");
  });
});

await describeAsync('multi-user-per-tenant invites — end-to-end HTTP', async () => {
  await itAsync('Alice invites Bob; Bob joins Alice tenant; Carol signs up alone; reuse rejected', async () => {
    let hasDeps = false;
    try {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      require.resolve('jsonwebtoken');
      require.resolve('bcryptjs');
      hasDeps = true;
    } catch {}
    if (!hasDeps) {
      console.log('  (invite HTTP test skipped: jsonwebtoken / bcryptjs not installed at repo root — run `npm install jsonwebtoken bcryptjs`)');
      return;
    }
    ensureClearRuntime();
    // Reset DB so signup auto-issues fresh tenant_ids starting at 1.
    const dbPath = join(REPO_ROOT, 'clear-data.db');
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + '-shm'); } catch {}
    try { unlinkSync(dbPath + '-wal'); } catch {}

    const compiled = compileProgram(SRC);
    if (compiled.errors && compiled.errors.length) {
      throw new Error('compile errors: ' + JSON.stringify(compiled.errors));
    }
    const serverJS = compiled.serverJS || compiled.javascript;
    const port = await findFreePort();
    const server = await startCompiledServer(serverJS, port);
    try {
      const post = async (path, body, headers = {}) => {
        const r = await fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json };
      };
      const get = async (path, headers = {}) => {
        const r = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json };
      };

      // STEP 1 — Alice signs up plain. New tenant.
      const aliceSignup = await post('/auth/signup', { email: 'alice@a.test', password: 'aliceP@ss123' });
      if (aliceSignup.status !== 201 || !aliceSignup.body.token) {
        throw new Error('Alice signup failed: ' + JSON.stringify(aliceSignup));
      }
      const aliceToken = aliceSignup.body.token;
      const aliceTenant = aliceSignup.body.user.tenant_id;
      expect(typeof aliceTenant).toBe('number');

      // STEP 2 — Alice creates an invite.
      const inviteRes = await post('/auth/invite', {}, { Authorization: `Bearer ${aliceToken}` });
      if (inviteRes.status !== 201 || !inviteRes.body.token) {
        throw new Error('Alice invite generation failed: ' + JSON.stringify(inviteRes));
      }
      const inviteToken = inviteRes.body.token;
      expect(inviteRes.body.tenant_id).toBe(aliceTenant);
      expect(typeof inviteToken).toBe('string');
      expect(inviteToken.length).toBe(32); // 16 bytes hex

      // STEP 3 — Bob signs up with the invite token. Joins Alice's tenant.
      const bobSignup = await post('/auth/signup', {
        email: 'bob@b.test',
        password: 'bobP@ss456',
        invite_token: inviteToken,
      });
      if (bobSignup.status !== 201) {
        throw new Error('Bob signup with invite failed: ' + JSON.stringify(bobSignup));
      }
      const bobToken = bobSignup.body.token;
      const bobTenant = bobSignup.body.user.tenant_id;
      expect(bobTenant).toBe(aliceTenant); // critical: Bob is in Alice's tenant

      // STEP 4 — Alice creates a deal.
      const aliceDeal = await post('/api/deals', { status: 'alice-secret-deal' }, {
        Authorization: `Bearer ${aliceToken}`,
      });
      expect(aliceDeal.status).toBe(200);

      // STEP 5 — Bob, in the SAME tenant, sees Alice's deal.
      const bobDeals = await get('/api/deals', { Authorization: `Bearer ${bobToken}` });
      expect(bobDeals.status).toBe(200);
      const bobSawAlice = Array.isArray(bobDeals.body) && bobDeals.body.some(d => d.status === 'alice-secret-deal');
      if (!bobSawAlice) {
        throw new Error("Bob did NOT see Alice's deal even though they're in the same tenant. Bob got: " + JSON.stringify(bobDeals.body));
      }

      // STEP 6 — Carol signs up plain (no invite). She gets a NEW tenant.
      const carolSignup = await post('/auth/signup', { email: 'carol@c.test', password: 'carolP@ss789' });
      expect(carolSignup.status).toBe(201);
      const carolToken = carolSignup.body.token;
      const carolTenant = carolSignup.body.user.tenant_id;
      if (carolTenant === aliceTenant) {
        throw new Error("Carol's tenant matches Alice's even though Carol used no invite — auto-tenant logic broken");
      }

      // STEP 7 — Carol GETs /api/deals → does NOT see Alice's deal (different tenant).
      const carolDeals = await get('/api/deals', { Authorization: `Bearer ${carolToken}` });
      expect(carolDeals.status).toBe(200);
      const carolSawAlice = Array.isArray(carolDeals.body) && carolDeals.body.some(d => d.status === 'alice-secret-deal');
      if (carolSawAlice) {
        throw new Error("Carol saw Alice's deal even though she's in a different tenant — tenant isolation broken");
      }

      // STEP 8 — Reusing Alice's first invite token returns 400 (single-use).
      const reuseSignup = await post('/auth/signup', {
        email: 'mallory@m.test',
        password: 'malloryPw',
        invite_token: inviteToken,
      });
      expect(reuseSignup.status).toBe(400);
      expect(reuseSignup.body.error).toContain('Invalid or already-used');

      // STEP 9 — A bogus invite token also returns 400.
      const bogusSignup = await post('/auth/signup', {
        email: 'eve@e.test',
        password: 'evePw',
        invite_token: 'not-a-real-token-' + 'x'.repeat(16),
      });
      expect(bogusSignup.status).toBe(400);

      // STEP 10 — Listing invites returns Alice's invite as used.
      const listed = await get('/auth/invite', { Authorization: `Bearer ${aliceToken}` });
      expect(listed.status).toBe(200);
      expect(Array.isArray(listed.body)).toBe(true);
      const found = listed.body.find(inv => inv.token === inviteToken);
      if (!found) throw new Error('Alice cannot see her own invite in /auth/invite list');
      if (!found.used_at) throw new Error('Alice\'s invite list does not show invite as used');
      expect(found.used_by_email).toBe('bob@b.test');
    } finally {
      server.cleanup();
    }
  });
});
