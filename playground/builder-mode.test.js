// =============================================================================
// PLAYGROUND IDE — BUILDER MODE E2E TESTS
// =============================================================================
// Run: node playground/builder-mode.test.js
// Plan: plans/plan-builder-mode-v0.1-04-21-2026.md
// =============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3459';  // port 3459 so ide.test.js (port 3458) can run in parallel

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

  // Case-insensitivity (E-1)
  await page.goto(`${BASE}/?studio-mode=BUILDER`, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => document.body.classList.contains('builder-mode')),
    'builder-mode class applied for uppercase value (E-1 case-insensitivity)'
  );

  // Unknown value → classic (E-2). Clear localStorage first to isolate the URL-invalid case;
  // otherwise stored preference from prior tests leaks through (which is correct behavior but
  // not what E-2 is exercising).
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${BASE}/?studio-mode=xyz`, { waitUntil: 'networkidle' });
  assert(
    await page.evaluate(() => !document.body.classList.contains('builder-mode')),
    'unknown value defaults to classic when no stored preference (E-2)'
  );

  // localStorage persistence
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  await page.goto(BASE, { waitUntil: 'networkidle' });  // reload without URL param
  assert(
    await page.evaluate(() => document.body.classList.contains('builder-mode')),
    'builder-mode persists after reload via localStorage'
  );

  // Opt-out (E-12)
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

  // No NEW JS errors across mode switches. Filter out pre-existing Studio noise:
  // - favicon 404 (harmless)
  // - 401 from /api/tenant (pre-existing — Studio fetches tenant info on boot,
  //   returns 401 without auth cookie; same error exists on classic mode loads)
  const jsErrors = consoleErrors.filter(e =>
    !e.includes('favicon') &&
    !(e.includes('401') && e.includes('Unauthorized'))
  );
  assert(jsErrors.length === 0, `no new JS errors across mode switches (got: ${jsErrors.join('; ') || 'none'})`);

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

  // Mobile viewport (E-6) — chat must still be full-width despite the 1100px breakpoint
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  const chatMobileBox = await page.locator('#chat-pane').boundingBox();
  assert(chatMobileBox.width > 500,
    `chat full-width on narrow viewport (was ${chatMobileBox.width}px, should be >500 — E-6)`);

  // Resizer inline-style carryover (E-5): drag in classic first, then switch to builder
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });  // classic
  // Simulate a manual flex style as though the resizer had dragged
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

  // ==========================================================================
  // PHASE 3 — Source toggle
  // BM-3 full (v0.3): the first 3 successful Publishes leave the source pane
  // visible (onboarding); after ship #3 it auto-hides on next load. Tests that
  // assert source-hidden-by-default need to seed the counter past 3 first.
  // ==========================================================================
  console.log('\n📄 Phase 3 — Source toggle');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  // Seed counter past the auto-hide threshold so this phase exercises the
  // post-onboarding behavior. Reload to re-run detectStudioMode().
  await page.evaluate(() => { try { localStorage.setItem('clear-bm-ships-counter', '99'); } catch {} });
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });

  assert(await page.locator('#source-toggle-btn').isVisible(),
    'Source button visible in builder mode');
  assert(!(await page.locator('#editor-pane').isVisible()),
    'editor hidden by default in builder mode (counter ≥ 3)');

  await page.locator('#source-toggle-btn').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#editor-pane').isVisible(),
    'editor visible after Source toggle');
  const labelAfterOpen = await page.locator('#source-toggle-btn').textContent();
  assert(labelAfterOpen.includes('Hide'),
    `button label flips to Hide after click (got "${labelAfterOpen}")`);

  await page.locator('#source-toggle-btn').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#editor-pane').isVisible()),
    'editor hidden again after second click');

  // E-11: content preserved across toggles
  await page.locator('#source-toggle-btn').click();  // open
  await page.waitForTimeout(300);
  await page.locator('.cm-editor').click();
  await page.keyboard.type('test-preserved');
  await page.waitForTimeout(100);
  const beforeHide = await page.locator('.cm-content').innerText();
  await page.locator('#source-toggle-btn').click();  // close
  await page.waitForTimeout(150);
  await page.locator('#source-toggle-btn').click();  // re-open
  await page.waitForTimeout(300);
  const afterShow = await page.locator('.cm-content').innerText();
  assert(beforeHide === afterShow,
    `editor content preserved across hide/show (E-11): before="${beforeHide.slice(-30)}" after="${afterShow.slice(-30)}"`);

  // In classic mode, the Source button should be hidden
  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  assert(!(await page.locator('#source-toggle-btn').isVisible()),
    'Source button hidden in classic mode');

  // BM-3 full (v0.3): when the ship counter is below 3, source pane should
  // default visible — onboarding mode for new Marcus users.
  await page.evaluate(() => { try { localStorage.setItem('clear-bm-ships-counter', '0'); } catch {} });
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  assert(await page.locator('#editor-pane').isVisible(),
    'BM-3 onboarding: editor visible by default when ship counter < 3');
  // And after the 3-ship threshold, editor goes back to hidden by default.
  await page.evaluate(() => { try { localStorage.setItem('clear-bm-ships-counter', '3'); } catch {} });
  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  assert(!(await page.locator('#editor-pane').isVisible()),
    'BM-3 onboarding: editor hidden by default once ship counter reaches 3');

  // ==========================================================================
  // PHASE 4 — Publish button rebrand
  // ==========================================================================
  console.log('\n⚡ Phase 4 — Publish button rebrand');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  // Force-show the deploy button (normally hidden until canDeploy=true)
  await page.evaluate(() => { document.getElementById('deploy-btn').style.display = ''; });

  const publishText = (await page.locator('#deploy-btn').textContent()).trim();
  assert(publishText === 'Publish',
    `button says "Publish" in builder mode (got "${publishText}")`);
  assert(
    await page.locator('#deploy-btn').evaluate(b => b.classList.contains('publish-btn')),
    'button has .publish-btn class in builder mode'
  );

  // Verify distinct styling (non-transparent background)
  const bg = await page.locator('#deploy-btn').evaluate(b => getComputedStyle(b).backgroundColor);
  assert(bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent',
    `publish button has a filled background (got ${bg})`);

  // Switch to classic — label reverts
  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { document.getElementById('deploy-btn').style.display = ''; });
  const classicText = (await page.locator('#deploy-btn').textContent()).trim();
  assert(classicText === 'Deploy',
    `button says "Deploy" in classic mode (got "${classicText}")`);
  assert(
    !(await page.locator('#deploy-btn').evaluate(b => b.classList.contains('publish-btn'))),
    '.publish-btn class removed in classic mode'
  );

  // ==========================================================================
  // PHASE 5 — Chat empty-state placeholder
  // ==========================================================================
  console.log('\n💬 Phase 5 — Chat placeholder');

  await page.goto(`${BASE}/?studio-mode=builder`, { waitUntil: 'networkidle' });
  const builderPlaceholder = await page.locator('#chat-input').getAttribute('placeholder');
  assert(
    builderPlaceholder && builderPlaceholder.toLowerCase().includes('what do you want to build'),
    `builder mode placeholder is the Marcus prompt (got "${builderPlaceholder}")`
  );

  await page.goto(`${BASE}/?studio-mode=classic`, { waitUntil: 'networkidle' });
  const classicPlaceholder = await page.locator('#chat-input').getAttribute('placeholder');
  assert(
    classicPlaceholder && classicPlaceholder.toLowerCase().includes('ask meph'),
    `classic mode keeps original placeholder (got "${classicPlaceholder}")`
  );

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

} catch (err) {
  console.error('\n❌ Test suite threw:', err);
  failed++;
} finally {
  await browser.close();
  server.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
