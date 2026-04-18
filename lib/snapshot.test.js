// Snapshot + rollback for Live App Editing (LAE-6).
//
// Every ship takes a snapshot (source + data file) BEFORE writing new source.
// Rollback restores the most recent (or named) snapshot's source and data.
// Undo is "Meph, undo the last change" → restores snapshot N-1.

import { describe, it, expect } from './testUtils.js';
import {
	takeSnapshot,
	listSnapshots,
	restoreSnapshot,
	getSnapshot,
	SNAPSHOT_DIR_ENV,
} from './snapshot.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function mkEnv() {
	const root = mkdtempSync(join(tmpdir(), 'clear-snap-'));
	const snapDir = join(root, 'snapshots');
	const sourcePath = join(root, 'main.clear');
	const dataPath = join(root, 'clear-data.db');
	writeFileSync(sourcePath, 'original source\n');
	writeFileSync(dataPath, 'fake-sqlite-binary-v1');
	process.env[SNAPSHOT_DIR_ENV] = snapDir;
	return {
		root,
		snapDir,
		sourcePath,
		dataPath,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

describe('snapshot — takeSnapshot', () => {
	it('creates a snapshot with an id, timestamp, and stored source + data', () => {
		const env = mkEnv();
		try {
			const snap = takeSnapshot({
				sourcePath: env.sourcePath,
				dataPath: env.dataPath,
				label: 'before adding region field',
			});
			expect(typeof snap.id).toBe('string');
			expect(snap.id.length > 0).toBe(true);
			expect(typeof snap.ts).toBe('number');
			expect(snap.label).toBe('before adding region field');

			const stored = getSnapshot(snap.id);
			expect(stored.source).toBe('original source\n');
			expect(stored.dataBytes.toString()).toBe('fake-sqlite-binary-v1');
		} finally {
			env.cleanup();
		}
	});

	it('returns progressively larger timestamps for later snapshots', () => {
		const env = mkEnv();
		try {
			const a = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath });
						writeFileSync(env.sourcePath, 'updated source\n');
			const b = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath });
			expect(b.ts >= a.ts).toBe(true);
			expect(b.id !== a.id).toBe(true);
		} finally {
			env.cleanup();
		}
	});

	it('handles a missing data file gracefully (source-only snapshot)', () => {
		const env = mkEnv();
		try {
			const snap = takeSnapshot({
				sourcePath: env.sourcePath,
				dataPath: join(env.root, 'does-not-exist.db'),
			});
			const stored = getSnapshot(snap.id);
			expect(stored.source).toBe('original source\n');
			expect(stored.dataBytes).toBe(null);
		} finally {
			env.cleanup();
		}
	});
});

describe('snapshot — listSnapshots', () => {
	it('returns snapshots newest-first', () => {
		const env = mkEnv();
		try {
			const a = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath, label: 'a' });
						const b = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath, label: 'b' });
			const list = listSnapshots();
			expect(list.length >= 2).toBe(true);
			// Newest first
			expect(list[0].id).toBe(b.id);
			expect(list[1].id).toBe(a.id);
		} finally {
			env.cleanup();
		}
	});

	it('each entry has id, ts, label fields', () => {
		const env = mkEnv();
		try {
			takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath, label: 'x' });
			const list = listSnapshots();
			expect(typeof list[0].id).toBe('string');
			expect(typeof list[0].ts).toBe('number');
			expect(list[0].label).toBe('x');
		} finally {
			env.cleanup();
		}
	});
});

describe('snapshot — restoreSnapshot', () => {
	it('restores the source file to the snapshot contents', () => {
		const env = mkEnv();
		try {
			const snap = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath });
			// Clobber source
			writeFileSync(env.sourcePath, 'corrupted');
			const result = restoreSnapshot(snap.id, {
				sourcePath: env.sourcePath,
				dataPath: env.dataPath,
			});
			expect(result.ok).toBe(true);
			expect(readFileSync(env.sourcePath, 'utf8')).toBe('original source\n');
		} finally {
			env.cleanup();
		}
	});

	it('restores the data file to the snapshot contents', () => {
		const env = mkEnv();
		try {
			const snap = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath });
			writeFileSync(env.dataPath, 'totally-different-bytes');
			const result = restoreSnapshot(snap.id, {
				sourcePath: env.sourcePath,
				dataPath: env.dataPath,
			});
			expect(result.ok).toBe(true);
			expect(readFileSync(env.dataPath, 'utf8')).toBe('fake-sqlite-binary-v1');
		} finally {
			env.cleanup();
		}
	});

	it('returns ok:false for an unknown snapshot id', () => {
		const env = mkEnv();
		try {
			const result = restoreSnapshot('does-not-exist', {
				sourcePath: env.sourcePath,
				dataPath: env.dataPath,
			});
			expect(result.ok).toBe(false);
		} finally {
			env.cleanup();
		}
	});

	it('supports "relative:-1" to restore the most recent snapshot', () => {
		const env = mkEnv();
		try {
			takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath });
						writeFileSync(env.sourcePath, 'second source\n');
			const latest = takeSnapshot({ sourcePath: env.sourcePath, dataPath: env.dataPath });
			writeFileSync(env.sourcePath, 'corrupted');
			const result = restoreSnapshot({ relative: -1 }, {
				sourcePath: env.sourcePath,
				dataPath: env.dataPath,
			});
			expect(result.ok).toBe(true);
			expect(result.restoredId).toBe(latest.id);
			expect(readFileSync(env.sourcePath, 'utf8')).toBe('second source\n');
		} finally {
			env.cleanup();
		}
	});
});
