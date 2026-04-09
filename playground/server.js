import express from 'express';
import { compileProgram } from '../index.js';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
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
app.get('/', (req, res) => res.sendFile(join(__dirname, 'ide.html')));
app.use(express.static(__dirname));

// =============================================================================
// COMPILE
// =============================================================================
app.post('/api/compile', (req, res) => {
  try {
    const { source } = req.body;
    if (!source && source !== '') return res.status(400).json({ error: 'Missing source' });
    if (!source.trim()) return res.json({ errors: [], warnings: [], html: null, javascript: null, serverJS: null, python: null, browserServer: null, css: null });
    const result = compileProgram(source);
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
  'team-dashboard',    // Project management dashboard (app_layout, sidebar)
  'ecommerce-api',     // Pure REST backend API (no frontend)
  'crm-pro',           // CRM with contacts + deals (relational data)
  'live-chat',         // Real-time messaging (websockets)
  'todo-fullstack',    // Simple full-stack with auth
  'product-landing',   // Multi-page marketing site (pure frontend)
  'helpdesk-agent',    // Multi-agent AI pipeline (agents, skills, pipelines)
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
  writeFileSync(join(BUILD_DIR, 'package.json'), JSON.stringify({ dependencies: { ws: '*' } })); // CJS mode, include ws for chat apps
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
  const env = { ...process.env, PORT: String(runningPort) };
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
    description: 'Read or replace the Clear source code in the editor. Use action="read" to see current code. Use action="write" with the code parameter to replace the editor content.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write'], description: 'read to get current code, write to replace it' },
        code: { type: 'string', description: 'The new Clear source code (only for action=write)' },
      },
      required: ['action'],
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
    name: 'write_file',
    description: 'Write text content to a file in the project root. Use this to save Clear source code to a .clear file so you can run CLI commands (check, lint, info, test) on it. Filename must end in .clear and contain only safe characters.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename relative to project root, e.g. "temp-app.clear". Must end in .clear.' },
        content: { type: 'string', description: 'The text content to write.' },
      },
      required: ['filename', 'content'],
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
];

// Anthropic server tools — executed by Anthropic's API, no client-side handling needed
const WEB_TOOLS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 10 },
];

app.get('/api/config', (req, res) => {
  res.json({ hasServerKey: !!process.env.ANTHROPIC_API_KEY });
});

app.post('/api/chat', async (req, res) => {
  const { messages, apiKey, editorContent, errors: editorErrors, webTools: enableWebTools } = req.body;
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
        return JSON.stringify({ error: 'Invalid action' });

      case 'compile':
        try {
          const r = compileProgram(currentSource);
          currentErrors = r.errors;
          lastCompileResult = r;
          return JSON.stringify({
            errors: r.errors,
            warnings: r.warnings,
            hasHTML: !!r.html,
            hasServerJS: !!r.serverJS,
            hasJavascript: !!r.javascript,
            hasPython: !!r.python,
          });
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
        writeFileSync(join(BUILD_DIR, 'package.json'), JSON.stringify({ dependencies: { ws: '*' } }));
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

      case 'write_file': {
        // Restrict to .clear files in project root only — no path traversal
        const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
        if (!safeName.endsWith('.clear')) return JSON.stringify({ error: 'Only .clear files allowed' });
        const dest = join(ROOT_DIR, safeName);
        writeFileSync(dest, input.content, 'utf8');
        return JSON.stringify({ written: true, path: safeName, bytes: input.content.length });
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
  let currentMessages = messages.slice(-20);
  let toolResults = [];

  try {
    for (let iter = 0; iter < 15; iter++) {
      const payload = {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: enableWebTools ? [...TOOLS, ...WEB_TOOLS] : TOOLS,
        stream: true,
        messages: currentMessages,
      };

      const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        const errText = await r.text();
        send({ type: 'error', message: errText });
        res.end();
        return;
      }

      // Parse SSE stream from Anthropic
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accText = '';
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
            if (ev.content_block.type === 'tool_use') {
              toolUseBlocks.push({ id: ev.content_block.id, name: ev.content_block.name, inputJson: '' });
              send({ type: 'tool_start', name: ev.content_block.name });
            } else if (ev.content_block.type === 'server_tool_use') {
              // Anthropic-executed tool (web_search, web_fetch) — show UI feedback only
              send({ type: 'tool_start', name: ev.content_block.name });
            } else if (ev.content_block.type === 'web_search_tool_result' || ev.content_block.type === 'web_fetch_tool_result') {
              send({ type: 'tool_done', name: 'web' });
            }
          } else if (ev.type === 'content_block_delta') {
            if (ev.delta.type === 'text_delta') {
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
      const assistantContent = [];
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

        // Auto-switch IDE tab based on what Claude is doing — before execution
        if (tb.name === 'edit_code' && input.action === 'write') {
          send({ type: 'switch_tab', tab: 'compiled' });
        }
        if (tb.name === 'run_command') {
          send({ type: 'switch_tab', tab: 'terminal' });
          send({ type: 'terminal_append', text: `[Claude] $ ${input.command}` });
        }
        if (tb.name === 'run_app') {
          send({ type: 'switch_tab', tab: 'terminal' });
        }
        if (tb.name === 'http_request') {
          send({ type: 'terminal_append', text: `[Claude] ${input.method} ${input.path}` });
        }
        if (tb.name === 'screenshot_output') {
          send({ type: 'switch_tab', tab: 'output' });
        }
        if (tb.name === 'read_terminal') {
          send({ type: 'switch_tab', tab: 'terminal' });
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
