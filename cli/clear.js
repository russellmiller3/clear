#!/usr/bin/env node
// =============================================================================
// CLEAR CLI — The tool AI agents use to build, test, and ship Clear apps
// =============================================================================
//
// Designed for machines first, humans second. Every command supports --json
// for structured output. Exit codes are meaningful. No interactive prompts.
//
// Commands:
//   build <file>     Compile a .clear file to JS/Python/HTML
//   check <file>     Validate without compiling (parse + validate only)
//   info <file>      Introspect: list endpoints, tables, pages, agents
//   fix <file>       Auto-fix all patchable errors in source
//   test <file>      Run test blocks in a .clear file
//   run <file>       Compile and execute (backend JS only)
//   serve <file>     Compile and start a local Express server
//   lint <file>      Security + quality warnings
//   dev <file>       Watch + rebuild + serve with live reload
//   init [dir]       Scaffold a new Clear project
//   package <file>   Bundle for deployment (Dockerfile + package.json)
//   help             Show this help
//
// Global flags:
//   --json           Machine-readable JSON output (every command)
//   --quiet          Suppress non-essential output
//   --no-test        Skip compiler test gate on build
//   --auto-fix       Auto-patch patchable errors during build
//
// Exit codes:
//   0  Success
//   1  Compile error (parse or validation failure)
//   2  Runtime error
//   3  File not found
//   4  Test failure
//
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, watch as fsWatch, copyFileSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILER_PATH = resolve(__dirname, '..', 'index.js');

// Dynamic import of compiler (ESM)
let _compiler = null;
async function getCompiler() {
  if (!_compiler) _compiler = await import(COMPILER_PATH);
  return _compiler;
}

// =============================================================================
// HELPERS
// =============================================================================

function parseFlags(args) {
  const flags = {
    json: args.includes('--json'),
    quiet: args.includes('--quiet'),
    noTest: args.includes('--no-test'),
    autoFix: args.includes('--auto-fix'),
    stdout: args.includes('--stdout'),
  };
  const outIdx = args.indexOf('--out');
  flags.outDir = outIdx !== -1 ? resolve(args[outIdx + 1]) : null;
  const targetIdx = args.indexOf('--target');
  flags.target = targetIdx !== -1 ? args[targetIdx + 1] : null;
  const portIdx = args.indexOf('--port');
  flags.port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3000;
  // Positional args (filter out flags)
  flags.positional = args.filter(a => !a.startsWith('--') && !(outIdx !== -1 && a === args[outIdx + 1]) && !(targetIdx !== -1 && a === args[targetIdx + 1]) && !(portIdx !== -1 && a === args[portIdx + 1]));
  return flags;
}

function output(data, flags) {
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (!flags.quiet) {
    if (data.error) console.error(`Error: ${data.error}`);
    if (data.errors) data.errors.forEach(e => console.error(`  Line ${e.line}: ${e.message}`));
    if (data.warnings) data.warnings.forEach(w => console.warn(`  Warning: ${w}`));
    if (data.message) console.log(data.message);
    if (data.files) data.files.forEach(f => console.log(`  Created ${f}`));
  }
}

function loadSource(file) {
  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    return { error: `File not found: ${file}`, code: 3 };
  }
  return { source: readFileSync(filePath, 'utf-8'), filePath };
}

function makeModuleResolver(filePath) {
  const sourceDir = dirname(filePath);
  return (moduleName) => {
    for (const candidate of [resolve(sourceDir, moduleName + '.clear'), resolve(sourceDir, moduleName)]) {
      if (existsSync(candidate)) return readFileSync(candidate, 'utf-8');
    }
    return null;
  };
}

// =============================================================================
// COMMANDS
// =============================================================================

async function checkCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear check <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { parse, validate } = await getCompiler();
  const ast = parse(loaded.source);
  if (ast.errors.length > 0) {
    output({ ok: false, errors: ast.errors, warnings: [] }, flags);
    process.exit(1);
  }

  const validation = validate(ast);
  const result = {
    ok: validation.errors.length === 0,
    errors: validation.errors,
    warnings: validation.warnings,
    nodeCount: ast.body.length,
  };
  output(result, flags);
  process.exit(result.ok ? 0 : 1);
}

async function infoCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear info <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { parse, NodeType } = await getCompiler();
  const ast = parse(loaded.source);

  const info = {
    file: file,
    lines: loaded.source.split('\n').length,
    errors: ast.errors.length,
    endpoints: [],
    tables: [],
    pages: [],
    agents: [],
    charts: [],
    inputs: [],
    displays: [],
    target: null,
    database: null,
    theme: null,
  };

  function walk(nodes) {
    for (const n of nodes) {
      switch (n.type) {
        case NodeType.ENDPOINT:
          info.endpoints.push({ method: n.method, path: n.path, line: n.line });
          break;
        case NodeType.DATA_SHAPE:
          info.tables.push({ name: n.name, fields: n.fields.map(f => f.name), line: n.line });
          break;
        case NodeType.PAGE:
          info.pages.push({ title: n.title, route: n.route || '/', line: n.line });
          break;
        case NodeType.AGENT:
          info.agents.push({ name: n.name, line: n.line });
          break;
        case NodeType.CHART:
          info.charts.push({ title: n.title, type: n.chartType, data: n.dataVar, line: n.line });
          break;
        case NodeType.ASK_FOR:
          info.inputs.push({ label: n.label, type: n.inputType, variable: n.variable, line: n.line });
          break;
        case NodeType.DISPLAY:
          info.displays.push({ format: n.format, line: n.line, actions: n.actions || [] });
          break;
        case NodeType.TARGET:
          info.target = n.targets?.join(' and ') || null;
          break;
        case NodeType.DATABASE_DECL:
          info.database = n.backend;
          break;
        case NodeType.THEME:
          info.theme = n.name;
          break;
      }
      if (n.body) walk(n.body);
    }
  }
  walk(ast.body);

  if (!flags.json) {
    // Human-readable summary
    console.log(`\n  ${file} (${info.lines} lines)`);
    if (info.target) console.log(`  Target: ${info.target}`);
    if (info.database) console.log(`  Database: ${info.database}`);
    if (info.theme) console.log(`  Theme: ${info.theme}`);
    if (info.tables.length) console.log(`  Tables: ${info.tables.map(t => t.name).join(', ')}`);
    if (info.endpoints.length) {
      console.log(`  Endpoints:`);
      info.endpoints.forEach(e => console.log(`    ${e.method} ${e.path}`));
    }
    if (info.pages.length) console.log(`  Pages: ${info.pages.map(p => `${p.title} (${p.route})`).join(', ')}`);
    if (info.agents.length) console.log(`  Agents: ${info.agents.map(a => a.name).join(', ')}`);
    if (info.charts.length) console.log(`  Charts: ${info.charts.map(c => `${c.title} (${c.type})`).join(', ')}`);
    if (info.inputs.length) console.log(`  Inputs: ${info.inputs.length}`);
    if (info.errors) console.log(`  Parse errors: ${info.errors}`);
    console.log('');
  } else {
    output(info, flags);
  }
}

async function fixCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear fix <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, { moduleResolver: makeModuleResolver(loaded.filePath) });

  const patchable = result.errors.filter(e => e.patchable && e.insertAfter && e.fix);
  if (patchable.length === 0) {
    output({ ok: true, message: 'No fixable errors found.', totalErrors: result.errors.length }, flags);
    process.exit(result.errors.length > 0 ? 1 : 0);
  }

  const lines = loaded.source.split('\n');
  const patches = patchable.sort((a, b) => b.insertAfter - a.insertAfter);
  const applied = [];
  for (const patch of patches) {
    lines.splice(patch.insertAfter, 0, ...patch.fix);
    applied.push({ line: patch.insertAfter, fix: patch.fix[0]?.trim() });
  }
  writeFileSync(loaded.filePath, lines.join('\n'));

  output({
    ok: true,
    fixed: applied.length,
    patches: applied,
    remainingErrors: result.errors.length - patchable.length,
    message: `Fixed ${applied.length} error(s). ${result.errors.length - patchable.length} remaining.`,
  }, flags);
}

async function lintCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear lint <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, { moduleResolver: makeModuleResolver(loaded.filePath) });

  // Categorize warnings
  const security = result.warnings.filter(w =>
    w.includes('auth') || w.includes('CORS') || w.includes('CSRF') ||
    w.includes('injection') || w.includes('sensitive') || w.includes('rate limit') ||
    w.includes('traversal') || w.includes('logging')
  );
  const quality = result.warnings.filter(w =>
    w.includes('no response') || w.includes("doesn't match") || w.includes('Did you mean') ||
    w.includes('Duplicate endpoint')
  );
  const other = result.warnings.filter(w => !security.includes(w) && !quality.includes(w));

  const lintResult = {
    ok: result.errors.length === 0 && security.length === 0,
    errors: result.errors,
    security,
    quality,
    other,
    totalWarnings: result.warnings.length,
  };

  if (!flags.json) {
    if (security.length > 0) {
      console.log(`\n  SECURITY (${security.length}):`);
      security.forEach(w => console.log(`    ${w}`));
    }
    if (quality.length > 0) {
      console.log(`\n  QUALITY (${quality.length}):`);
      quality.forEach(w => console.log(`    ${w}`));
    }
    if (result.errors.length > 0) {
      console.log(`\n  ERRORS (${result.errors.length}):`);
      result.errors.forEach(e => console.log(`    Line ${e.line}: ${e.message}`));
    }
    if (lintResult.ok) console.log('\n  All clear.');
    console.log('');
  } else {
    output(lintResult, flags);
  }
  process.exit(lintResult.ok ? 0 : 1);
}

async function buildCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear build <file.clear> [--out dir] [--json] [--stdout]' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const options = { sourceMap: true };
  if (flags.target) options.target = flags.target;
  options.moduleResolver = makeModuleResolver(loaded.filePath);

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, options);

  if (result.errors.length > 0) {
    output({ ok: false, errors: result.errors, warnings: result.warnings }, flags);
    process.exit(1);
  }

  if (flags.stdout) {
    if (flags.json) {
      output({
        ok: true,
        javascript: result.javascript || null,
        python: result.python || null,
        html: result.html || null,
        serverJS: result.serverJS || null,
        css: result.css || null,
        tests: result.tests || null,
        warnings: result.warnings,
      }, flags);
    } else {
      if (result.serverJS) console.log(result.serverJS);
      else if (result.javascript) console.log(result.javascript);
      if (result.html) console.log(result.html);
    }
    return;
  }

  // Write files
  const name = basename(file, extname(file));
  const dir = flags.outDir || dirname(loaded.filePath);
  mkdirSync(dir, { recursive: true });
  const files = [];

  if (result.serverJS) {
    writeFileSync(resolve(dir, 'server.js'), result.serverJS);
    files.push('server.js');
  } else if (result.javascript) {
    const jsName = result.javascript.includes('express') ? 'server.js' : `${name}.js`;
    writeFileSync(resolve(dir, jsName), result.javascript);
    files.push(jsName);
  }
  if (result.html) {
    const htmlName = result.serverJS ? 'index.html' : `${name}.html`;
    writeFileSync(resolve(dir, htmlName), result.html);
    files.push(htmlName);
  }
  if (result.css) {
    writeFileSync(resolve(dir, 'style.css'), result.css);
    files.push('style.css');
  }
  if (result.python) {
    writeFileSync(resolve(dir, `${name}.py`), result.python);
    files.push(`${name}.py`);
  }
  if (result.tests) {
    writeFileSync(resolve(dir, 'test.js'), result.tests);
    files.push('test.js');
  }

  // Copy runtime if needed
  const allJS = (result.javascript || '') + (result.serverJS || '');
  if (allJS.includes("require('./clear-runtime/")) {
    const runtimeDir = resolve(dir, 'clear-runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const runtimeSrc = resolve(__dirname, '..', 'runtime');
    for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
      const src = resolve(runtimeSrc, f);
      if (existsSync(src)) { copyFileSync(src, resolve(runtimeDir, f)); }
    }
    files.push('clear-runtime/');
  }

  output({ ok: true, files, warnings: result.warnings, message: `Built ${files.length} file(s)` }, flags);
}

async function testCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear test <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { parse, NodeType, compileProgram } = await getCompiler();
  const ast = parse(loaded.source);
  const tests = [];
  function findTests(nodes) {
    for (const n of nodes) {
      if (n.type === NodeType.TEST_DEF) tests.push(n);
      if (n.body) findTests(n.body);
    }
  }
  findTests(ast.body);

  if (tests.length === 0) {
    output({ ok: true, passed: 0, failed: 0, message: 'No test blocks found.' }, flags);
    process.exit(0);
  }

  const result = compileProgram(loaded.source, { target: 'web' });
  if (result.errors.length > 0) {
    output({ ok: false, errors: result.errors }, flags);
    process.exit(1);
  }

  // Execute tests
  const runner = `let _passed=0,_failed=0;function test(n,f){try{f();_passed++}catch(e){_failed++;console.error("FAIL: "+n+" -- "+e.message)}}function expect(v){return{toBeTruthy(){if(!v)throw Error("Expected truthy")}}}${result.javascript};`;
  try {
    new Function(runner)();
  } catch (e) {
    output({ ok: false, error: e.message }, flags);
    process.exit(2);
  }
}

async function runCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear run <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, { moduleResolver: makeModuleResolver(loaded.filePath) });
  if (result.errors.length > 0) {
    output({ ok: false, errors: result.errors }, flags);
    process.exit(1);
  }

  try {
    new Function(result.javascript || result.serverJS)();
  } catch (e) {
    output({ ok: false, error: e.message }, flags);
    process.exit(2);
  }
}

async function serveCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear serve <file.clear> [--port 3000]' }, flags); process.exit(1); }

  // Build first
  const tmpDir = resolve(dirname(resolve(file)), '.clear-serve');
  await buildCommand([file, '--out', tmpDir, '--no-test', ...(flags.json ? ['--json'] : []), '--quiet']);

  const serverFile = resolve(tmpDir, 'server.js');
  const htmlFile = resolve(tmpDir, 'index.html');

  if (existsSync(serverFile)) {
    // Start Express server
    if (!flags.quiet) console.log(`  Starting server on port ${flags.port}...`);
    const child = spawn('node', [serverFile], {
      env: { ...process.env, PORT: String(flags.port) },
      stdio: 'inherit',
    });
    child.on('exit', (code) => process.exit(code || 0));
    process.on('SIGINT', () => { child.kill(); process.exit(0); });
  } else if (existsSync(htmlFile)) {
    // Static file server
    if (!flags.quiet) console.log(`  Serving ${htmlFile} on http://localhost:${flags.port}`);
    const { createServer } = await import('http');
    const server = createServer((req, res) => {
      const html = readFileSync(htmlFile, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.listen(flags.port);
    process.on('SIGINT', () => { server.close(); process.exit(0); });
  } else {
    output({ error: 'No server.js or index.html produced. Check your build target.' }, flags);
    process.exit(1);
  }
}

async function devCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear dev <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  if (!flags.quiet) console.log(`  Watching ${file} for changes... (Ctrl+C to stop)`);

  // Initial build
  await buildCommand([file, '--no-test', '--quiet']);
  if (!flags.quiet) console.log('  Initial build complete.');

  let debounce = null;
  fsWatch(loaded.filePath, async () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      if (!flags.quiet) console.log(`  Rebuilding...`);
      try {
        await buildCommand([file, '--no-test', '--quiet']);
        if (!flags.quiet) console.log('  Rebuilt.');
      } catch (e) {
        console.error(`  Build failed: ${e.message}`);
      }
    }, 200);
  });
}

async function initCommand(args) {
  const flags = parseFlags(args);
  const dir = flags.positional[0] || '.';
  const targetDir = resolve(dir);
  mkdirSync(targetDir, { recursive: true });

  const mainClear = `build for web

page 'My App' at '/':
  heading 'Hello, Clear!'
  'Your Name' is a text input saved as a name
  button 'Greet':
    show 'Hello, ' + name
`;

  writeFileSync(resolve(targetDir, 'main.clear'), mainClear);
  output({ ok: true, files: ['main.clear'], message: `Created ${resolve(targetDir, 'main.clear')}` }, flags);
}

async function packageCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear package <file.clear> [--out dir]' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, { sourceMap: true, moduleResolver: makeModuleResolver(loaded.filePath) });
  if (result.errors.length > 0) {
    output({ ok: false, errors: result.errors }, flags);
    process.exit(1);
  }

  const outDir = flags.outDir || resolve(dirname(loaded.filePath), 'deploy');
  mkdirSync(outDir, { recursive: true });
  const files = [];

  const serverCode = result.serverJS || result.javascript;
  writeFileSync(resolve(outDir, 'server.js'), serverCode);
  files.push('server.js');

  if (result.html) {
    writeFileSync(resolve(outDir, 'index.html'), result.html);
    files.push('index.html');
  }
  if (result.tests) {
    writeFileSync(resolve(outDir, 'test.js'), result.tests);
    files.push('test.js');
  }

  // Runtime
  const runtimeDir = resolve(outDir, 'clear-runtime');
  mkdirSync(runtimeDir, { recursive: true });
  const runtimeSrc = resolve(__dirname, '..', 'runtime');
  for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
    const src = resolve(runtimeSrc, f);
    if (existsSync(src)) copyFileSync(src, resolve(runtimeDir, f));
  }
  files.push('clear-runtime/');

  // package.json
  const appName = basename(file, extname(file)).replace(/[^a-z0-9-]/g, '-');
  const pkg = {
    name: `clear-${appName}`,
    version: '1.0.0',
    description: 'Built with Clear language',
    main: 'server.js',
    scripts: { start: 'node server.js', test: 'node test.js' },
    dependencies: { express: '^4.18.0' },
  };
  writeFileSync(resolve(outDir, 'package.json'), JSON.stringify(pkg, null, 2));
  files.push('package.json');

  // Dockerfile
  writeFileSync(resolve(outDir, 'Dockerfile'), `FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]`);
  files.push('Dockerfile');

  writeFileSync(resolve(outDir, '.dockerignore'), 'node_modules\nclear-data.json\n');
  files.push('.dockerignore');

  output({ ok: true, files, outDir, message: `Packaged ${files.length} files to ${outDir}/` }, flags);
}

function helpCommand(flags = {}) {
  if (flags.json) {
    output({
      commands: ['build', 'check', 'info', 'fix', 'test', 'run', 'serve', 'lint', 'dev', 'init', 'package', 'help'],
      globalFlags: ['--json', '--quiet', '--no-test', '--auto-fix', '--stdout', '--out <dir>', '--port <n>'],
      exitCodes: { 0: 'success', 1: 'compile error', 2: 'runtime error', 3: 'file not found', 4: 'test failure' },
    }, flags);
    return;
  }
  console.log(`
Clear CLI — The tool AI agents use to build and ship Clear apps

Usage: clear <command> [file] [options]

Commands:
  build <file>     Compile .clear to JS/Python/HTML
  check <file>     Validate without compiling (fast)
  info <file>      List endpoints, tables, pages, agents
  fix <file>       Auto-fix patchable errors in source
  test <file>      Run test blocks
  run <file>       Compile and execute
  serve <file>     Compile and start local server
  lint <file>      Security + quality analysis
  dev <file>       Watch + rebuild on changes
  init [dir]       Scaffold new project
  package <file>   Bundle for deployment

Flags:
  --json           Machine-readable JSON output
  --quiet          Suppress non-essential output
  --out <dir>      Output directory
  --port <n>       Server port (default: 3000)
  --stdout         Print compiled output to stdout
  --no-test        Skip compiler test gate
  --auto-fix       Auto-patch fixable errors

Exit codes: 0=ok, 1=compile error, 2=runtime error, 3=not found, 4=test fail
`);
}

// =============================================================================
// MAIN
// =============================================================================

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);
const flags = parseFlags(commandArgs);

switch (command) {
  case 'build':    await buildCommand(commandArgs); break;
  case 'check':    await checkCommand(commandArgs); break;
  case 'info':     await infoCommand(commandArgs); break;
  case 'fix':      await fixCommand(commandArgs); break;
  case 'test':     await testCommand(commandArgs); break;
  case 'run':      await runCommand(commandArgs); break;
  case 'serve':    await serveCommand(commandArgs); break;
  case 'lint':     await lintCommand(commandArgs); break;
  case 'dev':      await devCommand(commandArgs); break;
  case 'init':     await initCommand(commandArgs); break;
  case 'package':
  case 'deploy':   await packageCommand(commandArgs); break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:  helpCommand(flags); break;
  default:
    output({ error: `Unknown command: ${command}. Run 'clear help' for usage.` }, flags);
    process.exit(1);
}
