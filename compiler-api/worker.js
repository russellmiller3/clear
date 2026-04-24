// Clear Compiler API — Cloudflare Worker
//
// Wraps compileProgram() from the main compiler package and exposes it over HTTPS.
// Edge-deployed so the LSP / VSCode extension / Studio can hit a single endpoint
// from anywhere in the world with sub-150ms latency.
//
// Endpoints:
//   GET  /health   → { ok: true, version }
//   POST /compile  → { javascript, html, css, errors, warnings, stats }
//
// Request body for POST /compile:
//   { source: string, modules?: { [name]: source } }
//
// Multi-file projects: pass each .clear file as { modules: { 'components': '...' } }.
// Worker turns the dict into a moduleResolver and hands it to compileProgram.
//
// Telemetry: every compile emits one structured-JSON console.log line.
// Cloudflare Workers Logs ingest these for usage / error / latency dashboards.
//
// Rate limiting: stub. Real implementation lives in env.RATE_LIMITER (KV namespace
// bound at deploy time). See wrangler.toml for the binding template.

import { compileProgram } from '../index.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const MAX_SOURCE_BYTES = 1_000_000; // 1 MB hard cap per request
const VERSION = '1.0.0';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, version: VERSION });
    }

    if (url.pathname === '/compile' && request.method === 'POST') {
      return handleCompile(request, env, ctx);
    }

    return json({ error: 'Not found', path: url.pathname }, 404);
  },
};

async function handleCompile(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body must be valid JSON' }, 400);
  }

  const { source, modules } = body || {};

  if (typeof source !== 'string' || source.length === 0) {
    return json({ error: 'Missing or empty `source` string in body' }, 400);
  }
  if (source.length > MAX_SOURCE_BYTES) {
    return json({
      error: `Source too large (${source.length} bytes). Maximum is ${MAX_SOURCE_BYTES}.`,
    }, 413);
  }
  if (modules != null && (typeof modules !== 'object' || Array.isArray(modules))) {
    return json({ error: '`modules` must be an object of { name: source } pairs' }, 400);
  }

  // Rate-limit hook. When env.RATE_LIMITER (KV) is bound, swap in the real check.
  // For now, emit the IP into telemetry so Russell can see traffic shape.
  const callerIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const moduleResolver = modules
    ? (name) => Object.prototype.hasOwnProperty.call(modules, name) ? modules[name] : null
    : undefined;

  const t0 = Date.now();
  let result;
  try {
    result = compileProgram(source, { moduleResolver });
  } catch (err) {
    const ms = Date.now() - t0;
    logCompile({
      ok: false,
      ms,
      sourceBytes: source.length,
      crash: String(err && err.message ? err.message : err),
      ip: callerIP,
    });
    return json({
      error: 'Compiler crashed',
      detail: String(err && err.message ? err.message : err),
    }, 500);
  }
  const ms = Date.now() - t0;

  logCompile({
    ok: true,
    ms,
    sourceBytes: source.length,
    errors: (result.errors || []).length,
    warnings: (result.warnings || []).length,
    target: detectTarget(source),
    hash: hashShort(source),
    ip: callerIP,
  });

  return json({
    javascript: result.javascript || '',
    html: result.html || '',
    css: result.css || '',
    serverJS: result.serverJS || '',
    errors: result.errors || [],
    warnings: result.warnings || [],
    stats: { compileMs: ms, sourceBytes: source.length },
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function detectTarget(source) {
  const m = source.match(/^build for (\w+)/m);
  return m ? m[1] : 'web';
}

// DJB2 short hash — for de-anonymized telemetry only, NOT cryptographic.
// Lets us count "how many distinct programs hit /compile this week" without
// storing the source itself.
function hashShort(source) {
  let h = 5381;
  for (let i = 0; i < source.length; i++) h = (h * 33 ^ source.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function logCompile(entry) {
  console.log(JSON.stringify({ event: 'compile', ts: Date.now(), ...entry }));
}
