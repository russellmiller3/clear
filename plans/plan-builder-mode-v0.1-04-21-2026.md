# Plan: Builder Mode v0.1 — Marcus-first Studio layout

**Branch:** `feature/builder-mode-v01`
**Date:** 2026-04-21
**Scope:** Small-to-medium — frontend-only. CSS + HTML + inline JS inside `playground/ide.html`. No backend changes.
**Full spec:** `ROADMAP.md` → "Builder Mode — Marcus-first Studio layout (GTM-6 detail, 2026-04-21)"

---

## 🎯 What We're Building

Flip Studio's visual hierarchy from developer-first to Marcus-first, behind a feature flag (`?studio-mode=builder`). Same primitives, different layout. Opt-in only in v0.1 — classic 3-panel stays the default.

### Before (current default — stays default in v0.1)

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar:  New  Load  Compile  Run  Stop  Deploy  ...        │
├────────────┬────────────────────────┬───────────────────────┤
│   Chat     │    Editor              │    Preview            │
│  (360px)   │   (flex:1, dominant)   │   (flex:1)            │
└────────────┴────────────────────────┴───────────────────────┘
```

### After (new, opt-in via `?studio-mode=builder`)

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar:  New  Load  Compile  [Source]       ...  [⚡ Publish]
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           [ Live preview — full width, ~60vh ]              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 💬 Meph                       (~40vh)                       │
│ > What do you want to build, or which app to change?   [Send]│
└─────────────────────────────────────────────────────────────┘
```

Editor is hidden by default; clicking `Source` slides it in as a right-side rail (overlay, absolute-positioned, z-index 20).

### Sub-features in scope for v0.1

| ID | Name | Change |
|---|---|---|
| BM-1 | Chat-as-driver | Chat pane moves to bottom ~40vh in builder mode. Placeholder updated to "What do you want to build today, or which app to change?" |
| BM-2 | Preview-as-hero | Preview pane moves to top ~60vh in builder mode. Full-width. |
| BM-3-minimal | Source toggle button | Toolbar button toggles editor visibility (defaults hidden). No localStorage auto-hide logic yet. |
| BM-5 | Branded Publish button | Rename existing "Deploy" → "Publish" via JS. Apply `.publish-btn` class for distinct styling. Same handler, same endpoint. |
| Feature flag | `?studio-mode=builder` | URL param sets body class. Persists in localStorage. |

### Explicitly NOT in scope (later PRES)

BM-3 full (localStorage 3-session counter), BM-4 click-to-edit, BM-6 tile gallery, status bar, `cmd+.` shortcut, global default flip.

---

## 📐 Key Design Decisions

1. **Single feature flag: `body.builder-mode` class.** All layout differences live under `body.builder-mode { … }` rules. Adding or removing the class is the entire mode switch. Zero DOM restructuring.
2. **Flex direction flip.** Current `#main-area` is `display: flex` (implicit row). Builder mode: `flex-direction: column`. Preview stacks above chat. Editor hidden entirely.
3. **Editor as overlay when shown.** Source toggle puts `#editor-pane` into `position: absolute; right: 0; top: 46px; width: 400px; z-index: 20`. Doesn't re-flow the preview/chat. Closes with the same button.
4. **Inline resizer styles get cleared on mode switch.** The `ep-resizer` and `chat-resizer` drag handlers set inline `style.flex` / `style.width`. These would fight builder-mode CSS. On every `detectStudioMode()` run, strip inline flex/width/height on the three panes.
5. **Publish = styled Deploy.** Existing `#deploy-btn` kept (same ID, same `doDeploy()` handler, same visibility logic at line ~1234). JS swaps `textContent` and `classList` based on mode.
6. **localStorage persistence is best-effort.** Wrapped in try/catch. Private-browsing / quota failures log once, then silently fall back to URL-param-only mode.

---

## 📁 Existing Code to Read (per phase)

### Always read first

| File | Section | Lines (verified 2026-04-21) |
|---|---|---|
| `plans/plan-builder-mode-v0.1-04-21-2026.md` | this file | — |
| `ROADMAP.md` | "Builder Mode — Marcus-first Studio layout" | lines ~215–280 |

### Phase 1 — feature flag + CSS foundation

| File | What to read | Lines |
|---|---|---|
| `playground/ide.html` | Main layout CSS | **52–73** |
| `playground/ide.html` | Body + main-area DOM | **481–513** |
| `playground/ide.html` | End of main script (for inline JS insertion point) | last ~40 lines |
| `playground/ide.test.js` | Test pattern reference (Playwright assertion style) | **1–60** |

### Phase 2 — preview hero + chat bottom

| File | Why |
|---|---|
| `playground/ide.html` lines 52–73 | Current layout CSS, mobile breakpoint, `.collapsed` rule |
| `playground/ide.html` lines 4697–4750 | Resizer drag handlers that set inline styles |

### Phase 3 — Source toggle

| File | Why |
|---|---|
| `playground/ide.html` lines 483–511 | Toolbar structure, button patterns |
| `playground/ide.html` lines 4686–4692 | Existing `toggleChat()` — pattern to mirror |

### Phase 4 — Publish button

| File | Why |
|---|---|
| `playground/ide.html` lines 496–500 | Deploy button current HTML |
| `playground/ide.html` around line 1234 | Deploy button visibility logic |
| `playground/ide.html` around lines 79–83 | Existing `.toolbar-btn` / `.primary` styles |

### Phase 5 — placeholder

| File | Why |
|---|---|
| `playground/ide.html` line 540 | `chat-input` textarea with placeholder attribute |

### Phase 6 — hide chat toggle

| File | Why |
|---|---|
| `playground/ide.html` line 509 | `chat-toggle-btn` in toolbar |
| `playground/ide.html` lines 71–72 | `chat-toggle-btn` CSS |

### Phase 7 — docs

Already know the surfaces from CLAUDE.md Documentation Rule. No new reads needed.

---

## 🚨 Edge Cases

| # | Scenario | Expected Behavior | Test? |
|---|---|---|---|
| E-1 | `?studio-mode=Builder` (mixed case) | Normalized to lowercase, treated as `builder` | Yes |
| E-2 | `?studio-mode=` (empty) or unknown value | Ignore, default to classic. Log once to console: `[studio-mode] unrecognized value: X` | Yes |
| E-3 | localStorage unavailable (private browsing, quota exceeded) | try/catch swallows error. Log once. Feature flag works from URL only for that session. | Manual |
| E-4 | User in builder mode has `.collapsed` class on chat-pane from earlier | On mode enter, remove `.collapsed` class so `flex: 0 0 40vh` applies. | Yes |
| E-5 | User dragged ep-resizer or chat-resizer in classic mode (inline flex/width set), then switches to builder | `detectStudioMode()` strips inline `flex`, `width`, `height` on all three panes before applying class. | Yes |
| E-6 | Viewport width < 1100px in builder mode | Mobile breakpoint at line 73 forces chat to `width: 0 !important`. Builder mode CSS overrides with `body.builder-mode #chat-pane { width: 100% !important; }` at the same specificity. | Yes (resize viewport in Playwright) |
| E-7 | Empty state — no compiled app yet | Preview shows existing empty-state (`.empty-state` div at line 594). Publish button hidden (existing `canDeploy` logic). Chat still prompts user to build. No layout break. | Yes |
| E-8 | Source overlay opens, user clicks outside | Overlay persists. Only the Source button closes it. Simpler than click-outside detection. | Manual |
| E-9 | Source overlay open, user resizes viewport below 600px | Overlay width is 400px — clamp to `min(400px, 85vw)` so it doesn't cover entire screen. | Manual |
| E-10 | `doDeploy()` modal open, user toggles mode mid-modal | Modal is body-level, unaffected by layout changes. Modal stays, user can finish. | Manual |
| E-11 | Mode switched via URL, user typed code in editor, editor now hidden | Editor content preserved (CodeMirror state in memory). Click Source → content appears intact. | Yes |
| E-12 | `?studio-mode=classic` when localStorage already has builder | Removes `builder-mode` class, clears localStorage preference. | Yes |
| E-13 | Multiple URL params (`?studio-mode=builder&studio-mode=classic`) | URLSearchParams.get returns first value. Use first. | No (rare) |
| E-14 | Tests tab / Flywheel tab / Supervisor tab active when mode switches | These live inside `#preview-pane`. They get more room in builder mode. No code change needed for them. | Yes (visit Flywheel in builder mode, confirm renders) |
| E-15 | User switches mode mid-compile | CodeMirror state persists. `status` badge unaffected by layout. | Manual |

---

## 🎯 Error UX

No user-facing error strings — all modes work silently. On failure paths:

- Unknown `?studio-mode=X`: `console.warn('[studio-mode] unrecognized value: "X", defaulting to classic')`
- localStorage failure: `console.warn('[studio-mode] localStorage unavailable; mode will not persist across sessions')`

---

## 🔄 Integration Notes

- **Existing `toggleChat()` (line 4686):** unchanged. In builder mode the chat-toggle button is hidden via CSS, so no conflict.
- **Existing `doDeploy()`:** unchanged. Label and class change; handler identical.
- **Existing `#deploy-btn` visibility logic (around line 1234):** `document.getElementById('deploy-btn').style.display = canDeploy ? '' : 'none'`. Our rename only changes `textContent` + adds/removes a class — doesn't touch `style.display`. No conflict.
- **Existing tests (`ide.test.js`):** assert `#editor-pane.isVisible()` (line 56). Classic mode is the default, so this stays true. No regression.
- **Existing `deploy.test.js`:** asserts `/api/deploy` behavior, not button label. No regression.
- **Resizer drag handlers (lines 4697+, 4736+):** unchanged. In builder mode, CSS hides both resizers. Handlers fire on nothing, harmlessly.

---

## 📋 Implementation Steps — TDD Cycles

### Phase 1 — Feature flag + CSS foundation

**🔴 Test — `playground/builder-mode.test.js` (NEW FILE)**

Create the file with the same pattern as `ide.test.js`. Copy-paste:

```js
// =============================================================================
// PLAYGROUND IDE — BUILDER MODE E2E TESTS
// =============================================================================
// Run: node playground/builder-mode.test.js
// =============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3459';  // different port so both test files can coexist in parallel runs

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

console.log('Starting server on port 3459...');
const server = spawn('node', ['playground/server.js'], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, PORT: '3459' },
  stdio: 'pipe',
});
let serverReady = false;
server.stdout.on('data', d => { if (d.toString().includes('localhost:')) serverReady = true; });
server.stderr.on('data', d => process.stderr.write(d));
await new Promise(resolve => {
  const check = setInterval(() => { if (serverReady) { clearInterval(check); resolve(); } }, 100);
  setTimeout(() => { clearInterval(check); resolve(); }, 5000);
});
console.log('Server ready. Launching browser...\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

try {
  // ==========================================================================
  // PHASE 1 — Feature flag
  // ==========================================================================
  console.log('🚩 Phase 1 — Feature flag');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => document.body.classList.contains('builder-mode')),
    'body has builder-mode class when ?studio-mode=builder'
  );

  // Case-insensitivity
  await page.goto(`${BASE}/?studio-mode=BUILDER`, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => document.body.classList.contains('builder-mode')),
    'builder-mode class applied for uppercase value (E-1 case-insensitivity)'
  );

  // Unknown value → classic
  await page.goto(`${BASE}/?studio-mode=xyz`, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => !document.body.classList.contains('builder-mode')),
    'unknown value defaults to classic (E-2)'
  );

  // localStorage persistence
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  await page.goto(BASE, { waitUntil: 'networkidle' });  // reload without URL param
  assert(
    await page.evaluate(() => document.body.classList.contains('builder-mode')),
    'builder-mode persists after reload via localStorage'
  );

  // Opt-out
  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => !document.body.classList.contains('builder-mode')),
    'classic value opts back out (E-12)'
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => !document.body.classList.contains('builder-mode')),
    'classic preference persists after reload'
  );

  // No console errors
  const jsErrors = consoleErrors.filter(e => !e.includes('favicon'));
  assert(jsErrors.length === 0, `no JS errors across mode switches (got: ${jsErrors.join('; ') || 'none'})`);

} catch (err) {
  console.error('\n❌ Test suite threw:', err);
  failed++;
} finally {
  await browser.close();
  server.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
```

**🟢 Code — `playground/ide.html`**

**Insertion point:** inside the main `<script>` block, find the block that runs on page load (at the bottom of the script, before the closing `</script>`). Search for `// Initial load` or similar. If no obvious marker, insert as the LAST statement before `</script>`.

Add this JS:

```js
// ==========================================================================
// STUDIO MODE (builder / classic) — Builder Mode v0.1
// ==========================================================================
function detectStudioMode() {
  const VALID = ['builder', 'classic'];
  const body = document.body;

  // 1. Read URL param (case-insensitive)
  let urlMode = null;
  try {
    const p = new URLSearchParams(window.location.search).get('studio-mode');
    if (p !== null) {
      const norm = String(p).trim().toLowerCase();
      if (VALID.includes(norm)) urlMode = norm;
      else console.warn(`[studio-mode] unrecognized value: "${p}", defaulting to classic`);
    }
  } catch (e) { /* URLSearchParams always works in a browser, defensive only */ }

  // 2. Read localStorage (best-effort)
  let storedMode = null;
  try {
    const s = localStorage.getItem('studio-mode-pref');
    if (s && VALID.includes(s)) storedMode = s;
  } catch (e) {
    console.warn('[studio-mode] localStorage unavailable; mode will not persist across sessions');
  }

  // 3. Resolve: URL param wins, else stored, else classic
  const mode = urlMode || storedMode || 'classic';

  // 4. Persist URL-param choice (best-effort)
  if (urlMode) {
    try { localStorage.setItem('studio-mode-pref', urlMode); } catch (e) { /* silent */ }
  }

  // 5. Clear inline styles from any prior resizer drag (E-5)
  ['editor-pane', 'preview-pane', 'chat-pane'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.removeProperty('flex');
    el.style.removeProperty('width');
    el.style.removeProperty('height');
  });

  // 6. Clear .collapsed on chat-pane in builder mode (E-4)
  if (mode === 'builder') {
    document.getElementById('chat-pane')?.classList.remove('collapsed');
  }

  // 7. Apply class
  body.classList.toggle('builder-mode', mode === 'builder');
}

// Run on initial load. Every mode change is a full navigation, so no need for listeners.
detectStudioMode();
```

**Insertion point specifics:** immediately before the closing `</script>` tag of the main inline script block. Use Grep to find the last `</script>` in `ide.html` before `</body>`.

**CSS — append to the existing `<style>` block, right after line 73 (mobile breakpoint):**

```css
/* ==========================================================================
   BUILDER MODE v0.1 (Marcus-first layout)
   Opt-in via ?studio-mode=builder URL param
   ========================================================================== */
body.builder-mode #main-area { flex-direction: column; position: relative; }
```

**Gate for Phase 1:**
- `node playground/builder-mode.test.js` — Phase 1 block passes (6 assertions).
- `node playground/ide.test.js` — no regressions (classic mode default is untouched).

**🔄 Refactor:** extract the `VALID = ['builder', 'classic']` array as a top-level constant in the script block so Phase 2-6 can reference it if needed.

**Commit:** `feat(studio): builder-mode feature flag + CSS flex-direction swap (BM-1/2 foundation)`

---

### Phase 2 — Preview hero + chat bottom (BM-1 + BM-2 layout)

**🔴 Test — append to `playground/builder-mode.test.js`:**

```js
  // ==========================================================================
  // PHASE 2 — Preview hero + chat bottom
  // ==========================================================================
  console.log('\n🎯 Phase 2 — Preview hero + chat bottom');

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });

  const previewBox = await page.locator('#preview-pane').boundingBox();
  const chatBox = await page.locator('#chat-pane').boundingBox();
  const mainBox = await page.locator('#main-area').boundingBox();

  assert(previewBox.height > mainBox.height * 0.5,
    `preview >50% of main-area height (was ${Math.round(100 * previewBox.height / mainBox.height)}%)`);
  assert(chatBox.height > mainBox.height * 0.3 && chatBox.height < mainBox.height * 0.5,
    `chat is 30-50% of main-area height (was ${Math.round(100 * chatBox.height / mainBox.height)}%)`);
  assert(previewBox.y < chatBox.y, 'preview is ABOVE chat (y-axis)');
  assert(Math.abs(previewBox.x - mainBox.x) < 2, 'preview is full-width (x starts at main-area x)');
  assert(Math.abs(chatBox.width - mainBox.width) < 2, 'chat is full-width');

  // Mobile viewport (E-6)
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  const chatMobileBox = await page.locator('#chat-pane').boundingBox();
  assert(chatMobileBox.width > 500, `chat full-width on narrow viewport (was ${chatMobileBox.width}px, should be >500)`);

  // Resizer inline-style carryover (E-5): drag in classic first, then switch to builder
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });  // classic
  // Simulate a manual flex style as though resizer had dragged
  await page.evaluate(() => {
    document.getElementById('editor-pane').style.flex = '0.3 1 0';
    document.getElementById('preview-pane').style.width = '200px';
  });
  // Now switch to builder
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  const inlineFlex = await page.evaluate(() => document.getElementById('editor-pane').style.flex);
  const inlineWidth = await page.evaluate(() => document.getElementById('preview-pane').style.width);
  assert(inlineFlex === '', 'inline flex cleared on mode switch (E-5)');
  assert(inlineWidth === '', 'inline width cleared on mode switch (E-5)');
```

**🟢 Code — append to the builder-mode CSS block in `ide.html`:**

```css
/* Preview as hero (BM-2) — full-width, ~60vh */
body.builder-mode #preview-pane {
  flex: 1 1 auto;
  min-height: 60vh;
  width: 100%;
  border-left: 0;
  border-bottom: 1px solid var(--bd);
}

/* Chat as bottom driver (BM-1) — full-width, ~40vh */
body.builder-mode #chat-pane {
  flex: 0 0 40vh;
  width: 100% !important;   /* overrides mobile breakpoint at line 73 */
  min-width: 0;
  border-top: 1px solid var(--bd);
}
body.builder-mode #chat-pane.collapsed { flex-basis: 40vh !important; }  /* defense-in-depth: E-4 */

/* Hide resizers in builder mode — they're for classic's horizontal layout */
body.builder-mode #ep-resizer { display: none; }
body.builder-mode #chat-resizer { display: none; }

/* Override mobile breakpoint specifically for builder mode (E-6) */
@media (max-width: 1100px) {
  body.builder-mode #chat-pane { width: 100% !important; }
}
```

**Gate:** both phase-2 assertions pass. Classic mode `ide.test.js` still green.

**🔄 Refactor:** consolidate the scattered builder-mode CSS rules under a single commented block header for readability.

**Commit:** `feat(studio): builder-mode preview-hero + chat-bottom layout (BM-1/BM-2)`

---

### Phase 3 — Hide editor by default + Source toggle (BM-3-minimal)

**🔴 Test — append:**

```js
  // ==========================================================================
  // PHASE 3 — Source toggle
  // ==========================================================================
  console.log('\n📄 Phase 3 — Source toggle');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });

  assert(await page.locator('#source-toggle-btn').isVisible(),
    'Source button visible in builder mode');
  assert(!(await page.locator('#editor-pane').isVisible()),
    'editor hidden by default in builder mode');

  await page.locator('#source-toggle-btn').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#editor-pane').isVisible(),
    'editor visible after Source toggle');
  assert(
    (await page.locator('#source-toggle-btn').textContent()).includes('Hide'),
    'button label flips to Hide after click'
  );

  await page.locator('#source-toggle-btn').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#editor-pane').isVisible()),
    'editor hidden again after second click');

  // E-11: content preserved across toggles
  await page.locator('#source-toggle-btn').click();  // open
  await page.waitForTimeout(150);
  await page.locator('.cm-editor').click();
  await page.keyboard.type('test-preserved');
  const beforeHide = await page.locator('.cm-content').innerText();
  await page.locator('#source-toggle-btn').click();  // close
  await page.locator('#source-toggle-btn').click();  // re-open
  await page.waitForTimeout(150);
  const afterShow = await page.locator('.cm-content').innerText();
  assert(beforeHide === afterShow, 'editor content preserved across hide/show (E-11)');

  // In classic mode, the Source button should be hidden
  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  assert(!(await page.locator('#source-toggle-btn').isVisible()),
    'Source button hidden in classic mode');
```

**🟢 Code — toolbar HTML insertion in `ide.html`:**

**Insertion point:** line ~495 in the toolbar, immediately after the Compile button (line 495: `<button class="toolbar-btn" onclick="doCompile()" title="Ctrl+S">Compile</button>`). Insert on a new line:

```html
    <button id="source-toggle-btn" class="toolbar-btn" onclick="toggleSource()" title="Show/hide .clear source" style="display:none">Show Source ◀</button>
```

**Insertion point for JS:** directly below the existing `window.toggleChat = function() { ... }` block (lines 4686–4692). Add:

```js
window.toggleSource = function() {
  const body = document.body;
  const btn = document.getElementById('source-toggle-btn');
  const shown = body.classList.toggle('show-source');
  btn.textContent = shown ? 'Hide Source ▶' : 'Show Source ◀';
  btn.title = shown ? 'Hide .clear source' : 'Show .clear source';
};
```

**Modify `detectStudioMode()`:** after step 7 (the class toggle), add visibility handling for the Source button:

```js
  // 8. Toggle Source button visibility based on mode
  const srcBtn = document.getElementById('source-toggle-btn');
  if (srcBtn) {
    srcBtn.style.display = (mode === 'builder') ? '' : 'none';
    // Leaving builder mode should reset show-source class so classic gets clean state
    if (mode !== 'builder') body.classList.remove('show-source');
  }
```

**CSS — append to builder-mode block:**

```css
/* Editor hidden by default in builder mode; Source toggle reveals it as right rail */
body.builder-mode #editor-pane { display: none; }
body.builder-mode.show-source #editor-pane {
  display: flex;
  position: absolute;
  right: 0;
  top: 0;                /* top of #main-area which is position:relative */
  bottom: 0;
  width: min(400px, 85vw);  /* E-9: clamp on narrow viewports */
  z-index: 20;
  background: var(--bg);
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.18);
  border-left: 1px solid var(--bd);
}
```

**Gate:** all phase-3 assertions pass.

**🔄 Refactor:** add a one-line comment above `toggleSource` linking to the plan: `// Builder Mode v0.1 — BM-3-minimal: toolbar-driven source toggle. Full 3-session auto-hide logic deferred.`

**Commit:** `feat(studio): builder-mode Source toggle + editor-as-overlay (BM-3 minimal)`

---

### Phase 4 — Publish button rebrand (BM-5)

**🔴 Test — append:**

```js
  // ==========================================================================
  // PHASE 4 — Publish button rebrand
  // ==========================================================================
  console.log('\n⚡ Phase 4 — Publish button rebrand');

  // Make the button visible by triggering a successful compile first
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window._editor?.dispatch({
    changes: { from: 0, to: window._editor.state.doc.length, insert: "build for web\npage 'Hello' at '/':\n  heading 'Hello'" }
  }));
  await page.waitForTimeout(200);
  await page.locator('button[onclick="doCompile()"]').click();
  await page.waitForTimeout(1200);

  // Force Deploy button visible (test compile produced a deployable result)
  await page.evaluate(() => { document.getElementById('deploy-btn').style.display = ''; });

  const publishText = await page.locator('#deploy-btn').textContent();
  assert(publishText.trim() === 'Publish', `button says "Publish" in builder mode (got "${publishText.trim()}")`);
  assert(
    await page.locator('#deploy-btn').evaluate(b => b.classList.contains('publish-btn')),
    'button has .publish-btn class in builder mode'
  );

  // Verify distinct styling (accent background)
  const bg = await page.locator('#deploy-btn').evaluate(b => getComputedStyle(b).backgroundColor);
  assert(bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent',
    `publish button has a filled background (got ${bg})`);

  // Switch to classic — label reverts
  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { document.getElementById('deploy-btn').style.display = ''; });
  const classicText = await page.locator('#deploy-btn').textContent();
  assert(classicText.trim() === 'Deploy', `button says "Deploy" in classic mode (got "${classicText.trim()}")`);
```

**🟢 Code — modify `detectStudioMode()`, append after step 8:**

```js
  // 9. Rebrand Deploy button as Publish in builder mode
  const depBtn = document.getElementById('deploy-btn');
  if (depBtn) {
    if (mode === 'builder') {
      depBtn.textContent = 'Publish';
      depBtn.classList.add('publish-btn');
    } else {
      depBtn.textContent = 'Deploy';
      depBtn.classList.remove('publish-btn');
    }
  }
```

**CSS — append to builder-mode block:**

```css
/* Publish button — builder-mode restyle of #deploy-btn (BM-5) */
.publish-btn {
  padding: 6px 20px;
  font-weight: 700;
  font-size: 12.5px;
  background: var(--accent) !important;
  color: #fff !important;
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 1px var(--accent), 0 2px 6px rgba(108, 140, 255, 0.25);
  letter-spacing: 0.3px;
  transition: transform 0.12s, box-shadow 0.18s, background 0.12s;
}
.publish-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 0 1px var(--accent), 0 6px 14px rgba(108, 140, 255, 0.4);
  background: color-mix(in oklch, var(--accent) 115%, transparent) !important;
}
.publish-btn:focus {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow), 0 2px 6px rgba(108, 140, 255, 0.25);
}
.publish-btn:active { transform: translateY(0); }
```

**Gate:** phase-4 assertions pass. `deploy.test.js` still green (button handler/endpoint untouched).

**🔄 Refactor:** move the Deploy/Publish rename into a helper `applyBuilderModeChrome(mode)` inside `detectStudioMode` so button + label + placeholder changes live together for Phase 5.

**Commit:** `feat(studio): builder-mode Publish button restyle (BM-5)`

---

### Phase 5 — Chat empty-state placeholder (BM-1 finish)

**🔴 Test — append:**

```js
  // ==========================================================================
  // PHASE 5 — Chat empty-state placeholder
  // ==========================================================================
  console.log('\n💬 Phase 5 — Chat placeholder');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  const builderPlaceholder = await page.locator('#chat-input').getAttribute('placeholder');
  assert(
    builderPlaceholder.toLowerCase().includes('what do you want to build'),
    `builder mode placeholder is the Marcus prompt (got "${builderPlaceholder}")`
  );

  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  const classicPlaceholder = await page.locator('#chat-input').getAttribute('placeholder');
  assert(
    classicPlaceholder.toLowerCase().includes('ask meph'),
    `classic mode keeps original placeholder (got "${classicPlaceholder}")`
  );
```

**🟢 Code — modify `detectStudioMode()`, inside `applyBuilderModeChrome(mode)` (added in Phase 4 refactor):**

```js
  // Chat input placeholder
  const chatIn = document.getElementById('chat-input');
  if (chatIn) {
    chatIn.placeholder = (mode === 'builder')
      ? 'What do you want to build today, or which app to change? (Enter to send)'
      : 'Ask Meph to build something... (Enter to send)';
  }
```

**Gate:** phase-5 assertions pass.

**🔄 Refactor:** if `applyBuilderModeChrome` is getting long, extract per-control helpers (`applyPublishButton`, `applyChatPlaceholder`). Otherwise inline is fine.

**Commit:** `feat(studio): builder-mode chat empty-state prompt (BM-1 finish)`

---

### Phase 6 — Hide chat-toggle button in builder mode

**🔴 Test — append:**

```js
  // ==========================================================================
  // PHASE 6 — Hide chat-toggle-btn
  // ==========================================================================
  console.log('\n🙈 Phase 6 — Hide chat-toggle-btn');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  assert(
    !(await page.locator('#chat-toggle-btn').isVisible()),
    'chat-toggle-btn hidden in builder mode'
  );

  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  assert(
    await page.locator('#chat-toggle-btn').isVisible(),
    'chat-toggle-btn visible in classic mode (no regression)'
  );
```

**🟢 Code — append to builder-mode CSS:**

```css
/* Chat can't collapse below 40vh in builder mode — hide the toggle button */
body.builder-mode #chat-toggle-btn { display: none; }
```

**Gate:** phase-6 assertions pass.

**🔄 Refactor:** none (single rule).

**Commit:** `feat(studio): hide chat-toggle-btn in builder mode`

---

### Phase 7 — Documentation updates

Update these files (trimmed list — this is a Studio UI feature-flag, not new Clear syntax):

#### `ROADMAP.md`
Add a line in the Builder Mode section table for BM-1/2/5/3-minimal with "Shipped 2026-04-21 on branch `feature/builder-mode-v01`." Update the priority table entry to reflect v0.1 complete.

#### `FAQ.md`
Add a new "How do I do X?" entry:

```markdown
### How do I try Builder Mode (Marcus-first Studio layout)?

Visit Studio with `?studio-mode=builder` in the URL. Example: `http://localhost:3456/?studio-mode=builder`.

What changes:
- Preview fills the top 60% of the screen (full width).
- Meph chat drops to the bottom 40% — always visible, with a prompt asking what you want to build.
- The code editor is hidden; click the **Source** button in the toolbar to open it as a right-side rail.
- The Run/Deploy button becomes a loud **Publish** button (same handler, still hits `/api/deploy`).

Opt back out with `?studio-mode=classic`. Preference persists in localStorage.

What's NOT in v0.1: click-to-edit on preview elements, auto-hide source after 3 successful ships, the "what are you building?" tile gallery, the status bar. All deferred to later PRES cycles.
```

#### `FEATURES.md`
Add under "Studio IDE":

```markdown
| Builder Mode (v0.1) | `?studio-mode=builder` URL param | Marcus-first layout — preview hero, chat driver, editor behind toggle, branded Publish button. Feature-flagged opt-in. |
```

#### `CHANGELOG.md`
Add a new top entry:

```markdown
## Builder Mode v0.1 — Marcus-first Studio layout (2026-04-21)

Feature-flagged Studio layout flip via `?studio-mode=builder` URL param. Four changes:
- BM-1 chat-as-driver (bottom 40vh, Marcus-prompt placeholder)
- BM-2 preview-as-hero (top 60vh, full width)
- BM-3-minimal Source toggle button (editor hidden, toolbar toggle)
- BM-5 Publish button (rename + restyle of existing Deploy button)

Classic 3-panel layout remains the default. Preference persists in localStorage. Full BM-3 auto-hide, BM-4 click-to-edit, BM-6 tile gallery deferred to later PRES cycles.

Tests: `playground/builder-mode.test.js` (new). `playground/ide.test.js` and `playground/deploy.test.js` regressions pass.
```

#### `HANDOFF.md`
Rewrite the "What shipped this session" section to reflect Builder Mode v0.1 alongside the earlier doc reorg. Update "What's next" to list BM-3 full / BM-4 / BM-6 as the next PRES candidates.

#### `playground/system-prompt.md`
Add one sentence in an appropriate section:

```markdown
Studio supports two layout modes: classic (3-panel, default) and builder (preview hero, chat driver — opt in via `?studio-mode=builder` URL param). Users may be in either; both hit the same endpoints.
```

#### NOT applicable (explicit skip list)

- `intent.md` — no new node types
- `SYNTAX.md` — no new Clear syntax
- `AI-INSTRUCTIONS.md` — no new Clear-writing conventions
- `USER-GUIDE.md` — feature-flagged UI mode; revisit when builder mode is the default
- `landing/*.html` — not user-facing yet
- `RESEARCH.md` — no training-signal change

**Gate:** all six doc files edited. Spot-check with `grep -rn "Builder Mode v0.1" *.md`.

**Commit:** `docs: Builder Mode v0.1 shipped — FAQ, FEATURES, CHANGELOG, HANDOFF, system-prompt, ROADMAP`

---

## 🧪 Testing Strategy

### Test commands

```bash
node playground/builder-mode.test.js   # new — Builder Mode E2E
node playground/ide.test.js            # regression — classic mode default
node playground/deploy.test.js         # regression — Publish button wires to same endpoint
```

### Run order

1. `ide.test.js` first — verifies classic mode is untouched.
2. `builder-mode.test.js` — verifies all six phase gates.
3. `deploy.test.js` — confirms the Publish rename didn't break Deploy wiring.

All three must be green before ship.

### Pre-flight checklist

- [ ] `plans/plan-builder-mode-v0.1-04-21-2026.md` exists and is read by executor
- [ ] `playground/ide.html` line numbers verified before Phase 1 starts (drift check)
- [ ] `playground/builder-mode.test.js` does NOT exist yet (Phase 1 creates it)
- [ ] `learnings.md` exists at project root
- [ ] No other branch is currently in progress modifying `ide.html`

### Success criteria

- [ ] All 6 phase gates pass in `builder-mode.test.js`
- [ ] Zero regressions in `ide.test.js` and `deploy.test.js`
- [ ] `playground/ide.html` diff is additive only (no deletions of existing code)
- [ ] `playground/ide.html` net addition ≤ 200 lines (CSS + 1 HTML line + JS)
- [ ] One new file: `playground/builder-mode.test.js`
- [ ] Six doc files updated (ROADMAP, FAQ, FEATURES, CHANGELOG, HANDOFF, system-prompt)
- [ ] Zero new inline globals outside `detectStudioMode` + `window.toggleSource`
- [ ] Manual smoke: load `/?studio-mode=builder` → layout flipped, Publish visible, Source toggle works

---

## 📚 Update learnings

After all 7 phases complete and before shipping, append to `learnings.md` under a "Builder Mode v0.1" section:

- CSS-only feature flag via body class works cleanly — zero DOM restructure.
- The main gotcha: inline styles set by drag-resizer handlers MUST be cleared on mode switch, or CSS rules fight inline specificity.
- Mobile breakpoint with `!important` needs explicit override at same specificity in builder mode.
- Editor-as-overlay (absolute-positioned right rail) requires `#main-area { position: relative }` as the containing block.
- localStorage access must be wrapped in try/catch for private-browsing compatibility.

---

## 📎 Resume prompt

> Building Builder Mode v0.1 on branch `feature/builder-mode-v01`. Plan in `plans/plan-builder-mode-v0.1-04-21-2026.md`. Feature-flagged (`?studio-mode=builder`) layout flip in `playground/ide.html`: preview becomes top 60vh, chat becomes bottom 40vh, editor hidden by default with toolbar Source toggle, Deploy button renamed to Publish with louder styling. Work phase-by-phase; each phase has its own test block appended to `playground/builder-mode.test.js`. Tests: `node playground/builder-mode.test.js` (new) + `node playground/ide.test.js` (regression) + `node playground/deploy.test.js` (regression). No backend, no compiler, no parser changes.
