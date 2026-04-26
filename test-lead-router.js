const http = require('http');

const PORT = 6921;
const BASE = `http://localhost:${PORT}`;

async function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const url = new URL(path, BASE);
    const options = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // Sign up to get token
  const signup = await req('POST', '/auth/signup', { email: 'tester@test.com', password: 'pass123' });
  const token = signup.body && signup.body.token;
  console.log('Token obtained:', !!token);

  // Test 1: POST Enterprise lead
  const t1 = await req('POST', '/api/leads', { name: 'Alice Smith', email: 'a@acmecorp.com', size: 'Enterprise' }, token);
  console.log('Test1 POST Enterprise:', t1.status, 'assigned_to:', t1.body && t1.body.assigned_to, '(want charlie, status 201)');

  // Test 2: POST SMB lead
  const t2 = await req('POST', '/api/leads', { name: 'Bob Jones', email: 'b@tinyco.com', size: 'SMB' }, token);
  console.log('Test2 POST SMB:', t2.status, 'assigned_to:', t2.body && t2.body.assigned_to, '(want alice, status 201)');

  // Test 3: POST Mid-market lead
  const t3 = await req('POST', '/api/leads', { name: 'Carol Lee', email: 'c@mid.com', size: 'Mid-market' }, token);
  console.log('Test3 POST Mid-market:', t3.status, 'assigned_to:', t3.body && t3.body.assigned_to, '(want bob)');

  // Test 4: GET /api/leads
  const t4 = await req('GET', '/api/leads');
  console.log('Test4 GET all:', t4.status, 'count:', t4.body && t4.body.length, '(want 200 + >0)');

  // Test 5: GET /api/leads/new
  const t5 = await req('GET', '/api/leads/new');
  console.log('Test5 GET new:', t5.status, 'count:', t5.body && t5.body.length);

  // Test 6: POST empty body -> expect 400
  const t6 = await req('POST', '/api/leads', {}, token);
  console.log('Test6 empty body:', t6.status, '(want 400)');
}

main().catch(console.error);
