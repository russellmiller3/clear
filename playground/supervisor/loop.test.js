import { describe, it, expect } from '../../lib/testUtils.js';
import { SupervisorLoop } from './loop.js';
import { SessionRegistry } from './registry.js';
import { WorkerSpawner } from './spawner.js';
import { unlinkSync } from 'fs';

const TEST_DB = '/tmp/loop-test.db';
function cleanup() { try { unlinkSync(TEST_DB); } catch {} }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

describe('SupervisorLoop', () => {
  it('pollOne reads heartbeat and terminal log from a live worker', async () => {
    cleanup();
    const registry = new SessionRegistry(TEST_DB);
    const spawner = new WorkerSpawner(registry);
    const loop = new SupervisorLoop(registry);

    await spawner.spawn(3491, 'worker-poll-1');
    await wait(2500);

    const result = await loop.pollOne('worker-poll-1');
    expect(result).toBeTruthy();
    expect(result.heartbeat).toBeTruthy();
    expect(result.heartbeat.sessionId).toEqual('worker-poll-1');
    expect(Array.isArray(result.terminalLines)).toEqual(true);

    await spawner.killAll();
    registry.close();
    cleanup();
  }, 15000);

  it('detectComplete returns true when terminal contains TASK COMPLETE', () => {
    const loop = new SupervisorLoop(null);
    const lines = ['[meph] Checking requirements', '[meph] TASK COMPLETE'];
    expect(loop.detectComplete(lines)).toEqual(true);
  });

  it('detectComplete returns false when terminal does not contain TASK COMPLETE', () => {
    const loop = new SupervisorLoop(null);
    const lines = ['[meph] Checking requirements', '[meph] Compiling...'];
    expect(loop.detectComplete(lines)).toEqual(false);
  });

  it('detectStuck returns true when terminal contains STUCK:', () => {
    const loop = new SupervisorLoop(null);
    const lines = ['[meph] Trying fix', '[meph] STUCK: validation error keeps failing'];
    expect(loop.detectStuck(lines)).toEqual(true);
  });

  it('detectStuck returns false when no STUCK: in terminal', () => {
    const loop = new SupervisorLoop(null);
    const lines = ['[meph] Compiling', '[meph] Tests pass'];
    expect(loop.detectStuck(lines)).toEqual(false);
  });

  it('pollOne marks session completed when TASK COMPLETE detected', async () => {
    cleanup();
    const registry = new SessionRegistry(TEST_DB);
    const spawner = new WorkerSpawner(registry);
    const loop = new SupervisorLoop(registry);

    await spawner.spawn(3492, 'worker-complete-1');
    await wait(2500);

    // Manually inject TASK COMPLETE into the worker's terminal via a sentinel approach:
    // We'll just patch detectComplete to return true for this session to test state machine
    const origDetect = loop.detectComplete.bind(loop);
    loop.detectComplete = () => true;

    await loop.pollOne('worker-complete-1');
    const s = registry.get('worker-complete-1');
    expect(s.state).toEqual('completed');

    loop.detectComplete = origDetect;
    await spawner.killAll();
    registry.close();
    cleanup();
  }, 15000);
});
