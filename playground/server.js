import express from 'express';
import { compileProgram } from '../index.js';
import { patch } from '../patch.js';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

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

// Terminal ring buffer — last 500 lines from running app stdout/stderr
const terminalBuffer = [];
function termLog(line) {
  terminalBuffer.push(line);
  if (terminalBuffer.length > 500) terminalBuffer.shift();
}

// Frontend error log — captured via injected script in compiled app
const frontendErrors = [];
app.post('/api/frontend-log', (req, res) => {
  const { type, message, source, lineno } = req.body || {};
  frontendErrors.push({ type: type || 'error', message, source, lineno, ts: Date.now() });
  if (frontendErrors.length > 100) frontendErrors.shift();
  res.json({ ok: true });
});

app.get('/api/terminal-log', (req, res) => {
  res.json({ lines: terminalBuffer.slice(-100), frontendErrors: frontendErrors.slice(-20) });
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
    // Test output format: "  PASS: test name" or "  FAIL: test name -- error"
    const passMatch = trimmed.match(/^PASS:\s*(.+)/);
    const failMatch = trimmed.match(/^FAIL:\s*(.+?)(?:\s*--\s*(.+))?$/);
    if (passMatch) {
      results.push({ name: passMatch[1], status: 'pass' });
    } else if (failMatch) {
      results.push({ name: failMatch[1], status: 'fail', error: failMatch[2] || '' });
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  return { passed, failed, results };
}

function runTestProcess(source) {
  const start = Date.now();
  if (!source || !source.trim()) {
    return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  }
  const tmpPath = join(BUILD_DIR, '_test-source-' + Date.now() + '.clear');
  mkdirSync(BUILD_DIR, { recursive: true });
  writeFileSync(tmpPath, source);
  try {
    const stdout = execSync(`node cli/clear.js test "${tmpPath}"`, { cwd: ROOT_DIR, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
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

// Store API key server-side so child processes (compiled apps with agents) can use it
let storedApiKey = process.env.ANTHROPIC_API_KEY || '';
let mephTodos = [];
app.post('/api/set-key', (req, res) => {
  storedApiKey = req.body.key || '';
  res.json({ ok: true });
});

app.post('/api/run', (req, res) => {
  const { serverJS, html, css } = req.body;
  if (!serverJS) return res.status(400).json({ error: 'No server code to run' });

  // Kill previous
  if (runningChild) {
    try { runningChild.kill('SIGTERM'); } catch {}
    runningChild = null;
  }

  // Write build files
  const rtDir = join(BUILD_DIR, 'clear-runtime');
  mkdirSync(rtDir, { recursive: true });
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

  // Start child
  const env = { ...process.env, PORT: String(runningPort), ...(storedApiKey ? { ANTHROPIC_API_KEY: storedApiKey } : {}) };
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
      res.json({ port: runningPort, logs });
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

app.post('/api/stop', (req, res) => {
  if (runningChild) {
    try { runningChild.kill('SIGTERM'); } catch {}
    runningChild = null;
  }
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

// FETCH — proxy requests to running app
// =============================================================================
app.post('/api/fetch', async (req, res) => {
  const { method, path, body, headers } = req.body;
  if (!runningChild) return res.status(400).json({ error: 'No app running. Click Run first.' });

  try {
    const url = `http://localhost:${runningPort}${path || '/'}`;
    const opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    res.json({ status: r.status, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    description: 'Read the terminal output from the running app (stdout + stderr) and any frontend console errors captured from the browser. Use this after making changes to check for crashes, server errors, or frontend JS errors.',
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

app.post('/api/chat', async (req, res) => {
  const { messages, apiKey, personality, editorContent, errors: editorErrors, webTools: enableWebTools } = req.body;
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
  function executeTool(name, input) {
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
        system: personality
          ? '## CRITICAL — User Custom Instructions (follow these in ALL responses)\n\n' + personality + '\n\n---\n\n' + systemPrompt
          : systemPrompt,
        tools: enableWebTools ? [...TOOLS, ...WEB_TOOLS] : TOOLS,
        stream: true,
        messages: currentMessages,
      };

      // Retry with exponential backoff on transient failures
      let r;
      const MAX_RETRIES = 5;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          r = await fetch(endpoint, {
            method: 'POST', headers, body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000), // 60s timeout — Anthropic can be slow on first token
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
          // Request screenshot from client via SSE, then wait for callback
          send({ type: 'screenshot_request' });
          const imageBase64 = await new Promise((resolve, reject) => {
            pendingScreenshotResolve = resolve;
            setTimeout(() => {
              pendingScreenshotResolve = null;
              reject(new Error('Screenshot timed out — no response from client'));
            }, 12000);
          }).catch(err => null);
          // Store as array content so Anthropic receives the image
          if (imageBase64) {
            result = [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
              { type: 'text', text: 'Screenshot of the output panel. Inspect visually to verify layout, colours, and content.' },
            ];
          } else {
            result = JSON.stringify({ error: 'Screenshot capture failed or timed out.' });
          }
        } else {
          result = executeTool(tb.name, input);
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

        toolResultBlocks.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
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
process.on('SIGTERM', () => {
  if (runningChild) try { runningChild.kill(); } catch {}
  process.exit(0);
});
process.on('SIGINT', () => {
  if (runningChild) try { runningChild.kill(); } catch {}
  process.exit(0);
});

// =============================================================================
// START
// =============================================================================
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`\n  Clear Playground: http://localhost:${PORT}\n`);
});
