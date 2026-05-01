#!/usr/bin/env node
/*
Lead-router launch verification.

Fast guard for the Marcus demo path:
1. The source uses the shipped route primitive, not the old if-chain.
2. The running app assigns leads before saving them.
*/

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const APP_DIR = resolve(ROOT, 'apps', 'lead-router');
const SOURCE_PATH = resolve(APP_DIR, 'main.clear');
const SERVER_PATH = resolve(APP_DIR, 'server.js');
const NODE = process.execPath;

let passed = 0;
let failed = 0;

function log(msg) {
  process.stdout.write(msg + '\n');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    log('PASS: ' + name);
  } catch (err) {
    failed += 1;
    log('FAIL: ' + name + ' - ' + (err && err.message ? err.message : String(err)));
  }
}

function runProcess(cmd, args, opts = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => resolveRun({ code, stdout, stderr }));
    child.on('error', err => resolveRun({ code: -1, stdout, stderr: stderr + String(err.message || err) }));
  });
}

await test('source uses the route primitive before saving the lead', async () => {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const routeIdx = source.indexOf('route lead by size:');
  const saveIdx = source.indexOf('new_lead = save lead as new Lead');
  assert(routeIdx !== -1, 'Expected apps/lead-router/main.clear to use `route lead by size:`.');
  assert(saveIdx !== -1, 'Expected the lead-router save line to exist.');
  assert(routeIdx < saveIdx, 'Expected route assignment to happen before saving the lead.');
  assert(!/if\s+lead's\s+size\s+is\s+['"]SMB['"]/i.test(source), 'Old if-chain routing is back; use `route lead by size:`.');
});

await test('compiled server assigns owners from the route primitive', async () => {
  const built = await runProcess(NODE, [resolve(ROOT, 'cli', 'clear.js'), 'build', SOURCE_PATH]);
  assert(built.code === 0, 'Build failed: ' + (built.stderr || built.stdout).slice(0, 600));
  assert(existsSync(SERVER_PATH), 'Expected build to create apps/lead-router/server.js.');
  const server = readFileSync(SERVER_PATH, 'utf8');
  assert(server.includes('route lead by size'), 'Compiled server should retain the route source trace.');
  assert(server.includes('lead.assigned_to = "alice"'), 'Compiled server should assign SMB/default leads to alice.');
  assert(server.includes('lead.assigned_to = "bob"'), 'Compiled server should assign Mid-market leads to bob.');
  assert(server.includes('lead.assigned_to = "charlie"'), 'Compiled server should assign Enterprise leads to charlie.');
  const routeIdx = server.indexOf('route lead by size');
  const insertIdx = server.indexOf("db.insert('leads'");
  assert(routeIdx !== -1 && insertIdx !== -1 && routeIdx < insertIdx, 'Compiled route assignment should run before database insert.');
});

log('');
log('Lead-router launch verification: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
