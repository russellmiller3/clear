// lib/packaging.js
// Shared "turn a compiled Clear app into a deployable bundle" helper.
// Called by cli/clear.js (CLI `clear package`) and by Studio's deploy
// endpoint. Writes server.js + index.html + package.json + Dockerfile +
// .dockerignore + clear-runtime/ to outDir. Chooses Postgres or SQLite
// runtime files based on result.dbBackend. In proxy mode strips the
// Anthropic SDK dep and bakes CLEAR_AI_URL env stubs into the Dockerfile
// so every deployed-app AI call routes through our metered proxy.

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_SRC = resolve(__dirname, '..', 'runtime');

// Keep Dockerfile strings as named constants so Phase 2's builder can
// swap them if Fly ever requires a different base image. One-line CMDs
// stay inline so a reader can follow the full build without flipping files.
const DOCKERFILE_ALPINE_DIRECT =
	'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install --production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]';
const DOCKERFILE_SLIM_DIRECT =
	'FROM node:20-slim\nWORKDIR /app\nCOPY package.json .\nRUN npm install --production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]';
const PROXY_ENV_LINES =
	'ENV CLEAR_AI_URL=""\nENV CLEAR_AI_TENANT_JWT=""\n';
const DOCKERFILE_ALPINE_PROXY =
	'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install --production\nCOPY . .\n' +
	PROXY_ENV_LINES +
	'EXPOSE 3000\nCMD ["node", "server.js"]';
const DOCKERFILE_SLIM_PROXY =
	'FROM node:20-slim\nWORKDIR /app\nCOPY package.json .\nRUN npm install --production\nCOPY . .\n' +
	PROXY_ENV_LINES +
	'EXPOSE 3000\nCMD ["node", "server.js"]';

export function packageBundle(result, outDir, opts = {}) {
	const { useAIProxy = false, sourceText = '', appName: appNameIn } = opts;
	mkdirSync(outDir, { recursive: true });
	const files = [];

	const serverCode = result.serverJS || result.javascript || '';
	writeFileSync(resolve(outDir, 'server.js'), serverCode);
	files.push('server.js');

	if (result.html) {
		writeFileSync(resolve(outDir, 'index.html'), result.html);
		files.push('index.html');
	}
	if (result.tests) {
		writeFileSync(resolve(outDir, 'test.js'), result.tests);
		files.push('test.js');
	}

	const runtimeDir = resolve(outDir, 'clear-runtime');
	mkdirSync(runtimeDir, { recursive: true });
	const isPostgres = (result.dbBackend || '').includes('postgres');

	if (isPostgres) {
		copyFileSync(resolve(RUNTIME_SRC, 'db-postgres.js'), resolve(runtimeDir, 'db.js'));
	} else {
		copyFileSync(resolve(RUNTIME_SRC, 'db.js'), resolve(runtimeDir, 'db.js'));
	}
	for (const f of ['auth.js', 'rateLimit.js']) {
		const src = resolve(RUNTIME_SRC, f);
		if (existsSync(src)) copyFileSync(src, resolve(runtimeDir, f));
	}
	files.push('clear-runtime/');

	const npmDeps = {};
	const collectNpm = (nodes) => {
		if (!Array.isArray(nodes)) return;
		for (const n of nodes) {
			if (n && n.type === 'use' && n.isNpm && n.npmPackage) {
				npmDeps[n.npmPackage] = '*';
			}
			if (n && n.body) collectNpm(n.body);
			if (n && n.pages) collectNpm(n.pages);
		}
	};
	collectNpm(result.ast?.body || []);

	// Proxy mode strips the Anthropic dep — the proxy holds the real key and
	// does the Anthropic call. Deployed app just POSTs to CLEAR_AI_URL.
	if (useAIProxy) {
		delete npmDeps['@anthropic-ai/sdk'];
	}

	const slugBase = appNameIn || 'app';
	const appSlug = slugBase.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
	const dbDep = isPostgres ? { pg: '^8.13.0' } : { 'better-sqlite3': '^12.8.0' };
	const pkg = {
		name: `clear-${appSlug}`,
		version: '1.0.0',
		description: 'Built with Clear language',
		main: 'server.js',
		scripts: { start: 'node server.js', test: 'node test.js' },
		dependencies: { express: '^4.18.0', ...dbDep, ...npmDeps },
	};
	writeFileSync(resolve(outDir, 'package.json'), JSON.stringify(pkg, null, 2));
	files.push('package.json');

	const dockerfile = useAIProxy
		? (isPostgres ? DOCKERFILE_SLIM_PROXY : DOCKERFILE_ALPINE_PROXY)
		: (isPostgres ? DOCKERFILE_SLIM_DIRECT : DOCKERFILE_ALPINE_DIRECT);
	writeFileSync(resolve(outDir, 'Dockerfile'), dockerfile);
	files.push('Dockerfile');

	writeFileSync(
		resolve(outDir, '.dockerignore'),
		'node_modules\nclear-data.db\nclear-data.db-wal\nclear-data.db-shm\n',
	);
	files.push('.dockerignore');

	return {
		ok: true,
		files,
		outDir,
		dbBackend: isPostgres ? 'postgresql' : 'sqlite',
		needsSecrets: detectNeededSecrets(result.ast, sourceText),
		aiCallsDetected: detectAICalls(result.ast),
	};
}

export function detectNeededSecrets(ast, sourceText = '') {
	const secrets = new Set();
	// Auth-gated routes need a JWT signing key — we auto-generate at deploy
	// time, but the caller needs to know a secret is required.
	if (/\brequires\s+(login|auth)\b/.test(sourceText)) secrets.add('JWT_SECRET');

	const walk = (nodes) => {
		if (!Array.isArray(nodes)) return;
		for (const n of nodes) {
			if (n && n.type === 'service_call' && n.service) {
				secrets.add(`${n.service.toUpperCase()}_KEY`);
			}
			if (n && n.body) walk(n.body);
			if (n && n.pages) walk(n.pages);
		}
	};
	walk(ast?.body || []);
	return [...secrets];
}

export function detectAICalls(ast) {
	let found = false;
	const walk = (nodes) => {
		if (!Array.isArray(nodes) || found) return;
		for (const n of nodes) {
			if (!n) continue;
			if (n.type === 'ask_ai' || n.type === 'agent' || n.type === 'stream_ai') {
				found = true;
				return;
			}
			if (n.body) walk(n.body);
			if (n.pages) walk(n.pages);
			if (found) return;
		}
	};
	walk(ast?.body || []);
	return found;
}
