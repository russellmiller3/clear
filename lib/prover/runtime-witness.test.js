// =============================================================================
// Runtime witness test for the prover (wired 2026-05-02 evening, Russell's
// "if the prover says PROVED how do we know it's telling the truth" question).
//
// PURPOSE
//   The prover's "structural proof" verdict for field-referencing rules
//   says PROVED on the basis that the compiler correctly emits the runtime
//   guard. That's a trust delegation: the prover believes the compiler.
//   This file is the check that holds the compiler to its promise.
//
//   For each "PROVED" rule shape:
//     1. Compile the source via compileProgram() with the javascript backend
//     2. Write the compiled server JS to a tempfile next to the runtime
//        helpers it imports (with a .cjs extension so node treats it as
//        CommonJS regardless of the repo's `"type": "module"`)
//     3. Spawn `node tempfile.cjs` on a free port; wait for the listening line
//     4. Send N (default 20) inputs that VIOLATE the rule's condition
//     5. Assert every single one comes back as a 403 rejection with the
//        rule's name in the JSON body
//     6. Tear down the server and delete the tempfile
//
//   If even one violating input slips through with success, the prover
//   was lying — the compiler didn't emit the guard correctly OR the
//   structural-proof reframe is wrong for this rule shape. Either way,
//   the test fails loud and the next session knows where to dig.
//
//   This converts "PROVED for every possible deal" from a math claim
//   into a measured claim: "we sent 20 deals that violate this rule;
//   all 20 were rejected at runtime; the rule's name appeared in every
//   rejection." A regulated-tier buyer can verify this themselves.
//
// WHY TOP-LEVEL AWAIT INSTEAD OF `it()`
//   testUtils.it() is synchronous — it calls the test function but does
//   NOT await the returned promise. Async tests fire-and-forget and ALL
//   print ✅ regardless of whether they actually pass. Spawn / fetch tests
//   have to be written outside the describe-it harness so they actually
//   wait for completion before the process exits. The sync sanity check
//   stays inside describe/it; the async work runs as top-level await.
// =============================================================================

import { describe, it, expect, describeAsync, itAsync } from '../testUtils.js';
import { compileProgram } from '../../index.js';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
// Repo root — one level above lib/prover. The compiled JS imports
// `./clear-runtime/db` relative to its own location, so the tempfile
// must live next to a `clear-runtime/` directory.
const REPO_ROOT = join(__dirname, '..', '..');

// `clear-runtime/` at repo root is gitignored — it's a build artifact, not
// a source dir. Bootstrap the two files we need from the canonical
// `runtime/` source so the harness works on a fresh clone too. Idempotent:
// skips copying when the files already exist (which they will on any
// machine that's run a build before).
//
// `clear-runtime/package.json` declares CommonJS so the runtime helpers
// (`db.js` etc., which use `require()`) load correctly inside this repo's
// ESM scope. Per the existing learnings rule on ESM/CJS scope assertions
// in mixed Node projects.
function ensureClearRuntime() {
  const dir = join(REPO_ROOT, 'clear-runtime');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) {
    writeFileSync(pkgPath, '{\n  "type": "commonjs"\n}\n');
  }
  const dbPath = join(dir, 'db.js');
  if (!existsSync(dbPath)) {
    copyFileSync(join(REPO_ROOT, 'runtime', 'db.js'), dbPath);
  }
}
ensureClearRuntime();

// Each case: rule that the prover says PROVED + a generator that produces
// inputs which VIOLATE the rule. The runtime witness should reject every
// generated input.
const CASES = [
  {
    name: 'discount-cap-thirty',
    src: `
build for javascript backend

when user sends deal to /api/deals:
  rule discount-cap-thirty:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`,
    route: '/api/deals',
    // discount_percent >= 30 — every input violates.
    violatingInputs: () => Array.from({ length: 20 }, (_, i) => ({
      discount_percent: 30 + i,
      list_price: 1000,
    })),
    expectRuleName: 'discount-cap-thirty',
  },
  {
    name: 'price-floor-positive',
    src: `
build for javascript backend

when user sends deal to /api/deals:
  rule price-floor-positive:
    enforce that deal's list_price is greater than 0, or fail with error message: 'must be positive'
  send back 'ok'
`,
    route: '/api/deals',
    // list_price <= 0 — every input violates.
    violatingInputs: () => Array.from({ length: 20 }, (_, i) => ({
      discount_percent: 10,
      list_price: -i,
    })),
    expectRuleName: 'price-floor-positive',
  },
  {
    name: 'cross-field-comparison',
    src: `
build for javascript backend

when user sends deal to /api/deals:
  rule cross-field-comparison:
    enforce that deal's discount_percent is less than deal's list_price, or fail with error message: 'discount cannot exceed price'
  send back 'ok'
`,
    route: '/api/deals',
    // discount >= price — every input violates.
    violatingInputs: () => Array.from({ length: 20 }, (_, i) => ({
      discount_percent: 100 + i,
      list_price: 50,
    })),
    expectRuleName: 'cross-field-comparison',
  },
];

// Find a free TCP port the OS isn't using right now. Open a listener on
// port 0 (OS picks), read the assigned port, close the listener, hand the
// port to the spawned server. There's a tiny race between close and
// re-listen; in practice the OS doesn't recycle the port that fast and
// we've never seen a collision in this harness.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

// Spawn the compiled server, wait for it to print its "Server running on
// port N" line, then resolve with { proc, cleanup }. cleanup kills the
// server and deletes the tempfile.
async function startCompiledServer(serverJS, port) {
  // .cjs extension is load-bearing: the compiled JS uses CommonJS
  // (require / module.exports), and the repo's package.json declares
  // `"type": "module"`, so a .js extension would have node try to load
  // it as ESM and fail with "require is not defined." Renaming forces
  // CommonJS regardless of the parent scope.
  const tempPath = join(REPO_ROOT, `_runtime-witness-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.cjs`);
  writeFileSync(tempPath, serverJS, 'utf8');
  const proc = spawn(process.execPath, [tempPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  proc.stdout.on('data', d => { stdoutBuf += d.toString(); });
  proc.stderr.on('data', d => { stderrBuf += d.toString(); });

  // Wait until the server prints its listening line, OR fails. 5s ceiling
  // — the compiled apps have no DB connect or external I/O at boot, so 5s
  // is generous. If it ever blows past that the spawn / require failed.
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 5000);
    const check = () => {
      if (stdoutBuf.includes(`Server running on port ${port}`)) {
        clearTimeout(timer);
        resolve({ ok: true });
      }
    };
    proc.stdout.on('data', check);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: `process exited with code ${code}`, stdout: stdoutBuf, stderr: stderrBuf });
    });
    check();
  });

  const cleanup = () => {
    try { proc.kill('SIGTERM'); } catch {}
    try { unlinkSync(tempPath); } catch {}
  };

  if (!ready.ok) {
    cleanup();
    throw new Error(`server failed to boot: ${ready.reason}\nstdout: ${ready.stdout || stdoutBuf}\nstderr: ${ready.stderr || stderrBuf}`);
  }

  return { proc, cleanup, port };
}

async function runWitnessCase(c) {
  const compiled = compileProgram(c.src);
  if (compiled.errors && compiled.errors.length > 0) {
    throw new Error(`compile errors for ${c.name}: ${JSON.stringify(compiled.errors)}`);
  }
  // Sanity that the compiler emit attached the rule name to the
  // rejection JSON. Without this, the runtime witness would pass on
  // status code alone and miss the audit-trail story.
  if (!compiled.javascript || !compiled.javascript.includes(`rule: "${c.expectRuleName}"`)) {
    throw new Error(`compiler did not emit rule name for ${c.name} — searched for 'rule: "${c.expectRuleName}"' in compiled JS`);
  }

  const port = await findFreePort();
  const server = await startCompiledServer(compiled.javascript, port);
  try {
    const inputs = c.violatingInputs();
    const failures = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const r = await fetch(`http://127.0.0.1:${port}${c.route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      let body;
      try { body = await r.json(); } catch { body = null; }
      const okStatus = r.status === 403 || r.status === 400;
      const okRule = body && body.rule === c.expectRuleName;
      if (!okStatus || !okRule) {
        failures.push({ i, input, status: r.status, body });
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${c.name}: ${failures.length} of ${inputs.length} violating inputs were NOT rejected with the rule name. ` +
        `Sample failure: ${JSON.stringify(failures[0])}. ` +
        `If 0 inputs rejected with the rule name, the compiler likely failed to attach the rule name to the rejection JSON. ` +
        `If some rejected and some didn't, the guard expression is wrong or the rule body has unexpected control flow.`
      );
    }
  } finally {
    server.cleanup();
  }
}

// Sync sanity check stays inside the standard describe/it harness — it
// runs before the async work and surfaces in the normal pass/fail count.
describe('lib/prover — runtime witness (sync sanity)', () => {
  it('eval design covers the trust-gap classes', () => {
    // Harness must include single-field-bound + cross-field cases.
    // These cover the highest-risk compiler-emit shapes.
    expect(CASES.some(c => c.name === 'discount-cap-thirty')).toBe(true);
    expect(CASES.some(c => c.name === 'cross-field-comparison')).toBe(true);
  });
});

// Async work — describeAsync awaits its body, itAsync awaits its callback.
// Each itAsync() inside the describeAsync body is awaited sequentially, so
// the pass/fail count is correct by the time describeAsync resolves. This
// is the canonical pattern for spawn / fetch / sleep tests; the standard
// describe/it harness can't safely run them because it() is sync.
await describeAsync('lib/prover — runtime witness (every PROVED rule actually rejects bad inputs)', async () => {
  for (const c of CASES) {
    await itAsync(`${c.name}: 20 violating inputs all rejected with rule name in error`, async () => {
      await runWitnessCase(c);
    });
  }
});
