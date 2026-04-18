// lib/packaging.test.js
// Tests for the shared packageBundle helper used by both cli/clear.js and
// the Studio deploy endpoint. Covers file output, Postgres vs SQLite paths,
// secret detection (JWT + Stripe/Twilio/SendGrid service calls), AI-call
// detection, and the --useAIProxy path that strips the Anthropic SDK dep.

import { describe, it, expect } from './testUtils.js';
import { packageBundle, detectNeededSecrets, detectAICalls } from './packaging.js';
import { compileProgram } from '../index.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

function tmpOut() {
	return mkdtempSync(join(tmpdir(), 'clear-pkg-'));
}

function compileOrThrow(src) {
	const r = compileProgram(src);
	if (r.errors.length) {
		throw new Error('Compile failed: ' + JSON.stringify(r.errors));
	}
	return { result: r, source: src };
}

describe('packageBundle — file output (test 1.1)', () => {
	const SRC = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;
	it('writes server.js + package.json + Dockerfile + .dockerignore + runtime/', () => {
		const { result, source } = compileOrThrow(SRC);
		const outDir = tmpOut();
		try {
			const res = packageBundle(result, outDir, { sourceText: source });
			expect(res.ok).toBe(true);
			expect(res.outDir).toBe(outDir);
			expect(existsSync(resolve(outDir, 'server.js'))).toBe(true);
			expect(existsSync(resolve(outDir, 'package.json'))).toBe(true);
			expect(existsSync(resolve(outDir, 'Dockerfile'))).toBe(true);
			expect(existsSync(resolve(outDir, '.dockerignore'))).toBe(true);
			expect(existsSync(resolve(outDir, 'clear-runtime', 'db.js'))).toBe(true);
			expect(existsSync(resolve(outDir, 'clear-runtime', 'auth.js'))).toBe(true);
			expect(existsSync(resolve(outDir, 'clear-runtime', 'rateLimit.js'))).toBe(true);
			expect(res.files).toContain('server.js');
			expect(res.files).toContain('package.json');
			expect(res.files).toContain('Dockerfile');
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('returns dbBackend in result shape', () => {
		const { result, source } = compileOrThrow(SRC);
		const outDir = tmpOut();
		try {
			const res = packageBundle(result, outDir, { sourceText: source });
			expect(typeof res.dbBackend).toBe('string');
			expect(Array.isArray(res.needsSecrets)).toBe(true);
			expect(typeof res.aiCallsDetected).toBe('boolean');
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});

describe('packageBundle — Postgres path (test 1.2)', () => {
	it('copies db-postgres.js as db.js and picks node:20-slim Dockerfile when dbBackend is postgresql', () => {
		const outDir = tmpOut();
		try {
			const fakeResult = {
				serverJS: 'console.log("hi")',
				html: null,
				tests: null,
				dbBackend: 'postgresql',
				ast: { body: [] },
			};
			const res = packageBundle(fakeResult, outDir, { sourceText: '' });
			expect(res.dbBackend).toBe('postgresql');
			const dbJs = readFileSync(resolve(outDir, 'clear-runtime', 'db.js'), 'utf8');
			expect(dbJs).toContain('pg');
			const dockerfile = readFileSync(resolve(outDir, 'Dockerfile'), 'utf8');
			expect(dockerfile).toContain('node:20-slim');
			const pkg = JSON.parse(readFileSync(resolve(outDir, 'package.json'), 'utf8'));
			expect(pkg.dependencies.pg).toBeDefined();
			expect(pkg.dependencies['better-sqlite3']).toBeUndefined();
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('copies db.js (SQLite) and picks node:20-alpine Dockerfile by default', () => {
		const outDir = tmpOut();
		try {
			const fakeResult = {
				serverJS: 'console.log("hi")',
				html: null,
				tests: null,
				ast: { body: [] },
			};
			const res = packageBundle(fakeResult, outDir, { sourceText: '' });
			expect(res.dbBackend).toBe('sqlite');
			const dockerfile = readFileSync(resolve(outDir, 'Dockerfile'), 'utf8');
			expect(dockerfile).toContain('node:20-alpine');
			const pkg = JSON.parse(readFileSync(resolve(outDir, 'package.json'), 'utf8'));
			expect(pkg.dependencies['better-sqlite3']).toBeDefined();
			expect(pkg.dependencies.pg).toBeUndefined();
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});

describe('detectNeededSecrets (test 1.3)', () => {
	it('returns [JWT_SECRET] when source contains requires login', () => {
		const secrets = detectNeededSecrets({ body: [] }, 'endpoint GET /x:\n  requires login\n  respond with 1');
		expect(secrets).toContain('JWT_SECRET');
	});

	it('returns [JWT_SECRET] when source contains requires auth', () => {
		const secrets = detectNeededSecrets({ body: [] }, 'requires auth');
		expect(secrets).toContain('JWT_SECRET');
	});

	it('dedupes: requires login + stripe SERVICE_CALL returns both once', () => {
		const ast = {
			body: [
				{ type: 'service_call', service: 'stripe' },
				{ type: 'service_call', service: 'stripe' },
			],
		};
		const secrets = detectNeededSecrets(ast, 'requires login');
		expect(secrets).toContain('JWT_SECRET');
		expect(secrets).toContain('STRIPE_KEY');
		expect(secrets.length).toBe(2);
	});

	it('walks into nested body + pages nodes for SERVICE_CALL', () => {
		const ast = {
			body: [
				{
					type: 'page',
					pages: [{ type: 'service_call', service: 'twilio' }],
				},
			],
		};
		const secrets = detectNeededSecrets(ast, '');
		expect(secrets).toContain('TWILIO_KEY');
	});

	it('returns [] for a plain CRUD app', () => {
		const secrets = detectNeededSecrets({ body: [{ type: 'crud', name: 'todos' }] }, 'make todos');
		expect(secrets).toEqual([]);
	});
});

describe('detectAICalls (test 1.4)', () => {
	it('true when AST has ask_ai node', () => {
		const ast = { body: [{ type: 'ask_ai', prompt: 'hi' }] };
		expect(detectAICalls(ast)).toBe(true);
	});
	it('true when AST has agent node', () => {
		const ast = { body: [{ type: 'agent', name: 'helper' }] };
		expect(detectAICalls(ast)).toBe(true);
	});
	it('true when AST has stream_ai node', () => {
		const ast = { body: [{ type: 'stream_ai', prompt: 'hi' }] };
		expect(detectAICalls(ast)).toBe(true);
	});
	it('true when agent is nested inside a page', () => {
		const ast = { body: [{ type: 'page', pages: [{ type: 'agent', name: 'n' }] }] };
		expect(detectAICalls(ast)).toBe(true);
	});
	it('false for a plain CRUD app', () => {
		const ast = { body: [{ type: 'crud', name: 'todos' }] };
		expect(detectAICalls(ast)).toBe(false);
	});
});

describe('packageBundle — AI proxy mode (test 1.5)', () => {
	it('when useAIProxy=true, omits @anthropic-ai/sdk from dependencies and adds CLEAR_AI_URL ENV to Dockerfile', () => {
		const outDir = tmpOut();
		try {
			const fakeResult = {
				serverJS: 'console.log("hi")',
				html: null,
				tests: null,
				ast: {
					body: [
						{ type: 'use', isNpm: true, npmPackage: '@anthropic-ai/sdk' },
						{ type: 'use', isNpm: true, npmPackage: 'lodash' },
					],
				},
			};
			const res = packageBundle(fakeResult, outDir, { sourceText: '', useAIProxy: true });
			const pkg = JSON.parse(readFileSync(resolve(outDir, 'package.json'), 'utf8'));
			expect(pkg.dependencies['@anthropic-ai/sdk']).toBeUndefined();
			expect(pkg.dependencies.lodash).toBe('*');
			const dockerfile = readFileSync(resolve(outDir, 'Dockerfile'), 'utf8');
			expect(dockerfile).toContain('ENV CLEAR_AI_URL');
			expect(dockerfile).toContain('ENV CLEAR_AI_TENANT_JWT');
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('when useAIProxy=false (default), keeps @anthropic-ai/sdk dep and omits proxy ENV lines', () => {
		const outDir = tmpOut();
		try {
			const fakeResult = {
				serverJS: 'console.log("hi")',
				html: null,
				tests: null,
				ast: {
					body: [{ type: 'use', isNpm: true, npmPackage: '@anthropic-ai/sdk' }],
				},
			};
			const res = packageBundle(fakeResult, outDir, { sourceText: '' });
			const pkg = JSON.parse(readFileSync(resolve(outDir, 'package.json'), 'utf8'));
			expect(pkg.dependencies['@anthropic-ai/sdk']).toBe('*');
			const dockerfile = readFileSync(resolve(outDir, 'Dockerfile'), 'utf8');
			expect(dockerfile.includes('ENV CLEAR_AI_URL')).toBe(false);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});
