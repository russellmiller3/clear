// Phase B runtime: db.findAll / db.findOne strip hidden columns from
// responses by default. Pass { includeHidden: true } to get the raw
// row. Tests that hide actually affects what APIs return, while the
// column still exists physically in the table.

import { describe, it, expect } from './testUtils.js';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

function mkTempDb() {
	const dir = mkdtempSync(join(tmpdir(), 'clear-hidden-'));
	// runtime/db.js reads CLEAR_DB_PATH on load — set before require.
	const dbPath = join(dir, 'test.db');
	process.env.CLEAR_DB_PATH = dbPath;
	// Bust the module cache so we get a fresh db module bound to this path.
	delete require.cache[require.resolve('../runtime/db.js')];
	const db = require('../runtime/db.js');
	return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// Each test gets a unique table name so stale rows from earlier tests
// don't leak in (runtime/db.js pins DATA_FILE to cwd + 'clear-data.db'
// at load time, so we share one sqlite file across the whole run).
let _tableCounter = 0;
function uniq() {
	return 'T' + Date.now() + '_' + ++_tableCounter;
}

describe('runtime db — hidden field filtering on read', () => {
	it('findAll strips hidden fields by default', () => {
		const { db, cleanup } = mkTempDb();
		const T = uniq();
		try {
			db.createTable(T, {
				name: { type: 'text' },
				email: { type: 'text' },
				notes: { type: 'text', hidden: true },
			});
			db.insert(T, { name: 'Alice', email: 'a@x.com', notes: 'secret stuff' });
			const rows = db.findAll(T);
			expect(rows.length).toBe(1);
			expect(rows[0].name).toBe('Alice');
			expect(rows[0].email).toBe('a@x.com');
			expect(rows[0].notes).toBe(undefined);
		} finally {
			cleanup();
		}
	});

	it('findAll with includeHidden:true returns hidden fields', () => {
		const { db, cleanup } = mkTempDb();
		const T = uniq();
		try {
			db.createTable(T, {
				name: { type: 'text' },
				notes: { type: 'text', hidden: true },
			});
			db.insert(T, { name: 'Bob', notes: 'internal memo' });
			const rows = db.findAll(T, null, { includeHidden: true });
			expect(rows.length).toBe(1);
			expect(rows[0].notes).toBe('internal memo');
		} finally {
			cleanup();
		}
	});

	it('findOne also strips hidden fields by default', () => {
		const { db, cleanup } = mkTempDb();
		const T = uniq();
		try {
			db.createTable(T, {
				name: { type: 'text' },
				notes: { type: 'text', hidden: true },
			});
			db.insert(T, { name: 'Carol', notes: 'hush-hush' });
			const row = db.findOne(T, { name: 'Carol' });
			expect(row.name).toBe('Carol');
			expect(row.notes).toBe(undefined);
		} finally {
			cleanup();
		}
	});

	it('hidden column stays physically in the SQLite table', () => {
		const { db, cleanup } = mkTempDb();
		const T = uniq();
		try {
			db.createTable(T, {
				name: { type: 'text' },
				notes: { type: 'text', hidden: true },
			});
			db.insert(T, { name: 'Dave', notes: 'preserved' });
			const raw = db.findOne(T, { name: 'Dave' }, { includeHidden: true });
			expect(raw.notes).toBe('preserved');
		} finally {
			cleanup();
		}
	});

	it('tables with no hidden fields pass rows through unchanged', () => {
		const { db, cleanup } = mkTempDb();
		const T = uniq();
		try {
			db.createTable(T, {
				title: { type: 'text' },
				body: { type: 'text' },
			});
			db.insert(T, { title: 'Hi', body: 'hello world' });
			const rows = db.findAll(T);
			expect(rows[0].title).toBe('Hi');
			expect(rows[0].body).toBe('hello world');
		} finally {
			cleanup();
		}
	});
});
