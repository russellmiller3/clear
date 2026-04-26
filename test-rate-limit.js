// Test script for rate-limited API
const BASE = 'http://localhost:4003';

async function post(name) {
  const r = await fetch(`${BASE}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return { status: r.status, body: await r.json() };
}

async function get() {
  const r = await fetch(`${BASE}/api/items`);
  return { status: r.status, body: await r.json() };
}

async function run() {
  const p1 = await post('Item 1');
  console.log('POST 1:', p1.status, JSON.stringify(p1.body));

  const g1 = await get();
  console.log('GET:', g1.status, JSON.stringify(g1.body));

  console.log('\nRate limit test (5 per minute):');
  for (let i = 2; i <= 7; i++) {
    const r = await post(`Item ${i}`);
    console.log(`POST ${i}: status=${r.status}`);
  }
}

run().catch(e => console.error('Error:', e.message));
