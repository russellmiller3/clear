// Compiler API worker tests
//
// Calls worker.default.fetch directly with constructed Request objects.
// Node 22's undici provides Request / Response / fetch globally so these
// tests run without miniflare. For the real Workers runtime test, use
// `wrangler dev` locally and curl localhost:8787.
//
// Run: node compiler-api/test/worker.test.mjs

import { describe, it, expect, run } from '../../lib/testUtils.js';
import worker from '../worker.js';

const BASE = 'https://compile.clearlang.dev';

async function call(path, init = {}) {
  const req = new Request(BASE + path, init);
  const res = await worker.fetch(req, {}, {});
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: Object.fromEntries(res.headers), text, json };
}

describe('compiler-api/worker — routing', () => {
  it('GET /health returns 200 with version', async () => {
    const r = await call('/health');
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(typeof r.json.version).toBe('string');
  });

  it('OPTIONS /compile returns 204 with CORS headers', async () => {
    const r = await call('/compile', { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(r.headers['access-control-allow-methods']).toContain('POST');
  });

  it('GET on unknown path returns 404', async () => {
    const r = await call('/nonexistent');
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('Not found');
  });
});

describe('compiler-api/worker — POST /compile validation', () => {
  it('rejects non-JSON body with 400', async () => {
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain('JSON');
  });

  it('rejects missing source with 400', async () => {
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain('source');
  });

  it('rejects empty source with 400', async () => {
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '' }),
    });
    expect(r.status).toBe(400);
  });

  it('rejects oversized source with 413', async () => {
    const big = 'x'.repeat(1_000_001);
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: big }),
    });
    expect(r.status).toBe(413);
    expect(r.json.error).toContain('too large');
  });

  it('rejects modules as array with 400', async () => {
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'page \'x\':\n  heading \'y\'', modules: ['nope'] }),
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain('modules');
  });
});

describe('compiler-api/worker — POST /compile success', () => {
  it('compiles a single-file program and returns html + javascript', async () => {
    const source = "build for web\npage 'Home':\n  heading 'Hello'";
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.errors)).toBe(true);
    expect(r.json.errors).toHaveLength(0);
    expect(r.json.html).toContain('<html');
    expect(r.json.html).toContain('Hello');
    expect(typeof r.json.javascript).toBe('string');
    expect(r.json.stats.compileMs).toBeGreaterThanOrEqual(0);
    expect(r.json.stats.sourceBytes).toBe(source.length);
  });

  it('compiles a multi-file project via modules dict', async () => {
    const source = "build for web\nuse 'components'\npage 'Home':\n  show components's MyCard()";
    const modules = {
      components: "define component MyCard:\n  heading 'Hi'\n",
    };
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, modules }),
    });
    expect(r.status).toBe(200);
    expect(r.json.errors).toHaveLength(0);
    // D-1 fix wired through: namespaced component renders into its container
    expect(r.json.html).toContain('class="clear-component"');
    expect(r.json.javascript).toContain('components.MyCard');
  });

  it('returns errors array (not 500) for source with compile errors', async () => {
    // Unknown keyword on its own line — compiler reports an error, not crash
    const source = "page 'x':\n  zzzzunknown_keyword 'thing'";
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    // Either 200 with errors[] or warnings[] populated — point is we don't 5xx
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.errors)).toBe(true);
    expect(Array.isArray(r.json.warnings)).toBe(true);
  });

  it('CORS headers present on successful compile', async () => {
    const r = await call('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: "page 'x':\n  heading 'y'" }),
    });
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });
});

run();
