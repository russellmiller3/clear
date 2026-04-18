// Snapshot + rollback for Live App Editing (LAE-6).
//
// A snapshot freezes the app's source + SQLite data at a point in time so
// Marcus can say "Meph, undo that" and get source, schema, and data back
// in one step. Stored as a pair of files under the snapshots directory,
// plus a tiny index.json that records id/ts/label.
//
// Storage layout:
//   $SNAPSHOT_DIR/index.json              — [{id, ts, label}, ...] newest-last
//   $SNAPSHOT_DIR/<id>.clear              — source file contents
//   $SNAPSHOT_DIR/<id>.db                 — binary copy of the SQLite file
//
// Default $SNAPSHOT_DIR is ./.clear-snapshots so it's gitignore-friendly.
// Tests override via process.env.CLEAR_SNAPSHOT_DIR before each run.

import {
	mkdirSync,
	readFileSync,
	writeFileSync,
	existsSync,
	copyFileSync,
	readdirSync,
	statSync,
} from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

export const SNAPSHOT_DIR_ENV = 'CLEAR_SNAPSHOT_DIR';
const DEFAULT_DIR = '.clear-snapshots';

function dir() {
	return process.env[SNAPSHOT_DIR_ENV] || DEFAULT_DIR;
}

function ensureDir() {
	const d = dir();
	if (!existsSync(d)) mkdirSync(d, { recursive: true });
	return d;
}

function indexPath() {
	return join(ensureDir(), 'index.json');
}

function readIndex() {
	const p = indexPath();
	if (!existsSync(p)) return [];
	try {
		return JSON.parse(readFileSync(p, 'utf8'));
	} catch {
		return [];
	}
}

function writeIndex(entries) {
	writeFileSync(indexPath(), JSON.stringify(entries, null, 2));
}

let _idCounter = 0;
function newId() {
	// counter ensures strict monotonic ordering even for snapshots taken in
	// the same millisecond (hot paths in tests, or rapid-fire ships).
	return Date.now().toString(36) + '-' + (++_idCounter).toString(36) + '-' + randomBytes(3).toString('hex');
}

export function takeSnapshot({ sourcePath, dataPath, label }) {
	const id = newId();
	const ts = Date.now();
	const d = ensureDir();

	// Copy source (required)
	if (!sourcePath || !existsSync(sourcePath)) {
		throw new Error('sourcePath is required and must exist');
	}
	copyFileSync(sourcePath, join(d, id + '.clear'));

	// Copy data file if present
	if (dataPath && existsSync(dataPath)) {
		copyFileSync(dataPath, join(d, id + '.db'));
	}

	const entries = readIndex();
	entries.push({ id, ts, label: label || '' });
	writeIndex(entries);

	return { id, ts, label: label || '' };
}

export function listSnapshots() {
	return readIndex().slice().sort((a, b) => b.ts - a.ts || (b.id > a.id ? 1 : -1));
}

export function getSnapshot(id) {
	const d = dir();
	const src = join(d, id + '.clear');
	if (!existsSync(src)) return null;
	const entry = readIndex().find((e) => e.id === id);
	const dbPath = join(d, id + '.db');
	return {
		id,
		ts: entry ? entry.ts : null,
		label: entry ? entry.label : '',
		source: readFileSync(src, 'utf8'),
		dataBytes: existsSync(dbPath) ? readFileSync(dbPath) : null,
	};
}

function resolveSnapshotRef(ref) {
	if (typeof ref === 'string') return ref;
	if (ref && typeof ref === 'object' && typeof ref.relative === 'number') {
		const entries = readIndex().slice().sort((a, b) => b.ts - a.ts || (b.id > a.id ? 1 : -1));
		// relative: -1 is the most-recent snapshot, -2 the one before, etc.
		const idx = Math.abs(ref.relative) - 1;
		return entries[idx] ? entries[idx].id : null;
	}
	return null;
}

export function restoreSnapshot(ref, { sourcePath, dataPath }) {
	const id = resolveSnapshotRef(ref);
	if (!id) return { ok: false, error: 'unknown snapshot reference' };

	const snap = getSnapshot(id);
	if (!snap) return { ok: false, error: `snapshot ${id} not found` };

	if (sourcePath) {
		writeFileSync(sourcePath, snap.source);
	}
	if (dataPath && snap.dataBytes) {
		writeFileSync(dataPath, snap.dataBytes);
	}

	return { ok: true, restoredId: id, ts: snap.ts, label: snap.label };
}
