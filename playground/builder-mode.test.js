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

} catch (err) {
  console.error('\n❌ Test suite threw:', err);
  failed++;
} finally {
  await browser.close();
  server.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
