// =============================================================================
// CLEAR SANDBOX RUNNER
// =============================================================================
//
// Isolated execution environment for compiled Clear apps. Designed for:
//   - RL training loops: run N episodes in parallel, each isolated
//   - Automated evaluation: compile + run + HTTP test + score
//   - Safe experimentation: each run is sandboxed, timeouts enforced
//
// Usage:
//   import { Sandbox } from './sandbox.js';
//
//   const sb = new Sandbox();
//   const result = await sb.run(`
//     build for javascript backend
//     when user calls GET /api/health:
//       send back 'ok'
//   `, {
//     timeout: 5000,
//     tests: [{ method: 'GET', path: '/api/health', expect: { status: 200 } }]
//   });
//   // { ok, exitCode, stdout, stderr, testResults: [{passed, actual, expected}] }
//
// Architecture:
//   - One Sandbox instance = one isolated slot (one port, one temp dir)
//   - Parallel RL episodes = N Sandbox instances running concurrently
//   - Shared node_modules pool from the clear package dir (no re-install)
//   - Each run() call: compile → write → start → test → kill → result
// =============================================================================

import { compileProgram } from './index.js';
import { writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, mkdtempSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = resolve(__dirname, 'runtime');
const NODE_MODULES_DIR = resolve(__dirname, 'node_modules');

// Port pool: sandboxes grab from this range. Concurrent sandboxes get different ports.
let _nextPort = 14000;
function allocatePort() { return _nextPort++; }

// =============================================================================
// HTTP TEST RUNNER
// Runs assertions against a running server. Returns structured results.
// =============================================================================

async function runHttpTests(port, tests, timeoutMs = 3000) {
  const results = [];
  for (const test of tests) {
    const { method = 'GET', path, body, expect: exp = {} } = test;
    try {
      const result = await httpRequest(port, method, path, body, timeoutMs);
      const passed = checkExpectations(result, exp);
      results.push({
        passed: passed.every(Boolean),
        method,
        path,
        checks: passed,
        actual: { status: result.status, body: result.body },
        expected: exp,
      });
    } catch (err) {
      results.push({
        passed: false,
        method,
        path,
        error: err.message,
        actual: null,
        expected: exp,
      });
    }
  }
  return results;
}

function checkExpectations(result, exp) {
  const checks = [];
  if (exp.status !== undefined) {
    checks.push(result.status === exp.status);
  }
  if (exp.body !== undefined) {
    if (typeof exp.body === 'object') {
      // Check each key in expected body exists in actual
      for (const [k, v] of Object.entries(exp.body)) {
        const actual = result.body?.[k];
        checks.push(v === '*' ? actual !== undefined : actual === v);
      }
    } else {
      checks.push(result.body === exp.body);
    }
  }
  if (exp.bodyContains !== undefined) {
    const bodyStr = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    checks.push(bodyStr.includes(exp.bodyContains));
  }
  if (exp.bodyLength !== undefined) {
    checks.push(Array.isArray(result.body) && result.body.length === exp.bodyLength);
  }
  if (exp.bodyLengthGreaterThan !== undefined) {
    checks.push(Array.isArray(result.body) && result.body.length > exp.bodyLengthGreaterThan);
  }
  // If no expectations specified, just check it didn't throw
  if (checks.length === 0) checks.push(true);
  return checks;
}

function httpRequest(port, method, path, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timed out')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Poll until port responds or timeout
async function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await httpRequest(port, 'GET', '/', null, 500);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  // Last attempt: try common health endpoints
  for (const path of ['/api/health', '/api/ping', '/health']) {
    try {
      await httpRequest(port, 'GET', path, null, 500);
      return true;
    } catch {}
  }
  return false;
}

// =============================================================================
// SANDBOX CLASS
// =============================================================================

export class Sandbox {
  constructor(options = {}) {
    this.port = options.port || allocatePort();
    this._dir = null;
  }

  /**
   * Compile and run a Clear program, execute HTTP tests, return structured result.
   *
   * @param {string} clearSource - Clear source code
   * @param {object} options
   * @param {number} [options.timeout=5000] - Max ms for server startup + tests
   * @param {Array}  [options.tests=[]]     - HTTP test assertions to run
   * @returns {Promise<{ok, compileErrors, exitCode, stdout, stderr, testResults, stats}>}
   */
  async run(clearSource, options = {}) {
    const timeout = options.timeout ?? 5000;
    const tests = options.tests ?? [];

    // --- Step 1: Compile ---
    const compiled = compileProgram(clearSource);
    if (compiled.errors && compiled.errors.length > 0) {
      return {
        ok: false,
        compileErrors: compiled.errors,
        exitCode: 1,
        stdout: '',
        stderr: compiled.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n'),
        testResults: [],
        stats: compiled.stats || null,
      };
    }

    const serverCode = compiled.serverJS || compiled.javascript;
    if (!serverCode || !serverCode.includes('express')) {
      return {
        ok: false,
        compileErrors: [{ message: 'No backend server produced. Add "build for javascript backend" or an endpoint.' }],
        exitCode: 1,
        stdout: '',
        stderr: 'No server produced',
        testResults: [],
        stats: compiled.stats || null,
      };
    }

    // --- Step 2: Write to isolated temp dir ---
    const dir = mkdtempSync(join(tmpdir(), 'clear-sandbox-'));
    this._dir = dir;
    try {
      writeFileSync(join(dir, 'server.js'), serverCode);

      // Copy runtime files
      const runtimeDest = join(dir, 'clear-runtime');
      mkdirSync(runtimeDest, { recursive: true });
      for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
        const src = join(RUNTIME_DIR, f);
        if (existsSync(src)) copyFileSync(src, join(runtimeDest, f));
      }

      // Symlink node_modules from the clear package dir (avoids npm install on every run)
      const nmLink = join(dir, 'node_modules');
      if (!existsSync(nmLink)) {
        try {
          const { symlinkSync } = await import('fs');
          symlinkSync(NODE_MODULES_DIR, nmLink, 'junction');
        } catch {
          // Fallback: copy won't work for large node_modules, just skip and hope
        }
      }

      // --- Step 3: Start server ---
      const startResult = await this._startServer(dir, timeout);
      if (!startResult.ok) {
        return {
          ok: false,
          compileErrors: [],
          exitCode: startResult.exitCode,
          stdout: startResult.stdout,
          stderr: startResult.stderr,
          testResults: [],
          stats: compiled.stats || null,
        };
      }

      // --- Step 4: Run HTTP tests ---
      const testResults = tests.length > 0
        ? await runHttpTests(this.port, tests, Math.min(timeout, 3000))
        : [];

      const testsPassed = testResults.every(t => t.passed);
      const exitCode = testResults.length > 0 && !testsPassed ? 4 : 0;

      return {
        ok: exitCode === 0,
        compileErrors: [],
        exitCode,
        stdout: startResult.stdout,
        stderr: startResult.stderr,
        testResults,
        stats: compiled.stats || null,
      };

    } finally {
      this._stop();
      // Clean up temp dir (best-effort)
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
      this._dir = null;
    }
  }

  _startServer(dir, timeoutMs) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const child = spawn('node', ['server.js'], {
        cwd: dir,
        env: { ...process.env, PORT: String(this.port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this._child = child;

      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });

      child.on('exit', (code) => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, exitCode: code ?? 1, stdout, stderr });
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, exitCode: 1, stdout, stderr: err.message });
        }
      });

      // Poll until server is ready or timeout
      const startTime = Date.now();
      const poll = async () => {
        if (settled) return;
        if (Date.now() - startTime > timeoutMs) {
          settled = true;
          child.kill('SIGKILL');
          resolve({ ok: false, exitCode: 1, stdout, stderr: `Server did not start within ${timeoutMs}ms` });
          return;
        }
        try {
          await httpRequest(this.port, 'GET', '/', null, 200);
          if (!settled) {
            settled = true;
            resolve({ ok: true, exitCode: 0, stdout, stderr });
          }
        } catch {
          setTimeout(poll, 150);
        }
      };
      setTimeout(poll, 300);
    });
  }

  _stop() {
    if (this._child && !this._child.killed) {
      try { this._child.kill('SIGKILL'); } catch {}
      this._child = null;
    }
  }
}

// =============================================================================
// CONVENIENCE: run a single Clear program and return score
// =============================================================================

/**
 * Compile, run, and score a Clear program in one call.
 * Simpler interface for RL environments that don't need reuse.
 */
export async function runClear(clearSource, options = {}) {
  const sb = new Sandbox(options);
  return sb.run(clearSource, options);
}
