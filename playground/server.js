import express from 'express';
import { compileProgram } from '../index.js';
import { parse } from '../parser.js';
import { patch } from '../patch.js';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync, openSync, closeSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { createHash } from 'crypto';
import { chromium } from 'playwright';
import { EVAL_JWT_SECRET, mintEvalAuthToken, mintLegacyEvalAuthToken } from './eval-auth.js';
import { wireDeploy } from './deploy.js';
import { FactorDB } from './supervisor/factor-db.js';
import { classifyArchetype } from './supervisor/archetype.js';
import {
  loadBundle as _loadEBM,
  rank as _rankEBM,
  featurizeFactorRow as _featurizeRow,
  rankPairwise as _rankPairwise,
  classifyErrorCategory as _classifyErrorCategory,
} from './supervisor/ebm-scorer.js';

// Reranker bundles loaded below, after __dirname is defined. Pointwise EBM
// comes from reranker.json; pairwise logistic from reranker-pairwise.json.
// When both are present, pairwise wins — it answers the retrieval question
// ("is THIS fix likely to help THIS error?") directly.
let _ebmBundle = null;
let _pairwiseBundle = null;
import { createEditApi } from '../lib/edit-api.js';
import { callMeph } from '../lib/meph-adapter.js';
import {
  takeSnapshot as _takeSnapshot,
  listSnapshots as _listSnapshots,
  restoreSnapshot as _restoreSnapshot,
} from '../lib/snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load EBM reranker bundle. Non-fatal if absent — retrieval falls back to
// raw BM25 ordering from querySuggestions(). After training, copy the
// reranker.json from your training output into playground/supervisor/.
try {
  const ebmPath = join(__dirname, 'supervisor', 'reranker.json');
  if (existsSync(ebmPath)) {
    _ebmBundle = _loadEBM(ebmPath);
    console.log(`  EBM reranker loaded: ${(_ebmBundle.features || []).length} features, intercept=${(_ebmBundle.intercept || 0).toFixed(3)}`);
  }
} catch (err) {
  console.warn(`  EBM reranker load failed (non-fatal): ${err.message}`);
}
try {
  const pairwisePath = join(__dirname, 'supervisor', 'reranker-pairwise.json');
  if (existsSync(pairwisePath)) {
    _pairwiseBundle = _loadEBM(pairwisePath);
    const m = _pairwiseBundle.metrics || {};
    console.log(`  Pairwise reranker loaded: ${(_pairwiseBundle.features || []).length} features, val_auc=${m.val_auc ?? 'n/a'} (${m.n_pairs ?? '?'} pairs)`);
  }
} catch (err) {
  console.warn(`  Pairwise reranker load failed (non-fatal): ${err.message}`);
}

// Load .env from project root
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.replace(/\r$/, '');
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  });
}
// Worker mode: --port=345X --session-id=workerX (set before .env is read above)
const _argv = process.argv.slice(2);
const _portArg = _argv.find(a => a.startsWith('--port='));
const _sessionArg = _argv.find(a => a.startsWith('--session-id='));
if (_portArg) process.env.PORT = _portArg.split('=')[1];
if (_sessionArg) process.env.SESSION_ID = _sessionArg.split('=')[1];

const APPS_DIR = join(ROOT_DIR, 'apps');
const BUILD_DIR = join(__dirname, '.playground-build');
const SESSIONS_DIR = join(__dirname, 'sessions');
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));

// =============================================================================
// STATIC FILES
// =============================================================================
// Route ide.html BEFORE static (otherwise index.html wins)
// No-cache headers so edits show on browser refresh without server restart
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // dotfiles:'allow' is needed when the checkout lives under a dotted path
  // (e.g. a worktree in .claude/worktrees/...) — without it send's default
  // dotfile protection 404s the whole response.
  res.sendFile(join(__dirname, 'ide.html'), { dotfiles: 'allow' });
});
app.use(express.static(__dirname, { etag: false, lastModified: false, dotfiles: 'allow', setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

// Deploy + billing endpoints (Phase 85 — one-click deploy). Needs express.json
// already mounted above. Uses an in-memory tenant store by default — swap to
// Postgres-backed store in production via wireDeploy({ store }).
wireDeploy(app);

// =============================================================================
// LIVE APP EDITING — PHASE A (Studio integration)
// =============================================================================
// Mounts POST /__meph__/api/propose, POST /__meph__/api/ship, and
// GET /__meph__/widget.js on Studio's Express app. The widget bundle
// self-gates on the caller's JWT role === 'owner'. For Phase A the ship
// flow is still a stub — it echoes the newSource back so the spike can
// demo the propose loop. Wiring ship to Studio's actual compile+respawn
// path is cycle 10b (next session).
const LIVE_EDIT_WIDGET_PATH = join(ROOT_DIR, 'runtime', 'meph-widget.js');
let _liveEditWidgetSource = '';
try {
  _liveEditWidgetSource = readFileSync(LIVE_EDIT_WIDGET_PATH, 'utf8');
} catch (e) {
  console.warn('[live-edit] widget.js not found at ' + LIVE_EDIT_WIDGET_PATH);
}

// Middleware that populates req.user from a Bearer JWT using Studio's
// existing eval secret. Matches the shape runtime/auth.js produces.
function liveEditAuth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = h.slice(7);
  const parts = token.split('.');
  if (parts.length !== 2) {
    req.user = null;
    return next();
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) {
      req.user = null;
    } else {
      req.user = payload;
    }
  } catch {
    req.user = null;
  }
  next();
}

app.use('/__meph__', liveEditAuth);

createEditApi(app, {
  readSource: async (req) => {
    // Phase A: source comes from the request body (Studio IDE sends it).
    // Cycle 10b will wire this to Studio's loaded-file state.
    return (req.body && req.body.source) || '';
  },
  callMeph: async ({ prompt, source }) => {
    const key = storedApiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    return await callMeph({ prompt, source, apiKey: key });
  },
  applyShip: async (newSource) => {
    // Cycle 10b: compile the new source, then POST to Studio's own /api/run
    // to write files and respawn the child app. Returns the new port so
    // the widget can reload to the right URL.
    const t0 = Date.now();
    let compiled;
    try {
      compiled = compileProgram(newSource);
    } catch (err) {
      return { ok: false, error: `compile threw: ${err.message}`, elapsed_ms: Date.now() - t0 };
    }
    if (compiled.errors && compiled.errors.length) {
      const msgs = compiled.errors.map((e) => e.message || String(e)).join('; ');
      return { ok: false, error: `compile failed: ${msgs}`, elapsed_ms: Date.now() - t0 };
    }
    const studioPort = process.env.PORT || '3456';
    try {
      const r = await fetch(`http://localhost:${studioPort}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverJS: compiled.serverJS,
          html: compiled.html,
          css: compiled.css || '',
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        return {
          ok: false,
          error: body.error || `/api/run returned ${r.status}`,
          elapsed_ms: Date.now() - t0,
        };
      }
      return { ok: true, elapsed_ms: Date.now() - t0, port: body.port };
    } catch (err) {
      return { ok: false, error: `ship fetch failed: ${err.message}`, elapsed_ms: Date.now() - t0 };
    }
  },
  widgetScript: _liveEditWidgetSource,
  listSnapshots: async () => _listSnapshots(),
  applyRollback: async (ref) => {
    // Rollback restores source + SQLite data to a prior snapshot.
    // Uses Studio's BUILD_DIR paths so Studio respawn sees the
    // restored files on the next /api/run call.
    const sourcePath = join(BUILD_DIR, 'source.clear');
    const dataPath = join(BUILD_DIR, 'clear-data.db');
    const r = _restoreSnapshot(ref, { sourcePath, dataPath });
    if (!r.ok) return r;
    // Recompile from restored source and respawn the child.
    let compiled;
    try {
      const restoredSource = readFileSync(sourcePath, 'utf8');
      compiled = compileProgram(restoredSource);
    } catch (err) {
      return { ok: false, error: `recompile after rollback failed: ${err.message}` };
    }
    if (compiled.errors && compiled.errors.length) {
      return {
        ok: false,
        error: 'restored source failed to compile: ' + compiled.errors.map((e) => e.message).join('; '),
      };
    }
    const studioPort = process.env.PORT || '3456';
    try {
      await fetch(`http://localhost:${studioPort}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverJS: compiled.serverJS,
          html: compiled.html,
          css: compiled.css || '',
        }),
      });
    } catch (err) {
      return { ok: false, error: `respawn after rollback failed: ${err.message}` };
    }
    return { ok: true, restoredId: r.restoredId, ts: r.ts, label: r.label };
  },
});

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
  // Marcus 5 — business ops apps (RevOps, approvals, routing, onboarding, support)
  'approval-queue',         // Approval workflow: submit → pending → approved/rejected
  'lead-router',            // Routing: intake + rules + assign by size (SMB/Mid/Enterprise)
  'onboarding-tracker',     // Customer onboarding: multi-step checklist per customer
  'support-triage',         // AI-assisted: classifies tickets by category + priority
  'internal-request-queue', // IT/HR/Facilities/Finance request triage

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
// Exposed for unit testing — the SSE drainer has been the source of
// agent-endpoint grading bugs (empty bodies, dropped structured payloads).
export { _extractSSEFrameText, _parseSSEFrames };

function runTestProcess(source) {
  const start = Date.now();
  if (!source || !source.trim()) {
    return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  }
  const tmpPath = join(BUILD_DIR, '_test-source-' + Date.now() + '.clear');
  mkdirSync(BUILD_DIR, { recursive: true });
  writeFileSync(tmpPath, source);
  // Outer timeout wraps both npm install + server startup + actual test
  // execution. Multi-agent templates with real `ask claude` E2E calls can
  // easily push past 30s. 180s is generous enough for those without letting
  // a truly hung run block the Studio UI forever. Override via env.
  const outerTimeoutMs = Math.max(15000, Number(process.env.CLEAR_STUDIO_TEST_TIMEOUT_MS) || 180000);
  try {
    // Pass API key from Meph config so agent tests can call Claude
    const testEnv = { ...process.env, ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}) };
    const stdout = execSync(`node cli/clear.js test "${tmpPath}"`, { cwd: ROOT_DIR, encoding: 'utf8', timeout: outerTimeoutMs, maxBuffer: 5 * 1024 * 1024, env: testEnv });
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
    // Translate the cryptic "spawnSync C:\Windows\system32\cmd.exe ETIMEDOUT"
    // that Node emits on Windows when execSync hits its timeout. On macOS/Linux
    // it shows up as killed=true + signal=SIGTERM. Either way the user needs
    // a message they can act on, not a stack trace pointing at cmd.exe.
    const timedOut = err.code === 'ETIMEDOUT' || (err.killed && err.signal === 'SIGTERM');
    if (timedOut) {
      const secs = Math.round(outerTimeoutMs / 1000);
      return {
        ok: false,
        error: `Test runner timed out after ${secs}s. Templates with live agent calls can be slow — try running fewer tests, or set CLEAR_STUDIO_TEST_TIMEOUT_MS to raise the limit.`,
        timedOut: true,
        duration: Date.now() - start,
      };
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
// Which auth scheme the current eval child uses — set by ensureEvalChild
// based on what the compiled serverJS imports. 'jwt' = jsonwebtoken (most
// templates). 'legacy' = runtime/auth.js (blog-api, lead-scorer, page-
// analyzer). Read by callEvalEndpoint to mint the right token format.
let evalChildAuthScheme = 'jwt';
let evalChildIdleTimer = null;
const EVAL_PORT = 4999;
// How long the eval child sticks around after the LAST request before we
// reap it. 60s was too tight for long suites: the grader call after each
// probe can take 2-10s, and multi-agent-research's 17-spec suite can stall
// mid-run if grading bursts happen to span 60s between child-hits. Bumping
// to 5 min covers any realistic suite length — the child gets cleaned up
// promptly once Studio goes idle, and `ensureEvalChild` reuses if the same
// source is re-run, so cost is near zero.
const EVAL_IDLE_MS = 300_000;

// Promise mutex — serializes eval suite runs so a Run-All and a Run-One-Eval
// never interleave. Each `/api/run-eval` caller chains onto this promise and
// awaits its ticket. Blocks nothing else in Studio; only eval runs are serial.
let _evalMutex = Promise.resolve();

// Synchronous fire-and-forget kill — used by SIGINT/exit handlers where we
// can't await. For cross-template switches use `killEvalChildAndWait` so the
// OS actually releases port 4999 before the next spawn fires.
function killEvalChild() {
  if (evalChildIdleTimer) { clearTimeout(evalChildIdleTimer); evalChildIdleTimer = null; }
  if (evalChild) {
    try { evalChild.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { if (evalChild) evalChild.kill('SIGKILL'); } catch {} }, 1500);
  }
  evalChild = null;
  evalChildPort = null;
}

// Kill the child AND wait for the OS to actually release port 4999. Without
// this, ensureEvalChild would immediately try to spawn a new child on the
// same port and the new listener would fail with EADDRINUSE — surfacing as
// "Network error: fetch failed" on every probe (the child crashes mid-boot
// and every request hits a dead socket). Switching templates between eval
// runs was the consistent trigger.
async function killEvalChildAndWait() {
  if (evalChildIdleTimer) { clearTimeout(evalChildIdleTimer); evalChildIdleTimer = null; }
  const prev = evalChild;
  evalChild = null;
  evalChildPort = null;
  if (!prev) return;
  try {
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      prev.once('exit', finish);
      try { prev.kill('SIGTERM'); } catch { finish(); }
      // Hard kill if the child ignores SIGTERM within 2s
      setTimeout(() => { try { prev.kill('SIGKILL'); } catch {} finish(); }, 2000);
    });
  } catch {}
  // Small grace period for the OS socket layer to release the port — Windows
  // specifically holds the port briefly even after the process exits. Without
  // this a fast-follow spawn still races.
  await new Promise(r => setTimeout(r, 200));
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

async function ensureEvalChild(serverJS) {
  // serverJS must already include the /_eval/* synthetic handlers — the
  // caller compiles with `{ evalMode: true }` to get them. Earlier versions
  // spliced the handlers in here with regex; that was fragile. The compiler
  // is now the single source of truth for the compiled serverJS shape.
  const fullJS = serverJS;
  // If we already have a child for THIS exact source, reuse it.
  if (evalChild && evalChildPort && evalChild._lastServerJS === fullJS) {
    resetEvalIdleTimer();
    return evalChildPort;
  }
  // Otherwise: kill any previous child (source changed) and spin a fresh one.
  // Wait for the old child to fully exit before reusing port 4999 — sync kill
  // returns instantly, but the OS may still hold the port for a beat, and a
  // fast spawn on top of that surfaces as "fetch failed" on every probe.
  await killEvalChildAndWait();

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
  // Share a single eval-scoped secret with the child so tokens minted by
  // mintEvalAuthToken in this process are verified by the child's auth
  // middleware. The compiler emits inline jsonwebtoken-based auth for the
  // core templates (reads JWT_SECRET). We also set CLEAR_AUTH_SECRET to
  // the same value so runtime/auth.js-based templates at least share the
  // same secret, though that scheme's token FORMAT differs (2-part HMAC
  // vs RFC 7519 JWT) — supporting it would require a second mint helper.
  // Without this change, every `requires login` endpoint 401s on every
  // probe, and 7 of 8 core templates score 0/N on evals (see eval-auth.js).
  const env = {
    ...process.env,
    PORT: String(EVAL_PORT),
    JWT_SECRET: EVAL_JWT_SECRET,
    CLEAR_AUTH_SECRET: EVAL_JWT_SECRET,
    ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}),
  };
  const child = spawn('node', ['server.js'], { cwd: BUILD_DIR, env, stdio: 'pipe' });
  child._lastServerJS = fullJS;
  evalChild = child;
  evalChildPort = EVAL_PORT;
  // Detect which auth library the compiled child uses so callEvalEndpoint
  // can mint a token in the matching format. Same `Authorization: Bearer`
  // header either way — only the payload shape differs. Defaults to 'jwt'
  // (modern templates); legacy runtime/auth.js templates get the 2-part
  // HMAC format (blog-api, lead-scorer, page-analyzer).
  evalChildAuthScheme = /require\(['"]\.\/clear-runtime\/auth['"]\)/.test(fullJS) ? 'legacy' : 'jwt';
  child.stderr.on('data', d => termLog('[eval-stderr] ' + d.toString().trimEnd()));
  child.stdout.on('data', d => termLog('[eval-stdout] ' + d.toString().trimEnd()));
  child.on('exit', () => { if (evalChild === child) { evalChild = null; evalChildPort = null; } });
  // Wait for the port to accept connections.
  await probeUntilReady(EVAL_PORT, 10_000);
  resetEvalIdleTimer();
  return EVAL_PORT;
}

// Pricing per 1K tokens for each grader provider. The UI's cost estimate
// and per-eval cost capture multiply against these. Prices checked April 2026
// — update when the vendor changes them. Source comment for each entry:
//   - anthropic (claude-sonnet-4): https://anthropic.com/pricing
//   - google (gemini-1.5-pro):     https://ai.google.dev/pricing
//   - openai (gpt-4o-mini):        https://openai.com/api/pricing
const PROVIDER_PRICING_USD_PER_1K = {
  anthropic: { input: 0.003,   output: 0.015  },
  google:    { input: 0.00125, output: 0.005  },
  openai:    { input: 0.00015, output: 0.0006 },
};

// Default model per provider. Override with EVAL_MODEL.
const PROVIDER_DEFAULT_MODEL = {
  anthropic: 'claude-sonnet-4-20250514',
  google:    'gemini-1.5-pro',
  openai:    'gpt-4o-mini',
};

function _resolveGraderConfig() {
  const provider = (process.env.EVAL_PROVIDER || 'anthropic').toLowerCase();
  const normalized = provider === 'gemini' ? 'google' : provider;
  const model = process.env.EVAL_MODEL || PROVIDER_DEFAULT_MODEL[normalized] || PROVIDER_DEFAULT_MODEL.anthropic;
  const pricing = PROVIDER_PRICING_USD_PER_1K[normalized] || PROVIDER_PRICING_USD_PER_1K.anthropic;
  const temperature = parseFloat(process.env.EVAL_TEMPERATURE || '0');
  return { provider: normalized, model, pricing, temperature };
}

function _graderKey(provider) {
  if (provider === 'google') return process.env.GOOGLE_API_KEY || '';
  if (provider === 'openai') return process.env.OPENAI_API_KEY || '';
  return storedApiKey || process.env.ANTHROPIC_API_KEY || '';
}

function _graderKeyEnvName(provider) {
  if (provider === 'google') return 'GOOGLE_API_KEY';
  if (provider === 'openai') return 'OPENAI_API_KEY';
  return 'ANTHROPIC_API_KEY';
}

// Build the grading prompt — provider-independent, same text across all
// graders so rubrics remain portable.
function _buildGraderPrompt(rubric, input, output) {
  return `You are grading an AI agent's output.\n\nRubric:\n${rubric}\n\nInput given to the agent:\n${JSON.stringify(input)}\n\nAgent's output:\n${typeof output === 'string' ? output : JSON.stringify(output)}\n\nRespond with ONLY a JSON object: { "pass": true|false, "score": 1-10, "feedback": "<one sentence>" }`;
}

function _parseGraderJSON(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function _costUSD(inTok, outTok, pricing) {
  return (inTok / 1000) * pricing.input + (outTok / 1000) * pricing.output;
}

// Provider-agnostic grader. Dispatches to Anthropic/Google/OpenAI based on
// EVAL_PROVIDER (default anthropic). Returns {pass, score, feedback,
// graderRaw, usage: {inTok, outTok, costUSD, provider, model}} on success,
// or {skipped: true, reason} when the provider key is missing.
async function gradeWithJudge(rubric, input, output) {
  const cfg = _resolveGraderConfig();
  const key = _graderKey(cfg.provider);
  if (!key) {
    return { skipped: true, reason: `${_graderKeyEnvName(cfg.provider)} not set — role/e2e grading skipped for provider '${cfg.provider}'` };
  }
  const prompt = _buildGraderPrompt(rubric, input, output);
  try {
    if (cfg.provider === 'anthropic') {
      return await _gradeAnthropic(cfg, key, prompt);
    }
    if (cfg.provider === 'google') {
      return await _gradeGoogle(cfg, key, prompt);
    }
    if (cfg.provider === 'openai') {
      return await _gradeOpenAI(cfg, key, prompt);
    }
    return { pass: false, feedback: `Unknown EVAL_PROVIDER: ${cfg.provider}`, score: 0, graderRaw: '' };
  } catch (err) {
    return { pass: false, feedback: 'Grader error: ' + err.message, score: 0, graderRaw: '' };
  }
}

async function _gradeAnthropic(cfg, key, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 256,
      temperature: cfg.temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return { pass: false, feedback: `Grader HTTP ${r.status}`, score: 0, graderRaw: '' };
  const data = await r.json();
  const graderRaw = data.content?.[0]?.text || '';
  const usage = {
    inTok: data.usage?.input_tokens || 0,
    outTok: data.usage?.output_tokens || 0,
    provider: 'anthropic',
    model: cfg.model,
  };
  usage.costUSD = _costUSD(usage.inTok, usage.outTok, cfg.pricing);
  const g = _parseGraderJSON(graderRaw);
  if (!g) return { pass: false, feedback: 'Grader returned non-JSON', score: 0, graderRaw, usage };
  return { pass: !!g.pass, score: g.score || 0, feedback: g.feedback || '', graderRaw, usage };
}

async function _gradeGoogle(cfg, key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: cfg.temperature, maxOutputTokens: 256 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return { pass: false, feedback: `Grader HTTP ${r.status}`, score: 0, graderRaw: '' };
  const data = await r.json();
  // Gemini may refuse via safety filters — surface the finishReason so the
  // user knows why the grade came back empty.
  const cand = data.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
    return { pass: false, feedback: `Gemini refused: ${cand.finishReason}`, score: 0, graderRaw: JSON.stringify(cand) };
  }
  const graderRaw = cand?.content?.parts?.[0]?.text || '';
  const usage = {
    inTok: data.usageMetadata?.promptTokenCount || 0,
    outTok: data.usageMetadata?.candidatesTokenCount || 0,
    provider: 'google',
    model: cfg.model,
  };
  usage.costUSD = _costUSD(usage.inTok, usage.outTok, cfg.pricing);
  const g = _parseGraderJSON(graderRaw);
  if (!g) return { pass: false, feedback: 'Grader returned non-JSON', score: 0, graderRaw, usage };
  return { pass: !!g.pass, score: g.score || 0, feedback: g.feedback || '', graderRaw, usage };
}

async function _gradeOpenAI(cfg, key, prompt) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: cfg.model,
      temperature: cfg.temperature,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return { pass: false, feedback: `Grader HTTP ${r.status}`, score: 0, graderRaw: '' };
  const data = await r.json();
  const graderRaw = data.choices?.[0]?.message?.content || '';
  const usage = {
    inTok: data.usage?.prompt_tokens || 0,
    outTok: data.usage?.completion_tokens || 0,
    provider: 'openai',
    model: cfg.model,
  };
  usage.costUSD = _costUSD(usage.inTok, usage.outTok, cfg.pricing);
  const g = _parseGraderJSON(graderRaw);
  if (!g) return { pass: false, feedback: 'Grader returned non-JSON', score: 0, graderRaw, usage };
  return { pass: !!g.pass, score: g.score || 0, feedback: g.feedback || '', graderRaw, usage };
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
  // Retry connection-level failures up to 2 extra times with short backoff.
  // `probeUntilReady` returns as soon as `/` responds, but Express mounts
  // `/` early and `/_eval/*` + domain routes later — so the first probe can
  // land during a window where the TCP listener is up but the real route
  // isn't registered yet, producing `fetch failed` / ECONNRESET. Retrying
  // rides out that warmup gap without hiding legitimate route/HTTP failures
  // (non-connection errors like 4xx/5xx are returned as-is on the first try).
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 500;
  let lastErr = null;
  // Mint once per call (not once per retry) so retries don't stack tokens.
  // Token TTL is 1 hour — trivially outlives any single eval spec run.
  // Format picked based on which auth library the child imports (set at
  // spawn time in ensureEvalChild): 'legacy' = 2-part runtime/auth.js HMAC,
  // anything else = standard 3-part jsonwebtoken JWT.
  const authToken = evalChildAuthScheme === 'legacy'
    ? mintLegacyEvalAuthToken()
    : mintEvalAuthToken();
  // Reset the eval-child idle timer every time we touch the child. Before
  // this, the timer was set once at child spawn and only reset when a suite
  // fully completed — so a suite that took longer than EVAL_IDLE_MS (60s)
  // had its child killed mid-run, and every spec after that timer fired
  // got "fetch failed" against a dead server. Workflow agents (Polished
  // Report, Research Topic in MAR) run late in the suite and were the
  // consistent casualties — 4 of 17 MAR evals failed this way.
  resetEvalIdleTimer();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(`http://localhost:${port}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Authorize every probe as a test user so `requires login`
          // endpoints pass the auth gate and the agent actually runs.
          // Child verifies with JWT_SECRET=EVAL_JWT_SECRET (shared at spawn).
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
        // 90s budget. Single-LLM-call probes finish in 2-15s, but multi-
        // step agents (repeat-until refinement, sub-agent orchestration)
        // legitimately chain 4-8 Claude calls and land in the 30-60s range.
        // Polished Report in multi-agent-research hit 45s and aborted under
        // the previous budget; its timeouts surfaced as "Network error".
        signal: AbortSignal.timeout(90_000)
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
      lastErr = err;
      // Only retry true connection errors — not AbortError (real 45s timeout).
      const msg = String(err?.message || '');
      const isConnErr = msg.includes('fetch failed') || msg.includes('ECONN') || err?.cause?.code?.startsWith?.('ECONN');
      if (!isConnErr || attempt === MAX_ATTEMPTS) {
        return { status: 0, data: null, error: msg };
      }
      await new Promise(ok => setTimeout(ok, BACKOFF_MS * attempt));
    }
  }
  return { status: 0, data: null, error: lastErr?.message || 'unreachable' };
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
    // Most common: streaming AI chunk `{text: "..."}` — return the chunk.
    if (parsed && typeof parsed.text === 'string') return parsed.text;
    // Bare string payloads: `send back "hello"` inside a stream block emits
    // `data: "hello"\n\n` — return the unwrapped string.
    if (typeof parsed === 'string') return parsed;
    // Everything else (objects, arrays, numbers, booleans, errors) is a
    // structured payload the grader needs to judge. Return its compact JSON
    // so it survives the concat into the final body. Before this, any shape
    // other than {text} or string was silently dropped — graders saw an
    // empty body and scored every structured-response agent zero.
    return JSON.stringify(parsed);
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
    const grade = await gradeWithJudge(spec.rubric, spec.input, resp.data);
    if (grade.skipped) {
      return { id: spec.id, status: 'skip', duration: Date.now() - started, feedback: grade.reason, input: spec.input, output: resp.data };
    }
    return {
      id: spec.id,
      status: grade.pass ? 'pass' : 'fail',
      duration: Date.now() - started,
      feedback: grade.feedback,
      score: grade.score,
      input: spec.input,
      output: resp.data,
      graderRaw: grade.graderRaw,
      usage: grade.usage,
    };
  }
  return { id: spec.id, status: 'pass', duration: Date.now() - started, feedback: 'Endpoint returned a non-empty response.', input: spec.input, output: resp.data };
}

// Compile the given source. Returns { ok, compiled?, error? }.
function compileForEval(source) {
  if (!source || !source.trim()) return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  let compiled, compiledEvalMode;
  try {
    // Regular compile — used to surface the suite shape (needed even for
    // the estimate endpoint which doesn't spin up the child).
    compiled = compileProgram(source);
    // Eval-mode compile — serverJS includes the /_eval/* synthetic
    // handlers. Used by the eval child runner.
    compiledEvalMode = compileProgram(source, { evalMode: true });
  } catch (err) {
    return { ok: false, error: 'Compile threw: ' + err.message };
  }
  if (compiled.errors && compiled.errors.length > 0) {
    return { ok: false, error: 'Source has compile errors — fix them before running evals.', errors: compiled.errors };
  }
  // `serverJS` exists when the app builds both web + backend. For a pure
  // backend-only app the code lives in `javascript` instead. Accept either.
  const server = compiledEvalMode.serverJS || compiledEvalMode.javascript;
  if (!server) return { ok: false, error: 'App has no backend to run evals against (need a javascript backend build target).' };
  return { ok: true, compiled, serverJS: server };
}

// POST /api/eval-suite — returns the suite list (no execution, no child).
app.post('/api/eval-suite', (req, res) => {
  const { source } = req.body;
  const compiled = compileForEval(source);
  if (!compiled.ok) return res.json(compiled);
  const suite = compiled.compiled.evalSuite || [];
  res.json({ ok: true, suite });
});

// POST /api/eval-suite-estimate — returns a pre-run cost + duration estimate
// for the current source so the UI can gate Run All behind a confirm modal.
// Does not spin up the eval child; pure compile + count.
app.post('/api/eval-suite-estimate', (req, res) => {
  const { source } = req.body;
  const compiled = compileForEval(source);
  if (!compiled.ok) return res.json(compiled);
  const suite = compiled.compiled.evalSuite || [];
  const estimate = estimateEvalSuiteCost(suite);
  res.json({ ok: true, ...estimate });
});

// --- Eval report export ---------------------------------------------------
// Renders current suite + results as a downloadable markdown or CSV file.
// Markdown = human audit-friendly (grouped by agent, full criteria + input +
// output + grader feedback inline). CSV = machine/spreadsheet friendly
// (one row per eval, large fields omitted — use MD for those).
// Stale-result warning: we recompute the source hash server-side and compare
// to the one implied by the result set. Mismatch = banner in the output so
// the user knows the results were generated against a different source.

function _sourceHash(source) {
  if (!source) return 'nosource';
  return createHash('sha256').update(String(source), 'utf8').digest('hex').slice(0, 12);
}

function _appTitleFromSource(source) {
  if (!source) return 'Clear App';
  // First `page 'Name'` if present; else scan for an `agent 'Name'`; else 'Clear App'.
  const page = /^\s*page\s+'([^']+)'/m.exec(source);
  if (page) return page[1];
  const agent = /^\s*agent\s+'([^']+)'/m.exec(source);
  if (agent) return agent[1] + ' (agent app)';
  return 'Clear App';
}

function _truncateForReport(s, max = 4000) {
  if (typeof s !== 'string') s = JSON.stringify(s, null, 2);
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n\n… (truncated)';
}

function renderEvalReportMarkdown({ source, suite, results, meta }) {
  const byId = new Map();
  for (const r of (results || [])) byId.set(r.id, r);
  const hash = _sourceHash(source);
  const title = _appTitleFromSource(source);
  const when = new Date().toISOString();
  const passed = meta?.passed ?? (results || []).filter(r => r.status === 'pass').length;
  const failed = meta?.failed ?? (results || []).filter(r => r.status === 'fail').length;
  const skipped = meta?.skipped ?? (results || []).filter(r => r.status === 'skip').length;
  const totalCost = meta?.total_cost_usd ?? (results || []).reduce((s, r) => s + (r.usage?.costUSD || 0), 0);
  const inTok = (results || []).reduce((s, r) => s + (r.usage?.inTok || 0), 0);
  const outTok = (results || []).reduce((s, r) => s + (r.usage?.outTok || 0), 0);
  const duration = meta?.duration ? (meta.duration / 1000).toFixed(1) + 's' : '—';

  const lines = [];
  lines.push(`# Eval Report — ${title}`);
  lines.push('');
  lines.push(`- **Run at:** ${when}`);
  lines.push(`- **Source hash:** \`${hash}\``);
  lines.push(`- **Total cost:** $${totalCost.toFixed(4)} (${inTok.toLocaleString()} input / ${outTok.toLocaleString()} output tokens)`);
  lines.push(`- **Duration:** ${duration}`);
  lines.push(`- **Summary:** ${passed} pass · ${failed} fail · ${skipped} skip — out of ${(suite || []).length}`);
  lines.push('');

  // Group entries by agent name (fall back to '(no agent)').
  const byAgent = new Map();
  for (const spec of (suite || [])) {
    const key = spec.agentName || '(unassigned)';
    if (!byAgent.has(key)) byAgent.set(key, []);
    byAgent.get(key).push(spec);
  }

  for (const [agentName, specs] of byAgent) {
    lines.push(`## ${agentName}`);
    lines.push('');
    for (const spec of specs) {
      const r = byId.get(spec.id);
      lines.push(`### ${spec.kind.toUpperCase()} — ${spec.label || spec.id}`);
      lines.push('');
      const statusStr = r?.status || 'not-run';
      // Include score-gap so the exported report reads the same as the
      // Studio Tests pane: "Passed at 7.2/10 (+0.2)" vs "Failed at 6.8/10
      // (-0.2)" frames flakiness as a borderline case, not a regression.
      let scoreStr = '';
      if (r?.score) {
        if (spec.rubric) {
          const gap = r.score - 7;
          const gapLabel = gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1);
          scoreStr = ` (score ${r.score}/10, gap ${gapLabel} from threshold)`;
        } else {
          scoreStr = ` (score ${r.score}/10)`;
        }
      }
      const borderlineStr = r?.borderline ? ' *(borderline — passed on retry)*' : '';
      lines.push(`**Status:** ${statusStr}${scoreStr}${borderlineStr}`);
      if (r?.priorAttempt) {
        lines.push(`**First attempt:** ${r.priorAttempt.status} at ${r.priorAttempt.score}/10 — ${r.priorAttempt.feedback}`);
      }
      if (r?.usage) {
        const rerunNote = r.usage.reruns ? ` (includes ${r.usage.reruns} retry)` : '';
        lines.push(`**Cost:** $${(r.usage.costUSD || 0).toFixed(5)}${rerunNote} — ${r.usage.inTok || 0} input / ${r.usage.outTok || 0} output tokens · ${r.usage.provider || ''}/${r.usage.model || ''}`);
      }
      lines.push('');
      // Criteria — rubric leads if present, shape check demotes to footnote.
      // Matches the Studio UI so exported reports read the same way.
      const crit = [];
      const critFootnotes = [];
      const hasRubric = !!spec.rubric;
      if (spec.rubric) crit.push(spec.rubric);
      if (spec.expected?.kind === 'fields' && spec.expected.fields?.length) {
        crit.push('Expected shape — object with fields: ' + spec.expected.fields.map(f => `${f.name} (${f.type || 'text'})`).join(', '));
      } else if (spec.expected?.kind === 'non-empty') {
        if (hasRubric) critFootnotes.push('Also validated: endpoint returned a non-empty response.');
        else crit.push('Expected — any non-empty response from the endpoint.');
      }
      if (spec.note) crit.push(spec.note);
      if (crit.length || critFootnotes.length) {
        lines.push('**Criteria:**');
        lines.push('');
        lines.push('```');
        if (crit.length) lines.push(crit.join('\n\n'));
        lines.push('```');
        if (critFootnotes.length) {
          lines.push('');
          lines.push('*' + critFootnotes.join(' · ') + '*');
        }
        lines.push('');
      }
      if (spec.input !== undefined) {
        lines.push('**Input:**');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(spec.input, null, 2));
        lines.push('```');
        lines.push('');
      }
      if (r?.output !== undefined) {
        lines.push('**Output:**');
        lines.push('');
        lines.push('```');
        lines.push(_truncateForReport(r.output));
        lines.push('```');
        lines.push('');
      }
      if (r?.feedback) {
        lines.push('**Grader feedback:**');
        lines.push('');
        lines.push('> ' + r.feedback.replace(/\n/g, '\n> '));
        lines.push('');
      }
      if (r?.graderRaw) {
        lines.push('**Grader raw response:**');
        lines.push('');
        lines.push('```');
        lines.push(_truncateForReport(r.graderRaw, 2000));
        lines.push('```');
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('');
  lines.push(`_Note: grader bias is structural — a model family grading its own outputs shares failure modes. Re-run with EVAL_PROVIDER=google or openai for an independent signal._`);
  return lines.join('\n');
}

function _csvEscape(v) {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function renderEvalReportCSV({ suite, results }) {
  const byId = new Map();
  for (const r of (results || [])) byId.set(r.id, r);
  // Column order fixed and documented — consumers depend on this.
  const cols = [
    'id', 'kind', 'agent_name', 'status', 'score', 'pass',
    'duration_ms', 'cost_usd', 'input_tokens', 'output_tokens',
    'endpoint_path', 'synthetic', 'feedback', 'source',
  ];
  const rows = [cols.join(',')];
  for (const spec of (suite || [])) {
    const r = byId.get(spec.id) || {};
    rows.push([
      _csvEscape(spec.id),
      _csvEscape(spec.kind),
      _csvEscape(spec.agentName || ''),
      _csvEscape(r.status || 'not-run'),
      _csvEscape(r.score ?? ''),
      _csvEscape(r.status === 'pass' ? 'true' : r.status === 'fail' ? 'false' : ''),
      _csvEscape(r.duration ?? ''),
      _csvEscape(r.usage?.costUSD ? r.usage.costUSD.toFixed(6) : ''),
      _csvEscape(r.usage?.inTok ?? ''),
      _csvEscape(r.usage?.outTok ?? ''),
      _csvEscape(spec.endpointPath || ''),
      _csvEscape(spec.synthetic ? 'true' : 'false'),
      _csvEscape(r.feedback ? r.feedback.replace(/\r?\n/g, '\\n') : ''),
      _csvEscape(spec.source || 'auto'),
    ].join(','));
  }
  return rows.join('\n') + '\n';
}

// POST /api/export-eval-report — returns a file download of the current
// suite + results. Supports format=md (markdown, grouped by agent) or
// format=csv (one row per eval). UI triggers a browser download from this.
app.post('/api/export-eval-report', (req, res) => {
  const { source, format, suite, results, meta } = req.body || {};
  const fmt = String(format || 'md').toLowerCase();
  if (fmt !== 'md' && fmt !== 'csv') {
    return res.status(400).json({ error: `Unknown format '${format}'. Use 'md' or 'csv'.` });
  }
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'No results to export. Run evals first, then try again.' });
  }
  const hash = _sourceHash(source || '');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `eval-report-${hash}-${ts}.${fmt}`;
  if (fmt === 'md') {
    const body = renderEvalReportMarkdown({ source, suite, results, meta });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(body);
  }
  const body = renderEvalReportCSV({ suite, results });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
});

// Shared runner used by both the HTTP endpoint and Meph's run_evals/run_eval
// tools. Serialized via `_evalMutex` so concurrent callers (e.g. Run-All +
// per-row Run) never interleave on the same DB / child process. Returns the
// same shape the UI expects.
async function runEvalSuite(source, id, onProgress) {
  // Take a ticket on the mutex chain. The chain always ends in a resolved
  // promise; we append our run after it and set the chain forward so the
  // next caller waits for us.
  //
  // `onProgress` (optional) is called twice per spec: once with
  // `{ phase: 'start', id, kind }` before the spec runs, and once with the
  // full result object (`{ phase: 'end', ...result }`) when it resolves.
  // Callers forward these to the UI / terminal so the 30-90s suite run
  // isn't a silent stare — Meph streams per-spec updates to the terminal
  // pane, and the Tests pane (when wired to SSE) can flip each row from
  // pending → running → pass/fail as results land.
  const ticket = _evalMutex.then(() => _runEvalSuiteImpl(source, id, onProgress));
  _evalMutex = ticket.catch(() => undefined);
  return ticket;
}

async function _runEvalSuiteImpl(source, id, onProgress) {
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
    // Single-eval re-runs keep the DB warm for fast iteration. Await the
    // kill so port 4999 is actually free before the respawn — the sync
    // kill variant raced with ensureEvalChild's spawn and produced
    // "fetch failed" on every probe for the whole suite.
    if (!id) {
      await killEvalChildAndWait();
      wipeEvalChildDbFiles();
    }
    const port = await ensureEvalChild(compiled.serverJS);
    const results = [];
    const total = specs.length;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (onProgress) {
        try { onProgress({ phase: 'start', id: spec.id, kind: spec.kind, agentName: spec.agentName, index: i, total }); } catch {}
      }
      // Stream per-spec progress to the Studio terminal pane so the user can
      // watch the whole suite unfold — not just in the Tests tab chips but in
      // the actual terminal log, one line per start/end/output. Works for any
      // caller: Meph's run_evals tool, the UI's Run Evals button, a direct
      // POST to /api/run-eval, or the SSE streaming variant — they all get
      // the same terminal trace for free.
      termLog(`[eval] ${i + 1}/${total} ${spec.id} running…`);
      let result = await runOneEval(spec, port);
      // Auto-rerun on fail, once. T=0 sampling jitter at the grader flips
      // borderline specs; re-running immediately catches transient failures
      // without paying 3x on every spec. If the re-run passes, mark the
      // result as borderline so the UI can signal "this one is flaky, not
      // broken." Cap at graded specs only (skip shape-checks + already-
      // passed runs). Override with CLEAR_EVAL_NO_RERUN=1 for strict mode.
      const canRerun =
        result.status === 'fail' &&
        spec.rubric &&                      // rubric-graded specs only
        !process.env.CLEAR_EVAL_NO_RERUN;
      if (canRerun) {
        termLog(`[eval] ${i + 1}/${total} ${spec.id} failed — retrying once to rule out sampling jitter`);
        const rerun = await runOneEval(spec, port);
        if (rerun.status === 'pass') {
          // First attempt failed, second passed. Attach the prior verdict so
          // the UI can show "borderline — flipped" and the user knows it was
          // close rather than confidently-correct.
          rerun.borderline = true;
          rerun.priorAttempt = {
            status: result.status,
            score: result.score || 0,
            feedback: result.feedback || '',
          };
          // Cost of the failed first attempt is real money — account for it
          // in the usage totals by merging with the rerun's usage.
          if (result.usage && rerun.usage) {
            rerun.usage = {
              ...rerun.usage,
              inTok: (rerun.usage.inTok || 0) + (result.usage.inTok || 0),
              outTok: (rerun.usage.outTok || 0) + (result.usage.outTok || 0),
              costUSD: (rerun.usage.costUSD || 0) + (result.usage.costUSD || 0),
              reruns: 1,
            };
          }
          result = rerun;
          termLog(`[eval] ${i + 1}/${total} ${spec.id} passed on retry — flagged borderline`);
        }
        // If the rerun also failed, keep the original result (don't double-
        // report two failures — the user just wanted to know if it was stable).
      }
      results.push(result);
      const tag = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '~';
      const cost = result.usage?.costUSD ? ` $${result.usage.costUSD.toFixed(4)}` : '';
      const fb = (result.feedback || '').slice(0, 160).replace(/\s+/g, ' ').trim();
      termLog(`[eval] ${i + 1}/${total} ${tag} ${spec.id} ${result.status}${cost}${fb ? ' — ' + fb : ''}`);
      // On failure, show the agent's actual output so the user can see WHAT
      // the agent said that got graded "fail" — otherwise the terminal trace
      // says "fail: didn't follow instructions" with no way to verify. Cap
      // at 240 chars per line; long outputs wrap badly in the terminal pane.
      if (result.status === 'fail' && result.output != null) {
        const out = (typeof result.output === 'string' ? result.output : JSON.stringify(result.output))
          .slice(0, 240).replace(/\s+/g, ' ').trim();
        if (out) termLog(`[eval] ${i + 1}/${total}   output: ${out}`);
      }
      if (onProgress) {
        try { onProgress({ phase: 'end', index: i, total, ...result }); } catch {}
      }
    }
    resetEvalIdleTimer();
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    // Sum real-cost totals across graded specs. Format-only and unskipped
    // specs contribute zero; skipped specs have no usage; null-guarded.
    const totalInputTokens = results.reduce((sum, r) => sum + (r.usage?.inTok || 0), 0);
    const totalOutputTokens = results.reduce((sum, r) => sum + (r.usage?.outTok || 0), 0);
    const totalCostUsd = results.reduce((sum, r) => sum + (r.usage?.costUSD || 0), 0);
    return {
      ok: failed === 0,
      suite,
      results,
      passed,
      failed,
      skipped,
      duration: Date.now() - start,
      total_cost_usd: totalCostUsd,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
    };
  } catch (err) {
    return { ok: false, error: 'Eval run failed: ' + err.message, duration: Date.now() - start };
  }
}

// Pre-run cost estimate. Gradeable specs = role + e2e (format is
// deterministic, zero API cost). Typical grader call: ~400 input tokens
// (rubric + input + output) + ~100 output tokens (JSON verdict). Multiplied
// against the active provider's pricing. Rough — actual cost surfaced in
// real time by per-row cost chips and running total after the run.
const TYPICAL_GRADER_INPUT_TOKENS = 400;
const TYPICAL_GRADER_OUTPUT_TOKENS = 100;

function estimateEvalSuiteCost(suite) {
  const cfg = _resolveGraderConfig();
  const gradeable = suite.filter(s => (s.kind === 'role' || s.kind === 'e2e' || s.kind === 'user') && s.rubric);
  const perCall = _costUSD(TYPICAL_GRADER_INPUT_TOKENS, TYPICAL_GRADER_OUTPUT_TOKENS, cfg.pricing);
  return {
    suite_size: suite.length,
    evals_to_grade: gradeable.length,
    estimated_cost_usd: +(gradeable.length * perCall).toFixed(4),
    estimated_duration_seconds: Math.round(gradeable.length * 2 + 3),
    provider: cfg.provider,
    model: cfg.model,
  };
}

// POST /api/run-eval — runs one or all evals.
//   body: { source, id?: string }  → if id present, runs just that eval;
//                                    otherwise runs the whole suite.
app.post('/api/run-eval', async (req, res) => {
  const { source, id } = req.body || {};
  const result = await runEvalSuite(source, id);
  res.json(result);
});

// SSE variant — same runner, but streams per-spec `eval_row` frames as they
// resolve so the UI (Tests pane) can flip each row from pending → running →
// pass/fail live instead of freezing for 60-90s on a big suite. Final frame
// is `eval_results` with the same aggregate shape /api/run-eval returns.
//
// Shape per frame:
//   data: {"type":"eval_row","phase":"start","id":"role-foo","kind":"role","index":0,"total":17}
//   data: {"type":"eval_row","phase":"end","id":"role-foo","status":"pass","index":0,"total":17,...}
//   ...repeat for each spec...
//   data: {"type":"eval_results","ok":true,"passed":11,"failed":6,"skipped":0,...}
//
// On error, emits a single `{"type":"error","message":"..."}` frame then ends.
app.post('/api/run-eval-stream', async (req, res) => {
  const { source, id } = req.body || {};
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy buffering — some reverse proxies otherwise coalesce the
  // whole stream into one blob, defeating the point of SSE.
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {}
  };
  // Emit the suite shape upfront so the UI can render all rows as "pending"
  // before any spec starts. Otherwise the Tests pane stays blank until the
  // first `eval_row` lands — defeats the point of streaming. Cheap second
  // compile (~10ms for typical apps); runEvalSuite does its own compile so
  // this doesn't leak into the runner.
  try {
    const compiled = compileForEval(source);
    if (compiled.ok && compiled.compiled) {
      // `evalSuite` is undefined (not []) for sources with no agents. Coerce
      // so the UI always gets exactly one suite frame it can trust as the
      // signal that streaming has started, even if the suite is empty.
      send({ type: 'suite', suite: compiled.compiled.evalSuite || [] });
    }
  } catch {}
  try {
    const result = await runEvalSuite(source, id, (row) => send({ type: 'eval_row', ...row }));
    send({ type: 'eval_results', ...result });
  } catch (err) {
    send({ type: 'error', message: err?.message || String(err) });
  }
  res.end();
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

// Shadow vars for supervisor polling — mirrored from /api/chat per-request locals
let _workerLastSource = '';
let _workerLastErrors = [];

// Factor DB — every compile+test cycle logs a row. Becomes re-ranker training data.
// Non-fatal: if the DB fails to open, sessions still work, just no logging.
const FACTOR_DB_PATH = process.env.FACTOR_DB_PATH || join(__dirname, 'factor-db.sqlite');
let _factorDB = null;
try { _factorDB = new FactorDB(FACTOR_DB_PATH); }
catch (err) { console.warn('[FACTOR_DB] disabled:', err.message); }

function _sha1(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 16);
}

// Compute archetype from source, defensively — never let classifier errors fail a compile
function _safeArchetype(source) {
  try { return classifyArchetype(parse(source)); }
  catch { return 'general'; }
}

// Which task step is Meph on? A step is "satisfied" when ALL its sourceMatches
// regexes appear in the current source. currentStep = highest-index satisfied step.
// Returns { id, index, name } or null. Never throws — bad regex just skips that
// step's predicate, so one malformed task JSON can't poison a whole sweep.
function _currentStep(source, steps) {
  if (!Array.isArray(steps) || steps.length === 0 || !source) return null;
  let highest = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const patterns = Array.isArray(s?.sourceMatches) ? s.sourceMatches : [];
    if (patterns.length === 0) continue;
    let allMatch = true;
    for (const p of patterns) {
      try {
        if (!new RegExp(p, 'i').test(source)) { allMatch = false; break; }
      } catch { allMatch = false; break; }
    }
    if (allMatch) highest = { id: s.id || `step_${i + 1}`, index: i, name: s.name || s.id || `Step ${i + 1}` };
  }
  return highest;
}
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

  // Copy runtime files. meph-widget.js ships with every auth-enabled app
  // so the owner's browser can load the Live App Editing widget directly
  // from the compiled app's origin (no CORS dance against Studio).
  const runtimeDir = join(ROOT_DIR, 'runtime');
  for (const f of ['db.js', 'auth.js', 'rateLimit.js', 'meph-widget.js']) {
    if (existsSync(join(runtimeDir, f))) copyFileSync(join(runtimeDir, f), join(rtDir, f));
  }

  // Find port
  runningPort++;
  if (runningPort > 4100) runningPort = 4001;

  // Start child. JWT_SECRET pinned so the e2e test harness can sign tokens that
  // the compiled app accepts. STUDIO_PORT tells the emitted /__meph__/api/*
  // proxy where to forward edit-widget calls — in prod this is unset and
  // the proxy 503s cleanly.
  const env = { ...process.env, PORT: String(runningPort), STUDIO_PORT: String(process.env.PORT || 3456), JWT_SECRET: process.env.JWT_SECRET || 'clear-test-secret', ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}) };
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
- insert_line: insert at position. { op: 'insert_line', line: 5, content: "  validate todo:" }
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

// Lightweight cache for API health — checked at most once per 5 min.
// Calling Anthropic on every dashboard poll would waste quota.
let _apiHealth = { status: 'unknown', message: null, checkedAt: 0 };

async function _checkApiHealth() {
  const key = storedApiKey;
  if (!key) {
    _apiHealth = { status: 'no_key', message: 'No API key configured', checkedAt: Date.now() };
    return;
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (r.ok) {
      _apiHealth = { status: 'ok', message: 'API reachable', checkedAt: Date.now() };
    } else {
      const body = await r.text();
      _apiHealth = { status: 'error', message: `HTTP ${r.status}: ${body.slice(0, 300)}`, checkedAt: Date.now() };
    }
  } catch (err) {
    _apiHealth = { status: 'error', message: err.message, checkedAt: Date.now() };
  }
}

// Flywheel dashboard — Factor DB stats for the Supervisor tab in Studio.
// Read-only; public within Studio so the UI can poll it. Shows training-data
// accumulation in real time as Meph sessions generate rows.
app.get('/api/flywheel-stats', async (req, res) => {
  if (!_factorDB) {
    return res.json({ enabled: false, total: 0, passing: 0, byArchetype: [], recent: [] });
  }
  try {
    // Refresh API health at most every 5 min — cheap check, visible signal
    if (Date.now() - _apiHealth.checkedAt > 5 * 60 * 1000) {
      await _checkApiHealth();
    }
    const stats = _factorDB.stats();
    const byArchetype = _factorDB._db.prepare(`
      SELECT archetype,
        COUNT(*) AS total,
        SUM(compile_ok) AS compiles_ok,
        SUM(test_pass) AS tests_pass
      FROM code_actions
      WHERE archetype IS NOT NULL
      GROUP BY archetype
      ORDER BY total DESC
    `).all();
    const recent = _factorDB._db.prepare(`
      SELECT id, session_id, archetype, compile_ok, test_pass, test_score,
        patch_summary, created_at
      FROM code_actions
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    const threshold = 200;
    res.json({
      enabled: true,
      total: stats.total,
      passing: stats.passing,
      threshold,
      percentToThreshold: Math.min(100, Math.round((stats.passing / threshold) * 100)),
      byArchetype,
      recent,
      apiHealth: _apiHealth,
    });
  } catch (err) {
    res.json({ enabled: false, error: err.message });
  }
});

// ─── SUPERVISOR DASHBOARD ENDPOINTS ──────────────────────────────
// Backs the "Supervisor" tab in Studio. Session browser + sweep control.

// List of recent sessions with aggregated stats. For the session table.
app.get('/api/supervisor/sessions', (req, res) => {
  if (!_factorDB) return res.json({ sessions: [] });
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const sessions = _factorDB._db.prepare(`
      SELECT
        session_id,
        COUNT(*) AS rows,
        SUM(compile_ok) AS compiles_ok,
        SUM(test_pass) AS tests_pass,
        MIN(created_at) AS started_at,
        MAX(created_at) AS last_at,
        (SELECT archetype FROM code_actions WHERE session_id = ca.session_id
          AND archetype IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS archetype
      FROM code_actions ca
      GROUP BY session_id
      ORDER BY last_at DESC
      LIMIT ?
    `).all(limit);
    res.json({ sessions });
  } catch (err) {
    res.json({ sessions: [], error: err.message });
  }
});

// All rows for a specific session — trajectory drill-down.
app.get('/api/supervisor/session/:id', (req, res) => {
  if (!_factorDB) return res.status(404).json({ error: 'Factor DB unavailable' });
  try {
    const rows = _factorDB._db.prepare(`
      SELECT id, archetype, compile_ok, test_pass, test_score,
        patch_summary, source_before, error_sig, created_at
      FROM code_actions
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(req.params.id);
    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ session_id: req.params.id, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sweep control — kick off a curriculum sweep from the Studio UI.
// Spawns the CLI script detached, writes progress to a temp log we can read.
let _activeSweep = null; // { runId, child, logPath, startedAt }

app.post('/api/supervisor/start-sweep', (req, res) => {
  if (_activeSweep) {
    return res.status(409).json({ error: 'A sweep is already running', runId: _activeSweep.runId });
  }
  const workers = Math.max(1, Math.min(parseInt(req.body?.workers || '3', 10), 5));
  const tasks = typeof req.body?.tasks === 'string' ? req.body.tasks : null;
  const timeout = Math.max(30, Math.min(parseInt(req.body?.timeout || '150', 10), 600));

  const runId = `sweep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const logPath = join(__dirname, '..', '.clear-sweep-logs');
  try { mkdirSync(logPath, { recursive: true }); } catch {}
  const logFile = join(logPath, runId + '.log');

  const args = [
    join(__dirname, 'supervisor', 'curriculum-sweep.js'),
    `--workers=${workers}`,
    `--timeout=${timeout}`,
  ];
  if (tasks) args.push(`--tasks=${tasks}`);

  const fd = openSync(logFile, 'w');
  const child = spawn('node', args, {
    stdio: ['ignore', fd, fd],
    detached: false,
    env: { ...process.env },
  });
  closeSync(fd);

  _activeSweep = {
    runId,
    child,
    logPath: logFile,
    startedAt: Date.now(),
    workers,
    tasks,
    timeout,
  };

  child.on('exit', (code) => {
    if (_activeSweep && _activeSweep.runId === runId) {
      _activeSweep.exitCode = code;
      _activeSweep.endedAt = Date.now();
    }
  });

  res.json({ runId, workers, tasks: tasks || 'all', startedAt: _activeSweep.startedAt });
});

// Sweep progress — poll the log file + exit state.
app.get('/api/supervisor/sweep-progress', (req, res) => {
  if (!_activeSweep) return res.json({ active: false });
  let log = '';
  try { log = readFileSync(_activeSweep.logPath, 'utf8'); } catch {}

  // Parse task completions from log lines like: "  [✅] L1 hello-world — 30.7s"
  const taskLines = (log.match(/\[(✅|❌|🔶|⏱️)\][^\n]+/g) || []).map(line => {
    const m = line.match(/\[(\S+)\]\s+(L\d+)\s+(\S+)\s+—\s+([\d.]+)s/);
    return m ? { status: m[1], level: m[2], task: m[3], duration: parseFloat(m[4]) } : { raw: line };
  });

  const finished = _activeSweep.exitCode !== undefined;
  res.json({
    active: true,
    finished,
    runId: _activeSweep.runId,
    workers: _activeSweep.workers,
    startedAt: _activeSweep.startedAt,
    endedAt: _activeSweep.endedAt || null,
    exitCode: _activeSweep.exitCode,
    elapsedMs: (_activeSweep.endedAt || Date.now()) - _activeSweep.startedAt,
    tasksCompleted: taskLines.length,
    tasks: taskLines,
    logTail: log.split('\n').slice(-40).join('\n'),
  });
});

// Clear the active sweep record so a new one can start.
// (If the child exited, we can clear. If still running, this 409s.)
app.post('/api/supervisor/clear-sweep', (req, res) => {
  if (!_activeSweep) return res.json({ cleared: false });
  if (_activeSweep.exitCode === undefined) {
    return res.status(409).json({ error: 'Sweep still running. Wait or kill first.' });
  }
  _activeSweep = null;
  res.json({ cleared: true });
});

// Dev-only: session quality records for re-ranker debugging.
// Hidden from Studio UI. Not shown to Meph. Training signal only.
app.get('/api/session-quality', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .slice(-limit);
    const records = files.map(f => {
      try { return JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
    res.json(records);
  } catch (err) {
    res.json([]);
  }
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
// Returns an ARRAY of system blocks so we can place a cache_control breakpoint
// on the stable portion without tripping on volatile content.
//
// Block layout:
//   [0] stable  — personality + base system prompt (cache_control: ephemeral)
//   [1] volatile (optional) — latest test snapshot (NO cache_control)
//
// The cache_control on block [0] caches tools + block [0] together (tools
// render before system). Block [1] is outside the cache, so test-run clicks
// don't invalidate the 3k-line system prompt cache.
//
// Silent-invalidator audit: personality is treated as stable per-session
// (it's a user preference, not per-request data). If it actually changes
// per request, each unique personality becomes its own cache entry —
// acceptable overhead.
function buildSystemWithContext(baseSystem, personality, testSnapshot) {
  const head = personality
    ? '## CRITICAL — User Custom Instructions (follow these in ALL responses)\n\n' + personality + '\n\n---\n\n'
    : '';
  const stableText = head + baseSystem;

  const blocks = [
    { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
  ];

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
    blocks.push({ type: 'text', text: '\n\n---\n\n' + parts.join('') });
  }

  return blocks;
}

app.post('/api/chat', async (req, res) => {
  const { messages, apiKey, personality, editorContent, errors: editorErrors, testResults: testSnapshot, webTools: enableWebTools, taskSteps } = req.body;
  // taskSteps (optional): [{ id, name, sourceMatches: ["regex1", ...] }, ...]
  // A step "passes" if ALL its sourceMatches regexes appear in the current source.
  // currentStep = the highest-index step whose regexes all match. This lets us
  // label every compile row with "which milestone of the task Meph has hit so far."
  // Hidden from Meph by design — we measure natural trajectory, not guided behavior.
  const sessionSteps = Array.isArray(taskSteps) && taskSteps.length > 0 ? taskSteps : null;
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

  // Session quality tracking — internal training signal, never sent to client or Meph
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionStartedAt = Math.floor(Date.now() / 1000);
  const sessionTestCalls = []; // { ok, error } for each run_tests call

  // Factor DB trajectory tracking — one row per compile, updated by subsequent run_tests
  // Each compile cycle emits a new row. Test results update the most recent row for this session.
  let _lastFactorRowId = null;
  let _sourceBeforeEdit = currentSource; // captured before each patch/write, used as source_before

  // Hint-usage tracking. Accumulates Meph's full text across tool-use iterations
  // so we can parse the HINT_APPLIED tag after end_turn. _hintsInjectedRowId
  // remembers which compile row had hints — that's the row we update so the
  // tracking joins cleanly to retrieval telemetry.
  let _allAssistantText = '';
  let _hintsInjectedRowId = null;
  // Inference fallback: if hints are served but Meph forgets to emit
  // HINT_APPLIED, we can still infer whether the hint likely helped by
  // watching error counts across subsequent compiles in the same turn.
  // If error count drops after hints → probably useful → log applied=1,
  // helpful='inferred'. Never overwrites a real tag; only fires when Meph
  // didn't announce. Kept in a distinct `helpful` bucket ('inferred') so
  // ranker training can choose whether to use this weaker signal.
  let _hintsInjectedErrorCount = null;
  let _hintsInjectedTier = null;
  let _postHintMinErrorCount = null;

  // Parse Meph's HINT_APPLIED tag and write the result to the row that carried
  // the hints. Called from BOTH exit paths (end_turn and iteration-limit) so
  // we track hint usage even when Meph fails to converge — which is when
  // tracking is most valuable. `source` is "end_turn" or "iter_limit" for logs.
  const _captureHintUsage = (source) => {
    try {
      if (_factorDB && _hintsInjectedRowId) {
        // If Meph emitted multiple tags (one per compile-with-hints), take
        // the LAST one — it reflects his final assessment after all iterations.
        const all = [..._allAssistantText.matchAll(/HINT_APPLIED:\s*([^\n]+)/gi)];
        const m = all.length > 0 ? all[all.length - 1] : null;
        if (m) {
          const body = m[1].trim();
          const appliedWord = body.match(/^(yes|no)/i);
          const tierM = body.match(/tier=([a-z_]+)/i);
          const helpfulM = body.match(/helpful=([a-z]+)/i);
          const reasonM = body.match(/reason=([^,\n]+)/i);
          const applied = appliedWord ? /^yes/i.test(appliedWord[1]) : null;
          _factorDB.logHintUsage(_hintsInjectedRowId, {
            applied,
            tier: tierM ? tierM[1] : null,
            helpful: helpfulM ? helpfulM[1].toLowerCase() : null,
            reason: reasonM ? reasonM[1].trim().slice(0, 200) : null,
          });
          console.log(`[hint-usage] row=${_hintsInjectedRowId} via=${source} applied=${applied} tier=${tierM ? tierM[1] : '-'} helpful=${helpfulM ? helpfulM[1] : '-'}`);
        } else {
          // No tag from Meph. Try the inference fallback: if a later compile
          // in this same turn had fewer errors than when hints were served,
          // the hint likely helped. Log as applied=1, helpful='inferred' so
          // ranker training can opt in or out of this weaker signal.
          // CRUCIAL: never overwrite with helpful='yes' — 'inferred' is a
          // distinct value so the honest-label set (yes/no/partial) stays clean.
          const canInfer =
            _hintsInjectedErrorCount !== null &&
            _postHintMinErrorCount !== null &&
            _postHintMinErrorCount < _hintsInjectedErrorCount;
          if (canInfer) {
            _factorDB.logHintUsage(_hintsInjectedRowId, {
              applied: 1,
              tier: _hintsInjectedTier,
              helpful: 'inferred',
              reason: `no tag; errors ${_hintsInjectedErrorCount}→${_postHintMinErrorCount} after hint`,
            });
            console.log(`[hint-usage] row=${_hintsInjectedRowId} via=${source}+inference applied=1 tier=${_hintsInjectedTier || '-'} helpful=inferred (errors ${_hintsInjectedErrorCount}→${_postHintMinErrorCount})`);
          } else {
            console.log(`[hint-usage] row=${_hintsInjectedRowId} via=${source} NO_TAG (hints injected, Meph didn't announce${_hintsInjectedErrorCount !== null ? `, errors stayed at ${_postHintMinErrorCount ?? _hintsInjectedErrorCount}` : ''})`);
          }
        }
      } else if (_factorDB && !_hintsInjectedRowId && /HINT_APPLIED:/i.test(_allAssistantText)) {
        console.warn(`[hint-usage] via=${source} HALLUCINATED (Meph emitted HINT_APPLIED with no hints in context)`);
      }
    } catch (err) {
      console.warn(`[hint-usage] parse failed: ${err.message}`);
    }
  };

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
          _sourceBeforeEdit = currentSource;
          currentSource = input.code;
          _workerLastSource = currentSource;
          // Auto-compile when code is written
          try {
            const r = compileProgram(input.code);
            currentErrors = r.errors;
            _workerLastErrors = currentErrors;
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
          _workerLastErrors = currentErrors;
          lastCompileResult = r;

          // ── Factor DB: log this compile attempt ─────────────────────────
          // One row per compile. test_pass gets updated by a subsequent run_tests.
          if (_factorDB && currentSource) {
            try {
              const compileOk = r.errors.length === 0 ? 1 : 0;
              const errorSig = r.errors.length > 0
                ? _sha1(r.errors.map(e => e.message).join('\n') + '\x00' + _sha1(currentSource))
                : null;
              // source_before captures what Meph compiled. If he called
              // edit_code+compile in sequence, _sourceBeforeEdit has the pre-edit
              // state. Fall back to currentSource so we always have SOMETHING —
              // otherwise we lose the whole point of the trajectory row.
              const sourceForLog = _sourceBeforeEdit && _sourceBeforeEdit.length > 0
                ? _sourceBeforeEdit
                : currentSource;
              const step = _currentStep(currentSource, sessionSteps);
              _lastFactorRowId = _factorDB.logAction({
                session_id: sessionId,
                archetype: _safeArchetype(currentSource),
                task_type: 'compile_cycle',
                error_sig: errorSig,
                file_state_hash: _sha1(currentSource),
                source_before: sourceForLog.slice(0, 5000),
                patch_ops: [],
                patch_summary: r.errors.length === 0
                  ? `Clean compile (${currentSource.split('\n').length} lines)`
                  : `Compile with ${r.errors.length} error(s): ${r.errors[0]?.message?.slice(0, 120) || 'unknown'}`,
                compile_ok: compileOk,
                test_pass: 0,
                test_score: 0.0,
                score_delta: 0.0,
                step_id: step?.id || null,
                step_index: step?.index ?? null,
                step_name: step?.name || null,
              });
              // Inference fallback: if hints were already served on an earlier
              // compile in this turn, track the minimum error count seen since.
              // If Meph later forgets to emit HINT_APPLIED, a drop in errors is
              // a reasonable signal that the hint helped.
              if (_hintsInjectedRowId && _lastFactorRowId !== _hintsInjectedRowId) {
                if (_postHintMinErrorCount === null || r.errors.length < _postHintMinErrorCount) {
                  _postHintMinErrorCount = r.errors.length;
                }
              }
            } catch { /* non-fatal */ }
          }
          // ────────────────────────────────────────────────────────────────

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

          // ── Factor DB suggestion injection (flywheel closes here) ──
          // When compile fails, retrieve up-to-3 hints using layered retrieval:
          //   Tier 1: exact same error_sig previously fixed in this archetype
          //   Tier 2: exact same error_sig previously fixed anywhere
          //   Tier 3: same-archetype passing gold rows (archetype-only fallback)
          // Tier is attached to each hint so Meph sees which signal produced it.
          if (_factorDB && r.errors.length > 0 && currentSource) {
            try {
              const archetype = _safeArchetype(currentSource);
              const errorSig = _sha1(r.errors.map(e => e.message).join('\n') + '\x00' + _sha1(currentSource));
              // Retrieve wider pool (topK=10) when any reranker is loaded so
              // the reranker has room to reorder. Without rerankers, keep the
              // historical topK=3 behavior so no regression from retrieval alone.
              const retrievalK = (_pairwiseBundle || _ebmBundle) ? 10 : 3;
              let hintRows = _factorDB.querySuggestions({
                archetype,
                error_sig: errorSig,
                topK: retrievalK,
              });

              // Rerank order of preference (highest → fallback):
              //   1. Pairwise logistic — scores each candidate AGAINST the current
              //      error, so a high-test_score fix for a different problem gets
              //      demoted. This is the one that answers the retrieval question
              //      directly.
              //   2. Pointwise EBM — regression on row quality; some lift over BM25.
              //   3. BM25 raw — ordering from querySuggestions.
              let rerankedBy = 'bm25';
              if (_pairwiseBundle && hintRows.length > 0) {
                try {
                  // Build error context from the CURRENT failing compile.
                  // target_error_category on each candidate = category of the row
                  // immediately BEFORE it in its session (the error that candidate fixed).
                  const errorCategory = _classifyErrorCategory(
                    'Compile with ' + r.errors.length + ' error(s): ' +
                    (r.errors[0]?.message || '')
                  );
                  const currentStepHere = _currentStep(currentSource, sessionSteps);
                  for (const c of hintRows) {
                    try {
                      const prev = _factorDB._db.prepare(
                        'SELECT patch_summary FROM code_actions WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1'
                      ).get(c.session_id, c.created_at);
                      c.target_error_category = _classifyErrorCategory(prev?.patch_summary || '');
                    } catch { c.target_error_category = 'none'; }
                  }
                  const ctx = {
                    archetype,
                    error_sig: errorSig,
                    error_category: errorCategory,
                    step_index: currentStepHere?.index ?? 0,
                    source_before: currentSource,
                  };
                  const ranked = _rankPairwise(_pairwiseBundle, ctx, hintRows);
                  hintRows = ranked.slice(0, 3);
                  rerankedBy = 'pairwise';
                } catch (err) {
                  // Fall through to EBM on any failure — better to ship a hint
                  // ranked by the older model than to ship nothing.
                }
              }
              if (rerankedBy === 'bm25' && _ebmBundle && hintRows.length > 0) {
                try {
                  const ranked = _rankEBM(_ebmBundle, hintRows, _featurizeRow);
                  hintRows = ranked.slice(0, 3);
                  rerankedBy = 'ebm';
                } catch (err) {
                  hintRows = hintRows.slice(0, 3);
                }
              } else if (rerankedBy === 'bm25') {
                hintRows = hintRows.slice(0, 3);
              }
              // Observability: always log retrieval outcome so we can distinguish
              // "no candidates found" from "Meph ignored the hints he saw".
              console.log(`[hints] archetype=${archetype} retrieved=${hintRows.length} reranked_by=${rerankedBy}${hintRows.length > 0 ? ' top_tier=' + hintRows[0].tier : ''}`);
              if (hintRows.length > 0) {
                // Build note based on the best-tier match we got
                const tiers = hintRows.map(h => h.tier);
                const hasExact = tiers.some(t => t.startsWith('exact_error'));
                const note = hasExact
                  ? `Found ${hintRows.length} past session(s) that hit this exact error and fixed it. Study the reference snippets and adapt the fix.`
                  : `No past session hit this exact error yet. Here are ${hintRows.length} working ${archetype} apps for shape-level reference.`;

                // Prose-formatted hint block. This is what Meph actually reads —
                // the JSON `references` array below is kept for UI/programmatic
                // use, but the `text` field is the human-readable form that
                // survives tool-result serialization to a language model.
                // Session 38 finding: Meph ignored hints buried in JSON. Prose
                // works better because Meph's attention is text-first.
                const _tierLabel = (t) => {
                  if (!t) return 'retrieved match';
                  if (t.startsWith('exact_error_same_archetype')) return 'SAME ERROR in same archetype';
                  if (t.startsWith('exact_error')) return 'SAME ERROR anywhere';
                  if (t.startsWith('same_archetype')) return 'same archetype, different error';
                  return t.replace(/_/g, ' ');
                };
                const hintBlocks = hintRows.map((h, i) => {
                  // Prefer pairwise score (probability fix resolves current error)
                  // when available — that's the signal Meph actually wants.
                  const scoreLabel = typeof h.pairwise_score === 'number'
                    ? `pairwise=${h.pairwise_score.toFixed(3)}`
                    : typeof h.ebm_score === 'number'
                      ? `EBM=${h.ebm_score.toFixed(3)}`
                      : 'score=n/a';
                  const header = `── Past Fix #${i + 1} [${_tierLabel(h.tier)}, ${scoreLabel}, test_score=${h.test_score || 0}] ──`;
                  const summary = h.patch_summary ? `What happened: ${h.patch_summary}` : '';
                  // Trim source to ~600 chars, stopping on a natural line boundary
                  const raw = (h.source_before || '').slice(0, 600);
                  const trimmed = raw.lastIndexOf('\n') > 400 ? raw.slice(0, raw.lastIndexOf('\n')) : raw;
                  const code = trimmed ? `Source that worked:\n\`\`\`clear\n${trimmed}\n\`\`\`` : '';
                  return [header, summary, code].filter(Boolean).join('\n');
                }).join('\n\n');
                const guidance = `\nHow to use: pattern-match the FIX, don't copy-paste. These are from different tasks — look at what structure works (validate blocks, guard clauses, auth placement, endpoint shape) and adapt to your current error.`;

                const text = `${note}\n\n${hintBlocks}\n${guidance}`;

                result.hints = {
                  note,
                  reranked_by: rerankedBy,
                  text,  // ← Meph reads THIS
                  references: hintRows.map(h => ({
                    tier: h.tier,
                    summary: (h.patch_summary || '').slice(0, 100),
                    score: h.test_score,
                    ebm_score: typeof h.ebm_score === 'number' ? Number(h.ebm_score.toFixed(4)) : undefined,
                    pairwise_score: typeof h.pairwise_score === 'number' ? Number(h.pairwise_score.toFixed(4)) : undefined,
                    source_excerpt: (h.source_before || '').slice(0, 800),
                  })),
                };
                // Remember which row carried the hints so the end-of-response
                // HINT_APPLIED parse can update the right row.
                _hintsInjectedRowId = _lastFactorRowId;
                // Snapshot error count + best-hint-tier at hint-serve time —
                // used for the inference fallback if Meph forgets the tag.
                _hintsInjectedErrorCount = r.errors.length;
                _hintsInjectedTier = hintRows[0]?.tier || null;
                _postHintMinErrorCount = null; // reset window
              }
            } catch { /* non-fatal */ }
          }
          // ────────────────────────────────────────────────────────────

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
        _sourceBeforeEdit = currentSource;
        const result = patch(currentSource, ops);
        if (result.applied > 0) {
          currentSource = result.source;
          _workerLastSource = currentSource;
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
        // Forward per-spec progress to the Tests pane. Terminal logging now
        // lives inside runEvalSuite itself — every caller (Meph, UI, direct
        // POST) gets the same terminal trace without duplicating it here.
        send({ type: 'switch_tab', tab: 'tests' });
        const onProgress = (ev) => { send({ type: 'eval_row', ...ev }); };
        const evalResult = await runEvalSuite(currentSource, undefined, onProgress);
        send({ type: 'eval_results', ...evalResult });
        return JSON.stringify(evalResult);
      }

      case 'run_eval': {
        if (!input.id) return JSON.stringify({ ok: false, error: "Missing 'id' — use list_evals to see available ids." });
        send({ type: 'switch_tab', tab: 'tests' });
        const onProgress = (ev) => { send({ type: 'eval_row', ...ev }); };
        const evalResult = await runEvalSuite(currentSource, input.id, onProgress);
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

  // Multi-turn tool-use loop with streaming.
  // Meph runs on Haiku 4.5 by default — ~3x cheaper than Sonnet on this workload.
  // Override with MEPH_MODEL=claude-sonnet-4-6 to A/B against baseline.
  const MEPH_MODEL = process.env.MEPH_MODEL || 'claude-haiku-4-5-20251001';
  // 200k is Haiku 4.5's hard cap and Sonnet 4.6's default (1M needs a beta header
  // we don't send). Either way, the effective cap here is 200k.
  const MEPH_CTX_MAX = 200000;
  let currentMessages = messages.slice(-50);
  let toolResults = [];

  // Estimate context usage (rough: ~4 chars per token)
  function estimateContextUsage() {
    const systemChars = (systemPrompt.length + (personality || '').length);
    const toolChars = JSON.stringify(enableWebTools ? [...TOOLS, ...WEB_TOOLS] : TOOLS).length;
    const msgChars = currentMessages.reduce((sum, m) => sum + JSON.stringify(m.content || '').length, 0);
    const totalTokens = Math.round((systemChars + toolChars + msgChars) / 4);
    return { used: totalTokens, max: MEPH_CTX_MAX, percent: Math.round((totalTokens / MEPH_CTX_MAX) * 100) };
  }

  try {
    // Max tool-use iterations per turn. 15 was too low for 5-endpoint CRUD tasks
    // on Haiku — the full Haiku sweep had a dead zone at L3-L6 where Meph ran
    // out of iterations before finishing register/login/full-CRUD flows. 25
    // gives him enough room without risking runaway sessions.
    const MEPH_MAX_ITER = Number(process.env.MEPH_MAX_ITER) || 25;
    for (let iter = 0; iter < MEPH_MAX_ITER; iter++) {
      // Prompt-caching strategy (added Session 38):
      //   1. System array has cache_control on the stable block → caches tools
      //      + stable system together (tools render before system; a breakpoint
      //      on the last system block covers both).
      //   2. Second breakpoint on the last content block of the last message →
      //      caches the entire conversation history so only the NEW turn pays
      //      full input price next iteration. Critical for multi-turn Meph
      //      sessions where messages grow 15-25 turns.
      // Max 4 breakpoints per request per the API; we use 2.
      //
      // Cache miss = 1.25× input (write premium). Hit = 0.1× input. Break-even
      // at 2 requests with same prefix. Meph's sessions do 15+ turns → massive
      // savings (~90% on system + tools + prior turns).
      const cachedMessages = currentMessages.map((m, i) => {
        if (i !== currentMessages.length - 1) return m;
        // Last message: attach cache_control to its last content block.
        // Content can be a string or an array of blocks — normalize to array
        // so we can reliably attach cache_control.
        if (typeof m.content === 'string') {
          return {
            ...m,
            content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
          };
        }
        if (Array.isArray(m.content) && m.content.length > 0) {
          const last = m.content[m.content.length - 1];
          return {
            ...m,
            content: [
              ...m.content.slice(0, -1),
              { ...last, cache_control: { type: 'ephemeral' } },
            ],
          };
        }
        return m;
      });

      const payload = {
        model: MEPH_MODEL,
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 8000 },
        system: buildSystemWithContext(systemPrompt, personality, testSnapshot),
        tools: enableWebTools ? [...TOOLS, ...WEB_TOOLS] : TOOLS,
        stream: true,
        messages: cachedMessages,
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
              _allAssistantText += ev.delta.text;
              send({ type: 'text', delta: ev.delta.text });
            } else if (ev.delta.type === 'input_json_delta') {
              const tb = toolUseBlocks[toolUseBlocks.length - 1];
              if (tb) tb.inputJson += ev.delta.partial_json;
            }
          } else if (ev.type === 'message_delta') {
            stopReason = ev.delta.stop_reason;
            // Cache-hit telemetry — logs prompt-caching efficiency per turn.
            // If cache_read stays at 0 across iterations, we have a silent
            // cache invalidator (timestamps/UUIDs in system, tool reorder, etc.).
            if (ev.usage) {
              const cr = ev.usage.cache_read_input_tokens || 0;
              const cw = ev.usage.cache_creation_input_tokens || 0;
              const it = ev.usage.input_tokens || 0;
              const total = cr + cw + it;
              if (total > 0) {
                const hitPct = Math.round((cr / total) * 100);
                console.log(`[cache] iter ${iter}: read=${cr} write=${cw} fresh=${it} (${hitPct}% hit)`);
              }
            }
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
        _captureHintUsage('end_turn');
        writeSessionQuality();
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

        // Track run_tests outcomes for session quality signals + Factor DB
        if (tb.name === 'run_tests') {
          try {
            const tr = typeof result === 'string' ? JSON.parse(result) : result;
            sessionTestCalls.push({ ok: tr.ok === true, error: tr.error || null });

            // ── Factor DB: update latest compile row with test outcome ──
            if (_factorDB && _lastFactorRowId) {
              const passed = Number(tr.passed || 0);
              const failed = Number(tr.failed || 0);
              const total = passed + failed;
              const testScore = total > 0 ? passed / total : (tr.ok === true ? 1.0 : 0.0);
              const testPass = (tr.ok === true && failed === 0 && total > 0) ? 1 : 0;
              try {
                _factorDB._db.prepare(`
                  UPDATE code_actions SET test_pass = ?, test_score = ? WHERE id = ?
                `).run(testPass, testScore, _lastFactorRowId);
              } catch { /* non-fatal */ }
            }
            // ──────────────────────────────────────────────────────────────
          } catch { sessionTestCalls.push({ ok: false, error: 'parse error' }); }
        }

        // Track http_request 2xx outcomes as weak test signal for Factor DB.
        // Curriculum sweeps tell Meph to verify via http_request (no Clear test
        // blocks exist in skeletons), so without this we never set test_pass=1
        // on curriculum runs. Weaker signal than run_tests (no assertion count),
        // but directionally correct: 2xx responses indicate the endpoint works.
        if (tb.name === 'http_request' && _factorDB && _lastFactorRowId) {
          try {
            const hr = typeof result === 'string' ? JSON.parse(result) : result;
            const status = Number(hr?.status || 0);
            if (status >= 200 && status < 300) {
              _factorDB._db.prepare(`
                UPDATE code_actions
                SET test_pass = 1,
                    test_score = CASE WHEN test_score > 0.9 THEN test_score ELSE 0.9 END
                WHERE id = ? AND compile_ok = 1
              `).run(_lastFactorRowId);
            }
          } catch { /* non-fatal */ }
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
              // `res` is ALREADY the parsed object (see line 2883). Calling
              // JSON.parse on it coerces it to "[object Object]" first, then
              // JSON.parse throws — which crashes the whole Meph turn mid-loop
              // with the opaque error "\"[object Object]\" is not valid JSON".
              // Use the parsed fields directly.
              return `[tool] ✓ patch — ${res.applied || 0} applied, ${res.skipped || 0} skipped`;
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
    _captureHintUsage('iter_limit');
    writeSessionQuality();
    send({ type: 'done', toolResults, source: currentSource });
    res.end();
  } catch (err) {
    _captureHintUsage('error_path');
    send({ type: 'error', message: err.message });
    res.end();
  }

  function writeSessionQuality() {
    try {
      const qualityWarnings = (lastCompileResult?.warnings || []).filter(w => w.code === 'weak_assertion');
      const record = {
        id: sessionId,
        task: (messages[0]?.content || '').slice(0, 500),
        started_at: sessionStartedAt,
        ended_at: Math.floor(Date.now() / 1000),
        weak_assertion_count: qualityWarnings.length,
        red_step_observed: sessionTestCalls.some(t => !t.ok || t.error),
        final_source: currentSource.slice(0, 10000),
      };
      writeFileSync(join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(record, null, 2));
    } catch { /* non-fatal — don't crash the session */ }
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
// SUPERVISOR WORKER ENDPOINTS
// =============================================================================
// These are thin read-only endpoints for the supervisor to poll.
// module-level shadow vars (_workerLastSource/_workerLastErrors) are mirrored
// from the per-request locals inside /api/chat — safe to read here.

app.get('/api/current-source', (req, res) => {
  res.json({ source: _workerLastSource, errors: _workerLastErrors });
});

app.get('/api/worker-heartbeat', (req, res) => {
  res.json({
    sessionId: process.env.SESSION_ID || 'default',
    appRunning: !!runningChild,
    appPort: runningPort,
    lastMephAction: terminalBuffer.filter(l => l.includes('[meph]')).slice(-1)[0] || null,
    ts: Date.now()
  });
});

// =============================================================================
// START
// =============================================================================
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`\n  Clear Playground: http://localhost:${PORT}\n`);
});
