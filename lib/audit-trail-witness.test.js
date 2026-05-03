// =============================================================================
// API-CALL AUDIT TRAIL — RUNTIME WITNESS (2026-05-03 night)
// =============================================================================
//
// PURPOSE
//   The compiler now emits an `_audit_log` array + a state-change-capture
//   middleware + a `GET /audit` endpoint when `allow signup and login` is
//   declared. Every POST/PUT/PATCH/DELETE the server handles gets logged
//   with caller identity, route, method, status, timestamp, and tenant id
//   (when shared scope is on). This file proves the capture and the
//   read-back work end-to-end over real HTTP.
//
// METHOD
//   Compile a tiny app with auth + a CRUD route. Spawn the server. Sign
//   up as Alice, post a deal, post another deal, hit a non-existent
//   endpoint (404). Then GET /audit as Alice and assert: every state-
//   change the test made is in the log; the GET /audit itself is NOT in
//   the log (read-only requests are skipped); each entry carries Alice's
//   user_id and email.
//
//   With shared scope: sign up Bob in a separate tenant; assert Bob's
//   GET /audit returns ONLY Bob's audit entries, not Alice's.
//
// WHY IT SHIPS
//   Marcus's compliance buyer asks: "show me every state change in the
//   last hour." Without this layer, the answer is "we have to grep
//   server logs." With this layer, the answer is "GET /audit." That's
//   the difference between a regulated-tier story that holds up under
//   scrutiny and one that doesn't.
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

const SRC_NO_TENANT = `target: backend
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

const SRC_TENANT = `target: backend
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
  const tempPath = join(REPO_ROOT, `_audit-witness-${stamp}.cjs`);
  // Per-test DB path so tests don't share state. Without this, on Windows
  // the SIGTERM'd previous server keeps a file lock long enough that
  // unlinkSync silently fails, and the next test sees stale rows.
  const dbPath = join(REPO_ROOT, `_audit-witness-${stamp}.db`);
  writeFileSync(tempPath, serverJS, 'utf8');
  const proc = spawn(process.execPath, [tempPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', JWT_SECRET: 'audit-witness-secret', CLEAR_DB_PATH: dbPath },
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

describe('audit trail — design sanity', () => {
  it('compiled JS creates the durable audit_log table and emits the middleware', () => {
    const compiled = compileProgram(SRC_NO_TENANT);
    expect(compiled.errors.length).toBe(0);
    const js = compiled.serverJS || compiled.javascript;
    expect(js).toContain("db.createTable('audit_log'");
    expect(js).toContain('API-call audit middleware');
    expect(js).toContain("app.get('/audit'");
  });
  it("audit middleware writes via db.insert (durable across restarts)", () => {
    const js = (compileProgram(SRC_NO_TENANT).serverJS) || compileProgram(SRC_NO_TENANT).javascript;
    expect(js).toContain("db.insert('audit_log'");
  });
  it("read-only requests are filtered (the middleware skips GET/HEAD/OPTIONS)", () => {
    const js = (compileProgram(SRC_NO_TENANT).serverJS) || compileProgram(SRC_NO_TENANT).javascript;
    expect(js).toContain("if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()");
  });
  it("tenant-scope variant filters /audit response by tenant", () => {
    const js = (compileProgram(SRC_TENANT).serverJS) || compileProgram(SRC_TENANT).javascript;
    expect(js).toContain("db.findAll('audit_log', { tenant_id: req.user.tenant_id })");
  });
  it("no-tenant-scope variant reads the full log via db.findAll", () => {
    const js = (compileProgram(SRC_NO_TENANT).serverJS) || compileProgram(SRC_NO_TENANT).javascript;
    expect(js).toContain("db.findAll('audit_log')");
  });
});

await describeAsync('audit trail — end-to-end HTTP (no tenant scope)', async () => {
  await itAsync('every state change Alice makes lands in /audit; her GET /audit does not', async () => {
    let hasDeps = false;
    try {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      require.resolve('jsonwebtoken');
      require.resolve('bcryptjs');
      hasDeps = true;
    } catch {}
    if (!hasDeps) {
      console.log('  (audit HTTP test skipped: jsonwebtoken / bcryptjs not installed at repo root)');
      return;
    }
    ensureClearRuntime();
    const dbPath = join(REPO_ROOT, 'clear-data.db');
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + '-shm'); } catch {}
    try { unlinkSync(dbPath + '-wal'); } catch {}

    const compiled = compileProgram(SRC_NO_TENANT);
    if (compiled.errors && compiled.errors.length) throw new Error('compile errors: ' + JSON.stringify(compiled.errors));
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
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const get = async (path, headers = {}) => {
        const r = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
        return { status: r.status, body: await r.json().catch(() => null) };
      };

      // Alice signs up. The signup itself is a state-change — it goes into the log.
      const aliceSignup = await post('/auth/signup', { email: 'alice@a.test', password: 'secret-pw-1234' });
      if (aliceSignup.status !== 201 || !aliceSignup.body.token) {
        throw new Error('signup failed: ' + JSON.stringify(aliceSignup));
      }
      const aliceToken = aliceSignup.body.token;
      const aliceId = aliceSignup.body.user.id;

      // Two deal posts — both state-changes, both should land.
      await post('/api/deals', { status: 'pending' }, { Authorization: `Bearer ${aliceToken}` });
      await post('/api/deals', { status: 'approved' }, { Authorization: `Bearer ${aliceToken}` });

      // A read-only GET — should NOT land in the audit log.
      await get('/api/deals', { Authorization: `Bearer ${aliceToken}` });

      // Now read the audit log.
      const auditRes = await get('/audit', { Authorization: `Bearer ${aliceToken}` });
      expect(auditRes.status).toBe(200);
      expect(Array.isArray(auditRes.body)).toBe(true);

      const entries = auditRes.body;
      // Signup row — caller has no JWT yet at signup time, so user_id is null.
      const signupRow = entries.find(e => e.method === 'POST' && e.path === '/auth/signup');
      if (!signupRow) throw new Error('signup not captured in audit log');
      expect(signupRow.status).toBe(201);

      // Deal posts — caller has Alice's JWT, so user_id is Alice's id.
      const dealRows = entries.filter(e => e.method === 'POST' && e.path === '/api/deals');
      if (dealRows.length !== 2) {
        throw new Error('expected exactly 2 /api/deals POST rows, got ' + dealRows.length);
      }
      for (const r of dealRows) {
        expect(r.user_id).toBe(aliceId);
        expect(r.user_email).toBe('alice@a.test');
        expect(typeof r.ts).toBe('string');
      }

      // GET /api/deals — should NOT be in the log (read-only filter).
      const getRow = entries.find(e => e.method === 'GET' && e.path === '/api/deals');
      if (getRow) throw new Error('read-only GET should not have been captured');

      // GET /audit itself — also read-only, also should NOT be captured.
      const auditGetRow = entries.find(e => e.method === 'GET' && e.path === '/audit');
      if (auditGetRow) throw new Error('GET /audit should not capture itself (read-only)');
    } finally {
      server.cleanup();
    }
  });
});

await describeAsync('audit trail — tenant-scoped end-to-end HTTP', async () => {
  await itAsync('Bob in tenant 2 sees only his own state changes, not Alice tenant 1', async () => {
    let hasDeps = false;
    try {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      require.resolve('jsonwebtoken');
      require.resolve('bcryptjs');
      hasDeps = true;
    } catch {}
    if (!hasDeps) {
      console.log('  (tenant-scoped audit HTTP test skipped: jsonwebtoken / bcryptjs not installed)');
      return;
    }
    ensureClearRuntime();
    const dbPath = join(REPO_ROOT, 'clear-data.db');
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + '-shm'); } catch {}
    try { unlinkSync(dbPath + '-wal'); } catch {}

    const compiled = compileProgram(SRC_TENANT);
    if (compiled.errors && compiled.errors.length) throw new Error('compile errors: ' + JSON.stringify(compiled.errors));
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
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const get = async (path, headers = {}) => {
        const r = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
        return { status: r.status, body: await r.json().catch(() => null) };
      };

      // Two unrelated tenants — Alice and Bob each sign up.
      const aliceRes = await post('/auth/signup', { email: 'alice@a.test', password: 'aliceP@1234' });
      const aliceToken = aliceRes.body.token;
      const aliceTenant = aliceRes.body.user.tenant_id;
      const bobRes = await post('/auth/signup', { email: 'bob@b.test', password: 'bobP@1234' });
      const bobToken = bobRes.body.token;
      const bobTenant = bobRes.body.user.tenant_id;
      if (aliceTenant === bobTenant) throw new Error("Alice and Bob ended up in the same tenant — auto-tenant logic broken");

      // Each posts a deal in their own tenant.
      await post('/api/deals', { status: 'alice-deal' }, { Authorization: `Bearer ${aliceToken}` });
      await post('/api/deals', { status: 'bob-deal-1' }, { Authorization: `Bearer ${bobToken}` });
      await post('/api/deals', { status: 'bob-deal-2' }, { Authorization: `Bearer ${bobToken}` });

      // Bob asks for /audit — should see ONLY Bob's tenant rows.
      const bobAudit = await get('/audit', { Authorization: `Bearer ${bobToken}` });
      expect(bobAudit.status).toBe(200);
      expect(Array.isArray(bobAudit.body)).toBe(true);
      const bobEntries = bobAudit.body;
      // Bob should NOT see Alice's deal post.
      const sawAlice = bobEntries.some(e => e.user_email === 'alice@a.test');
      if (sawAlice) throw new Error("Bob's /audit returned Alice's entries — tenant filter broken");
      // Bob SHOULD see his two deal posts.
      const bobDealRows = bobEntries.filter(e => e.method === 'POST' && e.path === '/api/deals' && e.user_email === 'bob@b.test');
      if (bobDealRows.length !== 2) {
        throw new Error("Bob's /audit didn't return both his deal posts; got " + bobDealRows.length + " of expected 2");
      }
      for (const r of bobDealRows) {
        expect(r.tenant_id).toBe(bobTenant);
        expect(r.user_email).toBe('bob@b.test');
      }
    } finally {
      server.cleanup();
    }
  });
});
