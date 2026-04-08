import express from 'express';
import { compileProgram } from '../index.js';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
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
app.get('/api/templates', (req, res) => {
  try {
    const dirs = readdirSync(APPS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => existsSync(join(APPS_DIR, d.name, 'main.clear')));
    const templates = dirs.map(d => {
      const source = readFileSync(join(APPS_DIR, d.name, 'main.clear'), 'utf8');
      const firstComment = source.match(/^#\s*(.+)/m);
      return {
        name: d.name,
        description: firstComment ? firstComment[1].replace(/^-+\s*/, '').trim() : '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
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
    if (msg.includes('running on port') && !responded) {
      responded = true;
      res.json({ port: runningPort, logs });
    }
  });

  child.stderr.on('data', (data) => {
    // Accumulate stderr but don't fail immediately — warnings are common at startup
    logs.push('[stderr] ' + data.toString());
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
];

app.post('/api/chat', async (req, res) => {
  const { messages, apiKey, editorContent, errors: editorErrors } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Set your Anthropic API key to chat with Claude' });
  if (!messages || messages.length === 0) return res.status(400).json({ error: 'No messages' });

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
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
        if (!lastCompileResult?.serverJS) return JSON.stringify({ error: 'No compiled server code. Compile first.' });
        // Sync run — write files and start
        if (runningChild) { try { runningChild.kill('SIGTERM'); } catch {} runningChild = null; }
        const rtDir = join(BUILD_DIR, 'clear-runtime');
        mkdirSync(rtDir, { recursive: true });
        writeFileSync(join(BUILD_DIR, 'server.js'), lastCompileResult.serverJS);
        writeFileSync(join(BUILD_DIR, 'package.json'), '{}');
        if (lastCompileResult.html) writeFileSync(join(BUILD_DIR, 'index.html'), lastCompileResult.html);
        writeFileSync(join(BUILD_DIR, 'style.css'), lastCompileResult.css || '');
        const runtimeDir = join(ROOT_DIR, 'runtime');
        for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
          if (existsSync(join(runtimeDir, f))) copyFileSync(join(runtimeDir, f), join(rtDir, f));
        }
        runningPort++;
        if (runningPort > 4100) runningPort = 4001;
        const env = { ...process.env, PORT: String(runningPort) };
        runningChild = spawn('node', ['server.js'], { cwd: BUILD_DIR, env, stdio: 'pipe' });
        runningChild.on('exit', () => { runningChild = null; });
        return JSON.stringify({ started: true, port: runningPort });
      }

      case 'stop_app':
        if (runningChild) { try { runningChild.kill('SIGTERM'); } catch {} runningChild = null; }
        return JSON.stringify({ stopped: true });

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

  // Multi-turn tool-use loop
  let currentMessages = messages.slice(-20); // Keep last 20 messages for context
  let toolResults = []; // Applied code changes to send back to frontend

  try {
    for (let iter = 0; iter < 10; iter++) {
      const payload = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      };

      const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }
      const data = await r.json();

      // Process response blocks
      let finalText = '';
      let hasToolUse = false;
      const toolResultBlocks = [];

      for (const block of data.content) {
        if (block.type === 'text') finalText += block.text;
        if (block.type === 'tool_use') {
          hasToolUse = true;
          let result;
          if (block.name === 'http_request') {
            result = await executeHttpRequest(block.input);
          } else {
            result = executeTool(block.name, block.input);
          }
          toolResultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: result });

          // Track code changes for frontend
          if (block.name === 'edit_code' && block.input.action === 'write') {
            toolResults.push({ tool: 'edit_code', code: block.input.code });
          }
        }
      }

      if (!hasToolUse || data.stop_reason === 'end_turn') {
        return res.json({ text: finalText, toolResults, source: currentSource });
      }

      // Feed tool results back for next iteration
      currentMessages.push({ role: 'assistant', content: data.content });
      currentMessages.push({ role: 'user', content: toolResultBlocks });
    }

    // Max iterations reached
    res.json({ text: 'I reached the maximum number of steps. Here is what I have so far.', toolResults, source: currentSource });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
