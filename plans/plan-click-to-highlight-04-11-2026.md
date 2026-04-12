# Plan: Click-to-Highlight Source Mapping

**Branch:** `feature/click-to-highlight`
**Date:** 2026-04-11

---

## 🎯 THE PROBLEM

Clear compiles to JS/Python/HTML, but there's no way to see which compiled lines came from which Clear line. The `// clear:N` markers exist in compiled output, and the compile animation already parses them — but the mapping is discarded after the animation ends. Users and Meph have no interactive way to trace Clear → compiled or compiled → Clear.

## 🔧 THE FIX

Three connected pieces:

```
  ┌──────────────┐     buildSourceMap()      ┌──────────────┐
  │  Clear Editor │ ──────────────────────►   │  sourceMapData│
  │  (CodeMirror) │                           │  { forward,   │
  └──────┬───────┘                           │    reverse,   │
         │ click line 5                       │    lines[] }  │
         ▼                                    └──────┬───────┘
  lookup forward[5]                                  │
  → compiled lines 12-18                             │
         │                                           │
         ▼                                           │
  ┌──────────────┐                                   │
  │ Compiled View │ ◄────────────────────────────────┘
  │ (CodeMirror)  │   highlight lines 12-18
  │  read-only    │   scroll into view
  └──────┬───────┘
         │ click line 15
         ▼
  lookup reverse[15] → clear line 5
  → jump to line 5 in editor, flash highlight
```

1. **`buildSourceMap(compiledCode)`** — parse `// clear:N` markers, build bidirectional map, store in `sourceMapData`
2. **Editor click handler** — on click, lookup `sourceMapData.forward[clearLine]`, switch to Compiled tab, highlight those lines
3. **Compiled view click handler** — on click, lookup `sourceMapData.reverse[compiledLine]`, jump to Clear source line
4. **Meph `source_map` tool** — server-side: compile with `sourceMap: true`, parse markers, return mapping for a given line

## 📁 FILES INVOLVED

### Modified files:
| File | What changes |
|------|-------------|
| `playground/ide.html` | `buildSourceMap()`, editor click handler, compiled view click handler, highlight logic |
| `playground/server.js` | `source_map` tool definition + handler + summary/log entries |
| `playground/server.test.js` | Regression tests for source map tool + IDE elements |
| `clear.test.js` | Source map marker emission tests |

### No new files.

## 🚨 EDGE CASES

| Scenario | How we handle it |
|----------|-----------------|
| No markers in output (web-only mode, sourceMap not passed) | `buildSourceMap()` returns null, click handlers are no-ops |
| Click on a Clear line with no mapping (blank line, comment) | No highlight, no tab switch — silent no-op |
| Click on compiled line with no marker above it | `reverse` map only has entries for lines under a marker block — unmapped lines are no-ops |
| Multiple compiled blocks map to same Clear line | `forward` map stores array of ranges, highlight all of them |
| Python output uses `# clear:N` not `// clear:N` | Regex handles both: `/(?:\/\/|#) clear:(\d+)/` |
| Compiled view doesn't exist yet (first time showing compiled tab) | `showCompiled()` creates it; we add click handler inside `showCompiled()` after view creation |
| Large file (>150 lines) skips compile animation | Source map still builds — it's independent of animation |
| User switches compiled sub-tab (HTML vs Server JS vs Client JS) | `switchCodeTab()` rebuilds compiledView; source map rebuilds from that tab's code. HTML tabs have no markers → null map → no-op clicks |
| Rapid double-click on editor line | `handleEditorClick` is idempotent — just re-highlights same lines |
| Editor click while compile animation is playing | `compileAnimRunning` guard prevents interference |

## 📋 TDD CYCLES

### Phase 1: Source map marker compiler tests

**Read first:** `compiler.js` (lines 1682-1696), `index.js` (compileProgram return value)

#### Cycle 1.1 — Lock down existing marker behavior with tests

🔴 **Test first** (add to `clear.test.js`):
```javascript
describe('Source map markers', () => {
  it('emits // clear:N markers when sourceMap option is true', () => {
    const result = compileProgram("x = 5\nshow x", { sourceMap: true });
    expect(result.javascript).toContain('// clear:');
  });

  it('does NOT emit markers without sourceMap option', () => {
    const result = compileProgram("x = 5\nshow x");
    // Frontend JS should not have markers by default
    if (result.javascript) {
      expect(result.javascript).not.toContain('// clear:');
    }
  });

  it('backend serverJS always has markers regardless of option', () => {
    const src = "build for javascript backend\nwhen user calls GET /test:\n  send back 'ok'";
    const result = compileProgram(src);
    expect(result.serverJS).toContain('// clear:');
  });

  it('markers reference valid line numbers', () => {
    const src = "build for javascript backend\nwhen user calls GET /test:\n  send back 'ok'";
    const result = compileProgram(src);
    const markers = [...result.serverJS.matchAll(/\/\/ clear:(\d+)/g)];
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) {
      const lineNum = parseInt(m[1]);
      expect(lineNum).toBeGreaterThan(0);
      expect(lineNum).toBeLessThanOrEqual(src.split('\n').length);
    }
  });
});
```

🟢 **Implement:** These should already pass — this cycle locks down existing behavior.

**Test command:** `node clear.test.js`

---

### Phase 2: IDE source map builder + compile wiring

**Read first:** `playground/ide.html` (lines 574-581 sourceMapData var, lines 862-930 autoCompile, lines 1008-1070 showCompiled)

#### Cycle 2.1 — `buildSourceMap()` function + wiring into autoCompile

🔴 **Test first** (add to `playground/server.test.js` in the Context meter section area):
```javascript
  // =========================================================================
  // SOURCE MAP — click-to-highlight infrastructure
  // =========================================================================
  console.log('\n🗺️  Source map');

  {
    const { text } = await get('/ide');
    assert(text.includes('function buildSourceMap'), 'ide.html has buildSourceMap function');
    assert(text.includes('sourceMapData'), 'ide.html has sourceMapData variable');
    assert(text.includes('sourceMapData = buildSourceMap'), 'autoCompile wires buildSourceMap');
  }
```

🟢 **Implement:** Add `buildSourceMap()` to `playground/ide.html` — insert after the `sourceMapData` variable declaration (after line 581, before the editor creation):

```javascript
function buildSourceMap(compiledCode) {
  if (!compiledCode) return null;
  const lines = compiledCode.split('\n');
  const forward = {};  // clearLine → [{ start, end }]
  const reverse = {};  // compiledLine (0-indexed) → clearLine
  let currentClear = null, blockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:\/\/|#) clear:(\d+)/);
    if (m) {
      if (currentClear !== null && blockStart >= 0) {
        const range = { start: blockStart, end: i - 1 };
        (forward[currentClear] = forward[currentClear] || []).push(range);
        for (let j = blockStart; j < i; j++) reverse[j] = currentClear;
      }
      currentClear = parseInt(m[1]);
      blockStart = i;
    }
  }
  if (currentClear !== null && blockStart >= 0) {
    const range = { start: blockStart, end: lines.length - 1 };
    (forward[currentClear] = forward[currentClear] || []).push(range);
    for (let j = blockStart; j <= lines.length - 1; j++) reverse[j] = currentClear;
  }

  return Object.keys(forward).length > 0
    ? { forward, reverse, compiledLines: lines }
    : null;
}
```

Then in `autoCompile()`, insert after line 874 (`lastCompiled = await r.json();`):
```javascript
    // Build persistent source map from compiled output
    const mapTarget = lastCompiled.serverJS || lastCompiled.javascript;
    sourceMapData = buildSourceMap(mapTarget);
```

**Test command:** `node playground/server.test.js`

---

### Phase 3: Editor click → highlight compiled lines

**Read first:** `playground/ide.html` (lines 628-630 editor DOM refs, lines 1008-1070 showCompiled)

#### Cycle 3.1 — Click handler + highlight function

🔴 **Test first** (add to source map section in `playground/server.test.js`):
```javascript
  {
    const { text } = await get('/ide');
    assert(text.includes('handleEditorClick'), 'ide.html has editor click handler');
    assert(text.includes('highlightCompiledLines'), 'ide.html has highlightCompiledLines function');
    assert(text.includes('editor.dom.addEventListener'), 'editor DOM has click listener');
  }
```

🟢 **Implement:** Insert after `window._editorView = editor;` (after line 630):

```javascript
// Source map: click Clear line → show compiled lines
editor.dom.addEventListener('click', handleEditorClick);

function handleEditorClick(e) {
  if (!sourceMapData || compileAnimRunning) return;
  const pos = editor.posAtCoords({ x: e.clientX, y: e.clientY });
  if (pos == null) return;
  const line = editor.state.doc.lineAt(pos).number;
  const ranges = sourceMapData.forward[line];
  if (!ranges || ranges.length === 0) return;

  // Switch to compiled tab — this creates compiledView via showCompiled()
  if (activeTab !== 'compiled') showTab('compiled');
  // showCompiled() synchronously creates compiledView, so no rAF needed
  highlightCompiledLines(ranges);
}

function highlightCompiledLines(ranges) {
  if (!compiledView) return;
  // Clear previous highlights
  compiledView.dom.querySelectorAll('.cm-source-map-highlight')
    .forEach(el => el.classList.remove('cm-source-map-highlight'));

  for (const { start, end } of ranges) {
    for (let i = start + 1; i <= end + 1; i++) {
      if (i < 1 || i > compiledView.state.doc.lines) continue;
      const lineObj = compiledView.state.doc.line(i);
      const domPos = compiledView.domAtPos(lineObj.from);
      let el = domPos?.node;
      if (!(el instanceof Element)) el = el?.parentElement;
      while (el && !el.classList.contains('cm-line')) el = el.parentElement;
      if (el) el.classList.add('cm-source-map-highlight');
    }
  }

  // Scroll first highlighted line into view
  const firstLine = ranges[0].start + 1;
  if (firstLine >= 1 && firstLine <= compiledView.state.doc.lines) {
    const lineObj = compiledView.state.doc.line(firstLine);
    compiledView.dispatch({ effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }) });
  }
}
```

**Important:** `showTab('compiled')` calls `showCompiled()` synchronously, which creates `compiledView` immediately. No `requestAnimationFrame` needed — `compiledView` is ready right after `showTab` returns.

**Test command:** `node playground/server.test.js`

---

### Phase 4: Compiled view click → jump to source

**Read first:** `playground/ide.html` (lines 1008-1070 showCompiled, line 1066-1070 switchCodeTab)

#### Cycle 4.1 — Reverse click handler wired into showCompiled

🔴 **Test first** (add to source map section in `playground/server.test.js`):
```javascript
  {
    const { text } = await get('/ide');
    assert(text.includes('handleCompiledClick'), 'ide.html has compiled view click handler');
    // Verify it's wired into showCompiled
    assert(text.includes("compiledView.dom.addEventListener('click', handleCompiledClick)"),
      'compiledView has click listener wired in showCompiled');
  }
```

🟢 **Implement:** Add `handleCompiledClick` function near the other handlers:

```javascript
function handleCompiledClick(e) {
  if (!sourceMapData || !compiledView) return;
  const pos = compiledView.posAtCoords({ x: e.clientX, y: e.clientY });
  if (pos == null) return;
  const line = compiledView.state.doc.lineAt(pos).number;
  const clearLine = sourceMapData.reverse[line - 1]; // reverse is 0-indexed
  if (clearLine == null) return;

  // Jump to source line and flash it
  jumpToLine(clearLine);

  // Highlight the clicked compiled line briefly
  const lineObj = compiledView.state.doc.line(line);
  const domPos = compiledView.domAtPos(lineObj.from);
  let el = domPos?.node;
  if (!(el instanceof Element)) el = el?.parentElement;
  while (el && !el.classList.contains('cm-line')) el = el.parentElement;
  if (el) {
    el.classList.add('cm-source-map-active');
    setTimeout(() => el.classList.remove('cm-source-map-active'), 1500);
  }
}
```

Wire into `showCompiled()` — insert at line 1069, right after `viewContainer.appendChild(compiledView.dom);`:
```javascript
  compiledView.dom.addEventListener('click', handleCompiledClick);
```

Also rebuild source map when switching sub-tabs. In `switchCodeTab()` (line 1072), add after `compiledTab = key;`:
```javascript
  // Rebuild source map for the new sub-tab's code
  const active = [lastCompiled?.html, lastCompiled?.serverJS, lastCompiled?.javascript, lastCompiled?.python]
    .filter(Boolean);
  const outputs = [];
  if (lastCompiled?.html) outputs.push({ key: 'html', code: lastCompiled.html });
  if (lastCompiled?.serverJS) outputs.push({ key: 'serverJS', code: lastCompiled.serverJS });
  if (lastCompiled?.javascript) outputs.push({ key: 'javascript', code: lastCompiled.javascript });
  if (lastCompiled?.python) outputs.push({ key: 'python', code: lastCompiled.python });
  const tabCode = outputs.find(o => o.key === key);
  sourceMapData = tabCode ? buildSourceMap(tabCode.code) : null;
```

**Test command:** `node playground/server.test.js`

---

### Phase 5: Meph `source_map` tool

**Read first:** `playground/server.js` (lines 378-488 TOOLS, lines 566-791 tool dispatch, lines 960-970 summary labels, lines 1043-1065 log formatting)

#### Cycle 5.1 — Tool definition + dispatch handler + summary + log format

🔴 **Test first** (add to source map section in `playground/server.test.js`):
```javascript
  {
    const fs = await import('fs');
    const serverSrc = fs.readFileSync(join(__dirname, 'server.js'), 'utf8');
    assert(serverSrc.includes("name: 'source_map'"), 'server.js has source_map tool definition');
    assert(serverSrc.includes('sourceMap: true'), 'server.js passes sourceMap option to compiler');
    assert(serverSrc.includes("case 'source_map'"), 'server.js has source_map case in dispatch');
  }
```

🟢 **Implement:**

**1. Tool definition** — add to TOOLS array (after `highlight_code` tool, before the closing `];`):
```javascript
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
```

**2. Tool dispatch** — add case in `executeTool()` before `default:` (before line 789):
```javascript
      case 'source_map': {
        if (!currentSource) return JSON.stringify({ error: 'No code in editor. Write code first.' });
        const compiled = compileProgram(currentSource, { sourceMap: true });
        const target = compiled.serverJS || compiled.javascript || compiled.python;
        if (!target) return JSON.stringify({ error: 'No compiled output.' });

        // Parse markers
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

        // Full map summary
        const summary = Object.entries(map)
          .sort(([a],[b]) => a - b)
          .map(([cl, cls]) => `Clear ${cl} → compiled lines ${cls[0]}-${cls[cls.length-1]}`)
          .join('\n');
        return JSON.stringify({ result: summary });
      }
```

**3. Summary label** — add in the tool summary switch (around line 968, before `default:`):
```javascript
            case 'source_map': return input.clear_line ? `Looking up Clear line ${input.clear_line}` : 'Getting full source map';
```

**4. Log formatting** — add in the log switch (around line 1062, before `default:`):
```javascript
            case 'source_map':
              return `[tool] ✓ source_map`;
```

**Test command:** `node playground/server.test.js`

---

### Phase 6: Full regression + intent.md update

#### Cycle 6.1 — Run all tests, update intent.md

🔴 **Tests:**
```bash
node clear.test.js          # compiler marker tests
node playground/server.test.js  # all server + IDE tests
```

🟢 **Verify:** All pass.

Then update `intent.md` — add to the Node Types table or a new section:
```markdown
### Source Maps

| Feature | Syntax | Behavior |
|---------|--------|----------|
| Source map markers | `// clear:N` (JS) / `# clear:N` (Python) | Embedded in compiled output, maps compiled line → Clear source line |
| Click-to-highlight | Click Clear line in IDE | Highlights corresponding compiled lines, scrolls into view |
| Reverse lookup | Click compiled line in IDE | Jumps to source Clear line, flashes highlight |
| Meph tool | `source_map` tool | Returns source map for current code, optional line lookup |
```

---

## 🧪 TESTING STRATEGY

**Test commands:**
- `node clear.test.js` — compiler tests (source map marker emission)
- `node playground/server.test.js` — server tests (source_map tool, IDE structural checks)

**Manual verification:**
- [ ] Open IDE, write a backend app, compile
- [ ] Click a Clear source line → compiled view opens, correct lines highlighted
- [ ] Click a compiled line → editor jumps to source line, flashes
- [ ] Click a blank/comment line → nothing happens (no crash)
- [ ] Switch compiled sub-tabs (HTML/Server JS) → map rebuilds, clicks still work on JS tab, no-op on HTML tab

**Success criteria:**
- [ ] `buildSourceMap()` correctly parses `// clear:N` and `# clear:N`
- [ ] Forward map: Clear line → compiled line range(s)
- [ ] Reverse map: compiled line → Clear line
- [ ] Editor click → compiled highlight + scroll
- [ ] Compiled click → source jump + flash
- [ ] Meph `source_map` tool returns correct mappings
- [ ] All 1699 compiler tests still pass
- [ ] All server tests pass (including context meter regression)

---

## 📎 RESUME PROMPT

> Continue implementing click-to-highlight source mapping in Clear Studio. The plan is at `plans/plan-click-to-highlight-04-11-2026.md`. TDD order: (1) compiler marker tests in clear.test.js, (2) buildSourceMap + autoCompile wiring in ide.html, (3) editor click handler, (4) compiled view click handler in showCompiled, (5) Meph source_map tool in server.js, (6) regression tests. Red-green-refactor each cycle.

**Final step:** Run `update-learnings` skill to capture lessons from this feature.
