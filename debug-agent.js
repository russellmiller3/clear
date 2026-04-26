// Test if ANTHROPIC_API_KEY is accessible and test a basic API call
const key = process.env.ANTHROPIC_API_KEY || process.env.CLEAR_AI_KEY;
console.log('API key present:', !!key);
if (key) {
  const https = require('https');
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }]
  });
  const opts = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  const req = https.request(opts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', data.slice(0, 200));
    });
  });
  req.on('error', e => console.log('Error:', e.message));
  req.write(payload);
  req.end();
} else {
  console.log('No API key - cannot test');
}
