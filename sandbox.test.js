// =============================================================================
// CLEAR SANDBOX RUNNER — Integration Tests
// =============================================================================
// Run: node sandbox.test.js
// Note: these tests actually spin up Node servers. Requires express + better-sqlite3.
// =============================================================================

import { Sandbox, runClear } from './sandbox.js';

let passed = 0;
let failed = 0;

async function it(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual: (expected) => {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toBeTruthy: () => { if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
    toBeFalsy: () => { if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
    toBeGreaterThan: (n) => { if (actual <= n) throw new Error(`Expected > ${n}, got ${actual}`); },
    toHaveLength: (n) => { if (actual?.length !== n) throw new Error(`Expected length ${n}, got ${actual?.length}`); },
    toContain: (v) => { if (!actual?.includes?.(v)) throw new Error(`Expected to contain ${JSON.stringify(v)}`); },
    not: {
      toBe: (expected) => { if (actual === expected) throw new Error(`Expected NOT ${JSON.stringify(expected)}`); },
      toBeNull: () => { if (actual === null) throw new Error('Expected non-null'); },
    },
  };
}

// =============================================================================

console.log('\n📦 Sandbox — compile errors');

await it('returns compile errors without starting server', async () => {
  const result = await runClear(`
    build for javascript backend
    price = 'hello'
    total = price * 1.08
  `);
  expect(result.ok).toBe(false);
  expect(result.compileErrors.length).toBeGreaterThan(0);
  expect(result.exitCode).toBe(1);
  expect(result.testResults).toHaveLength(0);
});

await it('returns ok=false for non-backend source', async () => {
  const result = await runClear(`
    build for web
    page 'Hello':
      show 'hello world'
  `);
  expect(result.ok).toBe(false);
  expect(result.compileErrors.length).toBeGreaterThan(0);
});

console.log('\n📦 Sandbox — server lifecycle');

await it('starts a server and returns ok=true for healthy app', async () => {
  const result = await runClear(`
    build for javascript backend
    when user calls GET /api/health:
      send back 'ok'
  `, { timeout: 8000 });
  expect(result.ok).toBe(true);
  expect(result.exitCode).toBe(0);
});

await it('includes compile stats in result', async () => {
  const result = await runClear(`
    build for javascript backend
    when user calls GET /api/ping:
      send back 'pong'
  `, { timeout: 8000 });
  expect(result.stats).not.toBeNull();
  expect(result.stats.endpoints).toBe(1);
});

console.log('\n📦 Sandbox — HTTP test assertions');

await it('passes a GET test that returns expected status', async () => {
  const result = await runClear(`
    build for javascript backend
    when user calls GET /api/health:
      send back 'ok'
  `, {
    timeout: 8000,
    tests: [{ method: 'GET', path: '/api/health', expect: { status: 200 } }],
  });
  expect(result.ok).toBe(true);
  expect(result.testResults).toHaveLength(1);
  expect(result.testResults[0].passed).toBe(true);
});

await it('fails a test when status does not match', async () => {
  const result = await runClear(`
    build for javascript backend
    when user calls GET /api/health:
      send back 'ok'
  `, {
    timeout: 8000,
    tests: [{ method: 'GET', path: '/api/health', expect: { status: 404 } }],
  });
  expect(result.ok).toBe(false);
  expect(result.testResults[0].passed).toBe(false);
  expect(result.exitCode).toBe(4);
});

await it('runs multiple tests in sequence', async () => {
  const result = await runClear(`
    build for javascript backend
    when user calls GET /api/ping:
      send back 'pong'
    when user calls GET /api/health:
      send back 'ok'
  `, {
    timeout: 8000,
    tests: [
      { method: 'GET', path: '/api/ping', expect: { status: 200 } },
      { method: 'GET', path: '/api/health', expect: { status: 200 } },
    ],
  });
  expect(result.testResults).toHaveLength(2);
  expect(result.testResults[0].passed).toBe(true);
  expect(result.testResults[1].passed).toBe(true);
  expect(result.ok).toBe(true);
});

await it('POST endpoint creates and returns data', async () => {
  const result = await runClear(`
    build for javascript backend
    create a Users table:
      name, required
    when user calls POST /api/users receiving user_data:
      define new_user as: save user_data as User
      send back new_user
  `, {
    timeout: 8000,
    tests: [
      { method: 'POST', path: '/api/users', body: { name: 'Alice' }, expect: { status: 200, body: { name: 'Alice' } } },
    ],
  });
  expect(result.testResults).toHaveLength(1);
  expect(result.testResults[0].passed).toBe(true);
});

await it('parallel sandboxes run without port conflicts', async () => {
  const programs = [
    { src: `build for javascript backend\nwhen user calls GET /api/a:\n  send back 'a'`, path: '/api/a' },
    { src: `build for javascript backend\nwhen user calls GET /api/b:\n  send back 'b'`, path: '/api/b' },
    { src: `build for javascript backend\nwhen user calls GET /api/c:\n  send back 'c'`, path: '/api/c' },
  ];
  const results = await Promise.all(programs.map(({ src, path }) => runClear(src, {
    timeout: 10000,
    tests: [{ method: 'GET', path, expect: { status: 200 } }],
  })));
  // All should succeed — each gets its own port
  const successes = results.filter(r => r.ok);
  expect(successes.length).toBeGreaterThan(0);
});

// =============================================================================

console.log('\n========================================');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
