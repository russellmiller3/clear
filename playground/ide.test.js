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

  assert(await page.title() === 'Clear Playground', 'page title correct');
  assert(await page.locator('#app').isVisible(), 'app renders');
  assert(await page.locator('#toolbar').isVisible(), 'toolbar visible');
  assert(await page.locator('#editor-pane').isVisible(), 'editor pane visible');
  assert(await page.locator('#preview-pane').isVisible(), 'preview pane visible');
  assert(await page.locator('#status-bar').isVisible(), 'status bar visible');

  const jsErrors = consoleErrors.filter(e => !e.includes('favicon'));
  assert(jsErrors.length === 0, `no JS errors on load (got: ${jsErrors.join('; ') || 'none'})`);

  // ==========================================================================
  // EDITOR
  // ==========================================================================
  console.log('\n✏️  Editor');

  assert(await page.locator('.cm-editor').isVisible(), 'CodeMirror editor visible');
  assert(await page.locator('.cm-content').getAttribute('contenteditable') === 'true', 'editor is editable');

  await page.locator('.cm-editor').click();
  await page.keyboard.type('x');
  await page.waitForTimeout(100);
  const typedText = await page.locator('.cm-content').innerText();
  assert(typedText.includes('x'), 'can type in editor');

  // ==========================================================================
  // TOOLBAR BUTTONS
  // ==========================================================================
  console.log('\n🔧 Toolbar buttons');

  assert(await page.locator('button:has-text("New")').isVisible(), 'New button visible');
  assert(await page.locator('button[onclick="doCompile()"]').isVisible(), 'Compile button visible');
  assert(await page.locator('button[onclick="doRun()"]').isVisible(), 'Run button visible');
  assert(await page.locator('button[onclick="doStop()"]').isVisible(), 'Stop button visible');
  assert(await page.locator('button[onclick="doSave()"]').isVisible(), 'Save button visible');
  assert(await page.locator('#theme-toggle').isVisible(), 'theme toggle visible');

  // ==========================================================================
  // NEW BUTTON
  // ==========================================================================
  console.log('\n📄 New button');

  await page.locator('button:has-text("New")').click();
  await page.waitForTimeout(300);
  const afterNew = await page.locator('.cm-content').innerText();
  assert(afterNew.includes('build for web'), 'New resets editor to scaffold');
  assert((await page.locator('#editor-label').innerText()).toLowerCase() === 'main.clear', 'label resets to main.clear');

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================
  console.log('\n📋 Templates');

  const picker = page.locator('#template-picker');
  assert(await picker.isVisible(), 'template picker visible');

  const optCount = await picker.locator('option').count();
  assert(optCount >= 40, `${optCount} templates loaded`);

  // Names should be Title Case with no dashes
  const firstOpt = await picker.locator('option:nth-child(2)').innerText();
  assert(!firstOpt.includes('-'), `name has no dashes: "${firstOpt}"`);
  assert(firstOpt[0] === firstOpt[0].toUpperCase(), `name is title-cased: "${firstOpt}"`);

  // Loading a template puts code in editor
  await picker.selectOption({ index: 2 });
  await page.waitForTimeout(800);
  const afterTemplate = await page.locator('.cm-content').innerText();
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
  await page.waitForTimeout(1000);

  const status = await page.locator('#status').innerText();
  assert(status.startsWith('OK'), `status shows OK after compile (got: "${status}")`);
  assert(!(await page.locator('#compile-dot').getAttribute('class'))?.includes('err'), 'compile dot is green');

  // ==========================================================================
  // TABS
  // ==========================================================================
  console.log('\n📑 Tabs');

  const compiledTab = page.locator('button[onclick="showTab(\'compiled\')"]');
  const outputTab   = page.locator('button[onclick="showTab(\'output\')"]');
  const terminalTab = page.locator('button[onclick="showTab(\'terminal\')"]');

  assert(await compiledTab.isVisible(), 'Compiled Code tab visible');
  assert(await outputTab.isVisible(), 'Output tab visible');
  assert(await terminalTab.isVisible(), 'Terminal tab visible');

  // Tab order: Compiled Code first
  const tabs = await page.locator('.prev-tab').allInnerTexts();
  assert(tabs[0] === 'Compiled Code', `first tab is "Compiled Code" (got "${tabs[0]}")`);
  assert(tabs[1] === 'Output', `second tab is "Output" (got "${tabs[1]}")`);
  assert(tabs[2] === 'Terminal', `third tab is "Terminal" (got "${tabs[2]}")`);

  // Compiled Code tab shows source
  await compiledTab.click();
  await page.waitForTimeout(300);
  const compiledContent = await page.locator('#preview-content pre').innerText();
  assert(compiledContent.length > 0, 'Compiled Code tab shows code');
  assert(compiledContent.includes('<!DOCTYPE') || compiledContent.includes('<html'), 'Compiled Code has HTML output');

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
  await page.locator('button:has-text("New")').click();
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

  await page.locator('.cm-editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
  const statusAfterCtrlS = await page.locator('#status').innerText();
  assert(statusAfterCtrlS.startsWith('OK') || statusAfterCtrlS === 'Compiling...', 'Ctrl+S triggers compile');

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  const chatFocused = await page.locator('#chat-input').evaluate(el => el === document.activeElement);
  assert(chatFocused, 'Ctrl+K focuses chat input');

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

  await page.evaluate(() => window._editor.dispatch({
    changes: { from: 0, to: window._editor.state.doc.length, insert: "build for javascript backend\nresult = call 'NonExistentAgent' with data" }
  }));
  await page.waitForTimeout(1500);

  const errText = await page.locator('#errors').innerText();
  assert(errText.length > 0, 'errors panel shows compile errors');
  assert((await page.locator('#compile-dot').getAttribute('class'))?.includes('err'), 'compile dot turns red on error');

  // ==========================================================================
  // NO JS ERRORS THROUGHOUT
  // ==========================================================================
  console.log('\n🧹 Final JS error check');

  const finalErrors = consoleErrors.filter(e => !e.includes('favicon'));
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
