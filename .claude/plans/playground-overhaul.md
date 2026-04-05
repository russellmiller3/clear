# Plan: Playground Visual Redesign

**Date:** 2026-04-05
**Scope:** Large (10 TDD cycles, UI components, async operations)
**File:** `playground/index.html` (single file, full rewrite)

---

## 🎯 THE PROBLEM

The playground uses zero DaisyUI components despite loading the library. Every UI element is hand-styled with inline `style.cssText` and hardcoded hex colors. It looks amateur next to the polished DaisyUI-styled apps it compiles. Users can't tell if compiled apps actually work because backend examples show static route lists instead of live API testers.

**Root cause:** The HTML was written as a quick prototype with inline styles. Nobody went back to replace them with DaisyUI component classes.

---

## 🔧 THE FIX

Replace all inline styles with DaisyUI v5 component classes. The playground already loads `daisyui.min.css` — we just need to use it.

**Key DaisyUI components to adopt:**
```
navbar       → header bar (replaces custom div)
menu         → sidebar example list (replaces custom buttons)
tabs         → output tabs (replaces custom tab-btn)
card         → info panels (replaces custom styled divs)
mockup-browser → preview iframe wrapper
badge        → status indicators, method labels
btn          → compile button, send button
```

**Architecture (unchanged):**
```
┌─────────────┬──────────────┬───────────────┐
│  Sidebar    │  Editor      │  Output       │
│  (menu)     │  (textarea)  │  (tabs)       │
│             │              │  ┌──────────┐ │
│  Examples   │              │  │ Preview  │ │
│  Try This   │              │  │ JS/HTML  │ │
│  Stats      │              │  │ API Test │ │
│             │              │  └──────────┘ │
└─────────────┴──────────────┴───────────────┘
```

---

## 📁 FILES INVOLVED

### Modified files

| File | What changes |
|------|-------------|
| `playground/index.html` | Full rewrite of HTML structure + CSS + JS. Keep all existing JS logic (compiler import, examples, compile function, tab switching, browser server injection). Replace markup and styles. |

### No new files needed

---

## 📁 EXISTING CODE — Phased Reading

### Always read first:
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec (already read — playground not in spec) |
| `playground/index.html` | The file we're rewriting |

### Phase 1-3 (sidebar, navbar, tabs):
| File | Why |
|------|-----|
| `playground/index.html` lines 61-100 | Current sidebar markup |
| `playground/index.html` lines 106-148 | Current header + tabs + output area |

### Phase 4-5 (preview, code output):
| File | Why |
|------|-----|
| `playground/index.html` lines 406-424 | Preview/tab display logic |
| `playground/index.html` lines 516-623 | Guide rendering |

### Phase 6-8 (compile animation, API tester):
| File | Why |
|------|-----|
| `index.js` | `compileProgram()` — need to understand if we can hook individual passes |
| `playground/index.html` lines 363-381 | Current `doCompile()` function |
| `playground/index.html` lines 429-512 | `renderBackendPreview()` function to replace |

---

## 🚨 EDGE CASES

| Scenario | How we handle |
|----------|---------------|
| DaisyUI CSS not loaded (network fail) | Fallback: page still readable, just unstyled |
| Example with compile errors | Error panel uses DaisyUI `alert alert-error` |
| Very long Clear source (100+ lines) | Editor textarea scrolls, sidebar stays fixed |
| Mobile viewport | Not this PR — noted for Phase 5 |
| Browser server fetch fails | API tester shows error response with status code |
| User types invalid JSON in API tester | Show parse error, don't crash |

---

## 🎯 ERROR UX

| State | What user sees |
|-------|---------------|
| Compile success | Green badge: "31 → 20 lines · 8ms" |
| Compile error | Red badge: "2 errors". Error panel with line numbers + messages |
| API request success | Green status badge + formatted JSON response |
| API request failure | Red status badge + error message |
| Empty editor | Placeholder: "Pick an example or start typing" |

---

## 📋 TDD CYCLES

### Phase 1: Sidebar → DaisyUI `menu`

**Cycle 1.1: Sidebar markup**

🔴 **Test:** Open playground. Inspect sidebar. Expect `<ul class="menu">` with `<li class="menu-title">` for "Examples" header. Each example is `<li><a>` with description `<span>` below name.

🟢 **Code:** Replace sidebar HTML (lines 65-99) with:
```html
<aside class="w-64 bg-base-200 border-r border-base-300/50 flex flex-col overflow-y-auto shrink-0">
  <div class="p-5 pb-3">
    <h1 class="text-2xl font-extrabold tracking-tight text-primary" style="font-family:var(--font-display)">Clear</h1>
    <p class="mt-1 text-sm text-base-content/50 leading-snug">Write readable code.<br>Compile to production apps.</p>
  </div>
  <div class="divider my-0 px-5"></div>
  <ul class="menu menu-sm px-3 py-2" id="exampleButtons">
    <li class="menu-title">Examples</li>
    <!-- JS generates <li><a> items -->
  </ul>
  <div class="divider my-0 px-5"></div>
  <div class="p-5 pt-2">
    <h2 class="menu-title text-xs px-0">Try This</h2>
    <ul class="text-xs text-base-content/50 space-y-1 mt-1">
      <li>Change a heading text</li>
      <li>Add a new field to a table</li>
      <li>Switch theme 'midnight' to 'ivory'</li>
      <li>Add a button with an action</li>
    </ul>
  </div>
  <div class="mt-auto p-5 pt-2 text-base-content/30 text-xs leading-relaxed">
    <div class="divider my-1"></div>
    1005 compiler tests · 0 deps · Runs in browser
  </div>
</aside>
```

🔄 **Refactor:** Remove all `btn.style.cssText` inline style assignments from JS example button generation. Use DaisyUI `active` class instead of custom `.example-btn-active`.

**Verify:** Screenshot sidebar. Menu items have proper hover states, active highlighting, descriptions.

---

### Phase 2: Header → DaisyUI `navbar`

**Cycle 2.1: Navbar markup**

🔴 **Test:** Inspect header bar. Expect `<div class="navbar">` with filename in mono, status as `<span class="badge">`, and compile as `<button class="btn btn-success btn-sm">`.

🟢 **Code:** Replace header (lines 106-112) with:
```html
<div class="navbar bg-base-200 border-b border-base-300/50 min-h-0 h-11 px-4">
  <div class="flex-1 flex items-center gap-3">
    <span class="font-mono text-sm font-semibold">main.clear</span>
    <span class="badge badge-success badge-sm font-mono" id="statusText"></span>
  </div>
  <div class="flex-none">
    <button id="compileBtn" class="btn btn-success btn-sm font-mono">Compile</button>
  </div>
</div>
```

🔄 **Refactor:** Remove inline `style` from compile button and status text. Status color now controlled by toggling `badge-success` / `badge-error` classes.

**Verify:** Screenshot header. Badge shows green/red status. Button is DaisyUI-styled.

---

### Phase 3: Output tabs → DaisyUI `tabs`

**Cycle 3.1: Tab markup**

🔴 **Test:** Inspect tab bar. Expect `<div role="tablist" class="tabs tabs-bordered">` with `<a role="tab" class="tab">` elements. Active tab has `tab-active` class.

🟢 **Code:** Replace tab bar (lines 133-139) with:
```html
<div role="tablist" class="tabs tabs-bordered bg-base-200 px-2">
  <a role="tab" class="tab tab-active tab-sm" data-tab="preview">Preview</a>
  <a role="tab" class="tab tab-sm" data-tab="js">JavaScript</a>
  <a role="tab" class="tab tab-sm" data-tab="html">HTML</a>
  <a role="tab" class="tab tab-sm" data-tab="css">CSS</a>
  <div class="flex-1"></div>
  <a role="tab" class="tab tab-sm" data-tab="guide">Guide</a>
</div>
```

🔄 **Refactor:** Update tab click handler to toggle `tab-active` class instead of custom `.tab-active` with inline styles. Remove custom `.tab-btn` styling.

**Verify:** Click each tab. Active state transitions correctly with DaisyUI styling.

---

### Phase 4: Preview → `mockup-browser`

**Cycle 4.1: Browser mockup wrapper**

🔴 **Test:** Preview tab shows iframe inside `<div class="mockup-browser bg-base-300">` with URL bar.

🟢 **Code:** In `showTab('preview')`, wrap iframe output:
```html
<div class="mockup-browser bg-base-300 border border-base-300/50 h-full flex flex-col">
  <div class="mockup-browser-toolbar">
    <div class="input">localhost:3000/</div>
  </div>
  <div class="flex-1 bg-base-100 overflow-auto">
    <iframe sandbox="allow-scripts allow-same-origin" style="width:100%;height:100%;border:none;"></iframe>
  </div>
</div>
```

🔄 **Refactor:** Remove `background:#fff` inline style from iframe. Transparent bg lets theme show through.

**Verify:** Screenshot preview. Looks like a real browser window with URL bar.

---

### Phase 5: Code output → polished `<pre>`

**Cycle 5.1: Styled code display**

🔴 **Test:** JS/HTML/CSS tabs show code in a dark container with mono font, proper padding, and line numbers.

🟢 **Code:** In code tab rendering, replace bare `<pre>` with:
```html
<div class="bg-base-300 rounded-lg m-2 overflow-auto h-full">
  <pre class="p-4 font-mono text-xs leading-relaxed text-base-content/70 whitespace-pre overflow-auto">{code}</pre>
</div>
```

🔄 **Refactor:** Extract code rendering to a helper function `renderCode(code, label)`.

**Verify:** Screenshot JS tab. Code is readable with proper contrast.

---

### Phase 6: Compile animation + timing

**Cycle 6.1: Show compiler phases**

🔴 **Test:** Type in editor. Status badge briefly shows "Compiling..." then "✓ 31 → 20 · 8ms". The compile function reports timing.

🟢 **Code:** Modify `doCompile()`:
```javascript
function doCompile() {
  const t0 = performance.now();
  statusText.textContent = 'Compiling...';
  statusText.className = 'badge badge-warning badge-sm font-mono';
  try {
    compiled = clear.compileProgram(editor.value);
    const ms = Math.round(performance.now() - t0);
    if (compiled.errors.length > 0) {
      statusText.textContent = compiled.errors.length + ' error' + (compiled.errors.length === 1 ? '' : 's');
      statusText.className = 'badge badge-error badge-sm font-mono';
    } else {
      const src = editor.value.split('\n').length;
      const out = (compiled.javascript || compiled.html || '').split('\n').length;
      statusText.textContent = '✓ ' + src + ' → ' + out + ' lines · ' + ms + 'ms';
      statusText.className = 'badge badge-success badge-sm font-mono';
    }
  } catch (e) {
    compiled = { errors: [{ line: 0, message: e.message }], javascript: '', html: '', css: '' };
    statusText.textContent = 'Error';
    statusText.className = 'badge badge-error badge-sm font-mono';
  }
  showTab(activeTab);
}
```

🔄 **Refactor:** Remove old `statusText.style.color` assignments.

**Verify:** Edit code. See "Compiling..." flash to "✓ 31 → 20 lines · 8ms".

---

### Phase 7: Example descriptions + scroll

**Cycle 7.1: Add descriptions to examples**

🔴 **Test:** Click an example. Editor scrolls to top. Below sidebar example list, description text updates to show what the app does and what to try.

🟢 **Code:** Add `descriptions` object alongside `EXAMPLES`:
```javascript
const DESCRIPTIONS = {
  'Lead Scorer': { desc: 'AI agent pipeline with structured output', tryThis: 'Switch to JS tab to see the compiled agent function' },
  'Todo App': { desc: 'Full-stack CRUD with validation', tryThis: 'Type a todo and click Add — it saves to the in-browser database' },
  'Dashboard': { desc: 'Sidebar layout with metric cards', tryThis: 'Change theme to ivory and see it switch to light mode' },
  'Invoice API': { desc: 'REST API with auth and role guards', tryThis: 'Check the JS tab — DELETE requires admin role' },
  'Landing Page': { desc: 'Marketing page with hero sections', tryThis: 'Edit the heading text and watch the preview update live' },
  'Hiring Pipeline': { desc: '3-agent chain: screen → score → summarize', tryThis: 'Read the Clear source — each agent calls the next' },
};
```

In `loadExample()`, add `editor.scrollTop = 0;` and update a description panel in the sidebar.

🔄 **Refactor:** Descriptions rendered as `<p class="text-xs text-base-content/40">` under each menu item.

**Verify:** Click each example. Editor scrolls. Description visible.

---

### Phase 8: Interactive API tester

**Cycle 8.1: API tester for backend examples**

🔴 **Test:** Load Lead Scorer. Preview shows expandable endpoint cards. POST /api/leads has JSON textarea pre-filled. Click Send. See 201 response with created record.

🟢 **Code:** New `renderInteractiveAPITester()` function replacing `renderBackendPreview()`:
- Inject browser server into a hidden iframe
- Each endpoint: card with method badge + path
- POST/PUT: textarea with example JSON payload (derived from validation rules or table schema)
- Send button that calls `hiddenIframe.contentWindow.fetch(path, { method, body })`
- Response panel: status badge + formatted JSON

```javascript
function renderInteractiveAPITester(js, source, compiled) {
  // 1. Create hidden iframe with browser server
  // 2. Extract routes from compiled JS
  // 3. For each route, render interactive card
  // 4. Wire Send buttons to fetch via hidden iframe
  // 5. Show response in expandable panel
}
```

Key UI per endpoint:
```html
<div class="card bg-base-200 border border-base-300/50 mb-2">
  <div class="card-body p-3">
    <div class="flex items-center gap-2">
      <span class="badge badge-success badge-sm font-mono">GET</span>
      <span class="font-mono text-sm">/api/leads</span>
      <button class="btn btn-ghost btn-xs ml-auto">Send</button>
    </div>
    <!-- Expandable: request body textarea + response panel -->
  </div>
</div>
```

🔄 **Refactor:** Extract route parsing into helper. Generate example payloads from table schemas.

**Verify:** Load each backend example. Send requests. See real responses.

---

### Phase 9: Download button

**Cycle 9.1: Export compiled output as zip**

🔴 **Test:** Click Download button next to Compile. Browser downloads a zip containing compiled files + README.

🟢 **Code:** Add JSZip CDN to head. Add Download button in navbar. On click:
```javascript
async function downloadZip() {
  if (!compiled) return;
  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js')).default;
  const zip = new JSZip();
  if (compiled.javascript) zip.file('server.js', compiled.javascript);
  if (compiled.html) zip.file('index.html', compiled.html);
  if (compiled.css) zip.file('style.css', compiled.css);
  zip.file('README.md', `# ${exampleName}\n\nCompiled from Clear.\n\n## Run\n\n\`\`\`bash\nnpm install express\nnode server.js\n\`\`\`\n`);
  zip.file('package.json', JSON.stringify({ name: 'clear-app', dependencies: { express: '^4' } }, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exampleName.toLowerCase().replace(/\s+/g, '-') + '.zip';
  a.click();
}
```

🔄 **Refactor:** Only include files that exist (web-only apps don't have server.js).

**Verify:** Download zip. Unzip. Inspect contents.

---

### Phase 10: Intro banner

**Cycle 10.1: Dismissible intro card**

🔴 **Test:** Fresh load shows a card above the editor. Clicking dismiss hides it and persists in localStorage.

🟢 **Code:** Add above the editor split:
```html
<div class="alert bg-base-200 border-base-300/50 mx-2 mt-2 mb-0" id="introBanner">
  <div>
    <h3 class="font-bold text-sm">Welcome to Clear</h3>
    <p class="text-xs text-base-content/60">Write plain English. Compile to production JavaScript, HTML, and Python. Pick an example or start typing.</p>
  </div>
  <button class="btn btn-ghost btn-xs" onclick="document.getElementById('introBanner').remove(); localStorage.setItem('clear_intro_dismissed','1')">✕</button>
</div>
```

On load: `if (localStorage.getItem('clear_intro_dismissed')) introBanner.remove();`

🔄 **Refactor:** None needed.

**Verify:** See banner. Dismiss. Reload. Banner stays hidden.

---

## 🧪 TESTING STRATEGY

**Test command:** Manual browser testing (no automated tests for playground HTML)

**For each phase:**
1. Start server: `npx http-server ./playground -p 8080 -c-1`
2. Open `http://localhost:8080`
3. Verify: zero console errors
4. Verify: all 6 examples compile
5. Verify: preview iframe renders correctly
6. Screenshot comparison vs current state

**Success criteria:**
- [ ] All DaisyUI components render correctly (menu, navbar, tabs, card, mockup-browser, badge, btn)
- [ ] All 6 examples compile with zero console errors
- [ ] Todo App full-stack works (add/list todos in browser)
- [ ] Backend examples show interactive API tester with working Send buttons
- [ ] Compile timing visible
- [ ] Download produces valid zip
- [ ] Theme (midnight dark) applies everywhere consistently
- [ ] No inline `style=` attributes remain except editor textarea and font-family vars

---

## 📚 LEARNINGS

After each phase, run `update-learnings` skill to capture lessons.

---

**Final step:** Run `red-team-plan` skill on this plan before executing.
