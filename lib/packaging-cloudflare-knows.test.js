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
		const src = result.workerBundle['src/index.js'];
		// Module-scope let with null initializer, hashed key keyed off the URL so
		// two agents referencing the same URL share the cache.
		expect(src).toMatch(/let\s+_knowledge_url_\w+\s*=\s*null/i);
	});

	it('emits an async loader that calls fetch(URL) on first call', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
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
		const src = result.workerBundle['src/index.js'];
		expect(src).toMatch(/if\s*\(\s*_knowledge_url_\w+\s*\)\s*return\s+_knowledge_url_\w+/i);
	});

	it('agent body awaits the URL loader (lazy, not eager)', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).toMatch(/await\s+_load_url_\w+\s*\(\s*env\s*\)/i);
	});

	it('no eager top-level _fetchPageText(url).then(...) pattern', () => {
		const result = compileProgram(URL_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
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
		const src = result.workerBundle['src/index.js'];
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
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('Company founded in 2020');
	});

	it('no runtime fs / require / _loadFileText for text knowledge (drift-guard)', () => {
		const result = compileProgram(MD_AGENT, {
			target: 'cloudflare',
			knowledgeBase: FIXTURES_DIR,
		});
		const src = result.workerBundle['src/index.js'];
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
		const src = result.workerBundle['src/index.js'];
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
	const src = result.workerBundle['src/index.js'];

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
