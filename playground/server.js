import express from 'express';
import { compileProgram } from '../index.js';
import { patch } from '../patch.js';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load .env from project root
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.replace(/\r$/, '');
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  });
}
const APPS_DIR = join(ROOT_DIR, 'apps');
const BUILD_DIR = join(__dirname, '.playground-build');

const app = express();
app.use(express.json({ limit: '1mb' }));

// =============================================================================
// STATIC FILES
// =============================================================================
// Route ide.html BEFORE static (otherwise index.html wins)
// No-cache headers so edits show on browser refresh without server restart
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(join(__dirname, 'ide.html'));
});
app.use(express.static(__dirname, { etag: false, lastModified: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

// =============================================================================
// COMPILE
// =============================================================================
app.post('/api/compile', (req, res) => {
  try {
    const { source } = req.body;
    if (!source && source !== '') return res.status(400).json({ error: 'Missing source' });
    if (!source.trim()) return res.json({ errors: [], warnings: [], html: null, javascript: null, serverJS: null, python: null, browserServer: null, css: null });
    const result = compileProgram(source, { sourceMap: true });
    res.json({
      errors: result.errors || [],
      warnings: result.warnings || [],
      html: result.html || null,
      javascript: result.javascript || null,
      serverJS: result.serverJS || null,
      python: result.python || null,
      browserServer: result.browserServer || null,
      css: result.css || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// TEMPLATES
// =============================================================================
const FEATURED_TEMPLATES = [
  // Core 8 — Playwright-tested, showcase all features
  'todo-fullstack',    // CRUD basics: tables, endpoints, auth, validation, search
  'crm-pro',           // Data dashboard: charts, search, aggregates, relationships
  'blog-fullstack',    // Content app: belongs to, rich display, search
  'live-chat',         // Real-time: WebSocket, subscribe, broadcast
  'helpdesk-agent',    // AI agent: tools, RAG, memory, guardrails, search
  'booking',           // Workflow: relationships, validation, scheduling
  'expense-tracker',   // Personal app: aggregates, charts, search, categories
  'ecom-agent',        // E-commerce: agent + chat UI, intent routing, skills, dashboard
];

app.get('/api/templates', (req, res) => {
  try {
    const dirs = readdirSync(APPS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => FEATURED_TEMPLATES.includes(d.name))
      .filter(d => existsSync(join(APPS_DIR, d.name, 'main.clear')));
    const templates = dirs.map(d => {
      const source = readFileSync(join(APPS_DIR, d.name, 'main.clear'), 'utf8');
      const firstComment = source.match(/^#\s*(.+)/m);
      return {
        name: d.name,
        description: firstComment ? firstComment[1].replace(/^-+\s*/, '').trim() : '',
      };
    }).sort((a, b) => FEATURED_TEMPLATES.indexOf(a.name) - FEATURED_TEMPLATES.indexOf(b.name));
    res.json(templates);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/template/:name', (req, res) => {
  const filePath = join(APPS_DIR, req.params.name, 'main.clear');
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Template not found' });
  res.type('text/plain').send(readFileSync(filePath, 'utf8'));
});

// =============================================================================
// DOCS — serve markdown reference files
// =============================================================================
const ALLOWED_DOCS = { 'syntax': 'SYNTAX.md', 'user-guide': 'USER-GUIDE.md' };

app.get('/api/docs/:name', (req, res) => {
  const filename = ALLOWED_DOCS[req.params.name];
  if (!filename) return res.status(404).json({ error: 'Doc not found' });
  const filePath = join(ROOT_DIR, filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.type('text/plain; charset=utf-8').send(readFileSync(filePath, 'utf8'));
});

// =============================================================================
// EXEC — run shell commands (whitelisted)
// =============================================================================
const ALLOWED_PREFIXES = ['node ', 'curl ', 'ls ', 'cat '];

app.post('/api/exec', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command' });

  // Security: whitelist prefix
  const allowed = ALLOWED_PREFIXES.some(p => command.startsWith(p));
  if (!allowed) return res.status(403).json({ error: `Command not allowed. Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}` });

  // Security: block command chaining/injection
  if (/[;&|`$]/.test(command) || command.includes('$(') || command.includes('>{')) {
    return res.status(403).json({ error: 'Command chaining (&&, ||, ;, |, $()) is not allowed' });
  }

  try {
    const stdout = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    res.json({ stdout, stderr: '', exitCode: 0 });
  } catch (err) {
    res.json({
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
    });
  }
});

// =============================================================================
// RUN — start compiled app as child process
// =============================================================================
let runningChild = null;
let runningPort = 4000;

// =============================================================================
// BROWSER AUTOMATION — Playwright-backed page for Meph's UI testing tools
// =============================================================================
// A single headless browser instance is reused across all tool calls.
// The page navigates to the running app's port. Network requests and
// WebSocket messages are captured in ring buffers so Meph can query them.
let _browser = null;
let _page = null;
let _pageConnectedTo = null; // port number the page is currently on
const _networkBuffer = []; // last 100 network requests
const _websocketBuffer = []; // last 100 WebSocket messages

async function getPage() {
  // Lazy-launch browser on first use
  if (!_browser) {
    _browser = await chromium.launch({ headless: true });
    const context = await _browser.newContext();
    _page = await context.newPage();

    // Capture every network request/response
    _page.on('requestfinished', async (req) => {
      try {
        const res = await req.response();
        let body = null;
        try {
          const contentType = res?.headers()?.['content-type'] || '';
          if (contentType.includes('json') || contentType.includes('text')) {
            body = (await res.text()).slice(0, 2000);
          }
        } catch {}
        _networkBuffer.push({
          url: req.url(),
          method: req.method(),
          status: res?.status() || 0,
          body,
          ts: Date.now(),
        });
        if (_networkBuffer.length > 100) _networkBuffer.shift();
      } catch {}
    });
    _page.on('requestfailed', (req) => {
      _networkBuffer.push({
        url: req.url(),
        method: req.method(),
        status: 0,
        error: req.failure()?.errorText || 'request failed',
        ts: Date.now(),
      });
      if (_networkBuffer.length > 100) _networkBuffer.shift();
    });

    // Capture WebSocket messages (both directions)
    _page.on('websocket', (ws) => {
      ws.on('framesent', (f) => {
        _websocketBuffer.push({ direction: 'sent', url: ws.url(), payload: String(f.payload).slice(0, 500), ts: Date.now() });
        if (_websocketBuffer.length > 100) _websocketBuffer.shift();
      });
      ws.on('framereceived', (f) => {
        _websocketBuffer.push({ direction: 'received', url: ws.url(), payload: String(f.payload).slice(0, 500), ts: Date.now() });
        if (_websocketBuffer.length > 100) _websocketBuffer.shift();
      });
    });
  }

  // Navigate to the running app if not already there
  if (runningPort && _pageConnectedTo !== runningPort) {
    _networkBuffer.length = 0;
    _websocketBuffer.length = 0;
    await _page.goto('http://localhost:' + runningPort, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
    _pageConnectedTo = runningPort;
  }
  return _page;
}

async function closeBrowser() {
  if (_browser) { try { await _browser.close(); } catch {} _browser = null; _page = null; _pageConnectedTo = null; }
}
// NOTE: SIGTERM/SIGINT cleanup is consolidated below into a single handler so
// closeBrowser finishes BEFORE process.exit — otherwise libuv hits
// "UV_HANDLE_CLOSING" on Windows when Playwright's async handles are still open.

// Terminal ring buffer — last 500 lines from running app stdout/stderr
const terminalBuffer = [];
function termLog(line) {
  terminalBuffer.push(line);
  if (terminalBuffer.length > 500) terminalBuffer.shift();
}

// Frontend error log — captured via injected script in compiled app.
// Mirrored to the main terminal so the user sees one honest timeline (stdout,
// stderr, user clicks, Meph tools, AND browser console errors all interleaved).
const frontendErrors = [];
app.post('/api/frontend-log', (req, res) => {
  const { type, message, source, lineno } = req.body || {};
  frontendErrors.push({ type: type || 'error', message, source, lineno, ts: Date.now() });
  if (frontendErrors.length > 100) frontendErrors.shift();
  try {
    const tag = type === 'warn' ? '[browser warn]' : type === 'log' || type === 'info' ? '[browser]' : '[browser error]';
    const loc = source && lineno ? ` (${String(source).split('/').pop()}:${lineno})` : '';
    termLog(`${tag} ${String(message || '').slice(0, 500)}${loc}`);
  } catch {}
  res.json({ ok: true });
});

app.get('/api/terminal-log', (req, res) => {
  res.json({ lines: terminalBuffer.slice(-100), frontendErrors: frontendErrors.slice(-20) });
});

// =============================================================================
// MEPH ACTIONS — user interaction recorder for shared session debugging
// =============================================================================
// The Studio bridge in compiled HTML posts user actions (click, input, submit)
// to the parent window. ide.html relays them here. Meph reads them via the
// `read_actions` tool to know what the user did, so "fix this bug" doesn't
// require the user to list every step they took.
const mephActionsBuffer = []; // last 200 user actions
app.post('/api/meph-actions', (req, res) => {
  const action = req.body || {};
  if (!action.action) return res.status(400).json({ error: 'Missing action field' });
  mephActionsBuffer.push({ ...action, recorded_at: Date.now() });
  if (mephActionsBuffer.length > 200) mephActionsBuffer.shift();
  // Mirror to terminal so the user sees their own clicks/input in the terminal pane.
  // Format: "[user] click → #save-btn" or "[user] input → title = 'Hello'"
  try {
    const parts = [`[user] ${action.action}`];
    if (action.selector) parts.push(action.selector);
    if (action.value !== undefined && action.value !== null) {
      const v = String(action.value).slice(0, 60);
      parts.push(`= ${JSON.stringify(v)}`);
    }
    if (action.text && action.action === 'click') {
      const t = String(action.text).slice(0, 40);
      if (t) parts.push(`"${t}"`);
    }
    termLog(parts.join(' '));
  } catch {}
  res.json({ ok: true });
});
app.get('/api/meph-actions', (req, res) => {
  res.json({ actions: mephActionsBuffer.slice(-100) });
});
app.post('/api/meph-actions/clear', (req, res) => {
  mephActionsBuffer.length = 0;
  res.json({ ok: true });
});

// =============================================================================
// TEST RUNNER — parse test output into structured results
// =============================================================================
function parseTestOutput(stdout) {
  const results = [];
  const lines = (stdout || '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Test output format: "PASS: test name" or "FAIL: test name - error [clear:N]"
    // Older runs used " -- " as the separator; accept both.
    const passMatch = trimmed.match(/^PASS:\s*(.+)/);
    const failMatch = trimmed.match(/^FAIL:\s*(.+?)(?:\s*-{1,2}\s*(.+))?$/);
    if (passMatch) {
      results.push({ name: passMatch[1], status: 'pass' });
    } else if (failMatch) {
      let err = failMatch[2] || '';
      // Extract the [clear:N] tag the compiler emits so the Studio UI can jump to source
      let sourceLine = null;
      const tagMatch = err.match(/\s*\[clear:(\d+)\]\s*$/);
      if (tagMatch) {
        sourceLine = parseInt(tagMatch[1], 10);
        err = err.slice(0, tagMatch.index).trim();
      }
      results.push({ name: failMatch[1], status: 'fail', error: err, sourceLine });
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  return { passed, failed, results };
}

// Exported for testing
export { parseTestOutput };

function runTestProcess(source) {
  const start = Date.now();
  if (!source || !source.trim()) {
    return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  }
  const tmpPath = join(BUILD_DIR, '_test-source-' + Date.now() + '.clear');
  mkdirSync(BUILD_DIR, { recursive: true });
  writeFileSync(tmpPath, source);
  try {
    // Pass API key from Meph config so agent tests can call Claude
    const testEnv = { ...process.env, ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}) };
    const stdout = execSync(`node cli/clear.js test "${tmpPath}"`, { cwd: ROOT_DIR, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024, env: testEnv });
    const parsed = parseTestOutput(stdout);
    return { ok: true, ...parsed, duration: Date.now() - start };
  } catch (err) {
    if (err.status === 4) {
      const parsed = parseTestOutput(err.stdout || '');
      return { ok: false, ...parsed, duration: Date.now() - start };
    }
    if (err.status === 1) {
      try {
        const errData = JSON.parse(err.stdout);
        return { ok: false, error: 'Compile errors', errors: errData.errors || [], duration: Date.now() - start };
      } catch {
        return { ok: false, error: (err.stdout || err.stderr || err.message).slice(0, 2000), duration: Date.now() - start };
      }
    }
    return { ok: false, error: (err.stderr || err.message || 'Test runner failed').slice(0, 2000), duration: Date.now() - start };
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

app.post('/api/run-tests', (req, res) => {
  const { source } = req.body;
  const result = runTestProcess(source);
  res.json(result);
});

// === STRUCTURED AGENT EVALS ===
//
// One eval suite per compiled app. Three kinds per suite:
//   - e2e    — POST the user-facing endpoint, LLM-grade the final result
//   - role   — POST an agent's endpoint, LLM-grade "did it do its job"
//   - format — POST an agent's endpoint, deterministic shape check (no API key needed)
//   - info   — agents called only by other agents; listed, not runnable
//
// Each eval has a unique id and is individually runnable.
// GET /api/eval-suite — returns the suite list (no execution)
// POST /api/run-eval  — runs one or all ({ id?: string }) ; returns results
//
// The child process that hosts the compiled app is kept alive for 60 seconds
// after the last run so "Run" clicks on individual eval rows are fast —
// we don't re-spawn the server for each click.

let evalChild = null;
let evalChildPort = null;
let evalChildIdleTimer = null;
const EVAL_PORT = 4999;
const EVAL_IDLE_MS = 60_000;

// Promise mutex — serializes eval suite runs so a Run-All and a Run-One-Eval
// never interleave. Each `/api/run-eval` caller chains onto this promise and
// awaits its ticket. Blocks nothing else in Studio; only eval runs are serial.
let _evalMutex = Promise.resolve();

function killEvalChild() {
  if (evalChildIdleTimer) { clearTimeout(evalChildIdleTimer); evalChildIdleTimer = null; }
  if (evalChild) {
    try { evalChild.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { if (evalChild) evalChild.kill('SIGKILL'); } catch {} }, 1500);
  }
  evalChild = null;
  evalChildPort = null;
}

// Orphan-child cleanup on Studio shutdown. Without these, Ctrl-C or an
// uncaught exception would leave the eval child running on port 4999,
// blocking the next Studio restart.
process.on('SIGINT', killEvalChild);
process.on('SIGTERM', killEvalChild);
process.on('exit', killEvalChild);

function resetEvalIdleTimer() {
  if (evalChildIdleTimer) clearTimeout(evalChildIdleTimer);
  evalChildIdleTimer = setTimeout(() => {
    termLog('[eval] idle timeout — stopping eval child');
    killEvalChild();
  }, EVAL_IDLE_MS);
}

// Wipe any persistent DB state the eval child previously wrote. Runs at the
// start of every FULL eval suite (no id), so Run-All always sees a clean
// slate. Single-eval re-runs skip this for fast iteration on one agent.
function wipeEvalChildDbFiles() {
  for (const f of ['clear-data.db', 'clear-data.db-wal', 'clear-data.db-shm', 'clear-data.db-journal', 'clear-data.json']) {
    try { unlinkSync(join(BUILD_DIR, f)); } catch {}
  }
  termLog('[eval] DB wiped before full suite run');
}

// Splice the auto-generated /_eval/* handlers into compiled serverJS right
// before `app.listen(...)` so every agent is reachable via HTTP for grading.
function injectEvalEndpoints(serverJS, endpointsJS) {
  if (!endpointsJS) return serverJS;
  // Insert above `const PORT = process.env.PORT` (the usual listen preamble).
  const marker = /const PORT = process\.env\.PORT/;
  if (marker.test(serverJS)) {
    return serverJS.replace(marker, endpointsJS + '\nconst PORT = process.env.PORT');
  }
  // Fallback: prepend to `app.listen(` directly.
  return serverJS.replace(/app\.listen\(/, endpointsJS + '\napp.listen(');
}

async function ensureEvalChild(serverJS, endpointsJS) {
  const fullJS = injectEvalEndpoints(serverJS, endpointsJS || '');
  // If we already have a child for THIS exact source, reuse it.
  if (evalChild && evalChildPort && evalChild._lastServerJS === fullJS) {
    resetEvalIdleTimer();
    return evalChildPort;
  }
  // Otherwise: kill any previous child (source changed) and spin a fresh one.
  killEvalChild();

  const rtDir = join(BUILD_DIR, 'clear-runtime');
  mkdirSync(rtDir, { recursive: true });
  for (const f of ['clear-data.db', 'clear-data.db-wal', 'clear-data.db-shm', 'clear-data.db-journal', 'clear-data.json']) {
    try { unlinkSync(join(BUILD_DIR, f)); } catch {}
  }
  writeFileSync(join(BUILD_DIR, 'server.js'), fullJS);
  const deps = { ws: '*' };
  if (fullJS.includes("require('bcryptjs')")) deps.bcryptjs = '*';
  if (fullJS.includes("require('jsonwebtoken')")) deps.jsonwebtoken = '*';
  if (fullJS.includes("require('multer')")) deps.multer = '*';
  if (fullJS.includes("require('nodemailer')")) deps.nodemailer = '*';
  writeFileSync(join(BUILD_DIR, 'package.json'), JSON.stringify({ dependencies: deps }));
  const depsNeeded = Object.keys(deps).filter(d => !existsSync(join(BUILD_DIR, 'node_modules', d)));
  if (depsNeeded.length > 0) {
    try { execSync('npm install --production --silent', { cwd: BUILD_DIR, timeout: 15000, stdio: 'pipe' }); } catch {}
  }
  const runtimeDir = join(ROOT_DIR, 'runtime');
  for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
    if (existsSync(join(runtimeDir, f))) copyFileSync(join(runtimeDir, f), join(rtDir, f));
  }
  const env = { ...process.env, PORT: String(EVAL_PORT), JWT_SECRET: 'clear-eval-secret', ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}) };
  const child = spawn('node', ['server.js'], { cwd: BUILD_DIR, env, stdio: 'pipe' });
  child._lastServerJS = fullJS;
  evalChild = child;
  evalChildPort = EVAL_PORT;
  child.stderr.on('data', d => termLog('[eval-stderr] ' + d.toString().trimEnd()));
  child.stdout.on('data', d => termLog('[eval-stdout] ' + d.toString().trimEnd()));
  child.on('exit', () => { if (evalChild === child) { evalChild = null; evalChildPort = null; } });
  // Wait for the port to accept connections.
  await probeUntilReady(EVAL_PORT, 10_000);
  resetEvalIdleTimer();
  return EVAL_PORT;
}

// Claude-as-judge. Returns { pass, feedback, score, skipped }.
async function gradeWithClaude(rubric, input, output) {
  const key = storedApiKey || process.env.ANTHROPIC_API_KEY || '';
  if (!key) return { skipped: true, reason: 'ANTHROPIC_API_KEY not set — role/e2e grading skipped' };
  const model = process.env.EVAL_MODEL || 'claude-sonnet-4-20250514';
  const prompt = `You are grading an AI agent's output.\n\nRubric:\n${rubric}\n\nInput given to the agent:\n${JSON.stringify(input)}\n\nAgent's output:\n${typeof output === 'string' ? output : JSON.stringify(output)}\n\nRespond with ONLY a JSON object: { "pass": true|false, "score": 1-10, "feedback": "<one sentence>" }`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!r.ok) return { pass: false, feedback: `Grader HTTP ${r.status}`, score: 0 };
    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { pass: false, feedback: 'Grader returned non-JSON', score: 0 };
    const g = JSON.parse(m[0]);
    return { pass: !!g.pass, score: g.score || 0, feedback: g.feedback || '' };
  } catch (err) {
    return { pass: false, feedback: 'Grader error: ' + err.message, score: 0 };
  }
}

// Deterministic format check. Works without API key.
function checkFormat(expected, output) {
  if (!output || (typeof output === 'object' && Object.keys(output).length === 0)) {
    return { pass: false, feedback: 'Output is empty.' };
  }
  if (expected.kind === 'non-empty') {
    const asText = typeof output === 'string' ? output : JSON.stringify(output);
    if (!asText || asText.length < 2) return { pass: false, feedback: 'Output is empty or too short.' };
    return { pass: true, feedback: 'Output is non-empty.' };
  }
  if (expected.kind === 'fields' && Array.isArray(expected.fields)) {
    if (typeof output !== 'object' || Array.isArray(output)) return { pass: false, feedback: 'Expected an object with fields, got ' + typeof output };
    const missing = expected.fields.filter(f => output[f.name] === undefined).map(f => f.name);
    const wrongType = expected.fields.filter(f => {
      if (output[f.name] === undefined) return false;
      if (f.type === 'number' && typeof output[f.name] !== 'number') return true;
      if (f.type === 'boolean' && typeof output[f.name] !== 'boolean') return true;
      return false;
    }).map(f => f.name);
    if (missing.length || wrongType.length) {
      return { pass: false, feedback: (missing.length ? `Missing fields: ${missing.join(', ')}. ` : '') + (wrongType.length ? `Wrong types: ${wrongType.join(', ')}.` : '') };
    }
    return { pass: true, feedback: `All ${expected.fields.length} expected fields present with correct types.` };
  }
  return { pass: true, feedback: 'No expectation specified; treated as pass.' };
}

// Hit an endpoint on the eval child and return { status, data, streamed? }.
//
// Streaming endpoints return content-type: text/event-stream. Naively
// calling `r.json()` on them returns raw frame text like
// `data: {"text":"partial"}\n\ndata: {"text":" more"}\n\n`, which is not
// useful for grading. This function detects that case and drains the
// stream, concatenating the `text` field from each `data:` frame into a
// single string. The rest of the runner then grades the complete response.
async function callEvalEndpoint(port, path, body) {
  try {
    const r = await fetch(`http://localhost:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000)
    });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('text/event-stream')) {
      const drained = await _drainSSE(r);
      return { status: r.status, data: drained, streamed: true };
    }
    let data;
    try { data = await r.json(); }
    catch { data = await r.text(); }
    return { status: r.status, data };
  } catch (err) {
    return { status: 0, data: null, error: err.message };
  }
}

// Read an SSE response body and concatenate all `data: ...` frames into
// a single string. Each frame is either `data: {"text": "..."}` (our
// streaming-agent format) or `data: [DONE]` (end sentinel). Non-JSON frames
// are treated as raw text to preserve whatever the endpoint emitted.
async function _drainSSE(response) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    // Fallback path when streams aren't available — read full text, parse frames.
    const raw = await response.text();
    return _parseSSEFrames(raw);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on SSE frame boundaries (\n\n); keep the last partial frame in the buffer
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    for (const frame of frames) out += _extractSSEFrameText(frame);
  }
  if (buffer) out += _extractSSEFrameText(buffer);
  return out;
}

function _parseSSEFrames(rawText) {
  let out = '';
  for (const frame of rawText.split('\n\n')) {
    out += _extractSSEFrameText(frame);
  }
  return out;
}

function _extractSSEFrameText(frame) {
  const trimmed = frame.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return '';
  const payload = trimmed.slice('data:'.length).trim();
  if (payload === '[DONE]' || payload === '') return '';
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed.text === 'string') return parsed.text;
    return '';
  } catch {
    // Non-JSON frame — treat as raw
    return payload;
  }
}

async function runOneEval(spec, port) {
  const started = Date.now();
  if (!spec.endpointPath) {
    return { id: spec.id, status: 'skip', duration: Date.now() - started, feedback: spec.note || 'Not directly runnable.' };
  }
  const resp = await callEvalEndpoint(port, spec.endpointPath, spec.input);
  if (resp.status === 0) {
    return { id: spec.id, status: 'fail', duration: Date.now() - started, feedback: 'Network error: ' + (resp.error || 'unknown'), input: spec.input };
  }
  if (resp.status >= 400) {
    return { id: spec.id, status: 'fail', duration: Date.now() - started, feedback: `Endpoint returned ${resp.status}.`, input: spec.input, output: resp.data };
  }
  // Format: deterministic shape check.
  if (spec.kind === 'format') {
    const check = checkFormat(spec.expected || { kind: 'non-empty' }, resp.data);
    return { id: spec.id, status: check.pass ? 'pass' : 'fail', duration: Date.now() - started, feedback: check.feedback, input: spec.input, output: resp.data };
  }
  // Role / E2E: deterministic "non-empty" gate, then LLM grading if a rubric is given.
  const nonEmpty = checkFormat({ kind: 'non-empty' }, resp.data);
  if (!nonEmpty.pass) {
    return { id: spec.id, status: 'fail', duration: Date.now() - started, feedback: nonEmpty.feedback, input: spec.input, output: resp.data };
  }
  if (spec.rubric) {
    const grade = await gradeWithClaude(spec.rubric, spec.input, resp.data);
    if (grade.skipped) {
      return { id: spec.id, status: 'skip', duration: Date.now() - started, feedback: grade.reason, input: spec.input, output: resp.data };
    }
    return { id: spec.id, status: grade.pass ? 'pass' : 'fail', duration: Date.now() - started, feedback: grade.feedback, score: grade.score, input: spec.input, output: resp.data };
  }
  return { id: spec.id, status: 'pass', duration: Date.now() - started, feedback: 'Endpoint returned a non-empty response.', input: spec.input, output: resp.data };
}

// Compile the given source. Returns { ok, compiled?, error? }.
function compileForEval(source) {
  if (!source || !source.trim()) return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  let compiled;
  try { compiled = compileProgram(source); }
  catch (err) { return { ok: false, error: 'Compile threw: ' + err.message }; }
  if (compiled.errors && compiled.errors.length > 0) {
    return { ok: false, error: 'Source has compile errors — fix them before running evals.', errors: compiled.errors };
  }
  // `serverJS` exists when the app builds both web + backend. For a pure
  // backend-only app the code lives in `javascript` instead. Accept either.
  const server = compiled.serverJS || compiled.javascript;
  if (!server) return { ok: false, error: 'App has no backend to run evals against (need a javascript backend build target).' };
  return { ok: true, compiled, serverJS: server };
}

// GET /api/eval-suite — returns the suite list (no execution, no child).
app.post('/api/eval-suite', (req, res) => {
  const { source } = req.body;
  const compiled = compileForEval(source);
  if (!compiled.ok) return res.json(compiled);
  const suite = compiled.compiled.evalSuite || [];
  res.json({ ok: true, suite });
});

// Shared runner used by both the HTTP endpoint and Meph's run_evals/run_eval
// tools. Serialized via `_evalMutex` so concurrent callers (e.g. Run-All +
// per-row Run) never interleave on the same DB / child process. Returns the
// same shape the UI expects.
async function runEvalSuite(source, id) {
  // Take a ticket on the mutex chain. The chain always ends in a resolved
  // promise; we append our run after it and set the chain forward so the
  // next caller waits for us.
  const ticket = _evalMutex.then(() => _runEvalSuiteImpl(source, id));
  _evalMutex = ticket.catch(() => undefined);
  return ticket;
}

async function _runEvalSuiteImpl(source, id) {
  const start = Date.now();
  const compiled = compileForEval(source);
  if (!compiled.ok) return { ...compiled, duration: Date.now() - start };
  const suite = compiled.compiled.evalSuite || [];
  if (suite.length === 0) return { ok: true, suite: [], results: [], empty: true, duration: Date.now() - start };
  let specs = suite;
  if (id) {
    specs = suite.filter(s => s.id === id);
    if (specs.length === 0) return { ok: false, error: `Unknown eval id: ${id}`, duration: Date.now() - start };
  }
  try {
    // Full-suite runs wipe DB state to guarantee deterministic behavior.
    // Single-eval re-runs keep the DB warm for fast iteration.
    if (!id) {
      killEvalChild();          // force respawn so the wipe is observed by the DB module
      wipeEvalChildDbFiles();
    }
    const port = await ensureEvalChild(compiled.serverJS, compiled.compiled.evalEndpointsJS || '');
    const results = [];
    for (const spec of specs) {
      results.push(await runOneEval(spec, port));
    }
    resetEvalIdleTimer();
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    return { ok: failed === 0, suite, results, passed, failed, skipped, duration: Date.now() - start };
  } catch (err) {
    return { ok: false, error: 'Eval run failed: ' + err.message, duration: Date.now() - start };
  }
}

// POST /api/run-eval — runs one or all evals.
//   body: { source, id?: string }  → if id present, runs just that eval;
//                                    otherwise runs the whole suite.
app.post('/api/run-eval', async (req, res) => {
  const { source, id } = req.body || {};
  const result = await runEvalSuite(source, id);
  res.json(result);
});

// Legacy endpoint kept for any stale clients — now just a no-op redirect.
app.post('/api/run-evals', async (req, res) => {
  req.body = req.body || {};
  req.body.id = undefined;
  return app._router.handle({ ...req, url: '/api/run-eval', method: 'POST' }, res, () => {});
});

// Store API key server-side so child processes (compiled apps with agents) can use it
let storedApiKey = process.env.ANTHROPIC_API_KEY || '';
let mephTodos = [];
app.post('/api/set-key', (req, res) => {
  storedApiKey = req.body.key || '';
  res.json({ ok: true });
});

// Poll the child app's port until it accepts a connection or we time out.
// Used to defeat the race where the child prints "running on port N" but
// Express's route handlers haven't mounted yet — without this, the very
// next /api/fetch from the e2e suite hits ECONNREFUSED.
async function probeUntilReady(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) });
      // Any HTTP response (even 404) means the server is up
      if (r.status > 0) return;
    } catch {}
    await new Promise(ok => setTimeout(ok, 50));
  }
  throw new Error('probe timeout');
}

app.post('/api/run', async (req, res) => {
  const { serverJS, html, css } = req.body;
  if (!serverJS) return res.status(400).json({ error: 'No server code to run' });

  // Kill previous and wait for actual exit before reusing BUILD_DIR / DB.
  if (runningChild) {
    const prev = runningChild;
    runningChild = null;
    try { prev.kill('SIGTERM'); } catch {}
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      prev.once('exit', finish);
      setTimeout(() => { try { prev.kill('SIGKILL'); } catch {} finish(); }, 2000);
    });
  }

  // Write build files
  const rtDir = join(BUILD_DIR, 'clear-runtime');
  mkdirSync(rtDir, { recursive: true });
  // Wipe ALL persistent state between runs — different apps share BUILD_DIR
  // but their schemas don't, so leftover tables from a prior app cause the
  // next one's seed/queries to fail unpredictably. Includes SQLite + JSON
  // fallback + journal file. Errors swallowed (file may not exist).
  for (const f of ['clear-data.db', 'clear-data.db-wal', 'clear-data.db-shm', 'clear-data.db-journal', 'clear-data.json']) {
    try { unlinkSync(join(BUILD_DIR, f)); } catch {}
  }
  writeFileSync(join(BUILD_DIR, 'server.js'), serverJS);
  // Build deps based on what the compiled code needs
  const deps = { ws: '*' };
  if (serverJS.includes("require('bcryptjs')")) deps.bcryptjs = '*';
  if (serverJS.includes("require('jsonwebtoken')")) deps.jsonwebtoken = '*';
  if (serverJS.includes("require('nodemailer')")) deps.nodemailer = '*';
  if (serverJS.includes("require('multer')")) deps.multer = '*';
  writeFileSync(join(BUILD_DIR, 'package.json'), JSON.stringify({ dependencies: deps }));
  // Install deps if any are missing
  const depsNeeded = Object.keys(deps).filter(d => !existsSync(join(BUILD_DIR, 'node_modules', d)));
  if (depsNeeded.length > 0) {
    try { execSync('npm install --production --silent', { cwd: BUILD_DIR, timeout: 15000, stdio: 'pipe' }); } catch {}
  }
  if (html) writeFileSync(join(BUILD_DIR, 'index.html'), html);
  writeFileSync(join(BUILD_DIR, 'style.css'), css || '');

  // Copy runtime files
  const runtimeDir = join(ROOT_DIR, 'runtime');
  for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
    if (existsSync(join(runtimeDir, f))) copyFileSync(join(runtimeDir, f), join(rtDir, f));
  }

  // Find port
  runningPort++;
  if (runningPort > 4100) runningPort = 4001;

  // Start child. JWT_SECRET pinned so the e2e test harness can sign tokens that
  // the compiled app accepts. Without this, the app generates a random secret
  // on every startup and auth tests can't send a valid token.
  const env = { ...process.env, PORT: String(runningPort), JWT_SECRET: process.env.JWT_SECRET || 'clear-test-secret', ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}) };
  const child = spawn('node', ['server.js'], { cwd: BUILD_DIR, env, stdio: 'pipe' });
  runningChild = child;

  let responded = false;
  const logs = [];

  child.stdout.on('data', (data) => {
    const msg = data.toString();
    logs.push(msg);
    termLog('[stdout] ' + msg.trimEnd());
    if (msg.includes('running on port') && !responded) {
      responded = true;
      // Probe the port before responding — the log line fires inside
      // app.listen's callback, but Express route binding can lag the socket
      // bind by a tick or two on Windows. Without this the e2e suite hits
      // the proxy before handlers are mounted and gets ECONNREFUSED.
      probeUntilReady(runningPort, 2000)
        .then(() => res.json({ port: runningPort, logs }))
        .catch(() => res.json({ port: runningPort, logs })); // respond anyway after timeout
    }
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString();
    logs.push('[stderr] ' + msg);
    termLog('[stderr] ' + msg.trimEnd());
  });

  child.on('exit', (code) => {
    // Only clear runningChild if this is still the current child (prevents race condition
    // where old child's exit fires after new child has already started)
    if (runningChild === child) runningChild = null;
    if (!responded) {
      responded = true;
      if (code !== 0) {
        res.status(500).json({ error: `Process exited with code ${code}`, logs });
      } else {
        res.json({ port: runningPort, logs });
      }
    }
  });

  // Timeout — respond even if no "running on port" message
  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.json({ port: runningPort, logs, warning: 'Server may not have started yet' });
    }
  }, 5000);
});

app.post('/api/stop', async (req, res) => {
  if (runningChild) {
    const child = runningChild;
    runningChild = null;
    try { child.kill('SIGTERM'); } catch {}
    // AWAIT actual exit before responding — otherwise the next test starts
    // before the OS releases the port and the file handle on clear-data.db,
    // causing flaky GET requests that come back with no status.
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      child.once('exit', finish);
      // Hard cap: 2s SIGKILL fallback for stubborn children
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(); }, 2000);
    });
  }
  _pageConnectedTo = null;
  _networkBuffer.length = 0;
  _websocketBuffer.length = 0;
  res.json({ stopped: true });
});

// =============================================================================
// SAVE — write Clear source and compiled output to desktop or cwd
// =============================================================================
app.post('/api/save', (req, res) => {
  const { source, filename, compiled } = req.body;
  if (!source) return res.status(400).json({ error: 'Missing source' });

  // Determine save directory: desktop if available, else cwd
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const desktop = join(home, 'Desktop');
  const saveDir = existsSync(desktop) ? desktop : process.cwd();
  const name = (filename || 'app').replace(/[^a-zA-Z0-9_-]/g, '_');
  const clearDir = join(saveDir, name);
  const buildDir = join(clearDir, 'build');

  try {
    mkdirSync(buildDir, { recursive: true });

    // Save Clear source
    writeFileSync(join(clearDir, 'main.clear'), source);

    // Save compiled output
    if (compiled) {
      if (compiled.html) writeFileSync(join(buildDir, 'index.html'), compiled.html);
      if (compiled.serverJS) writeFileSync(join(buildDir, 'server.js'), compiled.serverJS);
      if (compiled.javascript && !compiled.serverJS) writeFileSync(join(buildDir, 'main.js'), compiled.javascript);
      if (compiled.python) writeFileSync(join(buildDir, 'server.py'), compiled.python);
      if (compiled.css) writeFileSync(join(buildDir, 'style.css'), compiled.css);

      // Copy runtime files for backend apps
      if (compiled.serverJS) {
        const rtDir = join(buildDir, 'clear-runtime');
        mkdirSync(rtDir, { recursive: true });
        const runtimeDir = join(ROOT_DIR, 'runtime');
        for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
          if (existsSync(join(runtimeDir, f))) copyFileSync(join(runtimeDir, f), join(rtDir, f));
        }
        writeFileSync(join(buildDir, 'package.json'), JSON.stringify({ name, private: true, dependencies: { express: "^5.0.0" } }, null, 2));
      }
    }

    res.json({ saved: true, path: clearDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// APP STATUS — expose running port so IDE can query live app
// =============================================================================
app.get('/api/app-status', (req, res) => {
  res.json({ running: !!runningChild, port: runningChild ? runningPort : null });
});

// SCREENSHOT — client posts base64 PNG here after capturing output panel
// =============================================================================
let pendingScreenshotResolve = null;
app.post('/api/screenshot-data', express.json({ limit: '15mb' }), (req, res) => {
  const { image } = req.body || {};
  if (pendingScreenshotResolve && image) {
    pendingScreenshotResolve(image);
    pendingScreenshotResolve = null;
  }
  res.json({ ok: true });
});

// =============================================================================
// BRIDGE — Meph commands relay to/from the preview iframe via the IDE
// =============================================================================
// Flow:
//   1. Meph tool calls sendBridgeCommand(cmd, payload) — returns a Promise
//   2. Server stores the resolver in _bridgePending[id]
//   3. Server emits SSE { type: 'bridge_command', id, cmd, payload } to the IDE
//   4. IDE forwards via postMessage to the iframe (clear-bridge handler)
//   5. iframe replies via postMessage to the IDE
//   6. IDE POSTs to /api/bridge-reply with { id, result }
//   7. Server resolves the pending promise
const _bridgePending = {};
function sendBridgeCommandFromServer(send, cmd, payload, timeoutMs) {
  return new Promise((resolve) => {
    const id = 'bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    _bridgePending[id] = resolve;
    send({ type: 'bridge_command', id, cmd, payload });
    setTimeout(() => {
      if (_bridgePending[id]) {
        delete _bridgePending[id];
        resolve({ error: 'Bridge command timed out: ' + cmd });
      }
    }, timeoutMs || 5000);
  });
}
app.post('/api/bridge-reply', (req, res) => {
  const { id, result } = req.body || {};
  if (id && _bridgePending[id]) {
    _bridgePending[id](result || {});
    delete _bridgePending[id];
  }
  res.json({ ok: true });
});

// FETCH — proxy requests to running app
// =============================================================================
app.post('/api/fetch', async (req, res) => {
  const { method, path, body, headers } = req.body;
  if (!runningChild) return res.status(400).json({ error: 'No app running. Click Run first.' });

  const url = `http://localhost:${runningPort}${path || '/'}`;
  const opts = {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  // Retry on ECONNREFUSED — child server may have just printed "running on
  // port" but its route handlers can take a few extra ms to bind on Windows.
  // This was the root cause of e2e flakiness on the crm-pro template:
  // /api/run responded as soon as the port log appeared, e2e immediately
  // hit /api/fetch, and on a slow tick the connect refused before the test
  // got a real response — making `data.status` come back undefined.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return res.json({ status: r.status, data });
    } catch (err) {
      lastErr = err;
      // Only retry connection-refused — other errors (timeout, abort) are real
      if (err.code !== 'ECONNREFUSED' && !/ECONNREFUSED|fetch failed/i.test(err.message || '')) break;
      await new Promise(ok => setTimeout(ok, 150 * (attempt + 1)));
    }
  }
  res.status(500).json({ error: lastErr?.message || 'fetch failed' });
});

// =============================================================================
// SYNTAX SECTIONS — for Claude's system knowledge
// =============================================================================
const syntaxSections = new Map();
try {
  const syntaxSource = readFileSync(join(ROOT_DIR, 'SYNTAX.md'), 'utf8');
  const sections = syntaxSource.split(/^## /m);
  for (const s of sections) {
    if (!s.trim()) continue;
    const title = s.split('\n')[0].trim();
    syntaxSections.set(title.toLowerCase(), '## ' + s);
  }
} catch {}

app.get('/api/syntax/:topic', (req, res) => {
  const topic = req.params.topic.toLowerCase();
  for (const [key, val] of syntaxSections) {
    if (key.includes(topic)) return res.type('text/plain').send(val);
  }
  res.status(404).send('No syntax section matching: ' + topic);
});

// =============================================================================
// CHAT — Claude agent with tools
// =============================================================================
const systemPrompt = readFileSync(join(__dirname, 'system-prompt.md'), 'utf8');

const TOOLS = [
  {
    name: 'edit_code',
    description: 'Read, replace, or undo the Clear source code in the editor. Use action="read" to see current code. Use action="write" with the code parameter to replace the editor content. Use action="undo" to revert the last change (the user also has an Undo button in the toolbar).',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write', 'undo'], description: 'read to get current code, write to replace it, undo to revert last change' },
        code: { type: 'string', description: 'The new Clear source code (only for action=write)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a reference doc. Small files (PHILOSOPHY.md, requests.md) return in full. Large files (SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md) return a table of contents with line numbers on first call — then use startLine/endLine to read specific sections.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'One of: SYNTAX.md, AI-INSTRUCTIONS.md, PHILOSOPHY.md, USER-GUIDE.md, requests.md, meph-memory.md' },
        startLine: { type: 'number', description: 'Start line (1-based). Omit to get full file or TOC.' },
        endLine: { type: 'number', description: 'End line (1-based, inclusive). Omit to get full file or TOC.' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a CLI command. Allowed: node cli/clear.js (check, build, test, lint), curl, ls, cat. Returns stdout, stderr, exitCode.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run' },
      },
      required: ['command'],
    },
  },
  {
    name: 'compile',
    description: 'Compile the current Clear source code. Returns errors, warnings, and compiled output (html, javascript, serverJS, python).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_app',
    description: 'Start the compiled app as a live server. Returns the port number. Use http_request to test endpoints.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'stop_app',
    description: 'Stop the currently running app server.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request to the running app. Use to test endpoints.',
    input_schema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method' },
        path: { type: 'string', description: 'URL path, e.g. /api/todos' },
        body: { type: 'object', description: 'Request body for POST/PUT' },
      },
      required: ['method', 'path'],
    },
  },
  {
    name: 'edit_file',
    description: `Edit a file in the project root. Actions:
- "append": add content to the end of the file (safest for logs/requests)
- "insert": add content at a specific line number
- "replace": find a string and replace it (first occurrence, or all if replace_all is true)
- "overwrite": replace the entire file content (use sparingly)
- "read": read the current file content (returns content + line count)
You can modify .clear files and requests.md. You can create new files of any allowed type. Allowed extensions: .clear, .md, .json, .txt, .csv, .html, .css, .js, .py.`,
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename relative to project root, e.g. "requests.md" or "temp-app.clear".' },
        action: { type: 'string', enum: ['append', 'insert', 'replace', 'overwrite', 'read'], description: 'The edit action to perform.' },
        content: { type: 'string', description: 'The content to append/insert/overwrite with. Not needed for "read" action.' },
        line: { type: 'number', description: 'Line number for "insert" action (1-based). Content is inserted before this line.' },
        find: { type: 'string', description: 'String to find for "replace" action.' },
        replace_all: { type: 'boolean', description: 'If true, replace all occurrences. Default: false (first only).' },
      },
      required: ['filename', 'action'],
    },
  },
  {
    name: 'read_terminal',
    description: 'Read the unified Studio terminal — a chronological timeline of everything that happened: [stdout]/[stderr] from the running app, [user] clicks and inputs from the preview pane, [browser error]/[browser warn] from the iframe console, and [meph] tool calls from your previous turns. Use this to see the full repro of any bug without asking the user to narrate. Especially useful when the user says "fix this" — scroll the terminal to reconstruct what they did.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'screenshot_output',
    description: 'Fetch the rendered HTML from the running app to verify UI changes. Returns the full HTML document so you can check structure, content, and class names. Use this after UI changes to confirm they took effect.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'highlight_code',
    description: 'Highlight a range of lines in the Clear editor to draw the user\'s attention. Use this to point out specific lines — e.g. the bug you just fixed, the section you are about to edit, or lines that need review. The lines will flash visually in the editor.',
    input_schema: {
      type: 'object',
      properties: {
        start_line: { type: 'number', description: 'First line number to highlight (1-indexed).' },
        end_line: { type: 'number', description: 'Last line number to highlight (inclusive). Omit to highlight a single line.' },
        message: { type: 'string', description: 'Short message to show the user, e.g. "Here is the bug" or "I added this section".' },
      },
      required: ['start_line'],
    },
  },
  {
    name: 'run_tests',
    description: 'Run all tests for the current Clear app — both compiler-generated tests (endpoints, buttons, pages, flows) and user-written test blocks. Returns pass/fail counts and failure details with English-readable test names.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_evals',
    description: "Return the agent eval suite for the current source WITHOUT running it. Each entry has { id, kind ('e2e'|'role'|'format'), agentName, endpointPath, synthetic, rubric?, expected? }. Use this to decide which evals to run or to show the user what will be graded.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_evals',
    description: "Run the FULL agent eval suite for the current source. Compiles the app, starts a dedicated eval child with synthetic /_eval/<agent> endpoints injected for every agent, runs each eval, grades role/E2E via Claude when ANTHROPIC_API_KEY is set. Format evals are deterministic (no key needed). Slower than run_tests — can take 30s+ for multi-agent apps.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_eval',
    description: 'Run ONE agent eval by id (from list_evals). Useful when iterating on a single agent — avoids re-running the whole suite. The eval child stays alive between runs for fast repeat invocations.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: "Eval id, e.g. 'role-researcher' or 'e2e-_api_research'" }
      },
      required: ['id'],
    },
  },
  {
    name: 'click_element',
    description: 'Click an element in the running app (headless browser). Pass a CSS selector or visible text. Returns updated HTML and any errors. Use this to test buttons, links, tabs. Requires app to be running.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (#submit-btn) or visible text (button:has-text("Save"))' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'fill_input',
    description: 'Type a value into an input element in the running app. Pass a CSS selector and the text to type. Triggers input events so reactive state updates. Use to test form flows. Requires app to be running.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input, e.g. #email or input[name="title"]' },
        value: { type: 'string', description: 'The text to type into the input' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'read_network',
    description: 'Read the last N network requests made by the running app (client-side POV). Returns URL, method, status, response body, errors. Catches silent 404s, CORS errors, bad fetch URLs that the server never logs.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max requests to return (default 20, max 100)' },
        filter: { type: 'string', description: 'Optional URL substring filter, e.g. "/api/" to only show API calls' },
      },
    },
  },
  {
    name: 'inspect_element',
    description: 'Inspect a DOM element in the running app. Returns computed styles (color, font, padding), bounding box, text content, and attributes. Use to verify visual properties — is the button actually red, is the text actually large, etc.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element to inspect' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'read_storage',
    description: 'Read localStorage and sessionStorage from the running app. Use to debug auth flows (is the JWT stored?), persistent state, or saved preferences.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_actions',
    description: 'Read the user\'s recent interactions with the running app — clicks, inputs, form submissions. Use this when the user says "fix this bug" or "what just happened" — you get the exact sequence of actions they took, with selectors and values. The buffer auto-clears when the app restarts.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max recent actions to return (default 50, max 100)' },
      },
    },
  },
  {
    name: 'read_dom',
    description: 'Snapshot the running app\'s current state — full HTML body, the reactive _state object, current URL. Use to see exactly what the user is looking at right now. Pairs with read_actions: read_actions tells you HOW they got here, read_dom tells you WHERE they are.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'websocket_log',
    description: 'Read WebSocket messages (both directions) from the running app. Use to debug live-chat, real-time updates, and anything using subscribe to / broadcast to all.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max messages to return (default 20)' },
      },
    },
  },
  {
    name: 'db_inspect',
    description: 'Query the running app\'s SQLite database directly. Pass an SQL SELECT query. Use when "POST succeeded but GET returns nothing" — check if data actually saved.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL SELECT query, e.g. "SELECT * FROM todos LIMIT 10"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'todo',
    description: `Track your tasks as you work. Helps you plan multi-step work and show the user your progress.
- "set": Replace your entire todo list with a new set of tasks. Each task has content (what to do), status (pending/in_progress/completed), and activeForm (present tense, e.g. "Adding validation").
- "get": Read the current todo list.
Rules: Only ONE task should be in_progress at a time. Mark tasks completed immediately when done. Use short, specific task descriptions.`,
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['set', 'get'], description: 'set = replace todo list, get = read current list' },
        todos: {
          type: 'array',
          description: 'The full todo list (only for action=set). Each item: { content, status, activeForm }',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'What to do (imperative form)' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Task state' },
              activeForm: { type: 'string', description: 'Present continuous form shown during execution' },
            },
            required: ['content', 'status', 'activeForm'],
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'browse_templates',
    description: 'Browse the template library. Use action="list" to see all available templates with descriptions. Use action="read" with a template name to get its full Clear source code. Great for learning patterns, finding examples of specific features, or starting from an existing app.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read'], description: 'list = show all templates, read = get source code for a specific template' },
        name: { type: 'string', description: 'Template name to read (e.g. "todo-fullstack", "crm-pro"). Only needed for action=read.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'source_map',
    description: 'Get the source map for the current compiled code. Shows which compiled output lines correspond to which Clear source lines. Use to understand how Clear compiles, debug compilation issues, or trace a bug in compiled output back to the Clear source.',
    input_schema: {
      type: 'object',
      properties: {
        clear_line: { type: 'number', description: 'Optional: specific Clear line number to look up. Returns the compiled lines for that source line. Omit to get the full map.' },
      },
    },
  },
  {
    name: 'patch_code',
    description: `Apply surgical edits to the Clear source without rewriting the whole file. Much better than edit_code write for small changes. Operations:
- fix_line: replace a specific line. { op: 'fix_line', line: 7, replacement: "  send back user" }
- insert_line: insert at position. { op: 'insert_line', line: 5, content: "  validate data:" }
- remove_line: delete a line. { op: 'remove_line', line: 10 }
- add_endpoint: append endpoint. { op: 'add_endpoint', method: 'GET', path: '/api/health', body: "send back 'OK'" }
- add_field: add field to table. { op: 'add_field', table: 'Users', field: 'email', constraints: 'required, unique' }
- remove_field: remove field. { op: 'remove_field', table: 'Users', field: 'email' }
- add_test: append test block. { op: 'add_test', name: 'health check', body: "call GET /api/health\\nexpect response status 200" }
- add_validation: add rules. { op: 'add_validation', endpoint: 'POST /api/users', rules: "name is text, required" }
- add_table: add table. { op: 'add_table', name: 'Todos', fields: "title, required\\ncompleted, default false" }
- add_agent: add agent. { op: 'add_agent', name: 'Helper', param: 'question', body: "response = ask claude 'Help' with question\\nsend back response" }
Prefer this over edit_code write for changes that touch < 5 lines.`,
    input_schema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of patch operations to apply in order',
          items: { type: 'object' },
        },
      },
      required: ['operations'],
    },
  },
];

// Anthropic server tools — executed by Anthropic's API, no client-side handling needed
const WEB_TOOLS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 10 },
];

app.get('/api/config', (req, res) => {
  res.json({ hasServerKey: !!process.env.ANTHROPIC_API_KEY });
});

// Memory file endpoints (for UI button — Meph also accesses via edit_file tool)
app.post('/api/read-file', (req, res) => {
  const fname = String(req.body.filename || '').replace(/[^a-zA-Z0-9._-]/g, '-');
  if (fname !== 'meph-memory.md') return res.json({ error: 'Only meph-memory.md is readable from the UI.' });
  const fpath = join(ROOT_DIR, fname);
  if (!existsSync(fpath)) return res.json({ content: '' });
  res.json({ content: readFileSync(fpath, 'utf8') });
});

app.post('/api/write-file', (req, res) => {
  const fname = String(req.body.filename || '').replace(/[^a-zA-Z0-9._-]/g, '-');
  if (fname !== 'meph-memory.md') return res.json({ error: 'Only meph-memory.md is writable from the UI.' });
  writeFileSync(join(ROOT_DIR, fname), req.body.content || '', 'utf8');
  res.json({ written: true });
});

// Build the system message with live context Meph should see every turn:
// - Personality override (if user set one)
// - The main system prompt
// - Latest test-run results (so when the user clicks Run Tests and asks Meph to fix,
//   he already knows which tests failed + the plain-English error + the source line)
function buildSystemWithContext(baseSystem, personality, testSnapshot) {
  let context = '';
  if (testSnapshot && (testSnapshot.failed > 0 || testSnapshot.passed > 0)) {
    const parts = [];
    parts.push(`## Latest Test Run (user clicked Run Tests in Studio)\n`);
    parts.push(`Passed: ${testSnapshot.passed}, Failed: ${testSnapshot.failed}\n`);
    if (testSnapshot.failures && testSnapshot.failures.length) {
      parts.push(`\nFailures:\n`);
      for (const f of testSnapshot.failures.slice(0, 10)) {
        const at = f.sourceLine ? ` (clear:${f.sourceLine})` : '';
        parts.push(`- **${f.name}**${at}\n  ${f.error}\n`);
      }
      parts.push(`\nWhen the user asks you to fix a test, use this context — don't re-run tests just to see them. The sourceLine tells you exactly which line to edit; the error tells you what the fix is. After editing, re-run tests once to confirm the fix.\n`);
    } else if (testSnapshot.passed > 0) {
      parts.push(`All tests passing.\n`);
    }
    context = '\n\n---\n\n' + parts.join('');
  }
  const head = personality
    ? '## CRITICAL — User Custom Instructions (follow these in ALL responses)\n\n' + personality + '\n\n---\n\n'
    : '';
  return head + baseSystem + context;
}

app.post('/api/chat', async (req, res) => {
  const { messages, apiKey, personality, editorContent, errors: editorErrors, testResults: testSnapshot, webTools: enableWebTools } = req.body;
  const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!resolvedKey) return res.status(400).json({ error: 'Set your Anthropic API key to chat with Claude' });
  if (!messages || messages.length === 0) return res.status(400).json({ error: 'No messages' });

  // SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  function send(obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': resolvedKey,
    'anthropic-version': '2023-06-01',
  };
  const endpoint = 'https://api.anthropic.com/v1/messages';

  // Current editor state for read_editor tool
  let currentSource = editorContent || '';
  let currentErrors = editorErrors || [];
  let lastCompileResult = null;

  // Tool execution
  // Mirror every Meph tool call to the terminal pane so the user can watch
  // exactly what Meph is doing — no hidden actions.
  function describeMephTool(name, input) {
    switch (name) {
      case 'edit_code': return input.action === 'write' ? `edit_code (write, ${(input.code || '').length} chars)` : `edit_code (${input.action})`;
      case 'run_command': return `run_command: ${String(input.command || '').slice(0, 120)}`;
      case 'compile': return 'compile';
      case 'run_app': return 'run_app';
      case 'stop_app': return 'stop_app';
      case 'http_request': return `http_request ${input.method || 'GET'} ${input.path || ''}`;
      case 'read_file': return `read_file ${input.path || ''}`;
      case 'write_file': return `write_file ${input.path || ''}`;
      case 'run_tests': return 'run_tests';
      case 'click_element': return `click_element → ${input.selector || ''}`;
      case 'fill_input': return `fill_input → ${input.selector || ''} = ${JSON.stringify(String(input.value || '').slice(0, 60))}`;
      case 'screenshot_output': return 'screenshot_output';
      case 'highlight_code': return `highlight_code ${input.start_line || ''}-${input.end_line || ''}`;
      case 'browse_templates': return `browse_templates ${input.template || ''}`;
      case 'source_map': return `source_map`;
      case 'read_actions': return 'read_actions';
      case 'read_dom': return 'read_dom';
      case 'read_network': return `read_network ${input.filter || ''}`;
      case 'read_storage': return `read_storage ${input.key || ''}`;
      case 'websocket_log': return 'websocket_log';
      case 'db_inspect': return `db_inspect ${input.table || ''}`;
      case 'inspect_element': return `inspect_element ${input.selector || ''}`;
      case 'todo': return `todo (${input.action || 'set'})`;
      default: return name;
    }
  }
  // Runtime schema validation. Anthropic's tool schemas are advisory; Meph can
  // still send malformed JSON (missing required fields, wrong types, invented
  // keys). This validator catches it BEFORE the tool runs and returns a
  // teaching error that names the tool, the field, and the expected shape —
  // so Meph retries with the right arguments instead of crashing the handler.
  function validateToolInput(name, input) {
    if (input === null || typeof input !== 'object') {
      return `Tool "${name}" expects a JSON object, got ${typeof input}. Send properly-shaped arguments.`;
    }
    const str = (v) => typeof v === 'string';
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    const arr = (v) => Array.isArray(v);
    const inEnum = (v, choices) => str(v) && choices.includes(v);

    switch (name) {
      case 'edit_code': {
        if (!inEnum(input.action, ['read', 'write', 'undo'])) return `edit_code.action must be "read", "write", or "undo" — got ${JSON.stringify(input.action)}.`;
        if (input.action === 'write' && !str(input.code)) return `edit_code action="write" requires a "code" string field with the new Clear source.`;
        return null;
      }
      case 'run_command': return str(input.command) ? null : `run_command requires a "command" string.`;
      case 'http_request': {
        if (!inEnum(input.method, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])) return `http_request.method must be GET/POST/PUT/DELETE/PATCH — got ${JSON.stringify(input.method)}.`;
        if (!str(input.path)) return `http_request requires a "path" string (e.g. "/api/todos").`;
        return null;
      }
      case 'read_file': return str(input.filename) ? null : `read_file requires a "filename" string (e.g. SYNTAX.md, AI-INSTRUCTIONS.md).`;
      case 'edit_file': {
        if (!str(input.filename)) return `edit_file requires a "filename" string.`;
        if (!inEnum(input.action, ['append', 'insert', 'replace', 'overwrite', 'read'])) return `edit_file.action must be one of: append, insert, replace, overwrite, read.`;
        return null;
      }
      case 'click_element': return str(input.selector) ? null : `click_element requires a "selector" string (CSS selector).`;
      case 'fill_input': return str(input.selector) && (str(input.value) || num(input.value)) ? null : `fill_input requires "selector" (string) and "value" (string or number).`;
      case 'highlight_code': {
        if (!num(input.start_line) || input.start_line < 1) return `highlight_code requires "start_line" (positive integer).`;
        if (input.end_line !== undefined && !num(input.end_line)) return `highlight_code "end_line" must be a number if provided.`;
        return null;
      }
      case 'inspect_element': return str(input.selector) ? null : `inspect_element requires a "selector" string.`;
      case 'read_network': return (input.limit === undefined || num(input.limit)) ? null : `read_network "limit" must be a number if provided.`;
      case 'db_inspect': return str(input.table) ? null : `db_inspect requires a "table" string.`;
      case 'todo': {
        if (!inEnum(input.action, ['set', 'get'])) return `todo.action must be "set" or "get".`;
        if (input.action === 'set') {
          if (!arr(input.todos)) return `todo action="set" requires a "todos" array.`;
          for (let i = 0; i < input.todos.length; i++) {
            const t = input.todos[i];
            if (!t || typeof t !== 'object') return `todo.todos[${i}] must be an object with { content, status, activeForm }.`;
            if (!str(t.content)) return `todo.todos[${i}].content must be a string.`;
            if (!inEnum(t.status, ['pending', 'in_progress', 'completed'])) return `todo.todos[${i}].status must be pending/in_progress/completed.`;
            if (!str(t.activeForm)) return `todo.todos[${i}].activeForm must be a string (present-tense verb phrase).`;
          }
        }
        return null;
      }
      case 'patch_code': {
        if (!arr(input.operations) || input.operations.length === 0) return `patch_code requires a non-empty "operations" array. Example: [{op:"fix_line",line:5,replacement:"  send back user"}].`;
        const VALID_OPS = new Set(['fix_line', 'insert_line', 'remove_line', 'add_endpoint', 'add_field', 'remove_field', 'add_test', 'add_validation', 'add_table', 'add_agent']);
        for (let i = 0; i < input.operations.length; i++) {
          const op = input.operations[i];
          if (!op || typeof op !== 'object') return `patch_code.operations[${i}] must be an object.`;
          if (!VALID_OPS.has(op.op)) return `patch_code.operations[${i}].op is "${op.op}" — must be one of: ${[...VALID_OPS].join(', ')}.`;
          if (['fix_line', 'insert_line', 'remove_line'].includes(op.op) && !num(op.line)) return `patch_code.operations[${i}] op="${op.op}" requires "line" (number).`;
          if (op.op === 'fix_line' && !str(op.replacement)) return `patch_code fix_line requires "replacement" (string).`;
          if (op.op === 'insert_line' && !str(op.content)) return `patch_code insert_line requires "content" (string).`;
          if (op.op === 'add_endpoint' && (!str(op.method) || !str(op.path) || !str(op.body))) return `patch_code add_endpoint requires "method", "path", and "body" strings.`;
          if (op.op === 'add_field' && (!str(op.table) || !str(op.field))) return `patch_code add_field requires "table" and "field" strings.`;
          if (op.op === 'add_test' && (!str(op.name) || !str(op.body))) return `patch_code add_test requires "name" and "body" strings.`;
        }
        return null;
      }
      // Tools with empty schemas (no required fields): compile, run_app, stop_app,
      // read_terminal, screenshot_output, run_tests, read_dom, read_actions,
      // read_storage, source_map, browse_templates, websocket_log — pass through.
      case 'compile':
      case 'run_app':
      case 'stop_app':
      case 'read_terminal':
      case 'screenshot_output':
      case 'run_tests':
      case 'list_evals':
      case 'run_evals':
      case 'read_dom':
      case 'read_actions':
      case 'read_storage':
      case 'source_map':
      case 'browse_templates':
      case 'websocket_log':
        return null;
      case 'run_eval': {
        if (!str(input.id)) return `run_eval requires "id" (string). Use list_evals first to get available ids.`;
        return null;
      }
      // Reject any tool we don't recognize so Meph stops hallucinating
      // names like "run_file" or "write_file" (neither exists). Earlier
      // the default case returned null which silently allowed unknown calls.
      default:
        return `Unknown tool "${name}". Valid tools: edit_code, read_file, edit_file, run_command, http_request, compile, run_app, stop_app, run_tests, list_evals, run_evals, run_eval, click_element, fill_input, highlight_code, inspect_element, read_network, read_storage, read_terminal, read_actions, read_dom, screenshot_output, browse_templates, source_map, websocket_log, db_inspect, todo, patch_code.`;
    }
  }

  async function executeTool(name, input) {
    termLog(`[meph] ${describeMephTool(name, input)}`);
    const validationError = validateToolInput(name, input);
    if (validationError) {
      termLog(`[meph] ✗ schema error: ${validationError}`);
      return JSON.stringify({ error: validationError, schemaError: true });
    }
    switch (name) {
      case 'edit_code':
        if (input.action === 'read') {
          return JSON.stringify({ source: currentSource, errors: currentErrors });
        }
        if (input.action === 'write') {
          currentSource = input.code;
          // Auto-compile when code is written
          try {
            const r = compileProgram(input.code);
            currentErrors = r.errors;
            lastCompileResult = r;
            return JSON.stringify({ applied: true, errors: r.errors, warnings: r.warnings });
          } catch (err) {
            return JSON.stringify({ applied: true, compileError: err.message });
          }
        }
        if (input.action === 'undo') {
          // Signal client to trigger editor undo; actual undo happens client-side
          send({ type: 'undo' });
          return JSON.stringify({ undone: true });
        }
        return JSON.stringify({ error: 'Invalid action' });

      case 'compile':
        try {
          const r = compileProgram(currentSource);
          currentErrors = r.errors;
          lastCompileResult = r;
          // Always return compiled output alongside errors — Meph needs to
          // inspect generated code to diagnose bugs, especially when there ARE errors
          const result = {
            errors: r.errors,
            warnings: r.warnings,
            hasHTML: !!r.html,
            hasServerJS: !!r.serverJS,
            hasJavascript: !!r.javascript,
            hasPython: !!r.python,
          };
          // Include actual compiled code (truncated to avoid blowing context)
          if (r.serverJS) result.serverJS = r.serverJS.slice(0, 8000);
          if (r.javascript) result.javascript = r.javascript.slice(0, 8000);
          if (r.html) result.html = r.html.slice(0, 4000);
          if (r.python) result.python = r.python.slice(0, 8000);
          if (r.errors.length > 0 && (r.serverJS || r.javascript || r.html || r.python)) {
            result.note = 'Compiled output included despite errors — inspect for debugging.';
          }
          return JSON.stringify(result);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }

      case 'run_command': {
        const cmd = input.command;
        const allowed = ALLOWED_PREFIXES.some(p => cmd.startsWith(p));
        if (!allowed) return JSON.stringify({ error: `Not allowed. Use: ${ALLOWED_PREFIXES.join(', ')}` });
        try {
          const stdout = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf8', timeout: 15000 });
          return JSON.stringify({ stdout, exitCode: 0 });
        } catch (err) {
          return JSON.stringify({ stdout: err.stdout || '', stderr: err.stderr || err.message, exitCode: err.status || 1 });
        }
      }

      case 'run_app': {
        // backend-only apps put code in .javascript, full-stack in .serverJS
        const agentBackendCode = lastCompileResult?.serverJS || (!lastCompileResult?.html && lastCompileResult?.javascript) || null;
        if (!agentBackendCode) return JSON.stringify({ error: 'No compiled server code. Compile first.' });
        // Kill previous child
        if (runningChild) { try { runningChild.kill('SIGTERM'); } catch {} runningChild = null; }
        const rtDir = join(BUILD_DIR, 'clear-runtime');
        mkdirSync(rtDir, { recursive: true });
        writeFileSync(join(BUILD_DIR, 'server.js'), agentBackendCode);
        const agentDeps = { ws: '*' };
        if (agentBackendCode.includes("require('bcryptjs')")) agentDeps.bcryptjs = '*';
        if (agentBackendCode.includes("require('jsonwebtoken')")) agentDeps.jsonwebtoken = '*';
        if (agentBackendCode.includes("require('nodemailer')")) agentDeps.nodemailer = '*';
        if (agentBackendCode.includes("require('multer')")) agentDeps.multer = '*';
        writeFileSync(join(BUILD_DIR, 'package.json'), JSON.stringify({ dependencies: agentDeps }));
        const agentDepsNeeded = Object.keys(agentDeps).filter(d => !existsSync(join(BUILD_DIR, 'node_modules', d)));
        if (agentDepsNeeded.length > 0) {
          try { execSync('npm install --production --silent', { cwd: BUILD_DIR, timeout: 15000, stdio: 'pipe' }); } catch {}
        }
        if (lastCompileResult.html) writeFileSync(join(BUILD_DIR, 'index.html'), lastCompileResult.html);
        writeFileSync(join(BUILD_DIR, 'style.css'), lastCompileResult.css || '');
        const runtimeDir = join(ROOT_DIR, 'runtime');
        for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
          if (existsSync(join(runtimeDir, f))) copyFileSync(join(runtimeDir, f), join(rtDir, f));
        }
        runningPort++;
        if (runningPort > 4100) runningPort = 4001;
        const agentPort = runningPort;
        const env = { ...process.env, PORT: String(agentPort) };
        const agentChild = spawn('node', ['server.js'], { cwd: BUILD_DIR, env, stdio: 'pipe' });
        runningChild = agentChild;
        agentChild.on('exit', () => { if (runningChild === agentChild) runningChild = null; });

        // Sync-poll TCP until port is open (max 5s) so agent can immediately use http_request.
        // Write to a .cjs file (forces CJS regardless of parent package.json type:module).
        const pollPath = join(BUILD_DIR, '_port-poll.cjs');
        writeFileSync(pollPath, [
          "var net=require('net'),n=0;",
          "(function t(){",
          `  var s=net.createConnection(${agentPort},'127.0.0.1');`,
          "  s.on('connect',function(){s.destroy();process.exit(0);});",
          "  s.on('error',function(){if(++n<25)setTimeout(t,200);else process.exit(1);});",
          "})();",
        ].join('\n'));
        try { execSync(`node "${pollPath}"`, { timeout: 6000 }); } catch {}
        try { unlinkSync(pollPath); } catch {}

        return JSON.stringify({ started: true, port: agentPort });
      }

      case 'stop_app':
        if (runningChild) { try { runningChild.kill('SIGTERM'); } catch {} runningChild = null; }
        return JSON.stringify({ stopped: true });

      case 'read_file': {
        const READABLE = ['SYNTAX.md', 'AI-INSTRUCTIONS.md', 'PHILOSOPHY.md', 'USER-GUIDE.md', 'requests.md', 'meph-memory.md'];
        const fname = input.filename;
        if (!READABLE.includes(fname)) return JSON.stringify({ error: `Can only read: ${READABLE.join(', ')}` });
        const fpath = join(ROOT_DIR, fname);
        if (!existsSync(fpath)) return JSON.stringify({ error: `File not found: ${fname}` });
        const lines = readFileSync(fpath, 'utf8').split('\n');

        // Line-range mode: return specific section
        if (input.startLine && input.endLine) {
          const start = Math.max(1, input.startLine) - 1;
          const end = Math.min(lines.length, input.endLine);
          const section = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
          return JSON.stringify({ filename: fname, lines: `${start+1}-${end}`, totalLines: lines.length, content: section });
        }

        // Small files (<800 lines): return in full
        const SMALL_THRESHOLD = 800;
        if (lines.length < SMALL_THRESHOLD) {
          return JSON.stringify({ filename: fname, totalLines: lines.length, content: lines.join('\n') });
        }

        // Large files: return TOC (headings with line numbers)
        const toc = [];
        lines.forEach((line, i) => {
          if (line.startsWith('## ') || line.startsWith('### ') || line.startsWith('# ')) {
            toc.push(`${i + 1}: ${line}`);
          }
        });
        return JSON.stringify({
          filename: fname,
          totalLines: lines.length,
          mode: 'toc',
          hint: 'Large file. Use startLine/endLine to read specific sections.',
          toc: toc.join('\n'),
        });
      }

      case 'edit_file': {
        // Restrict to safe extensions in project root only — no path traversal
        if (!input || !input.filename) return JSON.stringify({ error: 'Missing required parameter "filename". You called edit_file without specifying which file. Example: edit_file({ filename: "requests.md", action: "append", content: "..." })' });
        if (!input.action) return JSON.stringify({ error: `Missing required parameter "action" for file "${input.filename}". Must be one of: append, insert, replace, overwrite, read. For adding content to the end of a file, use action="append".` });
        const safeName = String(input.filename).replace(/[^a-zA-Z0-9._-]/g, '-');
        const ALLOWED_EXT = ['.clear', '.md', '.json', '.txt', '.csv', '.html', '.css', '.js', '.py'];
        const ext = safeName.includes('.') ? '.' + safeName.split('.').pop() : '';
        if (!ALLOWED_EXT.includes(ext)) return JSON.stringify({ error: `File extension "${ext}" is not allowed. Allowed: ${ALLOWED_EXT.join(', ')}. You tried to access "${safeName}" — check the filename.` });
        const dest = join(ROOT_DIR, safeName);
        const fileExists = existsSync(dest);
        // Safety: only allow modifying .clear files and requests.md/meph-memory.md
        const WRITABLE_EXISTING = ['requests.md', 'meph-memory.md'];
        const canWrite = !fileExists || ext === '.clear' || WRITABLE_EXISTING.includes(safeName);
        if (!canWrite && input.action !== 'read') {
          return JSON.stringify({ error: `Permission denied: "${safeName}" is read-only. You can only modify .clear files, requests.md, and meph-memory.md. To read this file instead, use action="read". To create a new file, pick a name that doesn't already exist.` });
        }

        switch (input.action) {
          case 'read': {
            if (!fileExists) return JSON.stringify({ error: `File "${safeName}" does not exist in the project root. Check the filename. Available writable files: requests.md, meph-memory.md, and any .clear files.` });
            const text = readFileSync(dest, 'utf8');
            const lines = text.split('\n');
            return JSON.stringify({ content: text, lines: lines.length, path: safeName });
          }
          case 'append': {
            if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for append action on "${safeName}". You need to provide the text to add. Example: edit_file({ filename: "${safeName}", action: "append", content: "new text here" })` });
            const existing = fileExists ? readFileSync(dest, 'utf8') : '';
            const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
            writeFileSync(dest, existing + separator + input.content, 'utf8');
            const newLines = (existing + separator + input.content).split('\n').length;
            return JSON.stringify({ ok: true, appended: true, path: safeName, bytes_added: input.content.length, total_lines: newLines });
          }
          case 'insert': {
            if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for insert action on "${safeName}". Provide the text to insert. Example: edit_file({ filename: "${safeName}", action: "insert", line: 10, content: "new line" })` });
            if (!input.line || input.line < 1) return JSON.stringify({ error: `Missing or invalid "line" parameter for insert action on "${safeName}". Provide a line number >= 1 where content should be inserted. Example: edit_file({ filename: "${safeName}", action: "insert", line: 5, content: "..." })` });
            const existing = fileExists ? readFileSync(dest, 'utf8') : '';
            const lines = existing.split('\n');
            if (input.line > lines.length + 1) {
              return JSON.stringify({ error: `Line ${input.line} is past the end of "${safeName}" (file has ${lines.length} lines). Use line=${lines.length + 1} to insert at the end, or use action="append" instead.` });
            }
            const idx = Math.min(input.line - 1, lines.length);
            lines.splice(idx, 0, ...input.content.split('\n'));
            writeFileSync(dest, lines.join('\n'), 'utf8');
            return JSON.stringify({ ok: true, inserted: true, path: safeName, at_line: input.line, total_lines: lines.length });
          }
          case 'replace': {
            if (!input.find) return JSON.stringify({ error: `Missing "find" parameter for replace action on "${safeName}". Provide the exact string to search for. Example: edit_file({ filename: "${safeName}", action: "replace", find: "old text", content: "new text" })` });
            if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for replace action on "${safeName}". Provide the replacement text. Example: edit_file({ filename: "${safeName}", action: "replace", find: "${(input.find || '').slice(0, 30)}", content: "replacement" })` });
            if (!fileExists) return JSON.stringify({ error: `Cannot replace in "${safeName}" — file does not exist. Use action="overwrite" or action="append" to create it.` });
            const text = readFileSync(dest, 'utf8');
            let result;
            if (input.replace_all) {
              const count = text.split(input.find).length - 1;
              if (count === 0) return JSON.stringify({ error: `String not found anywhere in "${safeName}" (${text.split('\n').length} lines). Your find string was: "${input.find.slice(0, 120)}". Try action="read" first to see the actual file content, then use the exact text from the file. Common causes: extra whitespace, wrong line endings, or the text was already changed by a previous edit.` });
              result = text.split(input.find).join(input.content);
              writeFileSync(dest, result, 'utf8');
              return JSON.stringify({ ok: true, replaced: true, path: safeName, occurrences: count });
            } else {
              const pos = text.indexOf(input.find);
              if (pos === -1) {
                // Help the AI debug: show nearby content
                const findLower = input.find.toLowerCase().slice(0, 40);
                const lowerText = text.toLowerCase();
                const nearIdx = lowerText.indexOf(findLower.slice(0, 20));
                const hint = nearIdx >= 0
                  ? `Partial match found near character ${nearIdx}. The actual text there is: "${text.slice(Math.max(0, nearIdx - 10), nearIdx + 60).replace(/\n/g, '\\n')}"`
                  : `No partial match found either. The file has ${text.split('\n').length} lines.`;
                return JSON.stringify({ error: `Exact string not found in "${safeName}". Your find string (first 120 chars): "${input.find.slice(0, 120)}". ${hint} Suggestion: use action="read" to see the current file content, then copy the exact text you want to replace. Common issues: extra/missing whitespace, the text was already changed, or line endings differ.` });
              }
              result = text.slice(0, pos) + input.content + text.slice(pos + input.find.length);
              writeFileSync(dest, result, 'utf8');
              return JSON.stringify({ ok: true, replaced: true, path: safeName, occurrences: 1 });
            }
          }
          case 'overwrite': {
            if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for overwrite action on "${safeName}". Provide the full file content. Warning: this replaces the entire file. If you only need to add content, use action="append" instead.` });
            writeFileSync(dest, input.content, 'utf8');
            const newLines = input.content.split('\n').length;
            return JSON.stringify({ ok: true, written: true, path: safeName, bytes: input.content.length, total_lines: newLines });
          }
          default:
            return JSON.stringify({ error: `Unknown action "${input.action}" for file "${safeName}". Valid actions: append (add to end), insert (add at line N), replace (find and replace text), overwrite (replace entire file), read (view content). You probably want "append" for adding new content or "replace" for modifying existing text.` });
        }
      }

      case 'read_terminal':
        return JSON.stringify({
          terminal: terminalBuffer.slice(-80).join('\n'),
          frontendErrors: frontendErrors.slice(-20),
        });

      case 'screenshot_output':
        return '__ASYNC_SCREENSHOT__'; // handled in loop

      case 'http_request': {
        // Sync HTTP is tricky — return a promise indicator
        // Actually, we'll handle this async in the loop
        return '__ASYNC_HTTP__';
      }

      case 'source_map': {
        if (!currentSource) return JSON.stringify({ error: 'No code in editor. Write code first.' });
        const compiled = compileProgram(currentSource, { sourceMap: true });
        const target = compiled.serverJS || compiled.javascript || compiled.python;
        if (!target) return JSON.stringify({ error: 'No compiled output.' });

        const targetLines = target.split('\n');
        const map = {};
        let current = null;
        for (let i = 0; i < targetLines.length; i++) {
          const m = targetLines[i].match(/(?:\/\/|#) clear:(\d+)/);
          if (m) current = parseInt(m[1]);
          if (current != null) {
            (map[current] = map[current] || []).push(i + 1);
          }
        }

        if (input.clear_line) {
          const cl = input.clear_line;
          const compiledLines = map[cl];
          if (!compiledLines) return JSON.stringify({ result: `No compiled output maps to Clear line ${cl}.` });
          const snippet = compiledLines.map(n => `${n}: ${targetLines[n-1]}`).join('\n');
          return JSON.stringify({ result: `Clear line ${cl} compiles to:\n${snippet}` });
        }

        const summary = Object.entries(map)
          .sort(([a],[b]) => a - b)
          .map(([cl, cls]) => `Clear ${cl} → compiled lines ${cls[0]}-${cls[cls.length-1]}`)
          .join('\n');
        return JSON.stringify({ result: summary });
      }

      // highlight_code is a UI-only tool — the actual highlight effect is sent
      // via `send({type:'highlight',...})` in the post-execution block below.
      // This case just acknowledges success so Meph doesn't see "Unknown tool".
      case 'highlight_code':
        return JSON.stringify({ ok: true, message: `Highlighted lines ${input.start_line}–${input.end_line || input.start_line}` });

      case 'patch_code': {
        if (!currentSource) return JSON.stringify({ error: 'No code in editor. Write code first.' });
        const ops = input.operations;
        if (!Array.isArray(ops) || ops.length === 0) return JSON.stringify({ error: 'Need an operations array. Example: [{ op: "fix_line", line: 5, replacement: "  send back user" }]' });
        const result = patch(currentSource, ops);
        if (result.applied > 0) {
          currentSource = result.source;
          // Push updated source to editor via SSE
          send({ type: 'code_update', code: result.source });
        }
        return JSON.stringify({
          applied: result.applied,
          skipped: result.skipped,
          errors: result.errors,
          totalLines: result.source.split('\n').length,
        });
      }

      case 'run_tests': {
        const testResult = runTestProcess(currentSource);
        send({ type: 'switch_tab', tab: 'tests' });
        send({ type: 'test_results', testType: 'app', ...testResult });
        return JSON.stringify(testResult);
      }

      case 'list_evals': {
        const compiled = compileForEval(currentSource);
        if (!compiled.ok) return JSON.stringify(compiled);
        const suite = compiled.compiled.evalSuite || [];
        return JSON.stringify({ ok: true, suite, count: suite.length });
      }

      case 'run_evals': {
        const evalResult = await runEvalSuite(currentSource);
        send({ type: 'switch_tab', tab: 'tests' });
        send({ type: 'eval_results', ...evalResult });
        return JSON.stringify(evalResult);
      }

      case 'run_eval': {
        if (!input.id) return JSON.stringify({ ok: false, error: "Missing 'id' — use list_evals to see available ids." });
        const evalResult = await runEvalSuite(currentSource, input.id);
        send({ type: 'switch_tab', tab: 'tests' });
        send({ type: 'eval_results', ...evalResult });
        return JSON.stringify(evalResult);
      }

      case 'click_element': {
        // Click via the bridge — acts on the user's visible iframe so they SEE Meph clicking.
        if (!runningChild) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
        const result = await sendBridgeCommandFromServer(send, 'click', { selector: input.selector }, 4000);
        return JSON.stringify(result);
      }

      case 'fill_input': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
        const result = await sendBridgeCommandFromServer(send, 'fill', { selector: input.selector, value: input.value }, 4000);
        return JSON.stringify(result);
      }

      case 'read_network': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. Network capture starts when the app runs.' });
        await getPage(); // ensure browser is connected
        const limit = Math.min(input.limit || 20, 100);
        let requests = _networkBuffer.slice(-limit);
        if (input.filter) {
          requests = requests.filter(r => r.url.includes(input.filter));
        }
        return JSON.stringify({ count: requests.length, requests });
      }

      case 'inspect_element': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
        const result = await sendBridgeCommandFromServer(send, 'inspect', { selector: input.selector }, 4000);
        return JSON.stringify(result);
      }

      case 'read_storage': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
        const result = await sendBridgeCommandFromServer(send, 'read-storage', {}, 4000);
        return JSON.stringify(result);
      }

      case 'read_actions': {
        // Fetch user-action history from our recorder buffer
        try {
          const limit = Math.min(input.limit || 50, 100);
          const r = await fetch('http://localhost:' + (process.env.PORT || 3456) + '/api/meph-actions');
          const data = await r.json();
          return JSON.stringify({ count: Math.min(data.actions.length, limit), actions: data.actions.slice(-limit) });
        } catch (err) {
          return JSON.stringify({ error: err.message.slice(0, 300) });
        }
      }

      case 'read_dom': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
        const result = await sendBridgeCommandFromServer(send, 'read-dom', {}, 4000);
        return JSON.stringify(result);
      }

      case 'websocket_log': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. WebSocket capture starts when the app runs.' });
        await getPage();
        const limit = Math.min(input.limit || 20, 100);
        const messages = _websocketBuffer.slice(-limit);
        return JSON.stringify({ count: messages.length, messages });
      }

      case 'db_inspect': {
        if (!runningChild) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
        const q = String(input.query || '').trim();
        if (!q) return JSON.stringify({ error: 'Missing query' });
        // Security: only allow SELECT queries
        if (!/^select\s/i.test(q)) return JSON.stringify({ error: 'Only SELECT queries allowed. Use db_inspect for reads, not writes.' });
        try {
          // The running app has its SQLite DB in BUILD_DIR/clear-data.db
          const Database = (await import('better-sqlite3')).default;
          const dbPath = join(BUILD_DIR, 'clear-data.db');
          if (!existsSync(dbPath)) return JSON.stringify({ error: 'No database file yet. Make a request that writes data first.' });
          const db = new Database(dbPath, { readonly: true });
          const rows = db.prepare(q).all();
          db.close();
          return JSON.stringify({ ok: true, rowCount: rows.length, rows: rows.slice(0, 100) });
        } catch (err) {
          return JSON.stringify({ error: err.message.slice(0, 300) });
        }
      }

      case 'todo': {
        if (input.action === 'get') {
          return JSON.stringify({ todos: mephTodos });
        }
        if (input.action === 'set') {
          mephTodos = input.todos || [];
          send({ type: 'todo_update', todos: mephTodos });
          return JSON.stringify({ ok: true, count: mephTodos.length });
        }
        return JSON.stringify({ error: 'action must be "set" or "get"' });
      }

      case 'browse_templates': {
        const TEMPLATE_DIR = join(ROOT_DIR, 'apps');
        if (input.action === 'list') {
          try {
            const dirs = readdirSync(TEMPLATE_DIR).filter(d => {
              try { return statSync(join(TEMPLATE_DIR, d)).isDirectory(); } catch { return false; }
            });
            const templates = dirs.map(d => {
              const mainFile = join(TEMPLATE_DIR, d, 'main.clear');
              if (!existsSync(mainFile)) return null;
              const src = readFileSync(mainFile, 'utf8');
              const firstComment = src.match(/^#\s*(.+)/m);
              const lineCount = src.split('\n').filter(l => l.trim()).length;
              return { name: d, description: firstComment?.[1] || '', lines: lineCount };
            }).filter(Boolean);
            return JSON.stringify({ templates, count: templates.length });
          } catch (e) { return JSON.stringify({ error: e.message }); }
        }
        if (input.action === 'read') {
          if (!input.name) return JSON.stringify({ error: 'Need a template name. Use action="list" first to see available templates.' });
          const safeName = input.name.replace(/[^a-zA-Z0-9_-]/g, '');
          const mainFile = join(TEMPLATE_DIR, safeName, 'main.clear');
          if (!existsSync(mainFile)) return JSON.stringify({ error: `Template "${safeName}" not found. Use action="list" to see available templates.` });
          return JSON.stringify({ name: safeName, source: readFileSync(mainFile, 'utf8') });
        }
        return JSON.stringify({ error: 'action must be "list" or "read"' });
      }

      default:
        return JSON.stringify({ error: 'Unknown tool: ' + name });
    }
  }

  // Async HTTP request tool
  async function executeHttpRequest(input) {
    if (!runningChild) return JSON.stringify({ error: 'No app running. Use run_app first.' });
    try {
      const url = `http://localhost:${runningPort}${input.path || '/'}`;
      const opts = { method: input.method || 'GET', headers: { 'Content-Type': 'application/json' } };
      if (input.body && input.method !== 'GET') opts.body = JSON.stringify(input.body);
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return JSON.stringify({ status: r.status, data });
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }

  // Multi-turn tool-use loop with streaming
  let currentMessages = messages.slice(-50); // 1M context supports much longer conversations
  let toolResults = [];

  // Estimate context usage (rough: ~4 chars per token)
  function estimateContextUsage() {
    const MAX_TOKENS = 1000000; // Sonnet 4.6 with 1M context
    const systemChars = (systemPrompt.length + (personality || '').length);
    const toolChars = JSON.stringify(enableWebTools ? [...TOOLS, ...WEB_TOOLS] : TOOLS).length;
    const msgChars = currentMessages.reduce((sum, m) => sum + JSON.stringify(m.content || '').length, 0);
    const totalTokens = Math.round((systemChars + toolChars + msgChars) / 4);
    return { used: totalTokens, max: MAX_TOKENS, percent: Math.round((totalTokens / MAX_TOKENS) * 100) };
  }

  try {
    for (let iter = 0; iter < 15; iter++) {
      const payload = {
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 8000 },
        system: buildSystemWithContext(systemPrompt, personality, testSnapshot),
        tools: enableWebTools ? [...TOOLS, ...WEB_TOOLS] : TOOLS,
        stream: true,
        messages: currentMessages,
      };

      // Retry with exponential backoff on transient failures
      let r;
      const MAX_RETRIES = 5;
      // Per-request abort controller. We DON'T use AbortSignal.timeout here
      // because that aborts the entire stream at the wall-clock limit — for
      // multi-tool Meph turns, a single Anthropic stream can run 60–180s and
      // still be making forward progress. Instead: idle-watchdog — abort only
      // if NO data arrives for IDLE_TIMEOUT_MS. Reset the watchdog every chunk.
      const IDLE_TIMEOUT_MS = 90000;
      const FIRST_TOKEN_TIMEOUT_MS = 60000; // initial connection; reset after first byte
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const ctrl = new AbortController();
          let firstByteSeen = false;
          let watchdog = setTimeout(() => ctrl.abort(new Error('first-token timeout')), FIRST_TOKEN_TIMEOUT_MS);
          // Resetting helper used by the read loop below
          var resetIdleWatchdog = () => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => ctrl.abort(new Error('idle timeout: no data for ' + (IDLE_TIMEOUT_MS / 1000) + 's')), IDLE_TIMEOUT_MS);
            firstByteSeen = true;
          };
          r = await fetch(endpoint, {
            method: 'POST', headers, body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          if (r.ok) break;
          // Retry on 429 (rate limit), 500, 502, 503, 529 (overloaded)
          const retryable = [429, 500, 502, 503, 529].includes(r.status);
          if (!retryable || attempt === MAX_RETRIES - 1) {
            const errText = await r.text();
            console.error(`[chat] Anthropic API error ${r.status}:`, errText.slice(0, 200));
            send({ type: 'error', message: `API error ${r.status}: ${errText.slice(0, 300)}` });
            res.end();
            return;
          }
          const delay = Math.min((attempt + 1) * 3000, 15000); // 3s, 6s, 9s, 12s, 15s
          console.warn(`[chat] API ${r.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay/1000}s`);
          send({ type: 'text', delta: `\n*API returned ${r.status}, retrying (${attempt + 1}/${MAX_RETRIES})...*\n` });
          await new Promise(ok => setTimeout(ok, delay));
        } catch (fetchErr) {
          const errMsg = fetchErr.name === 'TimeoutError' ? 'Request timed out (60s)' :
                         fetchErr.code === 'ECONNREFUSED' ? 'Connection refused — is Anthropic API reachable?' :
                         fetchErr.code === 'ENOTFOUND' ? 'DNS lookup failed — check internet connection' :
                         fetchErr.message || String(fetchErr);
          console.error(`[chat] Network error (attempt ${attempt + 1}/${MAX_RETRIES}):`, errMsg);
          if (attempt === MAX_RETRIES - 1) {
            send({ type: 'error', message: `Network error after ${MAX_RETRIES} retries: ${errMsg}` });
            res.end();
            return;
          }
          const delay = Math.min((attempt + 1) * 3000, 15000);
          send({ type: 'text', delta: `\n*${errMsg} — retrying (${attempt + 1}/${MAX_RETRIES})...*\n` });
          await new Promise(ok => setTimeout(ok, delay));
        }
      }

      // Parse SSE stream from Anthropic
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accText = '';
      let accThinking = ''; // accumulated thinking text for multi-turn
      let accThinkingSignature = ''; // signature for thinking block verification
      let toolUseBlocks = []; // { id, name, inputJson }
      let stopReason = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Reset idle watchdog on every chunk — we're making progress.
        if (typeof resetIdleWatchdog === 'function') resetIdleWatchdog();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          let ev;
          try { ev = JSON.parse(raw); } catch { continue; }

          if (ev.type === 'content_block_start') {
            if (ev.content_block.type === 'thinking') {
              send({ type: 'thinking_start' });
            } else if (ev.content_block.type === 'tool_use') {
              toolUseBlocks.push({ id: ev.content_block.id, name: ev.content_block.name, inputJson: '' });
              send({ type: 'tool_start', name: ev.content_block.name });
            } else if (ev.content_block.type === 'server_tool_use') {
              // Anthropic-executed tool (web_search, web_fetch) — show UI feedback only
              send({ type: 'tool_start', name: ev.content_block.name });
            } else if (ev.content_block.type === 'web_search_tool_result' || ev.content_block.type === 'web_fetch_tool_result') {
              send({ type: 'tool_done', name: 'web' });
            }
          } else if (ev.type === 'content_block_stop') {
            // nothing needed — content_block_stop fires for all block types
          } else if (ev.type === 'content_block_delta') {
            if (ev.delta.type === 'thinking_delta') {
              accThinking += ev.delta.thinking;
              send({ type: 'thinking', delta: ev.delta.thinking });
            } else if (ev.delta.type === 'signature_delta') {
              accThinkingSignature += ev.delta.signature;
            } else if (ev.delta.type === 'text_delta') {
              accText += ev.delta.text;
              send({ type: 'text', delta: ev.delta.text });
            } else if (ev.delta.type === 'input_json_delta') {
              const tb = toolUseBlocks[toolUseBlocks.length - 1];
              if (tb) tb.inputJson += ev.delta.partial_json;
            }
          } else if (ev.type === 'message_delta') {
            stopReason = ev.delta.stop_reason;
          }
        }
      }
      // Stream ended naturally — clear the watchdog so it doesn't fire later
      if (typeof watchdog !== 'undefined') clearTimeout(watchdog);

      // Build assistant content block for next iteration
      // Thinking blocks must come first in the assistant content for multi-turn
      const assistantContent = [];
      if (accThinking) assistantContent.push({ type: 'thinking', thinking: accThinking, signature: accThinkingSignature });
      if (accText) assistantContent.push({ type: 'text', text: accText });

      if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
        send({ type: 'done', toolResults, source: currentSource });
        res.end();
        return;
      }

      // Execute tools and collect results
      const toolResultBlocks = [];
      for (const tb of toolUseBlocks) {
        let input;
        try { input = JSON.parse(tb.inputJson || '{}'); } catch { input = {}; }
        assistantContent.push({ type: 'tool_use', id: tb.id, name: tb.name, input });

        // Human-readable tool summary for chat UI
        const toolSummary = (() => {
          switch (tb.name) {
            case 'edit_code': return input.action === 'write' ? 'Editing code' : input.action === 'read' ? 'Reading editor' : input.action === 'undo' ? 'Undoing last change' : 'edit_code';
            case 'read_file': return `Reading ${input.filename || 'file'}`;
            case 'edit_file': return `${input.action || 'editing'} ${input.filename || 'file'}`;
            case 'run_command': return `$ ${(input.command || '').slice(0, 60)}`;
            case 'compile': return 'Compiling...';
            case 'run_app': return 'Starting app server';
            case 'stop_app': return 'Stopping app server';
            case 'http_request': return `${input.method || 'GET'} ${input.path || '/'}`;
            case 'read_terminal': return 'Checking terminal output';
            case 'screenshot_output': return 'Taking screenshot';
            case 'highlight_code': return `Highlighting lines ${input.start_line || ''}–${input.end_line || ''}`;
            case 'run_tests': return 'Running tests...';
            case 'click_element': return `Clicking ${input.selector || ''}`;
            case 'fill_input': return `Typing into ${input.selector || ''}`;
            case 'read_network': return 'Reading network requests';
            case 'inspect_element': return `Inspecting ${input.selector || ''}`;
            case 'read_storage': return 'Reading browser storage';
            case 'read_actions': return 'Reading user actions';
            case 'read_dom': return 'Reading current DOM';
            case 'websocket_log': return 'Reading WebSocket messages';
            case 'db_inspect': return `DB query: ${(input.query || '').slice(0, 50)}`;
            case 'todo': return input.action === 'set' ? 'Updating task list' : 'Reading task list';
            case 'source_map': return input.clear_line ? `Looking up Clear line ${input.clear_line}` : 'Getting full source map';
            case 'patch_code': return `Patching ${input.operations?.length || 0} operations`;
            case 'browse_templates': return input.action === 'read' ? `Reading template: ${input.name}` : 'Browsing templates';
            default: return tb.name;
          }
        })();
        send({ type: 'tool_start', name: tb.name, summary: toolSummary });

        // Auto-switch IDE tab based on what Claude is doing — before execution
        if (tb.name === 'edit_code' && input.action === 'write') {
          send({ type: 'switch_tab', tab: 'compiled' });
        }
        if (tb.name === 'run_command') {
          send({ type: 'switch_tab', tab: 'terminal' });
          send({ type: 'terminal_append', text: `[Meph] $ ${input.command}` });
        }
        if (tb.name === 'run_app') {
          send({ type: 'switch_tab', tab: 'terminal' });
        }
        if (tb.name === 'http_request') {
          send({ type: 'terminal_append', text: `[Meph] ${input.method} ${input.path}` });
        }
        if (tb.name === 'screenshot_output') {
          send({ type: 'switch_tab', tab: 'output' });
        }
        if (tb.name === 'read_terminal') {
          send({ type: 'switch_tab', tab: 'terminal' });
        }
        if (tb.name === 'run_tests') {
          send({ type: 'switch_tab', tab: 'tests' });
        }

        let result;
        if (tb.name === 'http_request') {
          result = await executeHttpRequest(input);
        } else if (tb.name === 'screenshot_output') {
          // Use the Playwright browser — it's already pointing at the running app's port.
          // This captures the ACTUAL rendered app, not the Studio wrapper or a blank iframe.
          if (!runningChild) {
            result = JSON.stringify({ error: 'No app running. Start with run_app first.' });
          } else {
            try {
              const page = await getPage();
              // Force a navigation if the app restarted on a new port (getPage handles this)
              // Wait for any reactive updates to settle
              await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
              const buffer = await page.screenshot({ fullPage: false, type: 'png' });
              const imageBase64 = buffer.toString('base64');
              result = [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
                { type: 'text', text: `Screenshot of the running app at localhost:${runningPort}. This is the actual rendered output — verify layout, colors, and content.` },
              ];
            } catch (err) {
              result = JSON.stringify({ error: 'Screenshot failed: ' + err.message.slice(0, 200) });
            }
          }
        } else {
          result = await executeTool(tb.name, input);
        }

        // Log every tool call to terminal so the user can see what's happening
        const toolLog = (() => {
          const res = typeof result === 'string' ? (() => { try { return JSON.parse(result); } catch { return {}; } })() : {};
          const ok = res.ok || res.appended || res.inserted || res.replaced || res.written || res.compiled;
          const err = res.error;
          switch (tb.name) {
            case 'edit_code':
              if (input.action === 'read') return '[tool] edit_code read — ' + (input.code ? `${input.code.split('\n').length} lines` : 'read editor');
              if (input.action === 'write') return `[tool] edit_code write — ${(input.code || '').split('\n').length} lines`;
              if (input.action === 'undo') return '[tool] edit_code undo';
              return `[tool] edit_code ${input.action || ''}`;
            case 'edit_file':
              if (err) return `[tool] ❌ edit_file ${input.action} "${input.filename}" — ${err.slice(0, 150)}`;
              if (input.action === 'read') return `[tool] edit_file read "${input.filename}" — ${res.lines || '?'} lines`;
              if (input.action === 'append') return `[tool] ✓ edit_file append "${input.filename}" — +${res.bytes_added || res.bytes || '?'} bytes, ${res.total_lines || '?'} total lines`;
              if (input.action === 'insert') return `[tool] ✓ edit_file insert "${input.filename}" at line ${res.at_line || input.line} — ${res.total_lines || '?'} total lines`;
              if (input.action === 'replace') return `[tool] ✓ edit_file replace "${input.filename}" — ${res.occurrences || 0} occurrence(s)`;
              if (input.action === 'overwrite') return `[tool] ✓ edit_file overwrite "${input.filename}" — ${res.bytes || '?'} bytes, ${res.total_lines || '?'} lines`;
              return `[tool] edit_file ${input.action} "${input.filename}"`;
            case 'read_file':
              if (err) return `[tool] ❌ read_file "${input.filename}" — ${err.slice(0, 150)}`;
              return `[tool] read_file "${input.filename}" — ${res.lines || '?'} lines`;
            case 'compile': {
              if (res.compileError) return `[tool] ❌ compile — ${res.compileError.slice(0, 150)}`;
              const errs = res.errors?.length || 0;
              const targets = [res.hasHTML && 'HTML', res.hasServerJS && 'Server JS', res.hasJavascript && 'JS', res.hasPython && 'Python'].filter(Boolean).join(', ');
              if (errs > 0) return `[tool] ⚠ compile — ${errs} error(s), targets: ${targets || 'none'}`;
              return `[tool] ✓ compile — targets: ${targets || 'none'}`;
            }
            case 'run_app':
              if (err) return `[tool] ❌ run_app — ${err.slice(0, 150)}`;
              return `[tool] ✓ run_app — port ${res.port || '?'}`;
            case 'stop_app':
              return `[tool] ✓ stop_app`;
            case 'http_request':
              if (err) return `[tool] ❌ ${input.method} ${input.path} — ${err.slice(0, 150)}`;
              return `[tool] ${input.method} ${input.path} → ${res.status || '?'}`;
            case 'read_terminal':
              return `[tool] read_terminal — ${(res.terminal || '').split('\n').length} lines`;
            case 'screenshot_output':
              return `[tool] screenshot — ${Array.isArray(result) ? 'captured' : 'failed'}`;
            case 'highlight_code':
              return `[tool] highlight lines ${input.start_line}–${input.end_line || input.start_line}${input.message ? ': ' + input.message : ''}`;
            case 'run_tests': {
              if (err) return `[tool] ❌ tests — ${err.slice(0, 150)}`;
              const tr = JSON.parse(result);
              return `[tool] ✓ tests — ${tr.passed || 0} passed, ${tr.failed || 0} failed`;
            }
            case 'click_element':
              return err ? `[tool] ❌ click ${input.selector} — ${err.slice(0, 120)}` : `[tool] ✓ clicked ${input.selector}`;
            case 'fill_input':
              return err ? `[tool] ❌ fill ${input.selector} — ${err.slice(0, 120)}` : `[tool] ✓ filled ${input.selector}`;
            case 'read_network': {
              if (err) return `[tool] ❌ read_network — ${err.slice(0, 120)}`;
              const r = JSON.parse(result);
              return `[tool] network — ${r.count || 0} requests`;
            }
            case 'inspect_element':
              return err ? `[tool] ❌ inspect ${input.selector} — ${err.slice(0, 120)}` : `[tool] ✓ inspected ${input.selector}`;
            case 'read_storage':
              return err ? `[tool] ❌ read_storage — ${err.slice(0, 120)}` : `[tool] ✓ read storage`;
            case 'read_actions': {
              if (err) return `[tool] ❌ read_actions — ${err.slice(0, 120)}`;
              const r = JSON.parse(result);
              return `[tool] user actions — ${r.count || 0} recorded`;
            }
            case 'read_dom':
              return err ? `[tool] ❌ read_dom — ${err.slice(0, 120)}` : `[tool] ✓ read DOM snapshot`;
            case 'websocket_log': {
              if (err) return `[tool] ❌ websocket_log — ${err.slice(0, 120)}`;
              const r = JSON.parse(result);
              return `[tool] websocket — ${r.count || 0} messages`;
            }
            case 'db_inspect': {
              if (err) return `[tool] ❌ db_inspect — ${err.slice(0, 120)}`;
              const r = JSON.parse(result);
              return `[tool] ✓ db — ${r.rowCount || 0} rows`;
            }
            case 'todo': {
              if (input.action === 'set') {
                const inProg = (mephTodos || []).find(t => t.status === 'in_progress');
                return `[tool] ✓ todo — ${inProg ? inProg.activeForm : 'updated'}`;
              }
              return `[tool] todo — ${(mephTodos || []).length} tasks`;
            }
            case 'source_map':
              return `[tool] ✓ source_map`;
            case 'patch_code':
              return `[tool] ✓ patch — ${JSON.parse(res).applied || 0} applied, ${JSON.parse(res).skipped || 0} skipped`;
            case 'browse_templates':
              return `[tool] ✓ browse_templates — ${input.action} ${input.name || ''}`.trim();
            default:
              return `[tool] ${tb.name}`;
          }
        })();
        send({ type: 'terminal_append', text: toolLog });

        // Post-execution events
        if (tb.name === 'edit_code' && input.action === 'write') {
          toolResults.push({ tool: 'edit_code', code: input.code });
          send({ type: 'code_update', code: input.code });
        }
        if (tb.name === 'highlight_code') {
          send({ type: 'highlight', startLine: input.start_line, endLine: input.end_line || input.start_line, message: input.message || '' });
        }
        send({ type: 'tool_done', name: tb.name });

        // Anthropic's tool_result.content must be a string OR an array of
        // content blocks. If executeTool ever returns a bare object (bug),
        // JSON-stringify it so we don't send `[object Object]` to the API.
        const safeContent =
          typeof result === 'string' ? result :
          Array.isArray(result) ? result :
          JSON.stringify(result);
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: tb.id, content: safeContent });
      }

      currentMessages.push({ role: 'assistant', content: assistantContent });
      currentMessages.push({ role: 'user', content: toolResultBlocks });
    }

    send({ type: 'context_usage', ...estimateContextUsage() });
    send({ type: 'done', toolResults, source: currentSource });
    res.end();
  } catch (err) {
    send({ type: 'error', message: err.message });
    res.end();
  }
});

// =============================================================================
// CLEANUP
// =============================================================================
// Single consolidated shutdown — kill child, AWAIT browser close, then exit.
// Without awaiting, Playwright's async handles fire in the middle of process.exit
// and Windows' libuv trips "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
let _shuttingDown = false;
async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  if (runningChild) { try { runningChild.kill(); } catch {} runningChild = null; }
  try { await closeBrowser(); } catch {}
  // Give pending stdio flushes a tick to finish before the loop tears down
  setImmediate(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// =============================================================================
// START
// =============================================================================
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`\n  Clear Playground: http://localhost:${PORT}\n`);
});
