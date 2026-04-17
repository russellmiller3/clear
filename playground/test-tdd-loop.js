/**
 * Integration test: verify Meph follows TDD loop for function building.
 *
 * Task given to Meph: "Build a function that calculates a discount.
 *   Use TDD — write a failing test first, then make it pass."
 *
 * Expected tool sequence:
 *   1. edit_code  (writes test block — no function yet)
 *   2. run_tests  (sees red — test fails because function doesn't exist)
 *   3. edit_code  (writes the function)
 *   4. run_tests  (sees green — test passes)
 *
 * Pass criteria:
 *   - run_tests called at least twice
 *   - First run_tests result contains a failure
 *   - Final run_tests result: passed > 0, failed === 0
 *   - edit_code called before the first run_tests (wrote test first)
 */

import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PORT = 3499;
const TIMEOUT_MS = 120_000; // 2 min — Meph takes a while

// Load API key — search common locations from this file (playground/ dir in worktree)
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadApiKey() {
  // From playground/ dir: go up 1 (worktree root), then 3 more to reach clear/ repo root
  // worktree = ...clear/.claude/worktrees/kind-xxx  →  clear/ is 3 levels above worktree root
  const candidates = [
    join(__dirname, '..', '..', '..', '..', '.env'),    // playground → worktree → worktrees → .claude → clear
    join(__dirname, '..', '.env'),                        // worktree root fallback
    join(__dirname, '..', '..', '.env'),
    join(__dirname, '..', '..', '..', '.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const match = readFileSync(p, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match) { console.log('Found .env at:', p); return match[1].trim(); }
    }
  }
  return process.env.ANTHROPIC_API_KEY || '';
}
const API_KEY = loadApiKey();

const TASK = `Build a Clear function that calculates a discount amount.
Use TDD: write the failing test first, then write the function to make it pass.
The function should be called apply_discount and take a price and a rate (0–1).
Example: apply_discount(100, 0.10) should return 10.
Follow red → green → refactor. Do not write the function before running the test first.`;

const INITIAL_CODE = `build for javascript backend

# workspace — Meph will add function and tests here
`;

function sseRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    });

    const toolCalls = [];   // { name, input, result } in order
    let _inTool = false;   // track whether we're inside a tool call (between tool_start and tool_done)
    let buffer = '';
    const deadline = setTimeout(() => {
      req.destroy();
      resolve({ toolCalls, timedOut: true });
    }, TIMEOUT_MS);

    req.on('response', (res) => {
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep incomplete last part
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const obj = JSON.parse(part.slice(6));
            // Server emits tool_start (not tool_use) + tool_done to bracket each call.
            // Each tool fires tool_start TWICE: once bare (no summary), once with summary.
            // We capture on the first (bare) event by tracking _inTool state.
            if (obj.type === 'tool_start' && obj.name && !_inTool) {
              _inTool = true;
              toolCalls.push({ name: obj.name, input: obj.input || {}, result: null });
            }
            if (obj.type === 'tool_done') {
              _inTool = false;
            }
            if (obj.type === 'test_results') {
              // Attach result to most recent run_tests call
              const last = [...toolCalls].reverse().find(t => t.name === 'run_tests');
              if (last) last.result = obj;
            }
            if (obj.type === 'done') {
              clearTimeout(deadline);
              resolve({ toolCalls, timedOut: false });
            }
          } catch {}
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseTestResult(result) {
  // result is the test_results SSE object: { ok, passed, failed, error, results[] }
  if (result && typeof result === 'object') {
    return {
      ok: result.ok,
      passed: result.passed ?? 0,
      failed: result.failed ?? 0,
      error: result.error || null,
      raw: JSON.stringify(result).slice(0, 300),
    };
  }
  const text = typeof result === 'string' ? result : JSON.stringify(result || '');
  const passMatch = text.match(/"passed"\s*:\s*(\d+)/);
  const failMatch = text.match(/"failed"\s*:\s*(\d+)/);
  return {
    ok: null,
    passed: passMatch ? parseInt(passMatch[1]) : null,
    failed: failMatch ? parseInt(failMatch[1]) : null,
    raw: text.slice(0, 300),
  };
}

async function run() {
  console.log('Sending TDD task to Meph...\n');
  console.log('Task:', TASK);
  console.log('\n--- waiting for Meph (up to 2 min) ---\n');

  if (!API_KEY) {
    console.error('❌ No ANTHROPIC_API_KEY found. Check .env in repo root.');
    process.exit(1);
  }
  console.log('API key loaded:', API_KEY.slice(0, 8) + '...\n');

  const { toolCalls, timedOut } = await sseRequest({
    messages: [{ role: 'user', content: TASK }],
    editorContent: INITIAL_CODE,
    editorErrors: [],
    apiKey: API_KEY,
  });

  if (timedOut) {
    console.log('⚠️  Timed out. Tool calls so far:');
    toolCalls.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
    process.exit(1);
  }

  console.log(`Meph finished. ${toolCalls.length} tool calls total.\n`);
  console.log('Tool sequence:');
  toolCalls.forEach((t, i) => {
    const preview = t.name === 'run_tests'
      ? `  → ${JSON.stringify(t.result || '').slice(0, 120)}`
      : t.name === 'edit_code'
      ? `  → action=${t.input?.action}, ${(t.input?.code || '').length} chars`
      : '';
    console.log(`  ${i + 1}. ${t.name}${preview}`);
  });

  // ── Assertions ──────────────────────────────────────────────────────────────
  const results = [];
  function assert(label, ok, detail = '') {
    results.push({ label, ok, detail });
    console.log(`\n${ok ? '✅' : '❌'} ${label}${detail ? ': ' + detail : ''}`);
  }

  const editCalls = toolCalls.filter(t => t.name === 'edit_code');
  const testCalls = toolCalls.filter(t => t.name === 'run_tests');

  assert(
    'edit_code called at least once (Meph wrote something)',
    editCalls.length >= 1,
    `edit_code count: ${editCalls.length}`
  );

  assert(
    'run_tests called at least twice (red then green)',
    testCalls.length >= 2,
    `run_tests count: ${testCalls.length}`
  );

  // First edit must come BEFORE first run_tests (test-first rule)
  const firstEditIdx = toolCalls.findIndex(t => t.name === 'edit_code');
  const firstTestIdx = toolCalls.findIndex(t => t.name === 'run_tests');
  assert(
    'edit_code comes before first run_tests (wrote test before running)',
    firstEditIdx < firstTestIdx,
    `edit_code at step ${firstEditIdx + 1}, run_tests at step ${firstTestIdx + 1}`
  );

  // First run_tests should show failure (red) — either assertion failures OR a compile error
  // (compile error = function referenced before definition = legit red step)
  if (testCalls.length >= 1) {
    const first = parseTestResult(testCalls[0].result);
    const isRed = first.ok === false || first.failed > 0 || !!first.error;
    assert(
      'First run_tests shows a failure or error (red step)',
      isRed,
      `ok=${first.ok} passed=${first.passed} failed=${first.failed} error=${first.error?.slice(0,60)}`
    );
  }

  // Last run_tests should show ok:true (green) — compile errors resolved, tests pass
  if (testCalls.length >= 2) {
    const last = parseTestResult(testCalls[testCalls.length - 1].result);
    assert(
      'Final run_tests shows ok:true (green step)',
      last.ok === true,
      `ok=${last.ok} passed=${last.passed} failed=${last.failed}`
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`TDD loop check: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
