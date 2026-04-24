#!/usr/bin/env node
// scripts/cross-target-smoke.mjs
//
// Compile the 8 core templates through every supported target, syntax-check
// every emission. Zero deps. Exit 1 if any target emits non-parsing code.
//
// Catches the Rule 17 drift class: a change lands for the Node target, the
// template smoke-test passes, but a parallel emission path (Python, Cloudflare
// Workers, browser-proxy bundle) gets left behind. Cheap to run (~10s total),
// cheap to wire into pre-push.
//
// Usage:
//   node scripts/cross-target-smoke.mjs           # all templates, all targets
//   node scripts/cross-target-smoke.mjs --target=python
//   node scripts/cross-target-smoke.mjs --app=helpdesk-agent
//
// Exit codes: 0 = all emissions syntactically valid. 1 = one or more failed.
//
// What each target's syntax-check runs:
//   node       → `node --check` on the emitted JS
//   cloudflare → `node --check` on every string value in workerBundle{}
//   browser    → `node --check` on browserServer
//   python     → `python3 -m py_compile` on the emitted Python

import { compileProgram } from '../index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const APPS = [
  'todo-fullstack',
  'crm-pro',
  'blog-fullstack',
  'live-chat',
  'helpdesk-agent',
  'booking',
  'expense-tracker',
  'ecom-agent',
];

const TARGETS = ['node', 'cloudflare', 'browser', 'python'];

const args = process.argv.slice(2);
const pickTarget = args.find(a => a.startsWith('--target='))?.split('=')[1];
const pickApp = args.find(a => a.startsWith('--app='))?.split('=')[1];

const apps = pickApp ? [pickApp] : APPS;
const targets = pickTarget ? [pickTarget] : TARGETS;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-cross-'));

let anyFail = false;
const failures = [];

function checkNode(code) {
  const f = path.join(tmp, 'check.mjs');
  fs.writeFileSync(f, code);
  try {
    execSync(`node --check ${f}`, { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.stderr?.toString().trim().split('\n').slice(0, 2).join(' | ') };
  }
}

function checkPython(code) {
  const f = path.join(tmp, 'check.py');
  fs.writeFileSync(f, code);
  try {
    execSync(`python3 -m py_compile ${f}`, { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.stderr?.toString().trim().split('\n').slice(-3).join(' | ') };
  }
}

function sourceFor(app, target) {
  const raw = fs.readFileSync(path.join('apps', app, 'main.clear'), 'utf8');
  if (target === 'python') return raw.replace('build for javascript backend', 'build for python backend');
  return raw;
}

function emissionFields(result, target) {
  // Returns [{name, code}] — name is the logical field, code is the string to syntax-check.
  const out = [];
  if (target === 'node') {
    const code = result.javascript || result.serverJS;
    if (code) out.push({ name: 'javascript', code });
  } else if (target === 'browser') {
    if (result.browserServer) out.push({ name: 'browserServer', code: result.browserServer });
  } else if (target === 'cloudflare') {
    if (result.workerBundle && typeof result.workerBundle === 'object') {
      for (const [fname, contents] of Object.entries(result.workerBundle)) {
        if (typeof contents === 'string' && (fname.endsWith('.js') || fname.endsWith('.mjs'))) {
          out.push({ name: `workerBundle/${fname}`, code: contents });
        }
      }
    }
  } else if (target === 'python') {
    if (result.python) out.push({ name: 'python', code: result.python });
  }
  return out;
}

console.log(`cross-target-smoke: ${apps.length} apps × ${targets.length} targets`);
console.log('');

for (const app of apps) {
  for (const target of targets) {
    const compileOpts = target === 'cloudflare' ? { target: 'cloudflare' } : {};
    let r;
    try {
      r = compileProgram(sourceFor(app, target), compileOpts);
    } catch (e) {
      console.log(`  ${target.padEnd(10)} ${app.padEnd(22)} CRASH   ${e.message}`);
      anyFail = true;
      failures.push({ app, target, phase: 'compile', msg: e.message });
      continue;
    }

    if (r.errors && r.errors.length > 0) {
      const msg = (r.errors[0].message || r.errors[0]).toString().slice(0, 80);
      console.log(`  ${target.padEnd(10)} ${app.padEnd(22)} ERRORS  ${msg}`);
      anyFail = true;
      failures.push({ app, target, phase: 'compile-errors', msg, count: r.errors.length });
      continue;
    }

    const fields = emissionFields(r, target);
    if (fields.length === 0) {
      console.log(`  ${target.padEnd(10)} ${app.padEnd(22)} (no emission field — skipped)`);
      continue;
    }

    for (const { name, code } of fields) {
      const checker = target === 'python' ? checkPython : checkNode;
      const res = checker(code);
      if (res.ok) {
        console.log(`  ${target.padEnd(10)} ${app.padEnd(22)} OK      ${name} (${code.length} B)`);
      } else {
        console.log(`  ${target.padEnd(10)} ${app.padEnd(22)} SYNTAX  ${name}: ${res.msg}`);
        anyFail = true;
        failures.push({ app, target, phase: 'syntax', name, msg: res.msg });
      }
    }
  }
}

console.log('');
if (anyFail) {
  console.log(`FAIL: ${failures.length} issue(s)`);
  process.exit(1);
} else {
  console.log(`OK: all ${apps.length * targets.length} app×target emissions parse clean`);
  process.exit(0);
}
