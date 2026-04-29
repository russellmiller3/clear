#!/usr/bin/env node
/*
run-marcus-uat.mjs — drive every Marcus app through its auto-generated
Playwright walker and report pass/fail per app.

For each Marcus app:
  1. `clear build` — refresh server.js + index.html + browser-uat.mjs
  2. spawn `node server.js` on a dedicated port
  3. wait for the port to accept connections
  4. run `node browser-uat.mjs` with TEST_URL pointing at that port
  5. kill the server, capture pass/fail counts

Prints a one-line summary per app + a final tally. Exits 1 if any app's
walker reports a failure (so CI / pre-push hooks can gate on it later).

Usage:
  node scripts/run-marcus-uat.mjs                    # all 5 Marcus apps
  node scripts/run-marcus-uat.mjs deal-desk          # just one
  node scripts/run-marcus-uat.mjs --list             # show what'd run

Env:
  CLEAR_UAT_PORT_BASE=4400  base port (each app gets BASE + index)
  CLEAR_UAT_BOOT_TIMEOUT_MS=15000  how long to wait for the server to listen
*/

import { spawn } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// The 5 Marcus apps per the canonical list (snapshots/marcus-primitives-decomposition).
const MARCUS_APPS = [
  'deal-desk',
  'approval-queue',
  'lead-router',
  'onboarding-tracker',
  'internal-request-queue',
];

const PORT_BASE = Number(process.env.CLEAR_UAT_PORT_BASE) || 4400;
const BOOT_TIMEOUT_MS = Number(process.env.CLEAR_UAT_BOOT_TIMEOUT_MS) || 15000;

function log(msg) { process.stdout.write(msg + '\n'); }

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveWait) => {
    const tryConnect = () => {
      if (Date.now() > deadline) return resolveWait(false);
      const sock = net.createConnection(port, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); resolveWait(true); });
      sock.once('error', () => {
        sock.destroy();
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

function runProcess(cmd, args, opts = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
    child.on('error', (err) => resolveRun({ code: -1, stdout, stderr: stderr + (err.message || String(err)) }));
  });
}

async function buildApp(name) {
  const file = resolve(ROOT, 'apps', name, 'main.clear');
  if (!existsSync(file)) return { ok: false, error: 'main.clear not found' };
  const result = await runProcess('node', [resolve(ROOT, 'cli', 'clear.js'), 'build', file]);
  if (result.code !== 0) {
    return { ok: false, error: 'build failed: ' + (result.stderr || result.stdout).slice(0, 500) };
  }
  return { ok: true };
}

async function runOneApp(name, port) {
  log(`\n── ${name} (port ${port}) ───────────────────────────`);

  // 0. Wipe any persisted SQLite from prior runs so the seed always re-fires
  // with the latest source data (idempotency-aware seeds skip inserts when
  // the same row already exists, which silently masks new seed entries).
  for (const ext of ['.db', '.db-shm', '.db-wal']) {
    try {
      const dbPath = resolve(ROOT, 'apps', name, 'clear-data' + ext);
      if (existsSync(dbPath)) {
        const fs = await import('fs/promises');
        await fs.unlink(dbPath);
      }
    } catch { /* swallow */ }
  }

  // 1. Build
  const built = await buildApp(name);
  if (!built.ok) {
    log(`  ✗ build: ${built.error}`);
    return { name, ok: false, passed: 0, failed: 1, reason: 'build' };
  }
  log('  ✓ built');

  // 2. Spawn server
  const appDir = resolve(ROOT, 'apps', name);
  const serverPath = resolve(appDir, 'server.js');
  if (!existsSync(serverPath)) {
    log(`  ✗ no server.js at ${serverPath}`);
    return { name, ok: false, passed: 0, failed: 1, reason: 'no-server' };
  }
  const server = spawn('node', [serverPath], {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d.toString(); });
  server.stderr.on('data', (d) => { serverLog += d.toString(); });

  try {
    // 3. Wait for the port to listen
    const ready = await waitForPort(port, BOOT_TIMEOUT_MS);
    if (!ready) {
      log(`  ✗ server did not listen on ${port} within ${BOOT_TIMEOUT_MS}ms`);
      log(`     server log:\n${serverLog.slice(0, 1200).split('\n').map(l => '       ' + l).join('\n')}`);
      return { name, ok: false, passed: 0, failed: 1, reason: 'no-listen' };
    }
    log(`  ✓ server listening`);

    // 4. Run the browser UAT walker
    const uatPath = resolve(appDir, 'browser-uat.mjs');
    if (!existsSync(uatPath)) {
      log(`  ✗ no browser-uat.mjs — did the compiler emit it?`);
      return { name, ok: false, passed: 0, failed: 1, reason: 'no-uat' };
    }
    const uat = await runProcess('node', [uatPath], {
      env: { ...process.env, TEST_URL: `http://127.0.0.1:${port}` },
    });

    // Parse pass/fail counts from UAT output
    const passMatches = (uat.stdout.match(/^PASS:/gm) || []).length;
    const failMatches = (uat.stdout.match(/^FAIL:/gm) || []).length;
    const failedRows = (uat.stdout.match(/^FAIL: .*$/gm) || []).slice(0, 5);

    if (uat.code !== 0 || failMatches > 0) {
      log(`  ✗ UAT: ${passMatches} passed, ${failMatches} failed`);
      for (const row of failedRows) log(`     ${row}`);
      return { name, ok: false, passed: passMatches, failed: failMatches, reason: 'uat-fail', uatStdout: uat.stdout, uatStderr: uat.stderr };
    }
    log(`  ✓ UAT: ${passMatches} passed`);
    return { name, ok: true, passed: passMatches, failed: 0 };
  } finally {
    // Kill server
    try { server.kill('SIGKILL'); } catch { /* swallow */ }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const a of MARCUS_APPS) log(a);
    process.exit(0);
  }
  const targets = args.filter(a => !a.startsWith('--'));
  const apps = targets.length > 0 ? targets : MARCUS_APPS;

  log(`Browser UAT — running ${apps.length} app(s)`);
  log(`Port base: ${PORT_BASE}`);

  const results = [];
  for (let i = 0; i < apps.length; i++) {
    const port = PORT_BASE + i;
    const r = await runOneApp(apps[i], port);
    results.push(r);
  }

  log(`\n══════════════════════════════════════════════════`);
  log(`Summary`);
  log(`══════════════════════════════════════════════════`);
  let totalPass = 0, totalFail = 0;
  for (const r of results) {
    const tag = r.ok ? 'OK' : 'FAIL';
    log(`  ${tag.padEnd(4)}  ${r.name.padEnd(28)}  ${r.passed} passed, ${r.failed} failed${r.reason ? ' (' + r.reason + ')' : ''}`);
    totalPass += r.passed;
    totalFail += r.failed;
  }
  log(`──────────────────────────────────────────────────`);
  log(`  TOTAL: ${totalPass} passed, ${totalFail} failed across ${results.length} apps`);

  // Optional: dump full UAT output of failed apps to file
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    const reportPath = resolve(ROOT, 'snapshots', `marcus-uat-failures-${new Date().toISOString().slice(0, 10)}.md`);
    const lines = [`# Marcus UAT failures — ${new Date().toISOString()}`, ''];
    for (const r of failed) {
      lines.push(`## ${r.name} — ${r.reason}`);
      lines.push('');
      if (r.uatStdout) lines.push('### stdout\n```\n' + r.uatStdout.slice(0, 4000) + '\n```\n');
      if (r.uatStderr) lines.push('### stderr\n```\n' + r.uatStderr.slice(0, 4000) + '\n```\n');
    }
    try { writeFileSync(reportPath, lines.join('\n')); log(`\nDetailed failures → ${reportPath}`); } catch {}
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(2);
});
