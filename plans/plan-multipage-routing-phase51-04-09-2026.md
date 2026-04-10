# Plan: Multi-Page Routing with Shared State (Phase 51)

**Branch:** `feature/multipage-routing-phase51`
**Date:** 2026-04-09
**Size:** Large

---

## Section 0 — Before Starting

```bash
git checkout -b feature/multipage-routing-phase51
```

Logger tag: `[ROUTING]`

---

## Section 1 — Existing Code (Read Per Phase)

### Always read first:
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec — PAGE, NAVIGATE, ON_PAGE_LOAD node types |

### Phase 1 — read these:
| File | Lines | Why |
|------|-------|-----|
| `synonyms.js` | 295–310 | `go_to`, `on_page_load` synonyms — add `on_page_enter` near them |
| `parser.js` | NodeType declaration block | Add `ON_PAGE_ENTER` node type |
| `parser.js` | `on_page_load` handler | Mirror this pattern for `on_page_enter` |

### Phase 2 — read these:
| File | Lines | Why |
|------|-------|-----|
| `compiler.js` | 4620–4760 | `compileToReactiveJS` — flatten logic, state init, node categorization |
| `compiler.js` | 3905–3910 | `NAVIGATE` node compiler — understand what we build on top of |
| `compiler.js` | 5852–5955 | `compileToHTML` — where `routerJS` is built |

### Phase 3 — read these:
| File | Lines | Why |
|------|-------|-----|
| `clear.test.js` | Near end (multi-page routing tests) | Find insertion point for new tests |
| `compiler.js` | Full TOC (lines 86–112) | Update section names after compiler changes |
| `parser.js` | Full TOC | Update section names after parser changes |

---

## Section 2 — What We're Building

### User-facing description

Multi-page SPA with route-scoped lifecycle and shared reactive state:

```clear
build for web

# Shared state — accessible on every page
currentUser is nothing
isLoggedIn is false

page 'Login' at '/':
  heading 'Sign In'
  'Email' is a text input saved as email
  'Password' is a password input saved as password
  button 'Log In':
    get user from '/api/auth/login'
    currentUser is user
    isLoggedIn is true
    navigate to '/dashboard'

page 'Dashboard' at '/dashboard':
  on page enter:
    if isLoggedIn is false then navigate to '/'
    otherwise:
      get stats from '/api/stats'
  heading 'Dashboard'
  display stats as table

page 'Settings' at '/settings':
  on page enter:
    if isLoggedIn is false then navigate to '/'
  heading 'Settings'
  text 'Welcome back'

page 'Profile' at '/profile':
  on page enter:
    if isLoggedIn is false then navigate to '/'
    otherwise:
      get profile from '/api/profile'
  heading 'My Profile'
  display profile's name
```

### Before/After: Router output

**Before (current):**
```js
function _router() {
  const hash = location.hash.slice(1) || '/';
  for (const [route, pageId] of Object.entries(_routes)) {
    const el = document.getElementById('page_' + pageId);
    if (el) el.style.display = (hash === route) ? 'block' : 'none';
  }
}
window.addEventListener('hashchange', _router);
_router();
```

**After (phase 51):**
```js
// Per-page enter handlers (compiled from `on page enter:` blocks)
function _enter_Dashboard() {
  if (_state.isLoggedIn === false) { window.location.hash = '/'; }
  else {
    fetch('/api/stats').then(r => r.json()).then(data => {
      _state.stats = data; _recompute();
    });
  }
}
function _enter_Settings() {
  if (_state.isLoggedIn === false) { window.location.hash = '/'; }
}
function _enter_Profile() {
  if (_state.isLoggedIn === false) { window.location.hash = '/'; }
  else {
    fetch('/api/profile').then(r => r.json()).then(data => {
      _state.profile = data; _recompute();
    });
  }
}

// Hash Router
const _routes = {
  '/': 'Login',
  '/dashboard': 'Dashboard',
  '/settings': 'Settings',
  '/profile': 'Profile'
};
function _router() {
  const hash = location.hash.slice(1) || '/';
  for (const [route, pageId] of Object.entries(_routes)) {
    const el = document.getElementById('page_' + pageId);
    if (el) el.style.display = (hash === route) ? 'block' : 'none';
  }
  if (hash === '/dashboard') _enter_Dashboard();
  if (hash === '/settings') _enter_Settings();
  if (hash === '/profile') _enter_Profile();
  _recompute();
}
window.addEventListener('hashchange', _router);
_router();
```

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| `on page enter:` (not `on route change:` or `on navigate:`) | Reads naturally as "when entering this page". 14-year-old test: pass. |
| Enter handler fires on EVERY navigation (including initial) | Consistent behavior. Auth redirects work on first load. |
| Router calls `_recompute()` always | Ensures page content reflects current state on navigation. Bug fix. |
| Top-level assigns = shared state | Already how `_state` works. Zero new syntax needed. Just document. |
| `if/otherwise` for auth guards | No implicit `return` needed. Clear idiom for conditional page actions. |
| `navigate to` is already a synonym | `go_to` synonym already has `navigate to`. No new work needed. |

---

## Section 3 — Data Flow

```
User navigates to #/dashboard
         │
         ▼
window.hashchange fires
         │
         ▼
_router() runs
  ├─ shows #page_Dashboard div
  ├─ hides all other page divs
  ├─ calls _enter_Dashboard() ──────→ reads _state.isLoggedIn
  │                                          │
  │                               isLoggedIn=false → window.location.hash = '/'
  │                               isLoggedIn=true  → fetch('/api/stats')
  │                                                         │
  │                                                   _state.stats = data
  │                                                   _recompute()
  └─ calls _recompute()  ──────────→ re-renders current page DOM
```

**Shared state is preserved because:**
- `_state` is a single JS object created once at app startup
- Navigation shows/hides divs — does NOT destroy or recreate `_state`
- Top-level Clear assigns (before any `page` block) → `_state` properties

---

## Section 4 — Integration Points

| Producer | Consumer | Data |
|----------|----------|------|
| `on page enter:` block | `_enter_PageName()` function | Compiled action body |
| `compileToReactiveJS` | `compiledJS` in `compileToHTML` | String of JS that defines `_enter_*` functions |
| `body` AST in `compileToHTML` | Router `if (hash === ...)` calls | Page routes + enter handler names |
| `_state` (shared) | All pages via `_recompute()` | Auth state, loaded data |

---

## Section 5 — Edge Cases

| Scenario | How Handled |
|----------|-------------|
| Page has `on page enter:` but no route | Skip — enter handlers require a route |
| Multiple `on page enter:` blocks in one page | Use only the first; emit compile warning |
| `on page enter:` in a non-PAGE context (section, nested) | Parser only allows inside PAGE bodies |
| Enter handler calls `navigate to` without guard | Executes normally; DOM may flash briefly. Document this. |
| No pages with `on page enter:` | Router omits enter calls; behavior identical to before |
| Single page app (no routing) | No router generated; `on page enter:` is a no-op (or compile warning) |
| Shared state variables same name as page-local | They're all in `_state` — no collision. Same variable. |
| `_recompute()` called before enter handler async completes | Fine — enter handler async callback calls `_recompute()` again when done |
| Auth redirect loop (dashboard redirects to login, login redirects to dashboard) | User logic error. Document the correct pattern. |

---

## Section 6 — ENV VARS

None required.

---

## Section 7 — Files to Create

### `apps/multi-page-spa/main.clear` (new demo app)

```clear
build for web

theme 'midnight'

# Shared state across all pages
currentUser is nothing
isLoggedIn is false

page 'Login' at '/':
  section 'Login Form' with style app_card:
    heading 'Sign In'
    'Email' is a text input saved as email
    'Password' is a password input saved as password
    button 'Log In':
      isLoggedIn is true
      currentUser is email
      navigate to '/dashboard'
    button 'Go to About':
      navigate to '/about'

page 'Dashboard' at '/dashboard':
  on page enter:
    if isLoggedIn is false then navigate to '/'
    otherwise:
      get stats from '/api/stats'
  section 'Header' with style app_header:
    heading 'Dashboard'
    button 'Settings':
      navigate to '/settings'
    button 'Profile':
      navigate to '/profile'
    button 'Log Out':
      isLoggedIn is false
      currentUser is nothing
      navigate to '/'
  section 'Content' with style app_content:
    text 'Welcome back'
    display stats as table

page 'Settings' at '/settings':
  on page enter:
    if isLoggedIn is false then navigate to '/'
  section 'Header' with style app_header:
    heading 'Settings'
    button 'Back':
      navigate to '/dashboard'
  section 'Content' with style app_content:
    text 'Settings page'

page 'Profile' at '/profile':
  on page enter:
    if isLoggedIn is false then navigate to '/'
  section 'Header' with style app_header:
    heading 'My Profile'
    button 'Back':
      navigate to '/dashboard'
  section 'Content' with style app_content:
    text 'Profile page'

page 'About' at '/about':
  heading 'About'
  text 'Multi-page SPA example in Clear'
  button 'Go Home':
    navigate to '/'
```

---

## Section 8 — Files to Modify

### `synonyms.js`

After `on_page_load` entry (line ~298), add:
```js
on_page_enter: Object.freeze(['on page enter', 'when entering this page', 'on entering']),
```

**Why here:** keeps all page lifecycle synonyms together. No collision risk — 3-word phrases, unique 3rd word (`enter` vs `load`).

Bump `SYNONYM_VERSION`.

---

### `parser.js` — NodeType declaration

Add after `ON_PAGE_LOAD`:
```js
ON_PAGE_ENTER: 'on_page_enter',
```

Add parser handler after `on_page_load` handler (~line 945):
```js
['on_page_enter', (ctx) => {
  // Block form only — "on page enter:" followed by indented body
  const { body: enterBody, endIdx: enterEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
  ctx.body.push({ type: NodeType.ON_PAGE_ENTER, body: enterBody, line: ctx.line });
  return enterEnd;
}],
```

**Note:** No inline form. `on page enter:` always takes a block. An enter handler without a body is a mistake.

Update parser.js TOC to add `ON_PAGE_ENTER` in the lifecycle handlers section.

---

### `compiler.js` — `compileToReactiveJS`

**Change 1: Scan body for enter handlers BEFORE flatten**

Add after the `flatten` function definition and `flatten(body)` call:
```js
// Collect per-page enter handlers (must scan before flatten loses page context)
const pageEnterHandlers = [];
for (const node of body) {
  if (node.type === NodeType.PAGE && node.route) {
    const enterNodes = node.body ? node.body.filter(n => n.type === NodeType.ON_PAGE_ENTER) : [];
    if (enterNodes.length > 0) {
      pageEnterHandlers.push({
        pageId: sanitizeName(node.title),
        route: node.route,
        body: enterNodes[0].body  // use first enter block only
      });
    }
  }
}
```

**Change 2: Skip `ON_PAGE_ENTER` in flatten**

In the `flatten` function:
```js
} else if (node.type === NodeType.ON_PAGE_ENTER) {
  // Skip -- compiled separately as _enter_PageName() functions
} else {
  flatNodes.push(node);
}
```

**Change 3: Skip in node categorization**

In the `for (const node of flatNodes)` switch, add to the "skip" list alongside `STYLE_DEF`, `CONTENT`, etc.:
```js
case NodeType.ON_PAGE_ENTER:
  break;
```

**Change 4: Emit enter functions**

After the component functions section (~line 4707), add:
```js
// Per-page enter handlers (from 'on page enter:' blocks)
if (pageEnterHandlers.length > 0) {
  lines.push('');
  lines.push('// --- Per-page enter handlers ---');
  const enterCtx = { lang: 'js', indent: 1, declared, stateVars, mode: 'web', sourceMap };
  for (const { pageId, body: enterBody } of pageEnterHandlers) {
    lines.push(`function _enter_${pageId}() {`);
    for (const n of enterBody) {
      const code = compileNode(n, enterCtx);
      if (code !== null) lines.push(code);
    }
    lines.push('}');
  }
}
```

**Change 5: Add `case NodeType.ON_PAGE_ENTER` to `_compileNodeInner` skip list**

In the section "Nodes handled by dedicated loops":
```js
case NodeType.ON_PAGE_ENTER:
```

---

### `compiler.js` — `compileToHTML`

**Change: Update router to call enter handlers + `_recompute()`**

Replace the router block at lines 5876–5892:
```js
if (hasRouting) {
  const routeMap = pages.map(p => `  '${p.route}': '${sanitizeName(p.title)}'`).join(',\n');

  // Scan for pages with on-page-enter handlers
  const enterHandlerPages = [];
  for (const node of body) {
    if (node.type === NodeType.PAGE && node.route) {
      const hasEnter = node.body && node.body.some(n => n.type === NodeType.ON_PAGE_ENTER);
      if (hasEnter) {
        enterHandlerPages.push({ route: node.route, pageId: sanitizeName(node.title) });
      }
    }
  }
  const enterCalls = enterHandlerPages
    .map(({ route, pageId }) => `  if (hash === '${route}' && typeof _enter_${pageId} !== 'undefined') _enter_${pageId}();`)
    .join('\n');

  routerJS = `
// --- Hash Router ---
const _routes = {
${routeMap}
};
function _router() {
  const hash = location.hash.slice(1) || '/';
  for (const [route, pageId] of Object.entries(_routes)) {
    const el = document.getElementById('page_' + pageId);
    if (el) el.style.display = (hash === route) ? 'block' : 'none';
  }
${enterCalls ? enterCalls + '\n' : ''}  if (typeof _recompute !== 'undefined') _recompute();
}
window.addEventListener('hashchange', _router);
_router();`;
}
```

---

### `intent.md` — Web Frontend section

Add to the `PAGE` section table:
```
| `ON_PAGE_ENTER` | `on page enter:` + body | Fires on every navigation to this page's route. Compiles to `_enter_PageName()` called by router. |
```

Update the canonical vocabulary table:
```
| Page enter handler | `on page enter:` |
```

---

### `compiler.js` TOC

Add to the REACTIVE JS COMPILER section description:
```
//                                     on-page-enter handlers
```

---

## Section 9 — Pre-Flight Checklist

- [ ] `learnings.md` exists at project root
- [ ] `on_page_enter` synonym doesn't collide with existing synonyms (verify: `on page load` vs `on page enter` — different 3rd word ✓)
- [ ] `sanitizeName(node.title)` for page IDs is consistent between `buildHTML` and `compileToReactiveJS` (both use same function ✓)
- [ ] `_enter_PageName()` functions are emitted BEFORE `_router()` in script order (compiledJS before routerJS ✓)
- [ ] Router's `_recompute()` call doesn't double-render (enter handler's async callbacks call `_recompute()` again — this is fine, same pattern as `on page load`)
- [ ] `on page enter:` without a page route: parser handler fires but `pageEnterHandlers` scan skips pages without routes ✓
- [ ] Single-page apps: `hasRouting = pages.length > 1` → router not generated → `on page enter:` silently has no effect (acceptable for phase 51)

---

## Section 10 — TDD Cycles

### Cycle 1: Synonym + Node Type (parser only)

**Goal:** `on page enter:` parses to an `ON_PAGE_ENTER` node.

**🔴 Failing tests first:**
```js
describe('on page enter lifecycle', () => {
  it('parses on page enter block', () => {
    const src = `
build for web
page 'Dashboard' at '/dashboard':
  on page enter:
    heading 'Hello'
`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const page = ast.body.find(n => n.type === NodeType.PAGE);
    const enterNode = page.body.find(n => n.type === NodeType.ON_PAGE_ENTER);
    expect(enterNode).toBeDefined();
    expect(enterNode.body).toHaveLength(1);
    expect(enterNode.body[0].type).toBe(NodeType.CONTENT);
  });

  it('navigate to is synonym for go to', () => {
    const src = `
build for web
page 'Home' at '/':
  button 'Go':
    navigate to '/dashboard'
`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("window.location.hash = '/dashboard'");
  });
});
```

**🟢 Implement:**
1. Add `on_page_enter` to `synonyms.js`
2. Bump `SYNONYM_VERSION`
3. Add `ON_PAGE_ENTER: 'on_page_enter'` to `NodeType` in `parser.js`
4. Add parser handler for `on_page_enter`
5. Run `node clear.test.js` — new tests pass, no regressions

**Commit:** `feat: add ON_PAGE_ENTER node type and parser handler`

---

### Cycle 2: Reactive JS compiler emits enter functions

**Goal:** `_enter_PageName()` function is generated from `on page enter:` block.

**🔴 Failing tests:**
```js
  it('compiles on page enter to _enter_ function', () => {
    const src = `
build for web
page 'Dashboard' at '/dashboard':
  on page enter:
    navigate to '/'
  heading 'Dashboard'
`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('function _enter_Dashboard()');
    expect(result.html).toContain("window.location.hash = '/'");
  });

  it('on page enter does not appear as flat node', () => {
    // ON_PAGE_ENTER should NOT be compiled as a stray statement
    const src = `
build for web
page 'Home' at '/':
  on page enter:
    navigate to '/'
  heading 'Home'
page 'Other' at '/other':
  heading 'Other'
`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    // Should not crash or produce null-output warnings
  });

  it('shared state is accessible across pages', () => {
    const src = `
build for web
isLoggedIn is false
page 'Login' at '/':
  button 'Login':
    isLoggedIn is true
    navigate to '/dashboard'
page 'Dashboard' at '/dashboard':
  on page enter:
    if isLoggedIn is false then navigate to '/'
  heading 'Dashboard'
`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('_state.isLoggedIn');
    expect(result.html).toContain('function _enter_Dashboard()');
  });
```

**🟢 Implement:**
1. Add `pageEnterHandlers` scan in `compileToReactiveJS` (before flatten)
2. Skip `ON_PAGE_ENTER` in flatten
3. Skip in node categorization loop
4. Emit `_enter_PageName()` functions after component functions
5. Add `ON_PAGE_ENTER` to `_compileNodeInner` skip cases
6. Run `node clear.test.js` — tests pass, no regressions

**Commit:** `feat: emit _enter_PageName() functions for on-page-enter blocks`

---

### Cycle 3: Router calls enter handlers + `_recompute()`

**Goal:** Router calls `_enter_PageName()` on navigation and always calls `_recompute()`.

**🔴 Failing tests:**
```js
  it('router calls enter handler for page', () => {
    const src = `
build for web
page 'Home' at '/':
  heading 'Home'
page 'Dashboard' at '/dashboard':
  on page enter:
    navigate to '/'
  heading 'Dashboard'
`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("if (hash === '/dashboard'");
    expect(result.html).toContain('_enter_Dashboard()');
  });

  it('router always calls _recompute', () => {
    const src = `
build for web
page 'Home' at '/':
  heading 'Home'
page 'About' at '/about':
  heading 'About'
`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('_recompute()');
  });

  it('full SPA with shared auth state compiles clean', () => {
    const src = [
      "build for web",
      "isLoggedIn is false",
      "page 'Login' at '/':",
      "  button 'Log In':",
      "    isLoggedIn is true",
      "    navigate to '/dashboard'",
      "page 'Dashboard' at '/dashboard':",
      "  on page enter:",
      "    if isLoggedIn is false then navigate to '/'",
      "  heading 'Dashboard'",
      "page 'Settings' at '/settings':",
      "  on page enter:",
      "    if isLoggedIn is false then navigate to '/'",
      "  heading 'Settings'",
      "page 'Profile' at '/profile':",
      "  on page enter:",
      "    if isLoggedIn is false then navigate to '/'",
      "  heading 'Profile'",
    ].join('\n');
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('_enter_Dashboard');
    expect(result.html).toContain('_enter_Settings');
    expect(result.html).toContain('_enter_Profile');
    expect(result.html).toContain('_state.isLoggedIn');
  });
```

**🟢 Implement:**
1. Update router in `compileToHTML` to call enter handlers + `_recompute()`
2. Run `node clear.test.js` — all tests pass

**Commit:** `feat: router calls per-page enter handlers and _recompute on navigation`

---

### Cycle 4: Demo app + intent.md + docs

**Goal:** Working demo app + documentation updates.

**🟢 Implement:**
1. Create `apps/multi-page-spa/main.clear`
2. Verify it compiles: `node -e "import('./index.js').then(m => { const r = m.compileProgram(require('fs').readFileSync('apps/multi-page-spa/main.clear', 'utf8')); console.log(r.errors); })"`
3. Update `intent.md` — add `ON_PAGE_ENTER` to Web Frontend table
4. Update `intent.md` — add `navigate to` to canonical vocabulary table
5. Update compiler.js TOC
6. Update parser.js TOC
7. Run `node clear.test.js` — all tests pass

```markdown
📚 Update learnings.md: run update-learnings skill to capture lessons from this phase.
```

**Commit:** `feat: multi-page routing demo app, intent.md updates`

---

## Section 11 — Logging Tags

`[ROUTING]` — for all logging in this feature branch.

---

## Section 12 — Test Run Order

```bash
node clear.test.js                    # 1489 compiler tests
# Focus on new test suite: "on page enter lifecycle"
```

No playground tests needed (pure compiler feature).

---

## Section 13 — Browser Checklist

Manually verify the demo app:
- [ ] `node clear.test.js apps/multi-page-spa/main.clear` compiles without errors
- [ ] Compiled HTML has router with enter handler calls
- [ ] Compiled HTML has `_enter_Dashboard()`, `_enter_Settings()`, `_enter_Profile()` functions
- [ ] `_state.isLoggedIn` used in enter functions
- [ ] `_recompute()` called in router

---

## Section 14 — Success Criteria

- [ ] `on page enter:` parses to `ON_PAGE_ENTER` node
- [ ] `_enter_PageName()` function generated for each page with `on page enter:` block
- [ ] Router calls the correct enter function when navigating to a page
- [ ] Router always calls `_recompute()` after navigation (fixes existing bug)
- [ ] `navigate to '/path'` compiles correctly (synonym already works)
- [ ] Top-level assigns become shared `_state` properties (already works, covered by test)
- [ ] Full 4-page auth SPA compiles cleanly with 0 errors
- [ ] All 1489 existing tests still pass
- [ ] `intent.md` updated with `ON_PAGE_ENTER`

---

## Section 15 — What Does NOT Change

- `go to` still works (navigate to is a synonym)
- Existing `on page load:` behavior unchanged
- Hash routing mechanism unchanged (still `window.location.hash`)
- Single-page apps unaffected (no router generated)
- Backend compilation unaffected

---

## Resume Prompt

```
Continue implementing plan: plans/plan-multipage-routing-phase51-04-09-2026.md

Branch: feature/multipage-routing-phase51

Current state: [describe what's done]

Next step: [describe what's next]

Run `node clear.test.js` to verify no regressions before each commit.
```
