// =============================================================================
// PLAYGROUND IDE — PUBLISH MODAL TARGETS CLEAR CLOUD (CC-4 cycle 4)
// =============================================================================
// Standalone Playwright test that locks in: every Publish from Studio ships
// to Clear Cloud (Cloudflare). No picker, no Fly fallback. Simple and final.
// Run: node studio/ide-deploy-modal.test.js
// =============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = '3461';
const BASE = `http://localhost:${PORT}`;

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

console.log(`Starting server on port ${PORT}...`);
const server = spawn('node', ['studio/server.js'], {
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
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));
const unexpectedConsoleErrors = () => consoleErrors.filter(msg =>
  !/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(msg)
);

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
        return new Response(JSON.stringify({ ok: true, jobId: 'job-live' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).includes('/api/deploy-status/job-live')) {
        return new Response(JSON.stringify({
          status: 'ok',
          result: { url: 'https://hello.buildclear.dev', appName: 'hello', versionId: 'v-1234567890' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return window.__originalFetch(url, opts);
    };
  });

  // Open the modal
  await page.evaluate(() => window.doDeploy());
  await page.waitForSelector('#deploy-modal', { state: 'visible' });
  await page.waitForSelector('#deploy-progress [data-deploy-stage]', { timeout: 2000 }).catch(() => {});
  assert(await page.locator('#deploy-modal').isVisible(), 'publish modal opens');
  const openErrors = unexpectedConsoleErrors();
  assert(openErrors.length === 0,
    `no unexpected console errors while opening publish modal (got: ${openErrors.join('; ') || 'none'})`);

  // No target picker — Studio is Clear-Cloud-only
  assert(await page.locator('#deploy-target-radio-group').count() === 0,
    'no target picker rendered (Clear Cloud is the only option)');
  assert(await page.locator('input[name="deploy-target"]').count() === 0,
    'no deploy-target radios anywhere in the DOM');

  // Domain placeholder mentions buildclear.dev (the Clear Cloud root domain)
  const placeholder = await page.locator('#deploy-domain').getAttribute('placeholder');
  assert(/buildclear\.dev/i.test(placeholder || ''),
    `domain placeholder mentions buildclear.dev (got: "${placeholder}")`);

  const progressStages = await page.locator('#deploy-progress [data-deploy-stage]').evaluateAll(nodes =>
    nodes.map(n => n.getAttribute('data-deploy-stage'))
  );
  const progressHtml = await page.locator('#deploy-progress').innerHTML().catch(() => '');
  assert(JSON.stringify(progressStages) === JSON.stringify(['compiling', 'packaging', 'uploading', 'provisioning-db', 'live']),
    `progress rail exposes five stages (got: ${JSON.stringify(progressStages)}; html: ${progressHtml.slice(0, 160)})`);

  // Submit → POST body carries target='cloudflare'
  await page.locator('#deploy-submit-btn').click();
  await page.waitForSelector('#deploy-copy-link-btn', { timeout: 2000 }).catch(() => {});
  const body = await page.evaluate(() => window.__capturedDeployBody);
  assert(body?.target === 'cloudflare',
    `submit POSTs target='cloudflare' (got: ${JSON.stringify(body?.target)})`);

  // Modal title reads "Publish to Clear Cloud" (renamed from "Deploy to a live URL")
  const title = await page.locator('.deploy-title').innerText();
  assert(/clear cloud/i.test(title || ''),
    `modal title mentions Clear Cloud (got: "${title}")`);

  assert(await page.locator('#deploy-copy-link-btn').count() === 1,
    'live confirmation exposes Copy link action');
  assert(await page.locator('#deploy-open-live-btn').count() === 1,
    'live confirmation exposes Open in new tab action');
  assert(await page.locator('#deploy-share-team-btn').count() === 1,
    'live confirmation exposes Share with team action');
  const liveUrl = await page.locator('#deploy-live-url').innerText().catch(() => '');
  assert(liveUrl === 'https://hello.buildclear.dev',
    `live confirmation shows the final URL (got: "${liveUrl}")`);

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
