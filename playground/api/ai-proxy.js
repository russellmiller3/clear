// Vercel Serverless Function — AI proxy for Clear playground
// Holds the Anthropic API key server-side, rate-limits by IP (3 calls per IP)

const ANTHROPIC_API_KEY = process.env.CLEAR_AI_KEY;
const MAX_CALLS_PER_IP = 3;

// In-memory store (resets on cold start — fine for demo)
// For persistent tracking, use Vercel KV or Upstash Redis
const ipCounts = new Map();

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Get IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  // Rate limit check
  const count = ipCounts.get(ip) || 0;
  if (count >= MAX_CALLS_PER_IP) {
    return res.status(429).json({
      error: `Demo limit reached (${MAX_CALLS_PER_IP} AI calls). Sign up for your own API key at anthropic.com to keep building.`,
      remaining: 0
    });
  }

  // Validate request
  const { prompt, context, schema } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // Build messages for Claude
  let systemPrompt = 'You are a helpful AI assistant. Respond concisely.';
  if (schema) {
    const fields = Object.entries(schema).map(([k, v]) => `${k} (${v})`).join(', ');
    systemPrompt += `\n\nRespond with ONLY valid JSON matching this schema: { ${fields} }. No markdown, no explanation, just JSON.`;
  }

  let userMessage = prompt;
  if (context) {
    userMessage += '\n\nContext:\n' + (typeof context === 'string' ? context : JSON.stringify(context));
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `AI API error: ${err}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Increment counter AFTER successful call
    ipCounts.set(ip, count + 1);
    const remaining = MAX_CALLS_PER_IP - count - 1;

    // Parse structured output if schema was provided
    let result = text;
    if (schema) {
      try {
        result = JSON.parse(text);
      } catch {
        result = text;
      }
    }

    return res.status(200).json({ result, remaining });
  } catch (err) {
    return res.status(500).json({ error: 'AI proxy error: ' + err.message });
  }
}
