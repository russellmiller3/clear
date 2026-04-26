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

  // cleanupStale() — defensive sweep before every new sweep so a previous
  // run's leftover rows can't trip the UNIQUE PRIMARY KEY on `sessions.id`.
  // Was added 2026-04-25 after a UNIQUE constraint failure broke an
  // overnight curriculum sweep — same worker IDs ('worker-1', 'worker-2',
  // ...) collided with idle/done rows the previous run never cleared.
  describe('cleanupStale()', () => {
    it('deletes idle rows', () => {
      cleanup();
      const reg = new SessionRegistry(TEST_DB);
      reg.create({ id: 'stale-idle', port: 3457, state: 'idle' });
      const removed = reg.cleanupStale();
      expect(removed).toBeGreaterThan(0);
      expect(reg.get('stale-idle')).toBeNull();
      reg.close();
      cleanup();
    });

    it('deletes done rows', () => {
      cleanup();
      const reg = new SessionRegistry(TEST_DB);
      reg.create({ id: 'stale-done', port: 3458, state: 'idle' });
      reg.update('stale-done', { state: 'done' });
      const removed = reg.cleanupStale();
      expect(removed).toBeGreaterThan(0);
      expect(reg.get('stale-done')).toBeNull();
      reg.close();
      cleanup();
    });

    it('deletes anything older than 1 hour regardless of state', () => {
      cleanup();
      const reg = new SessionRegistry(TEST_DB);
      // Insert a "running" row, then back-date it to 2h ago via a raw write.
      reg.create({ id: 'old-running', port: 3459, state: 'running' });
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      reg._db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(twoHoursAgo, 'old-running');
      const removed = reg.cleanupStale();
      expect(removed).toBeGreaterThan(0);
      expect(reg.get('old-running')).toBeNull();
      reg.close();
      cleanup();
    });

    it('preserves recent running rows', () => {
      cleanup();
      const reg = new SessionRegistry(TEST_DB);
      reg.create({ id: 'fresh-runner', port: 3460, state: 'running' });
      reg.cleanupStale();
      const survivor = reg.get('fresh-runner');
      expect(survivor).toBeTruthy();
      expect(survivor.state).toEqual('running');
      reg.close();
      cleanup();
    });

    it('returns count of deleted rows and leaves untouched rows alone', () => {
      cleanup();
      const reg = new SessionRegistry(TEST_DB);
      reg.create({ id: 'kill-1', port: 3461, state: 'idle' });
      reg.create({ id: 'kill-2', port: 3462, state: 'idle' });
      reg.create({ id: 'kill-3', port: 3463, state: 'idle' });
      reg.update('kill-3', { state: 'done' });
      reg.create({ id: 'keep-1', port: 3464, state: 'running' });
      const removed = reg.cleanupStale();
      expect(removed).toEqual(3);
      expect(reg.get('keep-1')).toBeTruthy();
      reg.close();
      cleanup();
    });
  });
});
