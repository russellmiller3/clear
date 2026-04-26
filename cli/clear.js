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
//   eval <file>      Run agent evals (schema checks, or --graded for LLM scorecard)
//   agent <file>     List agents with tools, skills, guardrails, directives
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
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync, spawn } from 'child_process';
import { packageBundle } from '../lib/packaging.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILER_PATH = pathToFileURL(resolve(__dirname, '..', 'index.js')).href;

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

  // Safely write a package.json that's both a CommonJS shield AND lists the
  // runtime dependencies the compiled server needs (express, ws, bcryptjs,
  // jsonwebtoken, nodemailer, multer). Without deps the built app can't run
  // standalone — `node server.js` throws "Cannot find module 'jsonwebtoken'".
  // Never clobber a pre-existing real package.json (would break the parent
  // project's setup). Idempotent on re-builds: re-run only updates the deps
  // block when serverCode requires new modules.
  const CJS_SHIELD_KEYS = new Set(['type', 'dependencies']); // package.json keys we own
  function packageJsonForServer(serverCode) {
    const deps = {};
    if (serverCode && serverCode.length > 0) {
      // Express + ws are emitted by the compiler whenever it generates a
      // server. The other 4 are conditional based on runtime helpers used.
      if (serverCode.includes("require('express')")) deps.express = '*';
      if (serverCode.includes("require('ws')")) deps.ws = '*';
      if (serverCode.includes("require('bcryptjs')")) deps.bcryptjs = '*';
      if (serverCode.includes("require('jsonwebtoken')")) deps.jsonwebtoken = '*';
      if (serverCode.includes("require('nodemailer')")) deps.nodemailer = '*';
      if (serverCode.includes("require('multer')")) deps.multer = '*';
      if (serverCode.includes("require('pg')")) deps.pg = '*';
      if (serverCode.includes("require('better-sqlite3')")) deps['better-sqlite3'] = '*';
    }
    const pkg = { type: 'commonjs' };
    if (Object.keys(deps).length > 0) pkg.dependencies = deps;
    return pkg;
  }
  function writePackageJsonShield(serverCode) {
    const pkgPath = resolve(dir, 'package.json');
    const desired = packageJsonForServer(serverCode || '');
    if (existsSync(pkgPath)) {
      let existing;
      try { existing = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch (_e) { existing = null; }
      // Owner check: only overwrite if every key in the existing file is one
      // of ours. If it has "name", "scripts", etc. we're inside a real project.
      const ownsIt = existing && typeof existing === 'object'
        && Object.keys(existing).every(k => CJS_SHIELD_KEYS.has(k));
      if (!ownsIt) {
        if (!flags.quiet) {
          console.warn(`  Warning: package.json already exists at ${dir} and isn't a Clear-built file — not overwriting. If you're building inside an ESM project, use --out <subdir> to isolate the build output.`);
        }
        return;
      }
    }
    writeFileSync(pkgPath, JSON.stringify(desired, null, 2) + '\n');
    if (!files.includes('package.json')) files.push('package.json');
  }
  // Run npm install when deps are present and node_modules is missing the
  // listed packages. Fails open: if npm is slow or offline we warn but don't
  // fail the build (user can install manually). Skipped via --skip-install
  // for repeat builds where deps haven't changed.
  function maybeInstallDeps(serverCode) {
    if (flags.skipInstall || flags.stdout) return;
    const desired = packageJsonForServer(serverCode || '');
    if (!desired.dependencies || Object.keys(desired.dependencies).length === 0) return;
    const nodeModules = resolve(dir, 'node_modules');
    const need = Object.keys(desired.dependencies).some(d => !existsSync(resolve(nodeModules, d)));
    if (!need) return;
    const installTimeoutMs = Math.max(15000, Number(process.env.CLEAR_NPM_INSTALL_TIMEOUT_MS) || 60000);
    if (!flags.quiet) console.log('  Installing dependencies (' + Object.keys(desired.dependencies).join(', ') + ')...');
    try {
      execSync('npm install --production --silent', { cwd: dir, timeout: installTimeoutMs, stdio: 'pipe' });
    } catch (e) {
      const timedOut = e.code === 'ETIMEDOUT' || (e.killed && e.signal === 'SIGTERM');
      if (!flags.quiet) {
        if (timedOut) console.log(`  (npm install timed out after ${Math.round(installTimeoutMs / 1000)}s — run "npm install" inside ${dir} before "node server.js")`);
        else console.log(`  (npm install failed: ${(e.message || '').slice(0, 140)} — run "npm install" inside ${dir} before "node server.js")`);
      }
    }
  }

  if (result.serverJS) {
    writeFileSync(resolve(dir, 'server.js'), result.serverJS);
    files.push('server.js');
    // Write package.json with deps so `node server.js` works standalone, then
    // npm-install them. Without this the test runner installs deps via its
    // own throwaway build dir but `clear build` left users with a missing
    // jsonwebtoken module.
    writePackageJsonShield(result.serverJS);
    maybeInstallDeps(result.serverJS);
  } else if (result.javascript) {
    const jsName = result.javascript.includes('express') ? 'server.js' : `${name}.js`;
    writeFileSync(resolve(dir, jsName), result.javascript);
    files.push(jsName);
    if (jsName === 'server.js' || result.javascript.includes('require(')) {
      writePackageJsonShield(result.javascript);
      maybeInstallDeps(result.javascript);
    }
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
  // Detect whether the LAE widget bundle is referenced (the compiler emits the
  // /__meph__/widget.js Express route + script tag whenever `allow signup and
  // login` is in source). Without copying meph-widget.js the widget script
  // 404s — harmless with onerror, but copying lets it work when STUDIO_PORT is
  // set in the environment.
  const needsWidget = (result.serverJS || '').includes("'/__meph__/widget.js'");
  if (allJS.includes("require('./clear-runtime/") || needsWidget) {
    const runtimeDir = resolve(dir, 'clear-runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const runtimeSrc = resolve(__dirname, '..', 'runtime');
    const runtimeFiles = ['db.js', 'auth.js', 'rateLimit.js'];
    if (needsWidget) runtimeFiles.push('meph-widget.js');
    for (const f of runtimeFiles) {
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

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, { moduleResolver: makeModuleResolver(loaded.filePath) });
  if (result.errors.length > 0) {
    output({ ok: false, errors: result.errors }, flags);
    process.exit(1);
  }

  // Use the auto-generated test file (result.tests) which includes BOTH
  // compiler-generated E2E tests AND user-written test blocks, all with
  // proper variable scoping (_baseUrl, _response, _responseBody, etc.)
  if (result.tests) {
    // Build in a temp directory with all deps installed
    const buildDir = resolve(dirname(resolve(file)), '.clear-test-build');
    mkdirSync(buildDir, { recursive: true });
    const rtDir = resolve(buildDir, 'clear-runtime');
    mkdirSync(rtDir, { recursive: true });

    // Copy runtime files
    const runtimeSrc = resolve(__dirname, '..', 'runtime');
    for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
      const src = resolve(runtimeSrc, f);
      if (existsSync(src)) copyFileSync(src, resolve(rtDir, f));
    }

    // Write server + test files
    const serverCode = result.serverJS || result.javascript || '';
    const testFile = resolve(buildDir, 'test.js');
    writeFileSync(testFile, result.tests);

    if (serverCode) {
      writeFileSync(resolve(buildDir, 'server.js'), serverCode);
      if (result.html) writeFileSync(resolve(buildDir, 'index.html'), result.html);
      if (result.css) writeFileSync(resolve(buildDir, 'style.css'), result.css);

      // Install npm dependencies (bcryptjs, jsonwebtoken, ws, etc.)
      const deps = { express: '*', ws: '*' };
      if (serverCode.includes("require('bcryptjs')")) deps.bcryptjs = '*';
      if (serverCode.includes("require('jsonwebtoken')")) deps.jsonwebtoken = '*';
      if (serverCode.includes("require('nodemailer')")) deps.nodemailer = '*';
      if (serverCode.includes("require('multer')")) deps.multer = '*';
      writeFileSync(resolve(buildDir, 'package.json'), JSON.stringify({ dependencies: deps }));
      const needInstall = Object.keys(deps).some(d => !existsSync(resolve(buildDir, 'node_modules', d)));
      if (needInstall) {
        if (!flags.quiet) console.log('  Installing dependencies...');
        // npm install on Windows goes through cmd.exe and can be slow on first
        // run (Defender scanning, fresh cache). 60s is a safer default than 30s.
        // A quiet failure here means tests about to require() a missing module,
        // so emit a warning when the install times out or errors.
        const installTimeoutMs = Math.max(15000, Number(process.env.CLEAR_NPM_INSTALL_TIMEOUT_MS) || 60000);
        try {
          execSync('npm install --production --silent', { cwd: buildDir, timeout: installTimeoutMs, stdio: 'pipe' });
        } catch (e) {
          const timedOut = e.code === 'ETIMEDOUT' || (e.killed && e.signal === 'SIGTERM');
          if (!flags.quiet) {
            if (timedOut) console.log(`  (npm install timed out after ${Math.round(installTimeoutMs / 1000)}s — continuing; tests may fail if deps are missing)`);
            else console.log(`  (npm install failed: ${(e.message || '').slice(0, 140)} — continuing)`);
          }
        }
      }

      // Start server
      const port = 3099 + Math.floor(Math.random() * 900);
      // Set a known JWT_SECRET so the server and test runner share the same secret
      // Without this, the server generates a random secret and auth tokens from
      // the test harness (via auth.createToken) won't verify.
      const testJwtSecret = 'clear-test-secret-' + Date.now();
      const env = { ...process.env, PORT: String(port), NODE_ENV: 'test', JWT_SECRET: testJwtSecret, CLEAR_AUTH_SECRET: testJwtSecret };
      if (!flags.quiet) console.log('  Starting server on port ' + port + '...');
      const server = spawn('node', ['server.js'], { cwd: buildDir, env, stdio: 'pipe' });

      // Wait for server to be ready (poll TCP, max 8s)
      let serverReady = false;
      server.stdout.on('data', (d) => {
        const s = d.toString();
        if (s.includes('port') || s.includes('listening') || s.includes('running')) serverReady = true;
      });
      server.stderr.on('data', (d) => {
        const s = d.toString();
        if (s.includes('WARNING')) return; // ignore auth warnings
        if (!flags.quiet) process.stderr.write('  [server] ' + s);
      });
      await new Promise(res => {
        let attempts = 0;
        const check = setInterval(async () => {
          attempts++;
          if (serverReady || attempts > 3) {
            try {
              const r = await fetch(`http://localhost:${port}/`);
              if (r.ok || r.status < 500) { clearInterval(check); res(); return; }
            } catch {}
          }
          if (attempts > 40) { clearInterval(check); res(); }
        }, 200);
      });

      // Run tests. Timeout is generous (default 120s) because templates with
      // agents make live `ask claude` calls that can each take 10–30 seconds.
      // Windows surfaces execSync timeouts as the cryptic "spawnSync cmd.exe
      // ETIMEDOUT" — catch that case explicitly and print something a human
      // can act on. Users can override with CLEAR_TEST_TIMEOUT_MS for heavy
      // suites (multi-agent research chains, LLM-graded evals, etc.).
      const testTimeoutMs = Math.max(10000, Number(process.env.CLEAR_TEST_TIMEOUT_MS) || 120000);
      if (!flags.quiet) console.log('  Running tests...\n');
      try {
        const testEnv = { ...process.env, TEST_URL: `http://localhost:${port}`, JWT_SECRET: testJwtSecret, CLEAR_AUTH_SECRET: testJwtSecret };
        const stdout = execSync(`node test.js`, { cwd: buildDir, encoding: 'utf8', timeout: testTimeoutMs, env: testEnv });
        process.stdout.write(stdout);
      } catch (e) {
        if (e.stdout) process.stdout.write(e.stdout);
        if (e.status === 4) { server.kill('SIGTERM'); process.exit(4); }
        // Node represents execSync timeouts with .signal === 'SIGTERM' and .code === 'ETIMEDOUT'
        // on Windows; on other platforms .killed === true. Surface a plain message either way.
        const timedOut = e.code === 'ETIMEDOUT' || (e.killed && e.signal === 'SIGTERM');
        if (timedOut) {
          process.stderr.write(`\n  Tests exceeded the ${Math.round(testTimeoutMs / 1000)}s time limit.\n`);
          process.stderr.write(`  Set CLEAR_TEST_TIMEOUT_MS to a higher value for long-running suites (e.g. agent chains).\n`);
        } else if (e.stderr) {
          process.stderr.write(e.stderr);
        }
      } finally {
        server.kill('SIGTERM');
      }
    } else {
      // Frontend-only app — run tests without server (no live API calls,
      // so the default 30s timeout is usually plenty; still honor the override).
      const testTimeoutMs = Math.max(10000, Number(process.env.CLEAR_TEST_TIMEOUT_MS) || 30000);
      try {
        execSync(`node test.js`, { cwd: buildDir, stdio: 'inherit', timeout: testTimeoutMs });
      } catch (e) {
        const timedOut = e.code === 'ETIMEDOUT' || (e.killed && e.signal === 'SIGTERM');
        if (timedOut) {
          process.stderr.write(`\n  Tests exceeded the ${Math.round(testTimeoutMs / 1000)}s time limit (set CLEAR_TEST_TIMEOUT_MS to override).\n`);
        }
        if (e.status === 4) process.exit(4);
      }
    }
    return;
  }

  // Fallback: no auto-generated tests and no user tests
  output({ ok: true, passed: 0, failed: 0, message: 'No tests found. Add test blocks to your Clear source.' }, flags);
  process.exit(0);
}

// =============================================================================
// AGENT COMMAND — List agents with all directives
// =============================================================================

async function agentCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear agent <file.clear>' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { parse, NodeType } = await getCompiler();
  const ast = parse(loaded.source);

  const agents = [];
  const skills = [];
  const pipelines = [];

  for (const n of ast.body) {
    if (n.type === NodeType.AGENT) {
      const agent = {
        name: n.name,
        line: n.line,
        receiving: n.receivingVar,
        schedule: n.schedule || null,
        tools: n.tools ? n.tools.map(t => t.type === 'ref' ? t.name : t.description) : [],
        skills: n.skills || [],
        restrictions: n.restrictions ? n.restrictions.map(r => r.text) : [],
        knowsAbout: n.knowsAbout || [],
        trackDecisions: n.trackDecisions || false,
        rememberConversation: n.rememberConversation || false,
        rememberPreferences: n.rememberPreferences || false,
        model: n.model || null,
      };
      agents.push(agent);
    }
    if (n.type === NodeType.SKILL) {
      skills.push({ name: n.name, tools: n.tools, instructions: n.instructions, line: n.line });
    }
    if (n.type === NodeType.PIPELINE) {
      pipelines.push({ name: n.name, input: n.inputVar, steps: n.steps.map(s => s.agentName), line: n.line });
    }
  }

  if (flags.json) {
    output({ ok: true, agents, skills, pipelines }, flags);
    return;
  }

  if (agents.length === 0) {
    console.log('  No agents found.');
    return;
  }

  for (const a of agents) {
    console.log(`\n  Agent '${a.name}' (line ${a.line}):`);
    if (a.schedule) console.log(`    Schedule: runs every ${a.schedule.value} ${a.schedule.unit}(s)`);
    else console.log(`    Receiving: ${a.receiving}`);
    if (a.tools.length > 0) console.log(`    Tools: ${a.tools.join(', ')}`);
    if (a.skills.length > 0) console.log(`    Skills: ${a.skills.join(', ')}`);
    if (a.restrictions.length > 0) console.log(`    Must not: ${a.restrictions.join('; ')}`);
    if (a.knowsAbout.length > 0) console.log(`    Knows about: ${a.knowsAbout.join(', ')}`);
    if (a.trackDecisions) console.log(`    Observability: tracking decisions`);
    if (a.rememberConversation) console.log(`    Memory: conversation context`);
    if (a.rememberPreferences) console.log(`    Memory: user preferences`);
    if (a.model) console.log(`    Model: ${a.model}`);
  }

  if (skills.length > 0) {
    console.log('\n  Skills:');
    for (const s of skills) {
      console.log(`    '${s.name}' (line ${s.line}): ${s.tools.join(', ')} — ${s.instructions.length} instruction(s)`);
    }
  }

  if (pipelines.length > 0) {
    console.log('\n  Pipelines:');
    for (const p of pipelines) {
      console.log(`    '${p.name}' (line ${p.line}): ${p.steps.join(' → ')}`);
    }
  }
  console.log('');
}

// =============================================================================
// EVAL COMMAND — Run agent evals (schema checks + LLM-graded scorecards)
// =============================================================================

async function evalCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) { output({ error: 'Usage: clear eval <file.clear> [--graded]' }, flags); process.exit(1); }

  const loaded = loadSource(file);
  if (loaded.error) { output(loaded, flags); process.exit(loaded.code); }

  const { compileProgram } = await getCompiler();
  const result = compileProgram(loaded.source, { moduleResolver: makeModuleResolver(loaded.filePath) });

  if (result.errors.length > 0) {
    output({ ok: false, errors: result.errors }, flags);
    process.exit(1);
  }

  if (!result.evals) {
    output({ ok: true, message: 'No agents found — nothing to eval.' }, flags);
    process.exit(0);
  }

  const graded = args.includes('--graded');

  if (graded) {
    // LLM-graded evals — write eval.js and run it
    if (!result.evals.graded) {
      output({ ok: true, message: 'No graded evals generated (no agent endpoints found).' }, flags);
      process.exit(0);
    }
    const outDir = resolve(dirname(resolve(file)), 'build');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const evalFile = resolve(outDir, 'eval.js');
    writeFileSync(evalFile, result.evals.graded);

    if (!flags.quiet) console.log(`  Graded evals written to ${evalFile}`);
    if (!flags.quiet) console.log(`  Run: ANTHROPIC_API_KEY=sk-... node ${evalFile}`);
    if (!flags.quiet) console.log(`  (Requires server running — start with: clear serve ${file})`);

    if (flags.json) {
      output({ ok: true, evalFile, type: 'graded', instructions: 'Start server, then run eval.js with ANTHROPIC_API_KEY' }, flags);
    }
    return;
  }

  // Schema evals — write eval Clear blocks and compile to standalone runner
  if (!result.evals.schema) {
    output({ ok: true, message: 'No schema evals generated.' }, flags);
    process.exit(0);
  }

  const outDir = resolve(dirname(resolve(file)), 'build');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Write schema evals as Clear source
  const schemaFile = resolve(outDir, 'schema-evals.clear');
  writeFileSync(schemaFile, loaded.source + '\n\n' + result.evals.schema);

  // Compile the combined source to a runnable JS file
  const combinedSource = loaded.source + '\n\n' + result.evals.schema;
  const evalResult = compileProgram(combinedSource, { moduleResolver: makeModuleResolver(loaded.filePath) });

  if (evalResult.errors.length > 0) {
    if (!flags.quiet) {
      console.log('  Schema eval compilation errors:');
      for (const e of evalResult.errors) console.log(`    line ${e.line}: ${e.message}`);
    }
    output({ ok: false, errors: evalResult.errors }, flags);
    process.exit(1);
  }

  // Write the eval runner as a standalone node script
  const js = evalResult.serverJS || evalResult.javascript || '';
  const evalRunner = `#!/usr/bin/env node
// Schema Evals (auto-generated) — run with: node schema-eval.js
// Tests agent output shapes against returning: schemas with mocked AI.

// Redirect app.listen so it doesn't actually start a server
const _origListen = Function.prototype;

${js}

// Collect and run tests
const _results = { passed: 0, failed: 0, failures: [] };
if (typeof _tests !== 'undefined') {
  (async () => {
    for (const t of _tests) {
      try { await t.fn(); _results.passed++; } catch(e) { _results.failed++; _results.failures.push({ name: t.name, error: e.message }); }
    }
    console.log("\\nSchema Eval Results:");
    console.log("  Passed:", _results.passed);
    if (_results.failed > 0) {
      console.log("  Failed:", _results.failed);
      for (const f of _results.failures) console.log("    -", f.name + ":", f.error);
    }
    process.exit(_results.failed > 0 ? 1 : 0);
  })();
}
`;

  const evalFile = resolve(outDir, 'schema-eval.js');
  writeFileSync(evalFile, evalRunner);

  if (!flags.quiet) {
    console.log(`\n  Schema evals generated:`);
    console.log(`    Clear source: ${schemaFile}`);
    console.log(`    JS runner:    ${evalFile}`);
    console.log(`\n  Run: node ${evalFile}`);
    console.log('');
  }

  if (flags.json) {
    output({ ok: true, type: 'schema', schemaFile, evalFile, instructions: `Run: node ${evalFile}` }, flags);
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
  const appName = basename(file, extname(file));
  const res = packageBundle(result, outDir, { sourceText: loaded.source, appName });
  output({ ok: true, files: res.files, outDir: res.outDir, message: `Packaged ${res.files.length} files to ${res.outDir}/` }, flags);
}

async function deployCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) {
    output({ error: 'Usage: clear deploy <file.clear>\n\nDeploys to Railway. Requires: npm install -g @railway/cli' }, flags);
    process.exit(1);
  }

  // Check Railway CLI is installed
  try {
    execSync('railway version', { stdio: 'pipe', timeout: 5000 });
  } catch {
    console.log('\n  Railway CLI not found.\n');
    console.log('  Install:  npm install -g @railway/cli');
    console.log('  Login:    railway login');
    console.log('  Init:     railway init\n');
    process.exit(1);
  }

  // Check logged in
  try {
    execSync('railway whoami', { stdio: 'pipe', timeout: 5000 });
  } catch {
    console.log('\n  Not logged into Railway.\n');
    console.log('  Run:  railway login\n');
    process.exit(1);
  }

  const deployDir = resolve(dirname(resolve(file)), 'deploy');

  // Package first
  if (!flags.quiet) console.log('  Packaging...');
  await packageCommand([file, '--out', deployDir, '--quiet']);

  // Deploy
  if (!flags.quiet) console.log('  Deploying to Railway...');
  try {
    const stdout = execSync('railway up --detach', {
      cwd: deployDir,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('  Deployed!');
    if (stdout.trim()) console.log('  ' + stdout.trim());
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || '').trim();
    if (msg.includes('no project') || msg.includes('No project') || msg.includes('not linked')) {
      console.log('\n  No Railway project linked.\n');
      console.log('  Run:  cd ' + deployDir + ' && railway init\n');
      process.exit(1);
    }
    console.error('  Deploy failed: ' + msg.slice(0, 300));
    process.exit(2);
  }

  // Post-deploy guidance
  const loaded = loadSource(file);
  if (!loaded.error) {
    const { compileProgram } = await getCompiler();
    const r = compileProgram(loaded.source);
    const isPg = (r.dbBackend || '').includes('postgres');
    const hasAuth = loaded.source.includes('signup and login') || loaded.source.includes('requires login');
    const hasAgent = loaded.source.includes('ask claude') || loaded.source.includes('ask ai');

    console.log('');
    if (!isPg) {
      console.log('  Note: Using SQLite. Data resets on redeploy.');
      console.log('  For persistent data, use: database is PostgreSQL');
    }
    if (isPg) {
      console.log('  Add Postgres in Railway dashboard. DATABASE_URL is set automatically.');
    }
    if (hasAuth) {
      console.log('  Set JWT_SECRET in Railway > Variables.');
    }
    if (hasAgent) {
      console.log('  Set ANTHROPIC_API_KEY in Railway > Variables.');
    }
    console.log('');
  }
}

function helpCommand(flags = {}) {
  if (flags.json) {
    output({
      commands: ['build', 'check', 'info', 'fix', 'test', 'eval', 'agent', 'run', 'serve', 'lint', 'dev', 'init', 'package', 'help'],
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
  eval <file>      Run agent schema evals (deterministic)
  eval <file> --graded  Generate LLM-graded eval harness
  agent <file>     List agents with tools, skills, guardrails
  run <file>       Compile and execute
  serve <file>     Compile and start local server
  lint <file>      Security + quality analysis
  dev <file>       Watch + rebuild on changes
  init [dir]       Scaffold new project
  package <file>   Bundle for deployment
  deploy <file>    Package and deploy to Railway

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
  case 'agent':    await agentCommand(commandArgs); break;
  case 'eval':     await evalCommand(commandArgs); break;
  case 'package':   await packageCommand(commandArgs); break;
  case 'deploy':    await deployCommand(commandArgs); break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:  helpCommand(flags); break;
  default:
    output({ error: `Unknown command: ${command}. Run 'clear help' for usage.` }, flags);
    process.exit(1);
}
