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

// Phase 6.10: knowledge loaders and agent functions now live in
// src/agents.js — not src/index.js. Tests that assert "does the bundle
// contain this loader / this cache / this inlined constant" walk the
// combined emit so they stay agnostic to the split.
function combinedBundleText(bundle) {
	const parts = [];
	for (const k of Object.keys(bundle || {})) {
		if (k === 'src/index.js' || k === 'src/agents.js' || k.startsWith('src/workflows/')) {
			parts.push(String(bundle[k] || ''));
		}
	}
	return parts.join('\n');
}

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
		const src = combinedBundleText(result.workerBundle);
		// Module-scope let with null initializer — lazy cache slot.
		expect(src).toMatch(/let\s+_products_cache\s*=\s*null/i);
	});

	it('emits an async loader that reads env.DB on first call, caches result', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		const src = combinedBundleText(result.workerBundle);
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
		const src = combinedBundleText(result.workerBundle);
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
		const src = combinedBundleText(result.workerBundle);
		// Inside the agent, the loader is awaited so _ragContext gets populated
		// from the cached rows.
		expect(src).toMatch(/await\s+_load_products\s*\(\s*env\s*\)/i);
	});

	it('no "require(" anywhere in Workers bundle (drift-guard)', () => {
		const result = compileProgram(PRODUCTS_AGENT, { target: 'cloudflare' });
		const src = combinedBundleText(result.workerBundle);
		expect(src).not.toMatch(/\brequire\s*\(/);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.2 — `knows about: 'https://example.com/docs'` lazy-fetches
//
// Workers has native fetch(), but no module-top-level await and no startup
// phase. So URL knowledge uses the same lazy pattern as tables: a module
// cache + a loader that fetches on first agent call and caches forever.
//
// The URL IS part of the compiled bundle (so the compiled Worker knows where
// to fetch from) — but the BODY is not. It loads at runtime against the
// live endpoint. That's deliberate: URL knowledge is for live docs that
// change. Static knowledge (markdown, PDF) gets inlined at compile time.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 4 cycle 4.2 — knows about URL lazy-fetches for Workers', () => {
	const URL_AGENT = `build for javascript backend

agent 'DocsBot' receiving question:
  knows about: 'https://docs.example.com/support'
  answer = ask claude 'Answer with docs context' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	it('emits a module-scope nullable cache for the URL knowledge source', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		const src = combinedBundleText(result.workerBundle);
		// Module-scope let with null initializer, hashed key keyed off the URL so
		// two agents referencing the same URL share the cache.
		expect(src).toMatch(/let\s+_knowledge_url_\w+\s*=\s*null/i);
	});

	it('emits an async loader that calls fetch(URL) on first call', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = combinedBundleText(result.workerBundle);
		// Loader function name is _load_url_<hash>(env) — env is threaded for
		// consistency with table loaders even though fetch doesn't need it.
		expect(src).toMatch(/async\s+function\s+_load_url_\w+\s*\(\s*env\s*\)/i);
		// fetch is called against the literal URL from the source.
		expect(src).toMatch(/fetch\(['"]https:\/\/docs\.example\.com\/support['"]\)/);
		// Tags + scripts stripped so the Worker gets clean text for RAG scoring.
		expect(src).toContain('.replace(');
	});

	it('loader returns cache if already populated (idempotent)', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = combinedBundleText(result.workerBundle);
		expect(src).toMatch(/if\s*\(\s*_knowledge_url_\w+\s*\)\s*return\s+_knowledge_url_\w+/i);
	});

	it('agent body awaits the URL loader (lazy, not eager)', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = combinedBundleText(result.workerBundle);
		expect(src).toMatch(/await\s+_load_url_\w+\s*\(\s*env\s*\)/i);
	});

	it('no eager top-level _fetchPageText(url).then(...) pattern', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = combinedBundleText(result.workerBundle);
		// The Node target emits `_fetchPageText(URL).then(t => { _knowledge_url_0 = t; })` —
		// that must NOT reach the Workers bundle.
		expect(src).not.toMatch(/_fetchPageText\s*\([^)]*\)\s*\.then/);
		// And no `require(` drift (URL knowledge shouldn't need Node APIs).
		expect(src).not.toMatch(/\brequire\s*\(/);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.3 — Text / Markdown knowledge inlined at compile time
//
// For .md and .txt, the content is static — known at Studio compile time.
// The compiler reads the file from disk (Studio runs on Node, so fs works),
// escapes it, and inlines it as a module-scope string constant. No runtime
// fs.readFileSync (Workers has no fs), no runtime fetch (content is static).
//
// The emitter needs a baseDir to resolve relative paths — threaded via
// compileProgram opts.knowledgeBase.
// ─────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve(__dirname, '..', 'test-fixtures', 'knows-about');

describe('Phase 4 cycle 4.3 — knows about .md/.txt inlines at compile', () => {
	const MD_AGENT = `build for javascript backend

agent 'RulesBot' receiving question:
  knows about: 'rules.md'
  answer = ask claude 'Use the rules to answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	const TXT_AGENT = `build for javascript backend

agent 'NotesBot' receiving question:
  knows about: 'notes.txt'
  answer = ask claude 'Help using notes' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	it('inlines markdown content as a module-scope string constant', () => {
		const result = compileProgram(MD_AGENT, {
			target: 'cloudflare',
			knowledgeBase: FIXTURES_DIR,
		});
		expect(result.errors).toHaveLength(0);
		const src = combinedBundleText(result.workerBundle);
		// Module-scope const holding the escaped content. Name is derived from
		// the file path — we use a hash suffix for determinism + uniqueness.
		expect(src).toMatch(/const\s+_knowledge_file_\w+\s*=\s*"/);
		// Actual content from the fixture ends up inside the string literal.
		// "Refunds available within 30 days" is in rules.md; should appear
		// (escaped) inside the inlined constant.
		expect(src).toContain('Refunds available within 30 days');
	});

	it('inlines .txt content too', () => {
		const result = compileProgram(TXT_AGENT, {
			target: 'cloudflare',
			knowledgeBase: FIXTURES_DIR,
		});
		expect(result.errors).toHaveLength(0);
		const src = combinedBundleText(result.workerBundle);
		expect(src).toContain('Company founded in 2020');
	});

	it('no runtime fs / require / _loadFileText for text knowledge (drift-guard)', () => {
		const result = compileProgram(MD_AGENT, {
			target: 'cloudflare',
			knowledgeBase: FIXTURES_DIR,
		});
		const src = combinedBundleText(result.workerBundle);
		// Compile-time inline means NO runtime file reads. Workers bundle has
		// no fs, so any of these would be a regression.
		expect(src).not.toMatch(/\brequire\s*\(/);
		expect(src).not.toMatch(/\bfs\./);
		expect(src).not.toMatch(/_loadFileText\s*\(/);
		expect(src).not.toMatch(/readFileSync/);
	});

	it('agent body reads the inlined string constant, not a file', () => {
		const result = compileProgram(MD_AGENT, {
			target: 'cloudflare',
			knowledgeBase: FIXTURES_DIR,
		});
		const src = combinedBundleText(result.workerBundle);
		// Agent RAG preamble references the module-scope constant directly.
		expect(src).toMatch(/_knowledge_file_\w+/);
	});

	it('compile error when file is not found at knowledgeBase', () => {
		const BAD_AGENT = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'does-not-exist.md'
  answer = ask claude 'X' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(BAD_AGENT, {
			target: 'cloudflare',
			knowledgeBase: FIXTURES_DIR,
		});
		expect(result.errors.length).toBeGreaterThan(0);
		// The error must name the missing file so Marcus can fix the filename.
		const combined = result.errors.map(e => e.message).join(' ');
		expect(combined).toContain('does-not-exist.md');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.4 — PDF / DOCX extracted at compile time
//
// pdf-parse + mammoth only run in Studio (Node). The extracted TEXT is what
// gets inlined. The emitted Worker bundle has zero references to pdf-parse,
// mammoth, or require. Extraction happens via a preload pass so the sync
// compile path stays synchronous.
// ─────────────────────────────────────────────────────────────────────────

// pdf-parse / mammoth are OPTIONAL Studio deps. If they're not installed
// (which is the state of this repo today — see EXEC CORRECTION in the plan),
// cycle 4.4 tests use a synthetic preloaded cache to prove the compiler
// wiring without needing the extractors at test time. The drift-guard
// assertions still fire against every produced bundle.

await testAsync('Phase 4 cycle 4.4 — PDF text inlines from preloaded cache', async () => {
	const { compileProgram } = await import('../index.js');

	const SRC = `build for javascript backend

agent 'FaqBot' receiving question:
  knows about: 'faq.pdf'
  answer = ask claude 'Answer from FAQ' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	// Hand-populated knowledgeCache — what preloadKnowledgeCache would return
	// if pdf-parse were available. The compile path doesn't care where the
	// extracted text came from; it just needs a string to inline.
	const cache = new Map();
	cache.set('faq.pdf', 'Return policy: 30 days. Shipping: 3-5 business days. Warranty: 1 year.');

	const result = compileProgram(SRC, {
		target: 'cloudflare',
		knowledgeBase: FIXTURES_DIR,
		knowledgeCache: cache,
	});
	if (result.errors.length > 0) {
		throw new Error(`compile errors: ${result.errors.map(e => e.message).join(' | ')}`);
	}
	const src = combinedBundleText(result.workerBundle);

	// Inlined constant references the file.
	if (!/const\s+_knowledge_file_\w+\s*=\s*"/.test(src)) {
		throw new Error('Expected an inlined const for the PDF knowledge.');
	}
	// The PDF text made it into the bundle as a string literal.
	if (!src.includes('Return policy: 30 days')) {
		throw new Error("Expected PDF extracted text to be inlined; got no 'Return policy' substring.");
	}

	// Drift-guard: ZERO Node-isms the deployed Worker cannot parse.
	const forbidden = ['pdf-parse', 'mammoth', 'require('];
	for (const needle of forbidden) {
		if (src.includes(needle)) {
			throw new Error(`Workers bundle contains forbidden Node-ism: '${needle}'`);
		}
	}
	// No fs. prefix (like fs.readFileSync)
	if (/\bfs\./.test(src)) {
		throw new Error(`Workers bundle contains 'fs.' reference`);
	}

	console.log('✅ cf-4.4: PDF text inlined, zero Node-isms in Workers bundle');
});

await testAsync('Phase 4 cycle 4.4 — preloadKnowledgeCache is exported + callable', async () => {
	const { preloadKnowledgeCache } = await import('./packaging-cloudflare.js');
	const { compileProgram } = await import('../index.js');

	const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'rules.md', 'notes.txt'
  answer = ask claude 'Answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	const ast = compileProgram(SRC).ast;
	const cache = await preloadKnowledgeCache(ast.body, FIXTURES_DIR);

	// Two text files; both present in cache.
	if (!cache.has('rules.md')) throw new Error('rules.md missing from cache');
	if (!cache.has('notes.txt')) throw new Error('notes.txt missing from cache');
	// Content was actually read.
	if (!cache.get('rules.md').includes('Refund')) throw new Error('rules.md content wrong');
	if (!cache.get('notes.txt').includes('San Francisco')) throw new Error('notes.txt content wrong');

	console.log('✅ cf-4.4: preloadKnowledgeCache reads text fixtures');
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.5 — Unsupported formats produce a useful compile error
//
// Marcus writes `knows about: 'audio.mp3'` expecting magic. We tell him
// exactly what's wrong + what he can do instead. No silent empty-string
// bundle; no "undefined" at runtime — a named, actionable error at
// compile time.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 4 cycle 4.5 — unsupported format compile error', () => {
	it('errors on .mp3 with the supported format list', () => {
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'song.mp3'
  answer = ask claude 'Answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, { target: 'cloudflare', knowledgeBase: FIXTURES_DIR });
		expect(result.errors.length).toBeGreaterThan(0);
		const msg = result.errors.map(e => e.message).join(' ');
		// Error names the format + lists supported extensions.
		expect(msg).toContain('.mp3');
		expect(msg).toContain('.txt');
		expect(msg).toContain('.md');
		expect(msg).toContain('.pdf');
		expect(msg).toContain('.docx');
	});

	it('errors on .jpg (image) with actionable message', () => {
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'photo.jpg'
  answer = ask claude 'Answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, { target: 'cloudflare', knowledgeBase: FIXTURES_DIR });
		expect(result.errors.length).toBeGreaterThan(0);
		const msg = result.errors.map(e => e.message).join(' ');
		expect(msg).toContain('.jpg');
		// Tells Marcus what to do, not just what went wrong.
		expect(msg.toLowerCase()).toMatch(/convert to text|not supported|text first/);
	});

	it('errors on a truly unknown extension (e.g. .xyz)', () => {
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'file.xyz'
  answer = ask claude 'Answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, { target: 'cloudflare', knowledgeBase: FIXTURES_DIR });
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('supported formats ARE accepted (no false positive)', () => {
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'rules.md', 'notes.txt'
  answer = ask claude 'Answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, { target: 'cloudflare', knowledgeBase: FIXTURES_DIR });
		expect(result.errors).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.6 — Warn at > 512KB, hard-fail at > 1MB
//
// Workers-for-Platforms has a 10MB bundle cap (uncompressed). Knowledge
// files eat into that cap. We warn when a single file >512KB, and refuse
// to compile when a single file >1MB. Marcus gets a useful error + pointer
// at D1 / R2 as alternatives.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 4 cycle 4.6 — warn/fail on oversized knowledge', () => {
	const LARGE_DIR = resolve(__dirname, '..', 'test-fixtures', 'knows-about-large');

	const setupFixture = (name, sizeBytes) => {
		if (!existsSync(LARGE_DIR)) mkdirSync(LARGE_DIR, { recursive: true });
		const filePath = join(LARGE_DIR, name);
		// Fill with a repeating pattern so the file is VALID text at the
		// requested size.
		const chunk = 'The quick brown fox jumps over the lazy dog. ';
		const reps = Math.ceil(sizeBytes / chunk.length);
		const content = chunk.repeat(reps).slice(0, sizeBytes);
		writeFileSync(filePath, content, 'utf8');
		return filePath;
	};

	it('warns when a single knowledge file is > 512KB but <= 1MB', () => {
		// ~600KB
		setupFixture('medium.md', 600 * 1024);
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'medium.md'
  answer = ask claude 'Help' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, {
			target: 'cloudflare',
			knowledgeBase: LARGE_DIR,
		});
		// No compile error — soft warn only.
		expect(result.errors).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThan(0);
		const warnMsgs = result.warnings.map(w => w.message).join(' ');
		expect(warnMsgs).toContain('medium.md');
		expect(warnMsgs.toLowerCase()).toMatch(/kb|bundle|d1|r2/);
	});

	it('hard-fails when a single knowledge file > 1MB', () => {
		// ~1.2MB
		setupFixture('huge.md', 1.2 * 1024 * 1024);
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'huge.md'
  answer = ask claude 'Help' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, {
			target: 'cloudflare',
			knowledgeBase: LARGE_DIR,
		});
		expect(result.errors.length).toBeGreaterThan(0);
		const msg = result.errors.map(e => e.message).join(' ');
		expect(msg).toContain('huge.md');
		// Error mentions the 1MB cap and suggests alternatives.
		expect(msg.toLowerCase()).toMatch(/1mb|1 mb|1,048,576|1048576/);
		expect(msg.toLowerCase()).toMatch(/d1|r2|bundle/);
	});

	it('small knowledge files do NOT warn or error', () => {
		// ~5KB — well under 512KB
		setupFixture('small.md', 5 * 1024);
		const SRC = `build for javascript backend

agent 'Bot' receiving question:
  knows about: 'small.md'
  answer = ask claude 'Help' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
		const result = compileProgram(SRC, {
			target: 'cloudflare',
			knowledgeBase: LARGE_DIR,
		});
		expect(result.errors).toHaveLength(0);
		// No size warnings — other warnings (unused var, etc.) are fine.
		const sizeWarns = result.warnings.filter(w =>
			/bundle|knowledge.*kb|inlined.*kb/i.test(w.message || '')
		);
		expect(sizeWarns).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.7 — Table-knowing agent runs end-to-end under d1Mock
//
// Compile a small knowledge-enabled agent to a Workers bundle, apply the
// emitted migrations to d1Mock, seed a Products row, then drive a request
// that hits the agent. Verify the loader queries env.DB exactly once (the
// cache gets populated), the agent function runs without throwing, and
// the RAG context actually includes the seeded product row.
// ─────────────────────────────────────────────────────────────────────────

import { pathToFileURL } from 'url';

await testAsync('Phase 4 cycle 4.7 — helpdesk-style agent runs E2E with table knowledge', async () => {
	const { compileProgram } = await import('../index.js');
	const { d1Mock } = await import('../runtime/db-d1.mjs');

	const SRC = `build for javascript backend

create a Products table:
  name, required
  description
  price, number

agent 'ProductBot' receiving question:
  knows about: Products
  answer = ask claude 'Use products to help' with question
  send back answer

when user sends seed to /api/seed:
  p = save seed as new Product
  send back p

when user requests data from /api/products:
  all_products = look up all records in Products
  send back all_products
`;

	const result = compileProgram(SRC, { target: 'cloudflare' });
	if (result.errors.length > 0) {
		throw new Error('compile errors: ' + result.errors.map(e => e.message).join(' | '));
	}

	const migrations = result.workerBundle['migrations/001-init.sql'];
	if (!migrations) throw new Error('missing migrations');

	// Stand up a disposable Worker module loaded from disk so `import` resolves
	// the emitted file AS a real module and we can call default.fetch().
	// Phase 6.10: write EVERY file in the workerBundle, not just src/index.js
	// — the file imports `./agents.js` which needs to exist alongside. Drop
	// a type:module package.json at the root so Node treats every emitted
	// .js as ESM (ESM/CJS scope assertion, see learnings.md).
	const dir = mkdtempSync(join(tmpdir(), 'clear-cf-knows-'));
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
		for (const [rel, contents] of Object.entries(result.workerBundle || {})) {
			if (typeof contents !== 'string') continue;
			const abs = join(dir, rel);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, contents, 'utf8');
		}
		const entry = join(dir, 'src', 'index.js');
		const mod = await import(pathToFileURL(entry).href);

		// ANTHROPIC_API_KEY must be set so _askAI_workers takes the direct path.
		// (It won't actually reach the network — we stub fetch later.)
		const env = { DB: d1Mock(), ANTHROPIC_API_KEY: 'test-key' };
		env.DB.exec(migrations);

		// Seed one product so the lazy loader has a row to cache.
		const seedReq = new Request('http://localhost/api/seed', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Wireless Keyboard', description: 'Ergonomic bluetooth', price: 49.99 }),
		});
		const seedResp = await mod.default.fetch(seedReq, env, {});
		if (seedResp.status >= 400) {
			throw new Error('seed failed: ' + seedResp.status + ' ' + await seedResp.text());
		}

		// Read back — the query at GET /api/products should see the row via D1.
		const listReq = new Request('http://localhost/api/products', { method: 'GET' });
		const listResp = await mod.default.fetch(listReq, env, {});
		if (listResp.status !== 200) throw new Error('GET /api/products returned ' + listResp.status);
		const rows = await listResp.json();
		if (!Array.isArray(rows) || rows.length === 0) {
			throw new Error('expected seeded row in /api/products, got: ' + JSON.stringify(rows));
		}

		// Now invoke the agent function directly. It should:
		//   1. Call _load_products(env) → hit D1 ONCE
		//   2. Populate _ragContext from the cached rows
		//   3. Call _askAI_workers(env, prompt, ...) → would hit anthropic, so
		//      we stub globalThis.fetch to return a canned response
		let fetchCalls = 0;
		let dbPrepareCalls = 0;
		const origFetch = globalThis.fetch;
		const origPrepare = env.DB.prepare;
		env.DB.prepare = function (sql) {
			if (/SELECT \* FROM products/i.test(sql)) dbPrepareCalls++;
			return origPrepare.call(env.DB, sql);
		};
		globalThis.fetch = async (url, opts) => {
			if (String(url).includes('anthropic')) {
				fetchCalls++;
				return new Response(JSON.stringify({
					content: [{ type: 'text', text: 'The Wireless Keyboard is $49.99.' }],
				}), { headers: { 'Content-Type': 'application/json' } });
			}
			return origFetch(url, opts);
		};
		try {
			// Phase 6.10: agent functions now live in src/agents.js with an
			// explicit `export` keyword. Import the shared module directly —
			// no need to re-wrap index.js with a manual export stub.
			const agentsEntry = join(dir, 'src', 'agents.js');
			const exposed = await import(pathToFileURL(agentsEntry).href);
			const answer = await exposed.agent_productbot(env, 'How much is the wireless keyboard?');
			if (typeof answer !== 'string' || !answer.includes('Wireless')) {
				throw new Error('agent answer unexpected: ' + JSON.stringify(answer));
			}
			// The loader must have hit the DB at least once for this agent call.
			if (dbPrepareCalls < 1) {
				throw new Error('_load_products did not query the DB');
			}
			// Second call should NOT add a new DB query — cache hit.
			const prevDbCalls = dbPrepareCalls;
			const again = await exposed.agent_productbot(env, 'Tell me more');
			if (typeof again !== 'string') throw new Error('second call failed');
			if (dbPrepareCalls > prevDbCalls) {
				throw new Error(`cache miss on second call: DB prepare went from ${prevDbCalls} to ${dbPrepareCalls}`);
			}
		} finally {
			globalThis.fetch = origFetch;
			env.DB.prepare = origPrepare;
		}

		console.log('✅ cf-4.7: agent_productbot ran end-to-end, loader cached');
	} finally {
		try { rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
	}
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 4.8 — PDF knowledge extraction works end-to-end
//
// Drive the complete PDF knowledge path:
//   1. Compiler emits an inlined text constant for the PDF source
//   2. Agent's RAG preamble searches that constant (not a runtime file)
//   3. The Worker bundle has zero references to pdf-parse / require / fs
//   4. A fixture PDF lives at test-fixtures/knows-about/faq.pdf (591 bytes)
//
// Because pdf-parse is not installed in this repo (see the EXEC CORRECTION
// on plan row 4.4), we run the E2E against a hand-populated knowledgeCache.
// The compile + agent runtime path is identical to what a real pdf-parse
// extraction would produce — only the "how the text got there" differs.
// ─────────────────────────────────────────────────────────────────────────

await testAsync('Phase 4 cycle 4.8 — PDF knowledge agent runs end-to-end', async () => {
	const { compileProgram } = await import('../index.js');

	// Make sure the fixture actually exists — catches a missing commit.
	const pdfPath = join(FIXTURES_DIR, 'faq.pdf');
	if (!existsSync(pdfPath)) {
		throw new Error(`PDF fixture missing at ${pdfPath}. Cycle 4.8 setup required.`);
	}

	const SRC = `build for javascript backend

agent 'FaqBot' receiving question:
  knows about: 'faq.pdf'
  answer = ask claude 'Answer from FAQ' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;

	// Simulated preload result — the text pdf-parse WOULD extract.
	const cache = new Map();
	cache.set('faq.pdf', 'Phase 4 FAQ: refunds in 30 days. Shipping takes 3-5 business days.');

	const result = compileProgram(SRC, {
		target: 'cloudflare',
		knowledgeBase: FIXTURES_DIR,
		knowledgeCache: cache,
	});
	if (result.errors.length > 0) throw new Error('compile errors: ' + result.errors.map(e => e.message).join(' | '));

	const src = combinedBundleText(result.workerBundle);

	// 1. Extracted PDF text made it into the bundle as a module-scope const.
	if (!src.includes('Phase 4 FAQ: refunds in 30 days')) {
		throw new Error('PDF extracted text missing from bundle');
	}

	// 2. Drift-guard — no Node-isms for PDF extraction in the deployed bundle.
	const forbidden = ['pdf-parse', 'mammoth', 'require('];
	for (const needle of forbidden) {
		if (src.includes(needle)) throw new Error(`Forbidden Node-ism in bundle: '${needle}'`);
	}
	if (/\bfs\./.test(src)) throw new Error("'fs.' in bundle");

	// 3. Run the agent with stubbed fetch — it should score the FAQ chunk
	// against the query ("refund") and include that snippet in the prompt.
	// Phase 6.10: write the whole bundle and import agents.js directly —
	// the agent function is now an explicit export from the shared module.
	// Drop a type:module package.json so Node imports every .js as ESM.
	const dir = mkdtempSync(join(tmpdir(), 'clear-cf-pdf-'));
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
		for (const [rel, contents] of Object.entries(result.workerBundle || {})) {
			if (typeof contents !== 'string') continue;
			const abs = join(dir, rel);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, contents, 'utf8');
		}
		const entry = join(dir, 'src', 'agents.js');
		const mod = await import(pathToFileURL(entry).href);

		let lastPromptSeen = '';
		const origFetch = globalThis.fetch;
		globalThis.fetch = async (url, opts) => {
			try {
				const body = JSON.parse(opts?.body || '{}');
				lastPromptSeen = body.messages?.[0]?.content || '';
			} catch (_e) { /* ignore */ }
			return new Response(JSON.stringify({
				content: [{ type: 'text', text: 'Refunds in 30 days per FAQ.' }],
			}), { headers: { 'Content-Type': 'application/json' } });
		};
		try {
			const env = { ANTHROPIC_API_KEY: 'test-key' };
			const answer = await mod.agent_faqbot(env, 'What is the refund policy?');
			if (typeof answer !== 'string' || !answer.toLowerCase().includes('refund')) {
				throw new Error('agent answer wrong: ' + JSON.stringify(answer));
			}
			// The prompt sent to Anthropic includes the RAG chunk from the PDF.
			if (!lastPromptSeen.toLowerCase().includes('refund')) {
				throw new Error('RAG chunk never injected into prompt: ' + JSON.stringify(lastPromptSeen));
			}
		} finally {
			globalThis.fetch = origFetch;
		}

		console.log('✅ cf-4.8: PDF knowledge agent answered + RAG snippet in prompt');
	} finally {
		try { rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
	}
});

await testAsync('Phase 4 cycle 4.8 — preloadKnowledgeCache handles PDF gracefully without pdf-parse', async () => {
	const { preloadKnowledgeCache } = await import('./packaging-cloudflare.js');
	const { compileProgram } = await import('../index.js');

	const SRC = `build for javascript backend

agent 'FaqBot' receiving question:
  knows about: 'faq.pdf'
  answer = ask claude 'Answer' with question
  send back answer

when user requests data from /api/ask:
  send back 'ok'
`;
	const ast = compileProgram(SRC).ast;
	// When pdf-parse isn't installed (current state), preload MUST return a
	// Map entry with an { error } payload — NOT throw, NOT silently return ''.
	// Downstream tests / code can detect this and either ask the user to
	// install pdf-parse, or surface a clean compile error.
	const cache = await preloadKnowledgeCache(ast.body, FIXTURES_DIR);
	if (!cache.has('faq.pdf')) {
		throw new Error('preload did not record an entry for faq.pdf');
	}
	const entry = cache.get('faq.pdf');
	if (typeof entry === 'string') {
		// Happy path — pdf-parse IS installed. Text extracted.
		if (!entry.toLowerCase().includes('refund')) {
			throw new Error('PDF extracted text missing "refund" chunk: ' + entry.slice(0, 100));
		}
		console.log('✅ cf-4.8: pdf-parse present — text extracted');
	} else if (entry && entry.error) {
		// Degraded path — pdf-parse missing. Error is surfaced, not swallowed.
		if (!entry.error.includes('pdf-parse') && !entry.error.toLowerCase().includes('cannot find')) {
			// The error message should mention the missing dep so Marcus knows
			// what to install. (Node's ERR_MODULE_NOT_FOUND message includes
			// the package name.)
			throw new Error('preload error should name pdf-parse: ' + entry.error);
		}
		console.log('✅ cf-4.8: pdf-parse missing — error surfaced cleanly');
	} else {
		throw new Error('preload cache entry is neither string nor {error}: ' + JSON.stringify(entry));
	}
});
