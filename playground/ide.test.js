// =============================================================================
// PLAYGROUND IDE — PLAYWRIGHT E2E TESTS
// =============================================================================
// Run: node playground/ide.test.js
// =============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3458';

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

// Start server
console.log('Starting server on port 3458...');
const server = spawn('node', ['playground/server.js'], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, PORT: '3458' },
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

await page.goto(BASE, { waitUntil: 'networkidle' });

try {
  // ==========================================================================
  // PAGE LOAD
  // ==========================================================================
  console.log('🌐 Page load');

  assert(await page.title() === 'Clear Studio', 'page title correct');
  assert(await page.locator('#app').isVisible(), 'app renders');
  assert(await page.locator('#toolbar').isVisible(), 'toolbar visible');
  assert(await page.locator('#editor-pane').isVisible(), 'editor pane visible');
  assert(await page.locator('#preview-pane').isVisible(), 'preview pane visible');
  assert(await page.locator('#status-bar').isVisible(), 'status bar visible');

  // Filter expected boot noise: favicons + the unauthenticated tenant fetch (401).
  const jsErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('401'));
  assert(jsErrors.length === 0, `no JS errors on load (got: ${jsErrors.join('; ') || 'none'})`);

  // ==========================================================================
  // EDITOR
  // ==========================================================================
  console.log('\n✏️  Editor');

  // Scope to #editor-pane: once compile runs, a second .cm-editor (the read-only
  // compiled view) is mounted in #preview-content, and a bare .cm-editor selector
  // becomes ambiguous.
  assert(await page.locator('#editor-pane .cm-editor').isVisible(), 'CodeMirror editor visible');
  assert(await page.locator('.cm-content').first().getAttribute('contenteditable') === 'true', 'editor is editable');

  await page.locator('#editor-pane .cm-editor').click();
  await page.keyboard.type('x');
  await page.waitForTimeout(100);
  const typedText = await page.locator('.cm-content').first().innerText();
  assert(typedText.includes('x'), 'can type in editor');

  // ==========================================================================
  // TOOLBAR BUTTONS
  // ==========================================================================
  console.log('\n🔧 Toolbar buttons');

  assert(await page.locator('button[onclick="newFile()"]').isVisible(), 'New button visible');
  assert(await page.locator('button[onclick="doCompile()"]').isVisible(), 'Compile button visible');
  // Run/Stop start hidden (display:none) and reveal after compile — assert presence not visibility.
  assert(await page.locator('button[onclick="doRun()"]').count() === 1, 'Run button present');
  assert(await page.locator('button[onclick="doStop()"]').count() === 1, 'Stop button present');
  assert(await page.locator('button[onclick="doSave()"]').isVisible(), 'Save button visible');
  assert(await page.locator('#theme-toggle').isVisible(), 'theme toggle visible');

  // ==========================================================================
  // NEW BUTTON
  // ==========================================================================
  console.log('\n📄 New button');

  await page.locator('button[onclick="newFile()"]').click();
  await page.waitForTimeout(300);
  const afterNew = await page.locator('.cm-content').first().innerText();
  assert(afterNew.includes('build for web'), 'New resets editor to scaffold');
  assert((await page.locator('#editor-label').innerText()).toLowerCase() === 'main.clear', 'label resets to main.clear');

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================
  console.log('\n📋 Templates');

  const picker = page.locator('#template-picker');
  assert(await picker.isVisible(), 'template picker visible');

  // Picker is intentionally narrowed to FEATURED_TEMPLATES (Marcus 6 + Core 8 = 14)
  // plus the placeholder option, so 15 total. The previous threshold of 40 dated
  // from when the picker listed every app in apps/ — the narrowing is the design,
  // not bit rot. Keep >= 14 so we catch the case where a featured app is dropped.
  const optCount = await picker.locator('option').count();
  assert(optCount >= 14, `${optCount} templates loaded (expected >= 14: 6 Marcus + 8 Core + placeholder)`);

  // Names should be Title Case with no dashes
  const firstOpt = await picker.locator('option:nth-child(2)').innerText();
  assert(!firstOpt.includes('-'), `name has no dashes: "${firstOpt}"`);
  assert(firstOpt[0] === firstOpt[0].toUpperCase(), `name is title-cased: "${firstOpt}"`);

  // Loading a template puts code in editor
  await picker.selectOption({ index: 2 });
  await page.waitForTimeout(800);
  const afterTemplate = await page.locator('.cm-content').first().innerText();
  assert(afterTemplate.includes('build for'), 'loading template populates editor');
  assert(await page.locator('#editor-label').innerText() !== 'main.clear', 'label updates to template name');

  // ==========================================================================
  // COMPILE
  // ==========================================================================
  console.log('\n⚙️  Compile');

  // Set a simple web app
  await page.evaluate(() => window._editor.dispatch({
    changes: { from: 0, to: window._editor.state.doc.length, insert: "build for web\npage 'Hello' at '/':\n  heading 'Hello World'" }
  }));
  await page.waitForTimeout(300);

  await page.locator('button[onclick="doCompile()"]').click();

  // doCompile triggers a scan animation that can run up to ~5s before the status
  // settles to "OK" (or "N error" / "OK (N warnings)"). Poll instead of fixed-wait.
  let status = '';
  for (let i = 0; i < 60; i++) { // up to 9s
    status = await page.locator('#status').innerText();
    if (status.startsWith('OK') || /error/i.test(status)) break;
    await page.waitForTimeout(150);
  }
  assert(status.startsWith('OK'), `status shows OK after compile (got: "${status}")`);
  assert(!(await page.locator('#compile-dot').getAttribute('class'))?.includes('err'), 'compile dot is green');

  // ==========================================================================
  // TABS
  // ==========================================================================
  console.log('\n📑 Tabs');

  // Tab labels were renamed in Studio's IDE refresh: "Compiled Code" → "Code",
  // "Output" → "Preview", "Terminal" stays. The onclick handlers kept their
  // original keys ('compiled', 'output', 'terminal') so the locators still work.
  const compiledTab = page.locator('button[onclick="showTab(\'compiled\')"]'); // labelled "Code"
  const outputTab   = page.locator('button[onclick="showTab(\'output\')"]');   // labelled "Preview"
  const terminalTab = page.locator('button[onclick="showTab(\'terminal\')"]'); // labelled "Terminal"

  assert(await compiledTab.isVisible(), 'Code tab visible');
  assert(await outputTab.isVisible(), 'Preview tab visible');
  assert(await terminalTab.isVisible(), 'Terminal tab visible');

  // Order check: Preview comes before Code, Code before Terminal. We use indexOf
  // (not fixed positions) because the bar also has Data + API tabs that show/hide
  // based on app shape, plus Tests/Flywheel/Supervisor afterwards.
  const tabs = await page.locator('.prev-tab').allInnerTexts();
  const previewIdx  = tabs.indexOf('Preview');
  const codeIdx     = tabs.indexOf('Code');
  const terminalIdx = tabs.indexOf('Terminal');
  assert(previewIdx  >= 0, `"Preview" tab present (got tabs: ${tabs.join(', ')})`);
  assert(codeIdx     >= 0, `"Code" tab present (got tabs: ${tabs.join(', ')})`);
  assert(terminalIdx >= 0, `"Terminal" tab present (got tabs: ${tabs.join(', ')})`);
  assert(previewIdx < codeIdx, `Preview tab is before Code tab`);
  assert(codeIdx < terminalIdx, `Code tab is before Terminal tab`);

  // Code tab shows compiled source. Studio runs a scan animation that types the
  // compiled JS into a CodeMirror as the source highlights — and while it's
  // running, showCompiled() is suppressed (see the compileAnimRunning guard in
  // ide.html). If we click the Code tab mid-animation, we end up looking at the
  // animated JS, not the HTML output. So: wait for the animation to end, THEN
  // click the tab so showCompiled rebuilds the sub-tab bar (HTML / Server JS /
  // etc.) and defaults to HTML.
  for (let i = 0; i < 80; i++) { // up to 12s — animation caps at ~5s
    const running = await page.evaluate(() => window._debug?.()?.compileAnimRunning);
    if (!running) break;
    await page.waitForTimeout(150);
  }
  await compiledTab.click();
  await page.locator('#preview-content .cm-editor').waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  // Belt and suspenders: explicitly switch to the HTML sub-tab so we don't depend
  // on outputs[0]'s ordering or on whatever sub-tab `compiledTab` was last set to.
  await page.evaluate(() => { if (window.switchCodeTab) window.switchCodeTab('html'); });
  await page.waitForTimeout(300);
  const compiledContent = await page.evaluate(async () => {
    const editor = document.querySelector('#preview-content .cm-editor');
    const scroller = editor?.querySelector('.cm-scroller');
    if (!editor || !scroller) return '';

    // Path 1 — CM6 attaches the view ref on the editor / scroller / content DOM
    // via `cmView` (used by EditorView.findFromDOM internals).
    for (const el of [editor, scroller, editor.querySelector('.cm-content')]) {
      const view = el?.cmView?.view;
      if (view?.state?.doc?.toString) return view.state.doc.toString();
    }

    // Path 2 — paginate through the editor by scrolling, collecting line text
    // keyed by each line's offsetTop so duplicates from overlapping scroll passes
    // collapse cleanly. Sort by offsetTop at the end to recover doc order.
    const seen = new Map();
    const collect = () => {
      editor.querySelectorAll('.cm-line').forEach(l => {
        seen.set(l.offsetTop, l.textContent);
      });
    };
    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 100));
    collect();
    const step = Math.max(scroller.clientHeight - 30, 60);
    while (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) {
      scroller.scrollTop += step;
      await new Promise(r => setTimeout(r, 60));
      collect();
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => t)
      .join('\n');
  });
  assert(compiledContent.length > 0, 'Code tab shows compiled output');
  assert(
    compiledContent.includes('<!DOCTYPE') || compiledContent.includes('<html'),
    `Code tab shows HTML output (len=${compiledContent.length}, head: "${compiledContent.slice(0, 200).replace(/\n/g, '\\n')}", tail: "${compiledContent.slice(-200).replace(/\n/g, '\\n')}")`,
  );

  // Output tab shows iframe for web app
  await outputTab.click();
  await page.waitForTimeout(300);
  assert(await page.locator('#preview-content iframe').isVisible(), 'Output tab shows iframe for web app');

  // Terminal tab renders
  await terminalTab.click();
  await page.waitForTimeout(200);
  assert(await page.locator('#preview-content').isVisible(), 'Terminal tab visible');

  // ==========================================================================
  // COMPILED CODE TAB — empty state before compile
  // ==========================================================================
  console.log('\n📋 Compiled Code empty state');

  // Force clear lastCompiled by going to new file
  await page.locator('button[onclick="newFile()"]').click();
  await page.waitForTimeout(200);
  // Manually check: compiled tab before auto-compile settles
  // The auto-compile fires after 500ms — check the empty state message
  // (we check the tab content, not timing-sensitive)
  await compiledTab.click();
  await page.waitForTimeout(1800); // let auto-compile run
  const compiledAfterNew = await page.locator('#preview-content').innerText();
  assert(compiledAfterNew.length > 0, 'Compiled Code tab has content after New');

  // ==========================================================================
  // KEYBOARD SHORTCUTS
  // ==========================================================================
  console.log('\n⌨️  Keyboard shortcuts');

  // Ctrl+S triggers a compile. Status flips through "Compiling..." → "OK ..." and,
  // for backend apps (the scaffold has `javascript backend`), Studio also auto-runs
  // the server, so the status may settle on "Starting..." or "Running :PORT" before
  // we read it. Accept any of those — they all prove the keyboard shortcut fired.
  const acceptableCompileStatus = (s) =>
    s.startsWith('OK') ||
    s.startsWith('Compiling') ||
    s.startsWith('Starting') ||
    s.startsWith('Running');
  await page.locator('#editor-pane .cm-content').click();
  await page.keyboard.press('Control+s');
  let statusAfterCtrlS = '';
  for (let i = 0; i < 60; i++) { // up to 9s
    await page.waitForTimeout(150);
    statusAfterCtrlS = await page.locator('#status').innerText();
    if (acceptableCompileStatus(statusAfterCtrlS)) break;
  }
  assert(
    acceptableCompileStatus(statusAfterCtrlS),
    `Ctrl+S triggers compile (got: "${statusAfterCtrlS}")`,
  );

  // Ctrl+K used to focus chat-input unconditionally. New behavior: it toggles the
  // Meph chat pane's collapsed state (focusing chat-input only when expanding from
  // a previously-collapsed state). Test the toggle, since that's the wired behavior.
  const wasCollapsed = await page.locator('#chat-pane').evaluate(el => el.classList.contains('collapsed'));
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(250);
  const nowCollapsed = await page.locator('#chat-pane').evaluate(el => el.classList.contains('collapsed'));
  assert(
    wasCollapsed !== nowCollapsed,
    `Ctrl+K toggles chat pane (was collapsed: ${wasCollapsed}, now: ${nowCollapsed})`,
  );

  // ==========================================================================
  // THEME TOGGLE
  // ==========================================================================
  console.log('\n🌙 Theme toggle');

  const theme1 = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme-toggle').click();
  const theme2 = await page.locator('html').getAttribute('data-theme');
  assert(theme1 !== theme2, `theme toggles (${theme1} → ${theme2})`);
  await page.locator('#theme-toggle').click();
  assert(await page.locator('html').getAttribute('data-theme') === theme1, 'theme toggles back');

  // ==========================================================================
  // STATUS BAR
  // ==========================================================================
  console.log('\n📊 Status bar');

  const linesText = await page.locator('#sb-lines').innerText();
  assert(linesText.startsWith('Lines:'), `line count shown: "${linesText}"`);
  const cursorText = await page.locator('#sb-cursor').innerText();
  assert(cursorText.startsWith('Ln'), `cursor position shown: "${cursorText}"`);

  // ==========================================================================
  // ERROR DISPLAY
  // ==========================================================================
  console.log('\n🔴 Error display');

  // Studio no longer auto-compiles on keystrokes — the user has to press Compile
  // (or Ctrl+S). So after we inject broken code we explicitly trigger compile, then
  // poll the status until it lands on "N error(s)" before checking the errors panel.
  await page.evaluate(() => window._editor.dispatch({
    changes: { from: 0, to: window._editor.state.doc.length, insert: "build for javascript backend\nresult = call 'NonExistentAgent' with data" }
  }));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.doCompile());
  let errStatus = '';
  for (let i = 0; i < 60; i++) { // up to 9s
    await page.waitForTimeout(150);
    errStatus = await page.locator('#status').innerText();
    if (/error/i.test(errStatus)) break;
  }

  const errText = await page.locator('#errors').innerText();
  assert(errText.length > 0, `errors panel shows compile errors (status: "${errStatus}", panel: "${errText}")`);
  assert((await page.locator('#compile-dot').getAttribute('class'))?.includes('err'), 'compile dot turns red on error');

  // ==========================================================================
  // NO JS ERRORS THROUGHOUT
  // ==========================================================================
  console.log('\n🧹 Final JS error check');

  // Mirror the load-time filter: ignore favicon noise + the unauthenticated tenant
  // fetch (401), which Studio expects when no tenant is signed in.
  const finalErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('401'));
  assert(finalErrors.length === 0, `no JS errors throughout (got: ${finalErrors.join('; ') || 'none'})`);

} catch (err) {
  console.error('\n💥 Test crash:', err.message);
  failed++;
}

await browser.close();
server.kill('SIGTERM');

console.log(`\n========================================`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) console.log(`❌ Failed: ${failed}`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
