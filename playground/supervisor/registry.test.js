import { describe, it, expect } from '../../lib/testUtils.js';
import { SessionRegistry } from './registry.js';
import { unlinkSync } from 'fs';

const TEST_DB = '/tmp/registry-test.db';
function cleanup() { try { unlinkSync(TEST_DB); } catch {} }

describe('SessionRegistry', () => {
  it('creates a session and reads it back', () => {
    cleanup();
    const reg = new SessionRegistry(TEST_DB);
    reg.create({ id: 'worker-1', port: 3457, state: 'idle' });
    const s = reg.get('worker-1');
    expect(s).toBeTruthy();
    expect(s.port).toEqual(3457);
    expect(s.state).toEqual('idle');
    reg.close();
    cleanup();
  });

  it('updates session state', () => {
    cleanup();
    const reg = new SessionRegistry(TEST_DB);
    reg.create({ id: 'worker-1', port: 3457, state: 'idle' });
    reg.update('worker-1', { state: 'running', task: 'build a blog' });
    const s = reg.get('worker-1');
    expect(s.state).toEqual('running');
    expect(s.task).toEqual('build a blog');
    reg.close();
    cleanup();
  });

  it('lists only active sessions', () => {
    cleanup();
    const reg = new SessionRegistry(TEST_DB);
    reg.create({ id: 'worker-1', port: 3457, state: 'running' });
    reg.create({ id: 'worker-2', port: 3458, state: 'idle' });
    reg.create({ id: 'worker-3', port: 3459, state: 'completed' });
    const active = reg.listActive(); // state IN ('idle', 'running')
    expect(active.length).toEqual(2);
    reg.close();
    cleanup();
  });

  it('registry survives close and reopen (WAL durability)', () => {
    cleanup();
    const reg1 = new SessionRegistry(TEST_DB);
    reg1.create({ id: 'worker-1', port: 3457, state: 'running', task: 'important task' });
    reg1.close();
    // Simulate process restart
    const reg2 = new SessionRegistry(TEST_DB);
    const s = reg2.get('worker-1');
    expect(s).toBeTruthy();
    expect(s.task).toEqual('important task');
    reg2.close();
    cleanup();
  });
});
