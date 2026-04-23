// lib/packaging-cloudflare-knows.test.js
// Phase 4 TDD suite — `knows about:` lazy-load for Workers target.
//
// Three kinds of knowledge in the Clear language today:
//   1. Table name        → query DB on first agent call, cache
//   2. 'https://...' URL → fetch on first agent call, cache
//   3. 'file.pdf' / .txt → compile-time extraction, inlined as string constant
//
// The Node target loads URL and file knowledge at module startup (via top-level
// Promise chains that resolve into shared let-bindings). Workers has NO such
// startup phase — no top-level await, no fs — so we MUST switch to a lazy
// getter model. PDF + DOCX extraction must happen STUDIO-SIDE at compile time
// and the extracted text gets inlined as a module-scope string constant; the
// deployed Worker never sees pdf-parse or mammoth.
//
// Drift-guard: every emitted Workers bundle must pass `grep -c 'pdf-parse\|mammoth\|require\(' = 0`.

import { describe, it, expect, testAsync } from './testUtils.js';
import { compileProgram } from '../index.js';
import { packageBundle } from './packaging.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.1 — `knows about: Products table` lazy-loads inside a Worker
//
// The Node backend emits a synchronous `db.findAll('Products', {})` inside the
// agent body. For Workers we need a module-scope nullable cache + an async
// loader that fetches from env.DB on first call and returns the cached value
// thereafter. No module-top-level await. Takes `env` as the first param.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 4 cycle 4.1 — knows about Table lazy-loads for Workers', () => {
	const PRODUCTS_AGENT = `build for javascript backend

create a Products table:
  name, required
  price, number

agent 'ProductBot' receiving question:
  knows about: Products
  answer = ask claude 'Answer using products' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	it('emits a module-scope nullable cache for the Products table', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		const src = result.workerBundle['src/index.js'];
		// Module-scope let with null initializer — lazy cache slot.
		expect(src).toMatch(/let\s+_products_cache\s*=\s*null/i);
	});

	it('emits an async loader that reads env.DB on first call, caches result', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Loader takes env as first arg, returns cache if populated.
		expect(src).toMatch(/async\s+function\s+_load_products\s*\(\s*env\s*\)/i);
		// First-call path prepares a D1 SELECT against the pluralized table name.
		// D1 uses SQLite with pluralized-lowercase table names (see emitD1Migrations).
		expect(src).toMatch(/env\.DB\.prepare\(['"]SELECT\s+\*\s+FROM\s+products['"]\)\.all\(\)/i);
		// Second call returns cached — look for the early-return shape.
		expect(src).toMatch(/if\s*\(\s*_products_cache\s*\)\s*return\s+_products_cache/i);
	});

	it('does NOT use module-top-level await anywhere in Workers emit', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// The loader function itself can await — that's fine, it's inside async fn.
		// What's forbidden: a bare `await _load_products(...)` at module scope,
		// or a `.then(...)` at module scope bound to a top-level let.
		// The Node path emits `_loadFileText(...).then(t => { _knowledge_file_0 = t; })` —
		// this exact shape MUST NOT appear in the Workers bundle.
		expect(src).not.toMatch(/\n_load_products\s*\(/);
		expect(src).not.toMatch(/\.then\s*\(\s*t\s*=>\s*\{\s*_knowledge/);
	});

	it('agent body calls the loader before searching (lazy, not eager)', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Inside the agent, the loader is awaited so _ragContext gets populated
		// from the cached rows.
		expect(src).toMatch(/await\s+_load_products\s*\(\s*env\s*\)/i);
	});

	it('no "require(" anywhere in Workers bundle (drift-guard)', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).not.toMatch(/\brequire\s*\(/);
	});
});
