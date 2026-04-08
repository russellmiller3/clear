// Acceptance test harness — builds apps, starts servers, captures error JSON
import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const results = {};

function build(atNum) {
  const dir = resolve(__dirname, `at${atNum}`);
  const appFile = resolve(dir, 'app.clear');
  if (!existsSync(appFile)) return null;
  const buildDir = resolve(dir, 'build');
  try {
    execSync(`node ${ROOT}/cli/clear.js build ${appFile} --out ${buildDir} --json --quiet 2>&1`);
    // Add package.json to avoid ESM issues
    writeFileSync(resolve(buildDir, 'package.json'), '{}');
    return { ok: true, buildDir };
  } catch (e) {
    const output = e.stdout ? e.stdout.toString() : e.message;
    return { ok: false, compileError: output };
  }
}

async function startServer(buildDir, port) {
  const serverFile = resolve(buildDir, 'server.js');
  if (!existsSync(serverFile)) return null;
  return new Promise((resolve, reject) => {
    const child = spawn('node', [serverFile], {
      env: { ...process.env, PORT: String(port), CLEAR_DEBUG: 'verbose' },
      stdio: 'pipe'
    });
    let started = false;
    child.stdout.on('data', (d) => {
      if (d.toString().includes('running on port') && !started) {
        started = true;
        resolve(child);
      }
    });
    child.stderr.on('data', () => {});
    setTimeout(() => { if (!started) { child.kill(); resolve(null); } }, 4000);
  });
}

function getToken(buildDir) {
  try {
    const authPath = resolve(buildDir, 'clear-runtime/auth.js');
    const auth = require(authPath);
    return auth.createToken({ id: 1, role: 'user' });
  } catch { return null; }
}

async function httpReq(port, method, path, body, token) {
  const url = `http://localhost:${port}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(5000) });
    const text = await r.text();
    try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, text }; }
  } catch (e) {
    return { error: e.message };
  }
}

// Define test scenarios
const tests = [
  { at: 1, method: 'POST', path: '/api/contacts', body: { name: 'Alice' }, auth: true,
    desc: 'Missing required field (email)' },
  { at: 2, method: 'POST', path: '/api/seed', body: null, auth: false,
    desc: 'Unique constraint violation (duplicate email in seed)' },
  { at: 3, method: 'PUT', path: '/api/contacts/999', body: { name: 'Ghost' }, auth: true,
    desc: 'Update non-existent record' },
  { at: 4, method: 'POST', path: '/api/line-items', body: { invoice_id: '999', description: 'Widget' }, auth: true,
    desc: 'Foreign key orphan (invoice_id 999 does not exist)' },
  { at: 5, method: 'POST', path: '/api/products', body: { name: 'Widget', price: 'fifty' }, auth: true,
    desc: 'Type coercion — string where number expected' },
  { at: 7, method: 'DELETE', path: '/api/admin/users/1', body: null, auth: true, role: 'admin',
    desc: 'Wrong role (admin instead of superadmin)' },
  { at: 8, method: 'POST', path: '/api/orders', body: { amount: 'abc', email: 'not-an-email' }, auth: true,
    desc: 'Validation type mismatch (amount + email)' },
  { at: 9, method: 'POST', path: '/api/seed', body: null, auth: false, concurrent: 5,
    desc: 'Concurrent seed creates duplicates' },
  { at: 10, method: 'POST', path: '/api/charge', body: {}, auth: true,
    desc: 'Timeout on external API (2s timeout)' },
  { at: 11, method: 'POST', path: '/api/charge', body: {}, auth: true,
    desc: 'Missing Stripe API key' },
  { at: 12, method: 'POST', path: '/api/notify', body: {}, auth: true,
    desc: 'SendGrid rejects request' },
  { at: 14, compile: true, desc: 'Wrong table name (typo: Contac instead of Contact)' },
  { at: 21, method: 'POST', path: '/api/contacts', body: { name: 'Alice' }, auth: true,
    desc: 'Suggested fix — missing required field with suggested_fix in response' },
  { at: 25, method: 'POST', path: '/api/contacts', body: { name: 'Alice' }, auth: true,
    desc: 'Silent wrong output — = vs is for string assignment' },
  { at: 27, method: 'POST', path: '/api/contacts', body: { name: 'Bob' }, auth: true,
    desc: 'Ultimate test — fix from error alone' },
];

// Compile-time tests
const compileTests = [6, 14];
// Frontend output tests (no server needed)
const frontendTests = [13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 26];

async function run() {
  console.log('=== Building all apps ===');
  let port = 4000;

  // Build everything
  for (let i = 1; i <= 27; i++) {
    const r = build(i);
    if (r) {
      if (r.ok) console.log(`  AT-${i}: Built OK`);
      else console.log(`  AT-${i}: Compile error (expected for AT-6/14)`);
      results[`at${i}`] = { build: r };
    }
  }

  // Run compile-time tests
  console.log('\n=== Compile-time tests ===');
  for (const atNum of compileTests) {
    const r = results[`at${atNum}`];
    if (r && !r.build.ok) {
      console.log(`  AT-${atNum}: ${r.build.compileError.substring(0, 200)}`);
      r.error = { type: 'compile', output: r.build.compileError };
    }
  }

  // Run frontend output tests
  console.log('\n=== Frontend output tests ===');
  for (const atNum of frontendTests) {
    const r = results[`at${atNum}`];
    if (!r || !r.build.ok) continue;
    // Read compiled output and extract error-related patterns
    const buildDir = r.build.buildDir;
    let html = '', serverJS = '';
    try { html = readFileSync(resolve(buildDir, 'index.html'), 'utf-8'); } catch {}
    try { serverJS = readFileSync(resolve(buildDir, 'server.js'), 'utf-8'); } catch {}

    const errorPatterns = [];
    if (html.includes('[clear:')) errorPatterns.push('Has [clear:LINE] context in fetch');
    if (html.includes('console.error')) errorPatterns.push('Has console.error logging');
    if (html.includes('_clearError')) errorPatterns.push('Has _clearError utility');
    if (html.includes('_editing_id')) errorPatterns.push('Uses shared _editing_id');
    if (serverJS.includes('_clearMap')) errorPatterns.push('Has _clearMap source map');
    if (serverJS.includes('suggested_fix')) errorPatterns.push('Has suggested_fix logic');
    if (serverJS.includes('_clearTry')) errorPatterns.push('Has _clearTry wrapping');

    r.frontendOutput = { patterns: errorPatterns, htmlLen: html.length, serverLen: serverJS.length };
    console.log(`  AT-${atNum}: ${errorPatterns.join(', ') || 'No error patterns found'}`);
  }

  // Run server tests
  console.log('\n=== Server runtime tests ===');
  for (const test of tests) {
    if (test.compile) continue;
    const r = results[`at${test.at}`];
    if (!r || !r.build.ok) { console.log(`  AT-${test.at}: Skipped (no build)`); continue; }

    const p = port++;
    const server = await startServer(r.build.buildDir, p);
    if (!server) { console.log(`  AT-${test.at}: Server failed to start`); continue; }

    let token = null;
    if (test.auth) {
      try {
        const authPath = resolve(r.build.buildDir, 'clear-runtime/auth.js');
        // Use dynamic import for CJS module
        const out = execSync(`node -e "const a = require('${authPath}'); console.log(a.createToken({ id: 1, role: '${test.role || 'user'}' }))"`, { encoding: 'utf-8' }).trim();
        token = out.split('\n').pop();
      } catch (e) { console.log(`  AT-${test.at}: Token creation failed: ${e.message}`); }
    }

    if (test.concurrent) {
      // Fire concurrent requests
      const promises = Array(test.concurrent).fill().map(() => httpReq(p, test.method, test.path, test.body, token));
      const responses = await Promise.all(promises);
      const errors = responses.filter(r => r.json && r.json.error);
      r.runtimeError = errors[0]?.json || responses[0]?.json || { note: 'No errors from concurrent requests' };
      console.log(`  AT-${test.at}: ${errors.length}/${test.concurrent} errors (${test.desc})`);
    } else {
      const resp = await httpReq(p, test.method, test.path, test.body, token);
      r.runtimeError = resp.json || resp;
      console.log(`  AT-${test.at}: ${resp.status} — ${JSON.stringify(resp.json || resp).substring(0, 120)}`);
    }

    server.kill();
    await new Promise(r => setTimeout(r, 300));
  }

  // Write results
  writeFileSync(resolve(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== Results written to tests/acceptance/results.json ===');
}

run().catch(e => { console.error(e); process.exit(1); });
