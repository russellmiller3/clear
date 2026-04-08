// =============================================================================
// PLAYGROUND E2E — ALL APPS: COMPILE, RUN, USE
// =============================================================================
// Tests all 43 templates: compile every one, run representative samples,
// hit real endpoints, verify the IDE UI (compile btn, run btn, output tab).
//
// Run: node playground/e2e.test.js
// =============================================================================

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3459';

let passed = 0, failed = 0, total = 0;

function assert(condition, msg) {
  total++;
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

async function apiPost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

async function apiGet(path) {
  const r = await fetch(BASE + path);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

// Hit a proxied endpoint on the running app
async function appPost(path, body) { return apiPost('/api/fetch', { method: 'POST', path, body }); }
async function appGet(path) { return apiPost('/api/fetch', { method: 'GET', path }); }
async function appDel(path) { return apiPost('/api/fetch', { method: 'DELETE', path }); }
async function appPut(path, body) { return apiPost('/api/fetch', { method: 'PUT', path, body }); }

async function stopApp() { await apiPost('/api/stop', {}); }

async function startApp(serverCode) {
  const { status, data } = await apiPost('/api/run', { serverJS: serverCode });
  if (status !== 200) {
    console.log(`    ⚠️  run returned ${status}: ${JSON.stringify(data).slice(0, 120)}`);
    return null;
  }
  if (data.warning) console.log(`    ⚠️  ${data.warning}`);
  if (data.logs?.length) console.log(`    logs: ${data.logs.join(' ').slice(0, 120)}`);
  await new Promise(r => setTimeout(r, 2500)); // let server boot
  return data.port;
}

async function waitForEndpoint(path, maxMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const { data } = await appGet(path);
      if (data && data.status !== undefined) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// =============================================================================
// START PLAYGROUND SERVER
// =============================================================================
console.log('Starting playground server on port 3459...');
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
console.log('Server ready.\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const jsErrors = [];
page.on('pageerror', err => jsErrors.push(err.message));
await page.goto(BASE, { waitUntil: 'networkidle' });

try {

// =============================================================================
// 1. COMPILE ALL TEMPLATES — every app must compile with 0 errors
// =============================================================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📦 Compile all 43 templates');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const { status: tplStatus, data: templates } = await apiGet('/api/templates');
assert(tplStatus === 200 && templates.length >= 40, `template list loads (${templates.length} templates)`);

const compiled = {}; // name -> compile result
let compileErrors = 0;

for (const t of templates) {
  const src = await (await fetch(BASE + '/api/template/' + t.name)).text();
  const { data } = await apiPost('/api/compile', { source: src });
  compiled[t.name] = data;
  if (data.errors.length > 0) {
    compileErrors++;
    console.log(`    ⚠️  ${t.name}: ${data.errors[0].message}`);
  }
}

assert(compileErrors === 0, `all ${templates.length} templates compile with 0 errors`);

// Categorize
const fullstack = templates.filter(t => compiled[t.name]?.html && compiled[t.name]?.serverJS);
const webOnly   = templates.filter(t => compiled[t.name]?.html && !compiled[t.name]?.serverJS);
const jsBackend = templates.filter(t => !compiled[t.name]?.html && (compiled[t.name]?.javascript || compiled[t.name]?.serverJS));

console.log(`\n  Fullstack: ${fullstack.length}  Web-only: ${webOnly.length}  JS-backend: ${jsBackend.length}`);

// =============================================================================
// 2. RUN + TEST ENDPOINTS: JS-Backend apps (javascript field)
// =============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔌 JS-Backend apps — run and hit endpoints');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// todo-api: full CRUD
{
  console.log('\n  📋 todo-api');
  const r = compiled['todo-api'];
  const code = r.serverJS || r.javascript;
  assert(!!code, 'todo-api has runnable code');
  const port = await startApp(code);
  assert(!!port, `todo-api started on port ${port}`);

  const { data: list } = await appGet('/api/todos');
  assert(Array.isArray(list.data), 'GET /api/todos returns array');

  const { data: created } = await appPost('/api/todos', { title: 'Buy milk', completed: false });
  assert(created.status === 200 || created.status === 201, 'POST /api/todos creates item');

  const { data: list2 } = await appGet('/api/todos');
  assert(Array.isArray(list2.data) && list2.data.length >= 1, 'list has 1+ item after POST');

  const id = list2.data[0]?.id;
  if (id !== undefined) {
    const { data: one } = await appGet(`/api/todos/${id}`);
    assert(one.status === 200, `GET /api/todos/${id} works`);

    // PUT /DELETE require auth in this template (intentional — no login endpoint)
    const { data: updated } = await appPut(`/api/todos/${id}`, { completed: true });
    assert(updated.status === 401, `PUT /api/todos/${id} returns 401 without auth (auth-protected)`);

    const { data: deleted } = await appDel(`/api/todos/${id}`);
    assert(deleted.status === 401, `DELETE /api/todos/${id} returns 401 without auth (auth-protected)`);
  }
  await stopApp();
}

// blog-api: posts CRUD
{
  console.log('\n  📰 blog-api');
  const r = compiled['blog-api'];
  const code = r.serverJS || r.javascript;
  assert(!!code, 'blog-api has runnable code');
  const port = await startApp(code);
  assert(!!port, `blog-api started on port ${port}`);

  const { data: posts } = await appGet('/api/posts');
  assert(posts.status === 200 || Array.isArray(posts.data), 'GET /api/posts responds');

  // POST /api/posts requires auth in blog-api template
  const { data: created } = await appPost('/api/posts', { title: 'E2E Test Post', body: 'Content', author: 'Tester' });
  assert(created.status === 401, 'POST /api/posts returns 401 without auth (auth-protected)');

  await stopApp();
}

// chat-backend
{
  console.log('\n  💬 chat-backend');
  const r = compiled['chat-backend'];
  const code = r.serverJS || r.javascript;
  assert(!!code, 'chat-backend has runnable code');
  const port = await startApp(code);
  assert(!!port, `chat-backend started on port ${port}`);

  const { data: rooms } = await appGet('/api/rooms');
  assert(rooms.status === 200 || Array.isArray(rooms.data), 'GET /api/rooms responds');

  const { data: health } = await appGet('/api/health');
  assert(health.status === 200, 'GET /api/health responds');

  await stopApp();
}

// url-shortener
{
  console.log('\n  🔗 url-shortener');
  const r = compiled['url-shortener'];
  const code = r.serverJS || r.javascript;
  assert(!!code, 'url-shortener has runnable code');
  const port = await startApp(code);
  assert(!!port, `url-shortener started on port ${port}`);

  const { data: links } = await appGet('/api/links');
  assert(links.status === 200 || Array.isArray(links.data), 'GET /api/links responds');

  // POST endpoint is /api/shorten (not /api/links)
  const { data: created } = await appPost('/api/shorten', { url: 'https://example.com', slug: 'test' });
  assert(created.status === 200 || created.status === 201, 'POST /api/shorten creates link');

  await stopApp();
}

// =============================================================================
// 3. RUN + TEST ENDPOINTS: Fullstack apps
// =============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🌐 Fullstack apps — run, test endpoints, verify UI');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// todo-fullstack: run via UI, verify Output tab + CRUD
{
  console.log('\n  📋 todo-fullstack (via IDE UI)');
  await page.locator('#template-picker').selectOption('todo-fullstack');
  await page.waitForTimeout(1000);
  await page.locator('button[onclick="doCompile()"]').click();
  await page.waitForTimeout(1500);

  const status = await page.locator('#status').innerText();
  assert(status.startsWith('OK'), `IDE compiles todo-fullstack (${status})`);

  await page.locator('button[onclick="doRun()"]').click();
  await page.waitForTimeout(4000);

  const activeTab = await page.locator('.prev-tab.active').innerText();
  assert(['Output', 'Terminal'].includes(activeTab), `Run switches to Output/Terminal (got "${activeTab}")`);

  if (activeTab === 'Output') {
    assert(await page.locator('#preview-content iframe').isVisible(), 'Output tab has iframe');
  }

  // Test API via proxy
  const { data: todos } = await appGet('/api/todos');
  assert(todos.status === 200 || Array.isArray(todos.data), 'GET /api/todos works on running fullstack app');

  const { data: newTodo } = await appPost('/api/todos', { title: 'E2E test todo', completed: false });
  assert(newTodo.status === 200 || newTodo.status === 201, 'POST /api/todos works on fullstack app');

  await page.locator('button[onclick="doStop()"]').click();
  await new Promise(r => setTimeout(r, 500));
}

// expense-tracker
{
  console.log('\n  💰 expense-tracker');
  const r = compiled['expense-tracker'];
  const port = await startApp(r.serverJS || r.javascript);
  assert(!!port, `expense-tracker started on port ${port}`);

  const { data: expenses } = await appGet('/api/expenses');
  assert(expenses.status === 200 || Array.isArray(expenses.data), 'GET /api/expenses responds');

  const { data: created } = await appPost('/api/expenses', { description: 'Coffee', amount: 4.50, category: 'Food' });
  assert(created.status === 200 || created.status === 201, 'POST /api/expenses creates expense');

  await stopApp();
}

// crm
{
  console.log('\n  👥 crm');
  const r = compiled['crm'];
  const port = await startApp(r.serverJS || r.javascript);
  assert(!!port, `crm started on port ${port}`);

  const { data: contacts } = await appGet('/api/contacts');
  assert(contacts.status === 200 || Array.isArray(contacts.data), 'GET /api/contacts responds');

  await stopApp();
}

// project-board
{
  console.log('\n  📌 project-board');
  const r = compiled['project-board'];
  const port = await startApp(r.serverJS || r.javascript);
  assert(!!port, `project-board started on port ${port}`);

  // Try common endpoints
  const endpoints = ['/api/tasks', '/api/projects', '/api/items', '/api/cards'];
  let anyWorked = false;
  for (const ep of endpoints) {
    const { data } = await appGet(ep);
    if (data.status === 200 || Array.isArray(data.data)) { anyWorked = true; break; }
  }
  assert(anyWorked, 'project-board has at least one working GET endpoint');

  await stopApp();
}

// recipe-book
{
  console.log('\n  🍳 recipe-book');
  const r = compiled['recipe-book'];
  const port = await startApp(r.serverJS || r.javascript);
  assert(!!port, `recipe-book started on port ${port}`);

  const endpoints = ['/api/recipes', '/api/items', '/api/dishes'];
  let anyWorked = false;
  for (const ep of endpoints) {
    const { data } = await appGet(ep);
    if (data.status === 200 || Array.isArray(data.data)) { anyWorked = true; break; }
  }
  assert(anyWorked, 'recipe-book has at least one working GET endpoint');

  await stopApp();
}

// =============================================================================
// 4. WEB-ONLY APPS — compile + Run button shows Output tab with iframe
// =============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎨 Web-only apps — Run shows Output tab with rendered iframe');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const t of webOnly.slice(0, 3)) {
  console.log(`\n  🌍 ${t.name}`);
  await page.locator('#template-picker').selectOption(t.name);
  await page.waitForTimeout(800);
  await page.locator('button[onclick="doCompile()"]').click();
  await page.waitForTimeout(1200);

  const st = await page.locator('#status').innerText();
  assert(st.startsWith('OK'), `${t.name} compiles in IDE (${st})`);

  await page.locator('button[onclick="doRun()"]').click();
  await page.waitForTimeout(500);

  const tab = await page.locator('.prev-tab.active').innerText();
  assert(tab === 'Output', `${t.name}: Run activates Output tab (got "${tab}")`);
  assert(await page.locator('#preview-content iframe').isVisible(), `${t.name}: iframe visible in Output tab`);
}

// =============================================================================
// 5. IDE BUTTONS — every button works as expected
// =============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 All IDE buttons');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// New
await page.locator('button:has-text("New")').click();
await page.waitForTimeout(300);
assert((await page.locator('.cm-content').innerText()).includes('build for web'), 'New resets editor');
assert((await page.locator('#editor-label').innerText()).toLowerCase() === 'main.clear', 'New resets label');

// Compile (Ctrl+S)
await page.locator('.cm-editor').click();
await page.keyboard.press('Control+s');
await page.waitForTimeout(1000);
assert((await page.locator('#status').innerText()).startsWith('OK'), 'Ctrl+S compiles');

// Compile button
await page.locator('button[onclick="doCompile()"]').click();
await page.waitForTimeout(1000);
assert((await page.locator('#status').innerText()).startsWith('OK'), 'Compile button works');

// Tabs
await page.locator('button[onclick="showTab(\'compiled\')"]').click();
await page.waitForTimeout(200);
assert((await page.locator('.prev-tab.active').innerText()) === 'Compiled Code', 'Compiled Code tab activates');

await page.locator('button[onclick="showTab(\'output\')"]').click();
await page.waitForTimeout(200);
assert((await page.locator('.prev-tab.active').innerText()) === 'Output', 'Output tab activates');

await page.locator('button[onclick="showTab(\'terminal\')"]').click();
await page.waitForTimeout(200);
assert((await page.locator('.prev-tab.active').innerText()) === 'Terminal', 'Terminal tab activates');

// Theme toggle
const theme1 = await page.locator('html').getAttribute('data-theme');
await page.locator('#theme-toggle').click();
const theme2 = await page.locator('html').getAttribute('data-theme');
assert(theme1 !== theme2, `theme toggle works (${theme1} → ${theme2})`);

// Dark mode: fonts should be Inter not serif
const bodyFont = await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily);
assert(bodyFont.includes('Inter') || bodyFont.includes('system-ui') || bodyFont.includes('sans-serif'),
  `dark mode font is sans-serif: "${bodyFont.slice(0, 60)}"`);

await page.locator('#theme-toggle').click(); // back to light

// Save
await page.locator('button[onclick="doSave()"]').click();
await page.waitForTimeout(500);
const toast = page.locator('.toast');
assert(await toast.isVisible().catch(() => false), 'Save shows toast notification');

// Stop
await page.locator('button[onclick="doStop()"]').click();
await page.waitForTimeout(300);

// Chat focus (Ctrl+K)
await page.locator('.cm-editor').click();
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
assert(await page.locator('#chat-input').evaluate(el => el === document.activeElement), 'Ctrl+K focuses chat');

// =============================================================================
// 6. CHAT — send a message (requires API key; skip if not set)
// =============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💬 Chat');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey) {
  // Inject API key into the page
  await page.evaluate(key => localStorage.setItem('clear_api_key', key), apiKey);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Type a message
  await page.locator('#chat-input').fill('Write a Clear app that shows "Hello from Claude" as a heading. Just the code, nothing else.');
  await page.locator('#chat-send').click();

  // Wait for response (up to 30s)
  await page.waitForFunction(() => {
    const msgs = document.querySelectorAll('.msg.assistant');
    return msgs.length > 0 && !document.getElementById('typing');
  }, { timeout: 30000 }).catch(() => {});

  const assistantMsgs = await page.locator('.msg.assistant').count();
  assert(assistantMsgs > 0, 'Claude responds to chat message');

  const lastMsg = await page.locator('.msg.assistant').last().innerText();
  assert(lastMsg.length > 10, `Claude response has content: "${lastMsg.slice(0, 80)}"`);
} else {
  console.log('  ⏭️  Skipping chat test — set ANTHROPIC_API_KEY env var to test');
  // Still test that the chat UI is there
  assert(await page.locator('#chat-input').isVisible(), 'chat input visible');
  assert(await page.locator('#chat-send').isVisible(), 'Send button visible');
  const sendColor = await page.locator('#chat-send').evaluate(el => getComputedStyle(el).color);
  assert(!sendColor.includes('(15,') && !sendColor.includes('rgb(15'), `Send button text is not near-black (got ${sendColor})`);
}

// =============================================================================
// 7. NO JS ERRORS THROUGHOUT
// =============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const filteredErrors = jsErrors.filter(e => !e.includes('favicon'));
assert(filteredErrors.length === 0, `no JS errors throughout (${filteredErrors.join('; ') || 'none'})`);

} catch (err) {
  console.error('\n💥 Test crash:', err.message);
  console.error(err.stack?.split('\n').slice(0, 4).join('\n'));
  failed++;
}

await browser.close();
server.kill('SIGTERM');

console.log(`\n${'━'.repeat(64)}`);
console.log(`✅ Passed: ${passed} / ${total}`);
if (failed > 0) console.log(`❌ Failed: ${failed}`);
console.log('━'.repeat(64));
process.exit(failed > 0 ? 1 : 0);
