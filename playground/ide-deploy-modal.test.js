// =============================================================================
// PLAYGROUND IDE — PUBLISH MODAL TARGETS CLEAR CLOUD (CC-4 cycle 4)
// =============================================================================
// Standalone Playwright test that locks in: every Publish from Studio ships
// to Clear Cloud (Cloudflare). No picker, no Fly fallback. Simple and final.
// Run: node playground/ide-deploy-modal.test.js
// =============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = '3459';
const BASE = `http://localhost:${PORT}`;

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

console.log(`Starting server on port ${PORT}...`);
const server = spawn('node', ['playground/server.js'], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, PORT },
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

// Auto-dismiss any alert dialogs so doDeploy's "Nothing to deploy" alert
// (or any other) doesn't hang Playwright.
page.on('dialog', d => d.accept().catch(() => {}));

await page.goto(BASE, { waitUntil: 'networkidle' });

try {
  console.log('🚀 Publish modal — always ships to Clear Cloud');

  // Set source so doDeploy doesn't early-return on "Nothing to deploy"
  await page.evaluate(() => window._editor.dispatch({
    changes: { from: 0, to: window._editor.state.doc.length, insert: "build for web\npage 'Hello' at '/':\n  heading 'Hi'" },
  }));
  await page.waitForTimeout(200);

  // Stub fetch so submit doesn't hit a real endpoint and we capture the POST body
  await page.evaluate(() => {
    window.__capturedDeployBody = null;
    window.__originalFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (url === '/api/deploy' && opts?.method === 'POST') {
        window.__capturedDeployBody = JSON.parse(opts.body);
        return new Response(JSON.stringify({ ok: false, error: 'test stub' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return window.__originalFetch(url, opts);
    };
  });

  // Open the modal
  await page.evaluate(() => window.doDeploy());
  await page.waitForTimeout(200);
  assert(await page.locator('#deploy-modal').isVisible(), 'publish modal opens');

  // No target picker — Studio is Clear-Cloud-only
  assert(await page.locator('#deploy-target-radio-group').count() === 0,
    'no target picker rendered (Clear Cloud is the only option)');
  assert(await page.locator('input[name="deploy-target"]').count() === 0,
    'no deploy-target radios anywhere in the DOM');

  // Domain placeholder mentions buildclear.dev (the Clear Cloud root domain)
  const placeholder = await page.locator('#deploy-domain').getAttribute('placeholder');
  assert(/buildclear\.dev/i.test(placeholder || ''),
    `domain placeholder mentions buildclear.dev (got: "${placeholder}")`);

  // Submit → POST body carries target='cloudflare'
  await page.locator('#deploy-submit-btn').click();
  await page.waitForTimeout(300);
  const body = await page.evaluate(() => window.__capturedDeployBody);
  assert(body?.target === 'cloudflare',
    `submit POSTs target='cloudflare' (got: ${JSON.stringify(body?.target)})`);

  // Modal title reads "Publish to Clear Cloud" (renamed from "Deploy to a live URL")
  const title = await page.locator('.deploy-title').innerText();
  assert(/clear cloud/i.test(title || ''),
    `modal title mentions Clear Cloud (got: "${title}")`);

} catch (err) {
  console.error('\n💥 Test crash:', err.message);
  failed++;
}

await browser.close();
server.kill('SIGTERM');

console.log('\n========================================');
console.log(`✅ Passed: ${passed}`);
if (failed > 0) console.log(`❌ Failed: ${failed}`);
console.log('========================================');
process.exit(failed > 0 ? 1 : 0);
