# Plan: Studio Test Runner Pane

**Branch:** `feature/studio-test-runner`
**Date:** 2026-04-13
**Scope:** Large (new tab pane + API endpoint + Meph tool + UI)

---

## 🎯 What We're Building

A "Tests" tab in Studio's preview pane that lets both humans and Meph run tests and see structured results. Two test types:

1. **Compiler tests** — `node clear.test.js` (1827 tests, validates the compiler itself)
2. **App tests** — `node cli/clear.js test <tempfile>` (runs `test` blocks in the current .clear source)

The pane shows pass/fail per test, error messages for failures, a summary bar, and timing. Meph gets a `run_tests` tool to trigger tests programmatically.

```
┌─────────────────────────────────────────────────┐
│ Preview │ Code │ Data │ API │ Terminal │ Tests   │
├─────────────────────────────────────────────────┤
│  [Run App Tests ▶]  [Run Compiler Tests ▶]      │
│                                                 │
│  ── App Tests (12 passed, 1 failed) — 0.8s ──  │
│  ✓ POST /api/todos creates a todo               │
│  ✓ GET /api/todos returns all                    │
│  ✗ DELETE /api/todos/:id requires auth           │
│    └ Expected 401, got 200                       │
│                                                 │
│  ── Compiler (1827 passed, 0 failed) — 3.1s ── │
│  ✓ ASSIGN: basic number assignment  [+1826 more]│
└─────────────────────────────────────────────────┘
```

---

## 📐 Key Design Decisions

1. **Two buttons, not one.** Compiler tests take ~3s and validate the language. App tests take <1s and validate user code. They serve different purposes and run independently.

2. **Plain HTTP POST, not SSE streaming.** The existing SSE `send()` is scoped per-request inside `/api/chat` — there's no global SSE broadcast mechanism. Adding one would be over-engineering for test results that complete in <5s. Instead: `/api/run-tests` is a normal POST that spawns the test process, waits for it, parses output, and returns JSON. The IDE shows a spinner while waiting. This is simple, reliable, and matches how `/api/exec` already works.

3. **Tests tab always visible.** Not conditional like Data/API tabs. Testing is a first-class Studio feature.

4. **IDE sends source with the request.** The server's `currentSource` is scoped inside `/api/chat`. Rather than add server-level state, the IDE sends the editor content in the POST body for app tests. Clean and stateless.

5. **Two output format parsers.** `clear.test.js` uses `✅`/`❌` emoji prefixes. `clear test` uses `  PASS: name` / `  FAIL: name -- error`. Both need dedicated regex parsing.

6. **Meph gets `run_tests` tool.** When Meph calls it, the tool runs tests synchronously and returns structured JSON. It also emits SSE events (`switch_tab`, `terminal_append`) to the IDE via the existing per-chat `send()` — which IS available inside the Meph tool handler.

7. **Compiler test results are collapsed by default.** 1827 lines of "PASS" is useless. Show summary + failures only. User can expand to see all.

---

## 📁 Files Involved

| File | What Changes |
|------|-------------|
| `playground/server.js` | Add `/api/run-tests` POST endpoint, add `run_tests` Meph tool, test output parsing helper |
| `playground/ide.html` | Add Tests tab button, CSS, `showTests()`, `runTests()`, test result rendering, SSE handler for Meph-triggered tests |
| `playground/server.test.js` | Add tests for `/api/run-tests` endpoint |

No new files.

---

## 🏗️ Data Flow

### User clicks button (HTTP path):
```
User clicks "Run App Tests"
       │
       ▼
POST /api/run-tests { type: 'app', source: '<editor content>' }
       │
       ▼
Server writes source to temp .clear file
Spawns: node cli/clear.js test <temp>
Waits for exit, captures stdout/stderr
Parses PASS/FAIL lines into structured results
Deletes temp file
       │
       ▼
Returns JSON: { ok, passed, failed, results: [{name, status, error?}], duration }
       │
       ▼
IDE stores results in testResults.app, re-renders Tests pane
```

### Meph calls tool (SSE path):
```
Meph calls run_tests { type: 'app' }
       │
       ▼
Tool handler in /api/chat switch runs same logic
Uses currentSource (already in scope within chat handler)
Returns structured JSON to Meph
Also emits: send({ type: 'switch_tab', tab: 'tests' })
Also emits: send({ type: 'test_results', results: {...} })
       │
       ▼
IDE receives SSE events, stores results, re-renders Tests pane
```

---

## 🚨 Edge Cases

| Scenario | How We Handle It |
|----------|-----------------|
| No .clear source loaded | Return `{ ok: false, error: 'No source code. Load or write a .clear file first.' }` — button shows error in pane |
| No test blocks in source | Return `{ ok: true, passed: 0, failed: 0, results: [], message: 'No test blocks found.' }` |
| Source has compile errors | Return `{ ok: false, error: 'Compile errors', errors: [...] }` — show in pane |
| Test process crashes / timeout | `execSync` with 30s timeout, catch error, return `{ ok: false, error: 'Tests timed out after 30s' }` |
| Tests already running | Disable buttons while fetch is pending, re-enable on response |
| Double-click Run button | Disabled state prevents double submission |
| Compiler test output (1827 lines) | Parse all, but render collapsed — show summary + failures + "[+N passed]" expander |
| Meph runs tests while user on different tab | SSE event stores results + switches tab |

---

## 📋 Implementation Phases

### Phase 1: Server endpoint + test output parser (server.js)

**Read first:** `playground/server.js` lines 0-10 (imports), 114-148 (exec section), 380-510 (TOOLS array), 640-670 (run_command handler), 1090-1150 (tool SSE events)

**Step 1a: Add test output parser helper** (insert after the `ALLOWED_PREFIXES` block, around line 119)

```js
// =============================================================================
// TEST RUNNER — parse test output into structured results
// =============================================================================
function parseTestOutput(stdout, stderr, type) {
  const results = [];
  const lines = (stdout || '').split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (type === 'compiler') {
      // clear.test.js format: "✅ test name" or "❌ test name\n   error message"
      if (trimmed.startsWith('✅')) {
        results.push({ name: trimmed.slice(2).trim(), status: 'pass' });
      } else if (trimmed.startsWith('❌')) {
        results.push({ name: trimmed.slice(2).trim(), status: 'fail', error: '' });
      } else if (trimmed.startsWith('📦')) {
        // describe block header — skip
      } else if (results.length > 0 && results[results.length - 1].status === 'fail' && !results[results.length - 1].error) {
        // Error detail line following a ❌ line
        results[results.length - 1].error = trimmed;
      }
    } else {
      // clear test format: "  PASS: test name" or "  FAIL: test name -- error"
      const passMatch = trimmed.match(/^PASS:\s*(.+)/);
      const failMatch = trimmed.match(/^FAIL:\s*(.+?)(?:\s*--\s*(.+))?$/);
      if (passMatch) {
        results.push({ name: passMatch[1], status: 'pass' });
      } else if (failMatch) {
        results.push({ name: failMatch[1], status: 'fail', error: failMatch[2] || '' });
      }
    }
  }
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  return { passed, failed, results };
}

function runTestProcess(type, source) {
  const { execSync } = require('child_process');
  const start = Date.now();
  
  if (type === 'compiler') {
    try {
      const stdout = execSync('node clear.test.js', { cwd: ROOT_DIR, encoding: 'utf8', timeout: 60000 });
      const parsed = parseTestOutput(stdout, '', 'compiler');
      return { ok: true, ...parsed, duration: Date.now() - start };
    } catch (err) {
      const parsed = parseTestOutput(err.stdout || '', err.stderr || '', 'compiler');
      return { ok: parsed.failed === 0, ...parsed, duration: Date.now() - start, stderr: err.stderr || '' };
    }
  }
  
  if (type === 'app') {
    if (!source || !source.trim()) {
      return { ok: false, error: 'No source code. Load or write a .clear file first.' };
    }
    // Write source to temp file
    const tmpPath = join(BUILD_DIR, '_test-source.clear');
    mkdirSync(BUILD_DIR, { recursive: true });
    writeFileSync(tmpPath, source);
    try {
      const stdout = execSync(`node cli/clear.js test "${tmpPath}"`, { cwd: ROOT_DIR, encoding: 'utf8', timeout: 30000 });
      const parsed = parseTestOutput(stdout, '', 'app');
      return { ok: true, ...parsed, duration: Date.now() - start };
    } catch (err) {
      // Exit code 4 = test failures (not crash)
      if (err.status === 4) {
        const parsed = parseTestOutput(err.stdout || '', '', 'app');
        return { ok: false, ...parsed, duration: Date.now() - start };
      }
      // Exit code 1 = compile error
      if (err.status === 1) {
        try {
          const errData = JSON.parse(err.stdout);
          return { ok: false, error: 'Compile errors', errors: errData.errors || [], duration: Date.now() - start };
        } catch {
          return { ok: false, error: err.stdout || err.stderr || err.message, duration: Date.now() - start };
        }
      }
      return { ok: false, error: err.stderr || err.message || 'Test runner failed', duration: Date.now() - start };
    } finally {
      try { unlinkSync(tmpPath); } catch {}
    }
  }
  
  return { ok: false, error: `Unknown test type: ${type}. Use 'app' or 'compiler'.` };
}
```

**Step 1b: Add `/api/run-tests` POST endpoint** (insert after `/api/terminal-log` around line 175)

```js
app.post('/api/run-tests', (req, res) => {
  const { type, source } = req.body;
  if (!type || !['app', 'compiler'].includes(type)) {
    return res.status(400).json({ ok: false, error: "type must be 'app' or 'compiler'" });
  }
  const result = runTestProcess(type, source);
  res.json(result);
});
```

**Step 1c: Add `run_tests` to TOOLS array** (insert after `highlight_code` tool, around line 504)

```js
{
  name: 'run_tests',
  description: 'Run tests and see results. type="app" runs test blocks in the current Clear source code. type="compiler" runs all compiler tests (1827 tests). Returns pass/fail counts and failure details.',
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['app', 'compiler'], description: 'Which tests to run' },
    },
    required: ['type'],
  },
},
```

**Step 1d: Add `run_tests` handler in tool switch** (insert after `highlight_code` case, around line 860)

```js
case 'run_tests': {
  const result = runTestProcess(input.type, currentSource);
  // Tell IDE to switch to tests tab and show results
  send({ type: 'switch_tab', tab: 'tests' });
  send({ type: 'test_results', testType: input.type, ...result });
  const summary = result.error 
    ? `Tests error: ${result.error}`
    : `${result.passed} passed, ${result.failed} failed (${result.duration}ms)`;
  return JSON.stringify(result);
}
```

**Step 1e: Add tool summary and auto-switch** (in the toolSummary switch around line 1113, and auto-switch block around line 1133)

```js
// In toolSummary switch:
case 'run_tests': return `Running ${input.type} tests...`;

// In auto-switch block:
if (tb.name === 'run_tests') {
  send({ type: 'switch_tab', tab: 'tests' });
}
```

**Note:** `runTestProcess` uses `execSync` which blocks. For compiler tests (~3s), this blocks the server. This is acceptable because: (a) Studio is single-user, (b) the chat SSE stream is already open so the client won't timeout, (c) switching to `spawn` + async would add complexity for marginal benefit. If it ever becomes a problem, refactor to spawn + Promise.

**Test gate:** `node playground/server.test.js` passes with new tests added.

---

### Phase 2: Tests tab UI (ide.html)

**Read first:** `playground/ide.html` lines 116-150 (CSS), 400-425 (tab buttons), 1313-1388 (terminal functions), 1379-1388 (showTab), 2479-2500 (SSE handlers)

**Step 2a: Add CSS** (insert after `.term-tool-ok` styles, around line 141)

```css
/* Tests tab */
#tests-panel { height: 100%; overflow: auto; padding: 16px; font-family: var(--mono); font-size: 12px; line-height: 1.7; color: var(--tx2); display: flex; flex-direction: column; gap: 12px; }
.test-toolbar { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--bd); flex-shrink: 0; }
.test-btn { padding: 6px 14px; font-size: 12px; font-family: var(--font); font-weight: 500; border: 1px solid var(--bd); border-radius: 6px; background: var(--bg2); color: var(--tx2); cursor: pointer; transition: all .15s; display: flex; align-items: center; gap: 6px; }
.test-btn:hover { background: var(--bg3); color: var(--tx); border-color: var(--accent); }
.test-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.test-btn:disabled:hover { background: var(--bg2); color: var(--tx2); border-color: var(--bd); }
.test-section { border: 1px solid var(--bd); border-radius: 8px; overflow: hidden; }
.test-section-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg2); font-weight: 500; font-size: 12px; cursor: pointer; user-select: none; }
.test-section-header:hover { background: var(--bg3); }
.test-section-body { max-height: 400px; overflow: auto; }
.test-pass { display: flex; align-items: baseline; gap: 6px; padding: 3px 12px; color: var(--green); }
.test-pass::before { content: '✓'; font-weight: 700; }
.test-fail { padding: 3px 12px; color: var(--red); }
.test-fail-name { display: flex; align-items: baseline; gap: 6px; }
.test-fail-name::before { content: '✗'; font-weight: 700; }
.test-fail-error { padding: 2px 12px 2px 24px; font-size: 11px; color: var(--red); opacity: 0.8; background: color-mix(in oklch, var(--red) 6%, transparent); border-radius: 4px; margin: 2px 12px 4px 18px; }
.test-summary { font-size: 11px; color: var(--tx3); }
.test-summary .pass-count { color: var(--green); font-weight: 600; }
.test-summary .fail-count { color: var(--red); font-weight: 600; }
.test-empty { color: var(--tx3); font-size: 12px; text-align: center; padding: 40px 20px; }
.test-error-banner { padding: 8px 12px; background: color-mix(in oklch, var(--red) 10%, transparent); border: 1px solid var(--red); border-radius: 6px; color: var(--red); font-size: 12px; white-space: pre-wrap; }
.test-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--bd); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

**Step 2b: Add Tests tab button** (in `#preview-tabs`, line 415 — insert BEFORE the "Clear Terminal" button)

```html
<button class="prev-tab" onclick="showTab('tests')">Tests</button>
```

**Step 2c: Add JavaScript** (insert after the `showTab` function block, around line 1388)

```js
// ==========================================================================
// TESTS TAB — run and display compiler + app test results
// ==========================================================================
let testResults = { app: null, compiler: null };
let testRunning = { app: false, compiler: false };

function showTests() {
  const el = document.getElementById('preview-content');
  const parts = ['<div id="tests-panel">'];
  
  // Toolbar
  parts.push('<div class="test-toolbar">');
  parts.push(`<button class="test-btn" onclick="runTests('app')" ${testRunning.app ? 'disabled' : ''}>
    ${testRunning.app ? '<span class="test-spinner"></span> Running...' : '▶ Run App Tests'}
  </button>`);
  parts.push(`<button class="test-btn" onclick="runTests('compiler')" ${testRunning.compiler ? 'disabled' : ''}>
    ${testRunning.compiler ? '<span class="test-spinner"></span> Running...' : '▶ Run Compiler Tests'}
  </button>`);
  parts.push('</div>');
  
  // Results sections
  if (!testResults.app && !testResults.compiler) {
    parts.push('<div class="test-empty">No test results yet. Click a button above to run tests.</div>');
  }
  
  if (testResults.app) parts.push(renderTestSection('App Tests', testResults.app, 'app'));
  if (testResults.compiler) parts.push(renderTestSection('Compiler Tests', testResults.compiler, 'compiler'));
  
  parts.push('</div>');
  el.innerHTML = parts.join('');
}

function renderTestSection(title, data, type) {
  if (data.error && !data.results) {
    return `<div class="test-section">
      <div class="test-section-header">${escHtml(title)}<span class="test-summary">${data.duration ? data.duration + 'ms' : ''}</span></div>
      <div class="test-error-banner">${escHtml(data.error)}${data.errors ? '\n' + data.errors.map(e => escHtml(e.message || e)).join('\n') : ''}</div>
    </div>`;
  }
  
  const passed = data.passed || 0;
  const failed = data.failed || 0;
  const duration = data.duration ? (data.duration / 1000).toFixed(1) + 's' : '';
  const results = data.results || [];
  const failures = results.filter(r => r.status === 'fail');
  const passes = results.filter(r => r.status === 'pass');
  
  // For compiler tests, collapse passes by default (too many)
  const showAllPasses = type !== 'compiler' || passes.length <= 20;
  const sectionId = 'test-section-' + type;
  
  let body = '';
  // Show failures first (always expanded)
  for (const r of failures) {
    body += `<div class="test-fail"><div class="test-fail-name">${escHtml(r.name)}</div>`;
    if (r.error) body += `<div class="test-fail-error">${escHtml(r.error)}</div>`;
    body += '</div>';
  }
  // Show passes
  if (showAllPasses) {
    for (const r of passes) {
      body += `<div class="test-pass">${escHtml(r.name)}</div>`;
    }
  } else if (passes.length > 0) {
    // Show first 5 + expander
    for (const r of passes.slice(0, 5)) {
      body += `<div class="test-pass">${escHtml(r.name)}</div>`;
    }
    body += `<div class="test-pass" style="color:var(--tx3);cursor:pointer;" onclick="this.parentElement.querySelectorAll('.test-hidden').forEach(e=>e.style.display='');this.style.display='none';">+ ${passes.length - 5} more passed tests (click to expand)</div>`;
    for (const r of passes.slice(5)) {
      body += `<div class="test-pass test-hidden" style="display:none;">${escHtml(r.name)}</div>`;
    }
  }
  
  if (results.length === 0 && !data.error) {
    body = '<div class="test-empty" style="padding:12px;">No test blocks found. Add <code>test \'name\':</code> blocks to your Clear code.</div>';
  }
  
  const summaryHtml = `<span class="test-summary"><span class="pass-count">${passed} passed</span>, <span class="fail-count">${failed} failed</span>${duration ? ' — ' + duration : ''}</span>`;
  
  return `<div class="test-section">
    <div class="test-section-header">${escHtml(title)} ${summaryHtml}</div>
    <div class="test-section-body" id="${sectionId}">${body}</div>
  </div>`;
}

async function runTests(type) {
  testRunning[type] = true;
  if (activeTab === 'tests') showTests(); // Re-render with spinner
  
  try {
    const body = { type };
    if (type === 'app') {
      body.source = editor.state.doc.toString();
    }
    const resp = await fetch('/api/run-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    testResults[type] = data;
  } catch (err) {
    testResults[type] = { ok: false, error: err.message || 'Network error', duration: 0 };
  } finally {
    testRunning[type] = false;
    if (activeTab === 'tests') showTests(); // Re-render with results
  }
}

// Expose for onclick handlers
window.runTests = runTests;
```

**Step 2d: Add to `showTab()` switch** (around line 1387)

Add `else if (tab === 'tests') showTests();` after the `api` case.

**Step 2e: Add SSE handler for Meph-triggered test results** (around line 2489, in the SSE event handler)

```js
} else if (ev.type === 'test_results') {
  testResults[ev.testType] = ev;
  if (activeTab === 'tests') showTests();
```

**Test gate:** `node playground/server.test.js` passes. Visual: open Studio, see Tests tab, click buttons, results render.

---

### Phase 3: Server tests + polish

**Read first:** `playground/server.test.js` (full file)

**Step 3a: Add tests to server.test.js** (append before the cleanup section)

```js
// =============================================================================
// TEST RUNNER ENDPOINT
// =============================================================================
console.log('\n--- Test Runner ---');

// Test: run-tests with missing type
{
  const { status, data } = await post('/api/run-tests', {});
  assert(status === 400 && data.error, 'run-tests rejects missing type');
}

// Test: run-tests with invalid type
{
  const { status, data } = await post('/api/run-tests', { type: 'invalid' });
  assert(status === 400 && data.error, 'run-tests rejects invalid type');
}

// Test: run-tests compiler type returns results
{
  const { data } = await post('/api/run-tests', { type: 'compiler' });
  assert(typeof data.passed === 'number' && data.passed > 0, 'compiler tests return passed count');
  assert(typeof data.failed === 'number', 'compiler tests return failed count');
  assert(typeof data.duration === 'number', 'compiler tests return duration');
  assert(Array.isArray(data.results), 'compiler tests return results array');
}

// Test: run-tests app type with no source
{
  const { data } = await post('/api/run-tests', { type: 'app' });
  assert(data.ok === false && data.error, 'app tests with no source returns error');
}

// Test: run-tests app type with source that has test blocks
{
  const source = `build for web
x = 5
test 'x is five':
  expect x is 5
`;
  const { data } = await post('/api/run-tests', { type: 'app', source });
  assert(typeof data.passed === 'number', 'app tests return passed count');
  assert(typeof data.duration === 'number', 'app tests return duration');
}

// Test: run-tests app type with source that has no test blocks
{
  const source = `build for web
x = 5
`;
  const { data } = await post('/api/run-tests', { type: 'app', source });
  assert(data.passed === 0 && data.failed === 0, 'app tests with no test blocks returns 0/0');
}
```

**Step 3b: Persist test results in localStorage** (in ide.html)

Add to `showTests()` init: load from localStorage. Add to `runTests()` completion: save to localStorage.

```js
// At top, after testResults declaration:
try { testResults = JSON.parse(localStorage.getItem('clear_test_results') || '{}'); } catch { testResults = { app: null, compiler: null }; }

// In runTests(), after testResults[type] = data:
try { localStorage.setItem('clear_test_results', JSON.stringify(testResults)); } catch {}
```

**Test gate:** `node playground/server.test.js` passes with all new tests. `node clear.test.js` still passes (no compiler changes).

---

## ✅ Success Criteria

- [ ] Tests tab visible in Studio preview pane tab bar
- [ ] "Run App Tests" button runs `clear test` on current source, shows structured results
- [ ] "Run Compiler Tests" button runs `node clear.test.js`, shows structured results
- [ ] Results show pass/fail per test with green/red indicators
- [ ] Failure error messages shown inline under failed tests
- [ ] Summary shows total passed/failed/duration
- [ ] Compiler tests collapsed by default (expandable)
- [ ] Buttons disabled while tests are running (spinner shown)
- [ ] Meph can call `run_tests` tool, gets structured JSON back
- [ ] Meph `run_tests` auto-switches IDE to Tests tab via SSE
- [ ] Results persist in localStorage across page reloads
- [ ] All existing tests still pass
- [ ] 6 new server.test.js tests for `/api/run-tests` endpoint
- [ ] Edge cases handled: no source, no test blocks, compile errors, timeouts

---

## 📚 Learnings Hook

After completion: Run `update-learnings` skill to capture any lessons.
