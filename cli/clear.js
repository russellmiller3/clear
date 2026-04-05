#!/usr/bin/env node
// =============================================================================
// CLEAR CLI — Build, test, run, and deploy Clear programs
// =============================================================================
// Usage: node cli/clear.js <command> [file] [options]
//
// Commands:
//   build <file>    Compile a .clear file to JS/Python/HTML
//   test <file>     Run test blocks in a .clear file
//   run <file>      Compile and execute a .clear file
//   init <dir>      Scaffold a new Clear project
//   help            Show this help message
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, watch, copyFileSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { compileProgram, parse, validate, NodeType } from '../clear/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================================
// COMMANDS
// =============================================================================

function runCompilerTests() {
  // Run the compiler test suite deterministically before building
  // If any test fails, block the build
  const testFile = resolve(dirname(new URL(import.meta.url).pathname), '..', 'clear', 'clear.test.js');
  if (!existsSync(testFile)) return true; // No test file = skip
  try {
    execSync(`node ${testFile}`, { stdio: 'pipe', timeout: 30000 });
    return true;
  } catch (err) {
    const output = err.stdout?.toString() || '';
    const failMatch = output.match(/Failed: (\d+)/);
    const failCount = failMatch ? failMatch[1] : '?';
    console.error(`  Compiler tests failed (${failCount} failures). Fix tests before building.`);
    // Show failing test names
    output.split('\n').filter(l => l.includes('FAIL') || l.startsWith('  ')).slice(0, 10).forEach(l => console.error('  ' + l.trim()));
    return false;
  }
}

function buildCommand(args) {
  const file = args[0];
  if (!file) {
    console.error('Usage: clear build <file.clear> [--stdout] [--out <dir>] [--target <target>]');
    process.exit(1);
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  const options = {};

  // Parse flags
  const stdout = args.includes('--stdout');
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? resolve(args[outIdx + 1]) : null;
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1) options.target = args[targetIdx + 1];

  // Run compiler tests before building (unless --no-test flag)
  if (!args.includes('--no-test')) {
    if (!runCompilerTests()) {
      console.error('  Build blocked. Run tests manually: node clear/clear.test.js');
      process.exit(1);
    }
  }

  // Enable source maps by default for build output (helps debugging compiled code)
  if (options.sourceMap === undefined) options.sourceMap = true;

  // File-based module resolver: reads .clear files relative to the source file
  const sourceDir = dirname(filePath);
  options.moduleResolver = (moduleName) => {
    // Try: moduleName.clear, moduleName (as-is)
    const candidates = [
      resolve(sourceDir, moduleName + '.clear'),
      resolve(sourceDir, moduleName),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return readFileSync(candidate, 'utf-8');
      }
    }
    return null;
  };

  const result = compileProgram(source, options);

  if (result.errors.length > 0) {
    const patchable = result.errors.filter(e => e.patchable);
    for (const err of result.errors) {
      const tag = err.patchable ? '[PATCHABLE] ' : '';
      console.error(`  ${tag}Line ${err.line}: ${err.message}`);
    }
    // Auto-patch patchable errors if --auto-fix flag is set
    if (patchable.length > 0 && args.includes('--auto-fix')) {
      console.log(`\n  Auto-fixing ${patchable.length} patchable error(s)...`);
      const lines = source.split('\n');
      // Sort patches by line number descending (so insertions don't shift later lines)
      const patches = patchable.filter(e => e.insertAfter && e.fix).sort((a, b) => b.insertAfter - a.insertAfter);
      for (const patch of patches) {
        const insertIdx = patch.insertAfter; // 1-based line number
        lines.splice(insertIdx, 0, ...patch.fix);
        console.log(`    Patched line ${insertIdx}: ${patch.fix[0].trim()}`);
      }
      writeFileSync(filePath, lines.join('\n'));
      console.log(`  Source patched. Re-run build to compile.`);
    }
    if (patchable.length > 0 && !args.includes('--auto-fix')) {
      console.error(`\n  ${patchable.length} error(s) can be auto-fixed. Run with --auto-fix to patch the source.`);
    }
    process.exit(1);
  }

  const name = basename(file, extname(file));

  if (stdout) {
    if (result.javascript) {
      console.log(result.javascript);
    }
    if (result.python) {
      console.log(result.python);
    }
    if (result.serverJS) {
      console.log(result.serverJS);
    }
    return;
  }

  // Write output files
  const dir = outDir || dirname(filePath);
  mkdirSync(dir, { recursive: true });

  if (result.javascript) {
    // Backend-only apps: name it server.js if it contains Express
    const jsName = (!result.serverJS && result.javascript.includes('express')) ? 'server.js' : `${name}.js`;
    writeFileSync(resolve(dir, jsName), result.javascript);
    console.log(`  Created ${jsName}`);
  }
  if (result.html) {
    // Full-stack apps: use index.html (matches server's sendFile reference)
    const htmlName = result.serverJS ? 'index.html' : `${name}.html`;
    writeFileSync(resolve(dir, htmlName), result.html);
    console.log(`  Created ${htmlName}`);
  }
  if (result.css) {
    writeFileSync(resolve(dir, 'style.css'), result.css);
    console.log(`  Created style.css`);
  }
  if (result.python) {
    writeFileSync(resolve(dir, `${name}.py`), result.python);
    console.log(`  Created ${name}.py`);
  }
  if (result.serverJS) {
    writeFileSync(resolve(dir, 'server.js'), result.serverJS);
    console.log(`  Created server.js`);
  }
  if (result.tests) {
    writeFileSync(resolve(dir, 'test.js'), result.tests);
    console.log(`  Created test.js (E2E tests)`);
  }

  // Copy runtime files for backend builds
  if ((result.javascript && result.javascript.includes("require('./clear-runtime/")) ||
      (result.serverJS && result.serverJS.includes("require('./clear-runtime/"))) {
    const runtimeDir = resolve(dir, 'clear-runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const runtimeSrc = resolve(dirname(new URL(import.meta.url).pathname), '..', 'clear', 'runtime');
    const runtimeFiles = ['db.js', 'auth.js', 'rateLimit.js'];
    for (const f of runtimeFiles) {
      const src = resolve(runtimeSrc, f);
      if (existsSync(src)) {
        copyFileSync(src, resolve(runtimeDir, f));
      }
    }
    console.log(`  Copied runtime files to clear-runtime/`);
  }
}

function testCommand(args) {
  const file = args[0];
  if (!file) {
    console.error('Usage: clear test <file.clear>');
    process.exit(1);
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  const ast = parse(source);

  // Find all TEST_DEF nodes
  const tests = [];
  function findTests(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.TEST_DEF) {
        tests.push(node);
      }
      if (node.body) findTests(node.body);
    }
  }
  findTests(ast.body);

  if (tests.length === 0) {
    console.log('No test blocks found.');
    process.exit(0);
  }

  // Compile the whole file
  const result = compileProgram(source, { target: 'web' });
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`  Line ${err.line}: ${err.message}`);
    }
    process.exit(1);
  }

  // Inject test/expect runner, compile, execute
  const runner = [
    'let _passed = 0, _failed = 0;',
    'function test(name, fn) {',
    '  try { fn(); _passed++; console.log("  PASS: " + name); }',
    '  catch(e) { _failed++; console.log("  FAIL: " + name + " -- " + e.message); }',
    '}',
    'function expect(val) {',
    '  return { toBeTruthy() { if (!val) throw new Error("Expected truthy, got " + val); } };',
    '}',
    result.javascript,
    'console.log("");',
    'console.log(_passed + " passed, " + _failed + " failed");',
    'if (_failed > 0) process.exit(1);',
  ].join('\n');

  try {
    const fn = new Function(runner);
    fn();
  } catch (e) {
    console.error(`  Runtime error: ${e.message}`);
    process.exit(1);
  }
}


function runCommand(args) {
  const file = args[0];
  if (!file) {
    console.error('Usage: clear run <file.clear>');
    process.exit(1);
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  const result = compileProgram(source, { target: 'web' });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`  Line ${err.line}: ${err.message}`);
    }
    process.exit(1);
  }

  if (result.javascript) {
    // Execute the compiled JS directly
    try {
      const fn = new Function(result.javascript);
      fn();
    } catch (e) {
      console.error(`Runtime error: ${e.message}`);
      process.exit(1);
    }
  }
}

function initCommand(args) {
  const dir = args[0] || '.';
  const targetDir = resolve(dir);
  mkdirSync(targetDir, { recursive: true });

  const mainClear = `# My Clear App
# Edit this file and run: clear build main.clear

target: web

page 'My App':
  'Name' as text input
  greeting = 'Hello, ' + name
  display greeting
`;

  writeFileSync(resolve(targetDir, 'main.clear'), mainClear);
  console.log(`Created ${resolve(targetDir, 'main.clear')}`);
}

function devCommand(args) {
  const file = args[0];
  if (!file) {
    console.error('Usage: clear dev <file.clear>');
    process.exit(1);
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  console.log(`Watching ${file} for changes...`);

  // Initial build
  buildCommand([file, '--stdout']);

  // Watch for changes
  let debounce = null;
  watch(filePath, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log(`\nRebuilding ${file}...`);
      try {
        buildCommand([file, '--stdout']);
      } catch (e) {
        console.error(e.message);
      }
    }, 200);
  });
}

function packageCommand(args) {
  const file = args[0];
  if (!file) {
    console.error('Usage: clear package <file.clear> [--out <dir>]');
    process.exit(1);
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  const result = compileProgram(source, { sourceMap: true });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`  Line ${err.line}: ${err.message}`);
    }
    process.exit(1);
  }

  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? resolve(args[outIdx + 1]) : resolve(dirname(filePath), 'deploy');
  mkdirSync(outDir, { recursive: true });

  // Write compiled server
  const serverCode = result.serverJS || result.javascript;
  writeFileSync(resolve(outDir, 'server.js'), serverCode);
  console.log('  Created server.js');

  // Write HTML if it exists
  if (result.html) {
    writeFileSync(resolve(outDir, 'index.html'), result.html);
    console.log('  Created index.html');
  }

  // Copy runtime files
  const runtimeDir = resolve(outDir, 'clear-runtime');
  mkdirSync(runtimeDir, { recursive: true });
  const runtimeSrc = resolve(dirname(new URL(import.meta.url).pathname), '..', 'clear', 'runtime');
  for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
    const src = resolve(runtimeSrc, f);
    if (existsSync(src)) copyFileSync(src, resolve(runtimeDir, f));
  }
  console.log('  Copied runtime files');

  // Generate package.json
  const appName = basename(file, extname(file)).replace(/[^a-z0-9-]/g, '-');
  const pkg = {
    name: `clear-${appName}`,
    version: '1.0.0',
    description: `Built with Clear language`,
    main: 'server.js',
    scripts: { start: 'node server.js' },
    dependencies: { express: '^4.18.0' },
  };
  writeFileSync(resolve(outDir, 'package.json'), JSON.stringify(pkg, null, 2));
  console.log('  Created package.json');

  // Generate Dockerfile
  const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]`;
  writeFileSync(resolve(outDir, 'Dockerfile'), dockerfile);
  console.log('  Created Dockerfile');

  // Generate .dockerignore
  writeFileSync(resolve(outDir, '.dockerignore'), 'node_modules\nclear-data.json\n');
  console.log('  Created .dockerignore');

  console.log(`\n  Package ready in ${outDir}/`);
  console.log('  To run:   cd ' + outDir + ' && npm install && npm start');
  console.log('  To deploy: docker build -t ' + appName + ' . && docker run -p 3000:3000 ' + appName);
}

function helpCommand() {
  console.log(`
Clear CLI — Build, test, run, and deploy Clear programs

Usage: clear <command> [file] [options]

Commands:
  build <file>    Compile a .clear file to JS/Python/HTML
                  --stdout     Print output instead of writing files
                  --out <dir>  Write output to directory
                  --target <t> Override target (web, backend, both)

  test <file>     Run test blocks in a .clear file

  run <file>      Compile and execute a .clear file

  init [dir]      Scaffold a new Clear project (default: current directory)

  dev <file>      Watch a .clear file and rebuild on changes

  help            Show this help message
`);
}

// =============================================================================
// MAIN
// =============================================================================

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

switch (command) {
  case 'build':
    buildCommand(commandArgs);
    break;
  case 'test':
    testCommand(commandArgs);
    break;
  case 'run':
    runCommand(commandArgs);
    break;
  case 'init':
    initCommand(commandArgs);
    break;
  case 'dev':
    devCommand(commandArgs);
    break;
  case 'package':
  case 'deploy':
    packageCommand(commandArgs);
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    helpCommand();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    helpCommand();
    process.exit(1);
}
