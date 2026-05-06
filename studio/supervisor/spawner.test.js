import { describe, it, expect } from '../../lib/testUtils.js';
import { WorkerSpawner } from './spawner.js';
import { SessionRegistry } from './registry.js';
import { unlinkSync } from 'fs';

const TEST_DB = '/tmp/spawner-test.db';
function cleanup() { try { unlinkSync(TEST_DB); } catch {} }

// Give a worker server time to start before polling it
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

describe('WorkerSpawner', () => {
  it('spawns a worker on a given port and heartbeat returns 200', async () => {
    cleanup();
    const registry = new SessionRegistry(TEST_DB);
    const spawner = new WorkerSpawner(registry);

    await spawner.spawn(3481, 'worker-test-1');
    await wait(2500); // give server time to bind

    const res = await fetch('http://localhost:3481/api/worker-heartbeat');
    expect(res.status).toEqual(200);
    const body = await res.json();
    expect(body.sessionId).toEqual('worker-test-1');

    await spawner.killAll();
    registry.close();
    cleanup();
  }, 10000);

  it('spawns 3 workers on different ports and kills all cleanly', async () => {
    cleanup();
    const registry = new SessionRegistry(TEST_DB);
    const spawner = new WorkerSpawner(registry);

    await spawner.spawnAll(3, 3482); // ports 3482, 3483, 3484
    await wait(3000);

    const responses = await Promise.all([
      fetch('http://localhost:3482/api/worker-heartbeat').then(r => r.json()),
      fetch('http://localhost:3483/api/worker-heartbeat').then(r => r.json()),
      fetch('http://localhost:3484/api/worker-heartbeat').then(r => r.json()),
    ]);
    expect(responses[0].sessionId).toEqual('worker-1');
    expect(responses[1].sessionId).toEqual('worker-2');
    expect(responses[2].sessionId).toEqual('worker-3');

    await spawner.killAll();
    const active = registry.listActive();
    // All should be marked crashed/stopped after kill
    expect(active.filter(s => s.state === 'running').length).toEqual(0);
    registry.close();
    cleanup();
  }, 15000);
});
