# Plan: Component Composition (Phase 52)

**Branch:** `feature/component-composition-phase52`
**Date:** 2026-04-09
**Size:** Large

---

## Section 0 — Before Starting

```bash
git checkout -b feature/component-composition-phase52
```

Logger tag: `[COMPONENT]`

---

## Section 1 — Existing Code (Read Per Phase)

### Always read first:
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec — COMPONENT_DEF, COMPONENT_USE node types |

### Phase 1 — read these:
| File | Lines | Why |
|------|-------|-----|
| `compiler.js` | 4597–4818 | `compileToReactiveJS` — flat node categorization, _recompute loop |
| `compiler.js` | 5220–5820 | `buildHTML` — HTML scaffold walk (verified 2026-04-09) |
| `compiler.js` | 3954–3998 | `compileNode` COMPONENT_DEF / COMPONENT_USE cases |
| `clear.test.js` | 5576–5956 | All existing component tests |

### Phase 2 — read these:
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | 2217–2253 | `parseComponentDef` |
| `parser.js` | 1240–1265 | `show` handler — block form detection |
| `compiler.js` | TOC at top | Confirm section names before editing |

### Phase 3 — read these:
| File | Lines | Why |
|------|-------|-----|
| `clear.test.js` | 5576–5960 | Re-read before writing new tests (state may have changed) |

---

## Section 2 — What We're Building

### User-facing description

```
# Define a reusable Card component
define component Card receiving title:
  heading title
  text 'Standard card layout'

# Use it in a page
page 'Dashboard':
  show Card('My Title')

# Block form — pass HTML children as a slot
define component Panel receiving content:
  section 'Panel':
    show content

page 'App':
  show Panel:
    heading 'Slot content'
    text 'Goes inside Panel'
```

### Before (what's broken)

1. `define component Card receiving title:` compiles `function Card(title)` **inside** `_recompute()` — not accessible from button handlers or onclick attributes
2. `show Card('Hello')` inline: HTML placeholder emitted BUT with wrong ID prefix (`component_Card_0` instead of `comp_0`) AND Card() function is out of scope at call time → runtime error
3. `show Card:` block form: no HTML placeholder emitted at all; reactive compiler discards return value → nothing rendered
4. `show double(5)` — any lowercase function call — falsely emits a `clear-component` placeholder, consuming a counter slot and desyncing IDs for subsequent real components

### After (what works)

1. Component functions compile as **top-level** JS functions — before state, accessible everywhere
2. `show Card(arg1, arg2)` → `<div id="comp_0" class="clear-component"></div>` in HTML + `getElementById('comp_0').innerHTML = Card(arg1, arg2)` in _recompute
3. `show Card:` block → same pattern, with children compiled to HTML string and passed as first arg
4. Only **PascalCase** function calls treated as components — `show double(5)` gets no placeholder

### ASCII before/after

```
BEFORE (broken):
  function _recompute() {
    function Card(title) { ... }   ← inside recompute, NOT accessible from buttons
    getElementById('component_Card_0').innerHTML = Card('Hello');  ← ID mismatch if also block-form
  }
  buildHTML: show Card('Hello') → <div id="component_Card_0"> (wrong prefix, no block-form support)
  buildHTML: show Card: block  → (nothing emitted!)
  buildHTML: show double(5)    → <div id="component_double_0"> (WRONG — not a component!)

AFTER (fixed):
  function Card(title) { ... }     ← TOP LEVEL — accessible everywhere
  function Panel(content) { ... }  ← TOP LEVEL

  function _recompute() {
    getElementById('comp_0').innerHTML = Card('My Title');
    getElementById('comp_1').innerHTML = Panel('<p>Slot text</p>');
  }
  buildHTML: show Card('My Title') → <div id="comp_0" class="clear-component">
  buildHTML: show Panel: block     → <div id="comp_1" class="clear-component">
  buildHTML: show double(5)        → (nothing — lowercase, not a component)
```

---

## Section 3 — Data Flow

```
DEFINE:
  COMPONENT_DEF node (top-level in AST, not inside PAGE)
  → compileToReactiveJS: collected by filter on flatNodes, emitted as top-level JS function BEFORE _state
  → buildHTML: skip (no HTML output for definitions — it's a function definition)

USE (inline — PascalCase only):
  SHOW node with expression.type === CALL and expression.name starts with uppercase
  → buildHTML: emit <div id="comp_N" class="clear-component"></div>
  → compileToReactiveJS filteredCompute loop: emit getElementById('comp_N').innerHTML = Name(args)

USE (block):
  COMPONENT_USE node (from "show Card:" + indented body)
  → buildHTML: emit <div id="comp_N" class="clear-component"></div>
  → compileToReactiveJS filteredCompute loop: compile children → HTML string, emit getElementById + innerHTML

COUNTER SYNC:
  Both buildHTML (compRenderCounter) and compileToReactiveJS (componentCounter) start at 0.
  Both increment ONLY for: (1) SHOW+CALL where name starts uppercase, (2) COMPONENT_USE.
  Both traverse in same DFS order (PAGE.body → SECTION.body → node).
  Result: comp_0, comp_1, comp_2... are in sync between HTML and reactive JS.
```

---

## Section 4 — Integration Points

| Producer | Consumer | Data Format |
|----------|----------|-------------|
| `parseComponentDef` | `compileToReactiveJS` | COMPONENT_DEF AST node with `name`, `props[]`, `body[]` |
| `buildHTML` (walk) | HTML output | `<div id="comp_N" class="clear-component"></div>` string |
| `compileToReactiveJS` (filteredCompute) | JS output inside `_recompute` | `document.getElementById('comp_N').innerHTML = Name(...)` |
| COMPONENT_USE node `children[]` | Compiler | Compiled to HTML string, passed as first positional arg |

---

## Section 5 — Edge Cases

| Scenario | Handling |
|----------|----------|
| Component def before page | Collected by filter, emitted before `_state` |
| Component def after page | `flatten()` collects ALL top-level nodes; filter runs after categorization loop |
| Two uses of same component | Each gets unique `comp_N` ID via shared counter |
| Component with no props | `function Card() { ... }` — zero params |
| Block form with no children | `Card('')` — passes empty string |
| Component used inside button action | Function is top-level so it's in scope |
| Inline + block forms mixed on same page | Counter increments correctly for both node types |
| Component not defined (undefined function) | Runtime: `Card is not defined` — acceptable; validator can catch in Phase 53 |
| Python target | COMPONENT_DEF: `def Card(title): ...` (already works); COMPONENT_USE: emit comment (already works) |
| Non-reactive app (no inputs/buttons) | `compileToJS` non-reactive path — out of scope for Phase 52, document limitation |
| Lowercase function call (`show double(5)`) | PascalCase guard prevents creating container — no counter increment |
| Component inside IF_THEN block body | Not flattened to top level — won't render. Known limitation; document, don't fix in Phase 52. |
| Component inside FOR_EACH body | Same limitation as IF_THEN. |

---

## Section 6 — ENV VARS

None required.

---

## Section 7 — Files to Create

No new files. All changes in `compiler.js` and `clear.test.js`.

---

## Section 8 — Files to Modify

### `compiler.js`

**Verified line references (2026-04-09):**
- Categorization switch: line 4624–4645
- SHOW+CALL handler in `_recompute` loop: lines 4806–4815
- COMPONENT_USE handler insertion point: after line 4815, before line 4816
- buildHTML SHOW case: lines 5787–5794 (NOT ~5878 — that's in `compileToHTML`)
- COMPONENT_USE insertion point in buildHTML: after line 5794, before line 5796 (IF_THEN case)
- `compRenderCounter` declaration: line 5911

---

**Change 1: Exclude COMPONENT_DEF from `computeNodes` in `compileToReactiveJS`**

In `compileToReactiveJS`, inside the categorization switch at line ~4637 (after `TEST_DEF: break;`), add:

```js
// In the switch(node.type) block — add COMPONENT_DEF to the skip group:
// Context: currently after `case NodeType.TEST_DEF: break;` at line ~4640
case NodeType.COMPONENT_DEF:
  break; // Collected separately and emitted as top-level functions
```

Then, after the categorization loop (after line 4645), collect component defs:

```js
// After the `for (const node of flatNodes) { switch ... }` loop:
const componentDefNodes = flatNodes.filter(n => n.type === NodeType.COMPONENT_DEF);
```

Then, after the setup/page-title section (after line 4660, before `// 3. State initialization`), emit component functions:

```js
// After: if (pageTitles.length > 0) { lines.push(`document.title = ...`); }
// Before: // 3. State initialization

// Component functions (top-level — accessible from _recompute, buttons, and event handlers)
if (componentDefNodes.length > 0) {
  lines.push('');
  lines.push('// --- Component functions ---');
  const compDefCtx = { lang: 'js', indent: 0, declared: new Set(), stateVars: null, mode: 'web', sourceMap };
  for (const n of componentDefNodes) {
    const code = compileNode(n, compDefCtx);
    if (code) lines.push(code);
  }
}
```

---

**Change 2: Fix SHOW+CALL handler in `filteredCompute` loop (lines 4806–4815)**

Replace the existing SHOW+CALL handler block (lines 4806–4815):

```js
// BEFORE (replace this entire block):
// SHOW with function call in reactive mode: render component to DOM
if (node.type === NodeType.SHOW && node.expression && node.expression.type === NodeType.CALL) {
  const callExpr = node.expression;
  const containerId = `component_${sanitizeName(callExpr.name)}_${componentCounter++}`;
  const args = callExpr.args.map(a => exprToCode(a, reactiveCtx)).join(', ');
  lines.push(`  // Render component: ${callExpr.name}`);
  lines.push(`  { const _el = document.getElementById('${containerId}');`);
  lines.push(`    if (_el) _el.innerHTML = ${sanitizeName(callExpr.name)}(${args}); }`);
  continue;
}

// AFTER (replace with this — adds PascalCase guard):
// SHOW with PascalCase function call: render component to DOM (lowercase = regular function, not component)
if (node.type === NodeType.SHOW && node.expression && node.expression.type === NodeType.CALL
    && node.expression.name && /^[A-Z]/.test(node.expression.name)) {
  const callExpr = node.expression;
  const containerId = `comp_${componentCounter++}`;
  const args = callExpr.args.map(a => exprToCode(a, reactiveCtx)).join(', ');
  lines.push(`  // Render component: ${callExpr.name}`);
  lines.push(`  { const _el = document.getElementById('${containerId}');`);
  lines.push(`    if (_el) _el.innerHTML = ${sanitizeName(callExpr.name)}(${args}); }`);
  continue;
}
```

Then, immediately after (at line ~4815, before `const result = compileNode(...)`), add COMPONENT_USE handler:

```js
// COMPONENT_USE (block form "show Card: + body"): render children HTML into placeholder
if (node.type === NodeType.COMPONENT_USE) {
  const containerId = `comp_${componentCounter++}`;
  const childParts = [];
  for (const child of node.children) {
    if (child.type === NodeType.CONTENT) {
      const tag = { heading: 'h1', subheading: 'h2', text: 'p', bold: 'strong',
                    italic: 'em', small: 'small', divider: 'hr' }[child.contentType] || 'p';
      if (child.contentType === 'divider') {
        childParts.push("'<hr>'");
      } else {
        childParts.push(`'<${tag}>${(child.text || '').replace(/'/g, "\\'")}</${tag}>'`);
      }
    } else if (child.type === NodeType.SHOW) {
      childParts.push(`'<p>' + ${exprToCode(child.expression, reactiveCtx)} + '</p>'`);
    }
  }
  const childrenExpr = childParts.length > 0 ? childParts.join(' + ') : "''";
  lines.push(`  // Render component: ${node.name} (block form)`);
  lines.push(`  { const _el = document.getElementById('${containerId}');`);
  lines.push(`    if (_el) _el.innerHTML = ${sanitizeName(node.name)}(${childrenExpr}); }`);
  continue;
}
```

---

**Change 3: Fix SHOW case in `buildHTML` walk (lines 5787–5794)**

Replace the SHOW case (lines 5787–5794):

```js
// BEFORE:
case NodeType.SHOW: {
  // Component call: show Card(name) -> container div for reactive rendering
  if (node.expression && node.expression.type === NodeType.CALL && node.expression.name) {
    const containerId = `component_${sanitizeName(node.expression.name)}_${compRenderCounter++}`;
    parts.push(`    <div id="${containerId}" class="clear-component"></div>`);
  }
  break;
}

// AFTER (adds PascalCase guard, fixes ID prefix):
case NodeType.SHOW: {
  // Component call: show Card(name) -> container div for reactive rendering
  // Only PascalCase function names are components — lowercase functions are pure JS
  if (node.expression && node.expression.type === NodeType.CALL && node.expression.name
      && /^[A-Z]/.test(node.expression.name)) {
    const containerId = `comp_${compRenderCounter++}`;
    parts.push(`    <div id="${containerId}" class="clear-component"></div>`);
  }
  break;
}
```

Then add the COMPONENT_USE case immediately after the SHOW case (after line 5794, before the IF_THEN case at line 5796):

```js
case NodeType.COMPONENT_USE: {
  // Block-form component: show Card: + body -> placeholder div for reactive rendering
  const containerId = `comp_${compRenderCounter++}`;
  parts.push(`    <div id="${containerId}" class="clear-component"></div>`);
  break;
}
```

---

**Change 4: Update `compileNode` COMPONENT_USE case (~line 3983)**

This case is now only reached in non-reactive contexts (Python, backend JS, non-reactive web). The function call result can be ignored there since there's no DOM to inject into. Keep it as documentation of the node, just add a comment:

```js
case NodeType.COMPONENT_USE: {
  if (ctx.lang === 'python') return `${pad}# Component: ${node.name}`;
  // In reactive JS, COMPONENT_USE is handled by compileToReactiveJS (not compileNode).
  // This path only fires for non-reactive apps and backend contexts.
  const childParts = [];
  for (const child of node.children) {
    if (child.type === NodeType.CONTENT) {
      const tag = { heading: 'h1', subheading: 'h2', text: 'p', bold: 'strong',
                    italic: 'em', small: 'small', divider: 'hr' }[child.contentType] || 'p';
      if (child.contentType === 'divider') childParts.push("'<hr>'");
      else childParts.push(`'<${tag}>${(child.text || '').replace(/'/g, "\\'")}</${tag}>'`);
    } else if (child.type === NodeType.SHOW) {
      childParts.push(`'<p>' + ${exprToCode(child.expression, ctx)} + '</p>'`);
    }
  }
  const childrenExpr = childParts.length > 0 ? childParts.join(' + ') : "''";
  return `${pad}${sanitizeName(node.name)}(${childrenExpr});`;
}
```

**Update TOC**: After any changes to compiler.js, update the TABLE OF CONTENTS comment block at the top of the file.

---

### `clear.test.js`

Add the following tests in a new describe block after the existing `COMPONENT DOM RENDERING` describe block (~line 5956). Each test is copy-paste ready.

---

## Section 9 — Pre-Flight Checklist

- [x] `learnings.md` exists
- [x] No new synonyms needed — `show Card(arg)` and `show Card:` both already parse correctly
- [x] Counter sync verified: `buildHTML.compRenderCounter` and `compileToReactiveJS.componentCounter` both start at 0, both increment only for PascalCase SHOW+CALL and COMPONENT_USE, both traverse in same DFS order
- [x] PascalCase guard on BOTH sides — buildHTML and reactive compiler
- [x] Component functions emitted before `_state` — accessible from `_recompute`, button handlers, onclick attributes
- [x] Python target: COMPONENT_DEF already works; COMPONENT_USE emits comment — no change needed
- [x] Non-reactive apps (`compileToJS` path): Out of scope, documented in edge cases
- [x] No new intent.md updates needed — COMPONENT_DEF/COMPONENT_USE already in spec

---

## Section 10 — TDD Cycles

### Cycle 1: Component function is top-level (not inside `_recompute`)

**Red — add this test to `clear.test.js` in the COMPONENT DOM RENDERING section:**
```js
it('component function is defined at top level, not inside _recompute', () => {
  const result = compileProgram(`
build for web
define component Card receiving title:
  heading 'hello'
page 'App':
  heading 'Test'
  `);
  expect(result.errors).toHaveLength(0);
  const js = result.javascript;
  const funcIdx = js.indexOf('function Card');
  const recomputeIdx = js.indexOf('function _recompute');
  expect(funcIdx).toBeGreaterThan(-1);
  expect(recomputeIdx).toBeGreaterThan(-1);
  // Card function must be defined BEFORE _recompute
  expect(funcIdx).toBeLessThan(recomputeIdx);
});
```

**Verify red:** `node clear.test.js` — this test fails (currently `function Card` is inside `_recompute`).

**Green:** Apply Change 1:
1. Add `case NodeType.COMPONENT_DEF: break;` to categorization switch at line ~4640
2. Add `const componentDefNodes = flatNodes.filter(n => n.type === NodeType.COMPONENT_DEF);` after line 4645
3. Add component emit block after page title (after line 4660)

**Verify green:** `node clear.test.js` — new test passes, all 1489 existing tests pass.

**Refactor:** Confirm the `// --- Component functions ---` comment is consistent with the `// --- State ---` style used elsewhere in the file.

---

### Cycle 2: `show Card(arg)` emits container div with correct ID

**Red:**
```js
it('show Card(arg) emits comp_N container div in HTML scaffold', () => {
  const result = compileProgram(`
build for web
define component Card receiving title:
  heading 'hello'
page 'App':
  show Card('My Title')
  `);
  expect(result.errors).toHaveLength(0);
  expect(result.html).toContain('class="clear-component"');
  expect(result.html).toContain('id="comp_0"');
  // Old prefix must be gone
  expect(result.html).not.toContain('id="component_Card_0"');
});
```

**Verify red:** `node clear.test.js` — fails because current prefix is `component_Card_0`.

**Green:** Apply Change 3 (buildHTML SHOW case) — add PascalCase guard and change prefix to `comp_${compRenderCounter++}`.

**Verify green:** `node clear.test.js` — passes.

**Refactor:** Check that no other part of the compiler generates `component_${name}_${N}` IDs (grep for `component_` to confirm no stragglers).

---

### Cycle 3: `show Card(arg)` injects HTML in reactive JS

**Red:**
```js
it('show Card(arg) injects HTML into comp_0 container in reactive JS', () => {
  const result = compileProgram(`
build for web
define component Card receiving title:
  heading 'hello'
page 'App':
  show Card('My Title')
  `);
  expect(result.errors).toHaveLength(0);
  expect(result.javascript).toContain("getElementById('comp_0')");
  expect(result.javascript).toContain(".innerHTML = Card(");
  // Old prefix must be gone
  expect(result.javascript).not.toContain("getElementById('component_Card_0')");
});
```

**Verify red:** `node clear.test.js` — fails (old prefix).

**Green:** Apply Change 2 (SHOW+CALL handler in filteredCompute) — add PascalCase guard and change to `comp_${componentCounter++}`.

**Verify green:** `node clear.test.js` — passes. Cycles 2 and 3 together confirm ID sync.

**Refactor:** Remove any stale comment that says `component_${name}_${N}` format (if any exist in compiler.js).

---

### Cycle 4: Lowercase function call does NOT create component container

**Red:**
```js
it('show with lowercase function call does NOT create component container', () => {
  const result = compileProgram(`
build for web
define function double(x):
  return x * 2

page 'App':
  show double(5)
  `);
  expect(result.errors).toHaveLength(0);
  // No component container should be emitted for a lowercase function call
  expect(result.html).not.toContain('class="clear-component"');
  expect(result.html).not.toContain('id="comp_0"');
});
```

**Verify red:** `node clear.test.js` — fails currently (no PascalCase guard, creates container for `double`).

**Green:** PascalCase guard was already added in Cycles 2 and 3. This test should now pass automatically. Confirm.

**Verify green:** `node clear.test.js` — passes.

**Refactor:** No additional refactor needed.

---

### Cycle 5: Block-form `show Card:` emits container div in HTML

**Red:**
```js
it('block-form show Card: emits comp_N container div in HTML', () => {
  const result = compileProgram(`
build for web
define component Panel receiving content:
  show content
page 'App':
  show Panel:
    heading 'Slot content'
  `);
  expect(result.errors).toHaveLength(0);
  expect(result.html).toContain('class="clear-component"');
  expect(result.html).toContain('id="comp_0"');
});
```

**Verify red:** `node clear.test.js` — fails (no COMPONENT_USE case in buildHTML).

**Green:** Apply Change 3 part 2 — add `case NodeType.COMPONENT_USE:` to buildHTML walk.

**Verify green:** `node clear.test.js` — passes.

**Refactor:** None needed.

---

### Cycle 6: Block-form `show Card:` injects children HTML in reactive JS

**Red:**
```js
it('block-form show Card: injects children HTML into placeholder', () => {
  const result = compileProgram(`
build for web
define component Panel receiving content:
  show content
page 'App':
  show Panel:
    text 'Hello world'
  `);
  expect(result.errors).toHaveLength(0);
  expect(result.javascript).toContain("getElementById('comp_0')");
  expect(result.javascript).toContain('.innerHTML = Panel(');
  expect(result.javascript).toContain('<p>Hello world</p>');
});
```

**Verify red:** `node clear.test.js` — fails (COMPONENT_USE not handled in filteredCompute).

**Green:** Apply Change 2 part 2 — add COMPONENT_USE handler in filteredCompute loop after the SHOW+CALL handler.

**Verify green:** `node clear.test.js` — passes.

**Refactor:** Confirm COMPONENT_USE handler and SHOW+CALL handler use the same children-to-HTML logic. If there's any duplication, extract a `_compileChildrenToHTML(children, ctx)` helper function (3+ call sites justify it).

---

### Cycle 7: E2E — component with props and content slot, both on same page

**Red:**
```js
it('E2E: component composition — inline and block forms coexist with correct IDs', () => {
  const result = compileProgram(`
build for web
define component Card receiving title:
  heading title
  text 'Card footer'

define component Wrapper receiving content:
  show content

page 'Dashboard':
  show Card('Revenue')
  show Wrapper:
    text 'Slot text'
  `);
  expect(result.errors).toHaveLength(0);
  const js = result.javascript;

  // Both component functions are top-level
  expect(js).toContain('function Card(title)');
  expect(js).toContain('function Wrapper(content)');

  // Both before _recompute
  const recomputeIdx = js.indexOf('function _recompute');
  expect(js.indexOf('function Card')).toBeLessThan(recomputeIdx);
  expect(js.indexOf('function Wrapper')).toBeLessThan(recomputeIdx);

  // comp_0 = Card (inline), comp_1 = Wrapper (block) — order matches source order
  expect(result.html).toContain('id="comp_0"');
  expect(result.html).toContain('id="comp_1"');

  // Both injected in recompute with correct IDs
  expect(js).toContain("getElementById('comp_0').innerHTML = Card(");
  expect(js).toContain("getElementById('comp_1').innerHTML = Wrapper(");
});
```

**Verify red:** `node clear.test.js` — fails (multiple issues before all cycles applied).

**Green:** All prior cycles should make this pass.

**Verify green:** `node clear.test.js` — all 1496+ tests pass (7 new tests added). No regressions.

**Refactor:** Run `node clear.test.js` one final time. Confirm count.

---

### Cycle 8: Component with reactive prop (from input state)

**Red:**
```js
it('component receives reactive state variable as prop', () => {
  const result = compileProgram(`
build for web
define component Label receiving name:
  heading name

page 'App':
  'Your name' as text input saves to username
  show Label(username)
  `);
  expect(result.errors).toHaveLength(0);
  // username is in state
  expect(result.javascript).toContain('username:');
  // Label call uses _state.username
  expect(result.javascript).toContain('Label(_state.username)');
  expect(result.html).toContain('id="comp_0"');
});
```

**Verify red:** `node clear.test.js` — may already pass once Cycle 3 is done (exprToCode resolves state vars correctly). Confirm.

**Green:** If failing, check that `reactiveCtx` has `stateVars` set when compiling args in the SHOW+CALL handler. The existing code already does `const args = callExpr.args.map(a => exprToCode(a, reactiveCtx)).join(', ')` which should resolve `username` to `_state.username` when it's in `stateVarNames`.

**Verify green:** `node clear.test.js` — passes.

**Refactor:** None.

---

### Cycle 9: Update ROADMAP.md

Add Phase 52 to the "What's Built" section in `ROADMAP.md`:

```markdown
### Component Composition (Phase 52)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Component definition | Done | `define component Card receiving title:` |
| Inline component use | Done | `show Card('Hello')` |
| Block component use (slot) | Done | `show Card:` + indented body |
| Reactive props | Done | `show Card(username)` — resolves from _state |
| Top-level JS function | Done | Functions accessible from button handlers |
```

---

### Cycle 10: Update learnings

| Step | Action |
|------|--------|
| 📚 | Run `update-learnings` skill — document: (1) component function must be top-level, not inside _recompute, (2) PascalCase convention distinguishes components from regular functions, (3) counter sync pattern between buildHTML and compileToReactiveJS, (4) block-form slot = children compiled to HTML string passed as first arg |

---

## Section 11 — Logging Tags

All new `console.warn` calls (if any) use `[COMPONENT]` prefix.

---

## Section 12 — Test Run Order

```bash
# After EACH cycle:
node clear.test.js

# Final confirmation after all cycles:
node clear.test.js
# Expect: 1496+ tests pass (added 7-8 new tests), 0 failures
```

---

## Section 13 — Browser Checklist

After implementation, manually test using the playground (`node playground/server.js`):
- [ ] Component renders in browser (create test app with `show Card('Hello')`)
- [ ] Component with prop: heading text matches arg passed
- [ ] Block-form slot: children appear inside component output
- [ ] Two components on same page: both render to their correct containers (no ID collision)
- [ ] Component called inside button onclick: function is in scope, renders correctly
- [ ] Lowercase function call (`show double(5)`): no stray empty div in page

---

## Section 14 — Success Criteria

- [ ] `function Card` appears before `function _recompute` in compiled JS
- [ ] `show Card(arg)` → HTML has `<div id="comp_0" class="clear-component">`
- [ ] `show Card(arg)` → JS has `getElementById('comp_0').innerHTML = Card(...)`
- [ ] `show Card:` block → HTML has `<div id="comp_1" class="clear-component">`
- [ ] `show Card:` block → JS has `getElementById('comp_1').innerHTML = Card(...children HTML...)`
- [ ] `show double(5)` → NO clear-component div in HTML
- [ ] `show Card(username)` → JS uses `_state.username`
- [ ] All 1496+ tests pass (no regressions)
- [ ] ROADMAP.md updated: Phase 52 listed as Done
- [ ] learnings.md updated

---

## Copy-Paste Resume Prompt

```
I'm implementing Phase 52 (Component Composition) in the Clear language compiler.
Branch: feature/component-composition-phase52
Plan: plans/plan-component-composition-phase52-04-09-2026.md

Verified current bugs (2026-04-09):
- COMPONENT_DEF emitted inside _recompute() at line ~4643 (default case → computeNodes)
- buildHTML SHOW case (line 5787): uses `component_${name}_N` prefix, missing PascalCase guard
- Reactive SHOW+CALL handler (line 4807): uses `component_${name}_N` prefix, missing PascalCase guard
- COMPONENT_USE: no buildHTML case, no reactive injection

TDD cycle order:
1. Move COMPONENT_DEF to top-level (add break at line ~4640, collect + emit before line 4662)
2. Fix buildHTML SHOW case (line 5787): add PascalCase guard + use comp_N prefix
3. Fix reactive SHOW+CALL handler (line 4807): same PascalCase guard + comp_N prefix
4. Verify PascalCase guard works (lowercase fn = no container)
5. Add COMPONENT_USE case to buildHTML (after line 5794)
6. Add COMPONENT_USE handler in filteredCompute loop (after line 4815)
7. E2E test: two components on same page, correct ID sync
8. Reactive prop test: show Card(username) uses _state.username
9. Update ROADMAP.md
10. Run update-learnings

Run node clear.test.js after each cycle. Target: 1496+ tests pass.
```
