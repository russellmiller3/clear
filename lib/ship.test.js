import { describe, it, expect } from './testUtils.js';
import { applyShip } from './ship.js';

function captureIO() {
	const writes = [];
	const spawns = [];
	const compiles = [];
	const handle = {
		writes,
		spawns,
		compiles,
		writeFile: async (path, content) => {
			writes.push({ path, content });
		},
		readFile: async (path) => {
			const last = [...writes].reverse().find((w) => w.path === path);
			return last ? last.content : handle._initialContent || '';
		},
		compile: async (source) => {
			compiles.push(source);
			if (handle._compileThrows) throw new Error(handle._compileThrows);
			return { errors: handle._compileErrors || [], ok: !(handle._compileErrors || []).length };
		},
		spawn: async (artifacts) => {
			spawns.push(artifacts);
			if (handle._spawnFails) {
				throw new Error(handle._spawnFails);
			}
			return { ready: true };
		},
	};
	return handle;
}

describe('ship — applyShip success path', () => {
	it('writes new source, compiles, and spawns on success', async () => {
		const io = captureIO();
		io._initialContent = 'old';
		const r = await applyShip('main.clear', 'new content', io);
		expect(r.ok).toBe(true);
		expect(io.writes.length).toBe(1);
		expect(io.writes[0].content).toBe('new content');
		expect(io.compiles.length).toBe(1);
		expect(io.spawns.length).toBe(1);
	});

	it('returns elapsed_ms on success', async () => {
		const io = captureIO();
		const r = await applyShip('main.clear', 'new', io);
		expect(typeof r.elapsed_ms).toBe('number');
		expect(r.elapsed_ms >= 0).toBe(true);
	});
});

describe('ship — applyShip failure handling', () => {
	it('rolls back the file if compile fails', async () => {
		const io = captureIO();
		io._initialContent = 'original';
		io._compileErrors = [{ message: 'parse error at line 5' }];
		const r = await applyShip('main.clear', 'broken', io);
		expect(r.ok).toBe(false);
		expect(r.error.toLowerCase().includes('compile')).toBe(true);
		// Two writes: first the new content, then the rollback to original
		expect(io.writes.length).toBe(2);
		expect(io.writes[1].content).toBe('original');
		// Never spawns on compile failure
		expect(io.spawns.length).toBe(0);
	});

	it('rolls back the file if spawn fails', async () => {
		const io = captureIO();
		io._initialContent = 'original';
		io._spawnFails = 'port already in use';
		const r = await applyShip('main.clear', 'new', io);
		expect(r.ok).toBe(false);
		expect(r.error.toLowerCase().includes('spawn')).toBe(true);
		// The new content was written, then rolled back
		expect(io.writes.length).toBe(2);
		expect(io.writes[1].content).toBe('original');
	});

	it('surfaces the underlying compile error message in result.error', async () => {
		const io = captureIO();
		io._compileErrors = [{ message: 'unexpected token at line 42' }];
		const r = await applyShip('main.clear', 'broken', io);
		expect(r.error.includes('unexpected token')).toBe(true);
	});
});

describe('ship — snapshot hook', () => {
	it('calls io.takeSnapshot before writing new source when provided', async () => {
		const io = captureIO();
		const snapshots = [];
		io.takeSnapshot = async ({ label }) => {
			snapshots.push({ label, writesBeforeSnapshot: io.writes.length });
		};
		await applyShip('main.clear', 'new', io);
		expect(snapshots.length).toBe(1);
		// Snapshot fires before any writes to the source file.
		expect(snapshots[0].writesBeforeSnapshot).toBe(0);
	});

	it('does not abort the ship if snapshot throws', async () => {
		const io = captureIO();
		io.takeSnapshot = async () => {
			throw new Error('disk full');
		};
		const logs = [];
		io.log = (msg) => logs.push(msg);
		const r = await applyShip('main.clear', 'new', io);
		expect(r.ok).toBe(true);
		expect(logs.some((m) => m.includes('snapshot failed'))).toBe(true);
	});
});

describe('ship — applyShip guards', () => {
	it('requires sourcePath', async () => {
		const io = captureIO();
		const r = await applyShip('', 'x', io);
		expect(r.ok).toBe(false);
	});

	it('requires a non-empty new source', async () => {
		const io = captureIO();
		const r = await applyShip('main.clear', '', io);
		expect(r.ok).toBe(false);
	});
});
