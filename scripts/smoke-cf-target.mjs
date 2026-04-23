#!/usr/bin/env node
// Spot-check the --target cloudflare emission end-to-end for a representative
// set of templates. Zero deploys — just verify each template compiles to a
// valid Workers bundle with the security invariants we need.
//
// Runs these checks per app:
//   1. compile with target='cloudflare' → 0 errors
//   2. result.workerBundle has src/index.js, wrangler.toml, (maybe) migrations/
//   3. src/index.js parses clean under node --check
//   4. src/index.js contains 0 forbidden strings (require(, fs., child_process, /tmp, execSync)
//   5. src/index.js exports default { async fetch(request, env, ctx) }
//   6. data-clear-line attrs are preserved in embedded HTML
//
// Usage: node scripts/smoke-cf-target.mjs [--apps=todo-fullstack,expense-tracker]

import { compileProgram } from '../index.js';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = join(__dirname, '..', 'apps');

const argApps = process.argv.find((a) => a.startsWith('--apps='))?.slice(7);
const targetApps = argApps
	? argApps.split(',').map((s) => s.trim())
	: ['todo-fullstack', 'crm-pro', 'blog-fullstack', 'live-chat', 'helpdesk-agent', 'booking', 'expense-tracker', 'ecom-agent'];

const FORBIDDEN = ['require(', 'child_process', 'fs.', '/tmp', 'execSync', 'process.cwd'];

let totalChecks = 0;
let failedChecks = 0;

function check(app, label, ok, detail = '') {
	totalChecks++;
	if (ok) {
		console.log(`  ✅ ${label}`);
	} else {
		failedChecks++;
		console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
	}
}

for (const app of targetApps) {
	console.log(`\n## ${app}`);
	const mainPath = join(APPS_DIR, app, 'main.clear');
	let src;
	try {
		src = readFileSync(mainPath, 'utf8');
	} catch (e) {
		console.log(`  ⚠️  skipped — ${e.message}`);
		continue;
	}

	let result;
	try {
		result = compileProgram(src, { target: 'cloudflare' });
	} catch (e) {
		failedChecks++;
		console.log(`  ❌ compile threw: ${e.message}`);
		continue;
	}

	check(app, '0 compile errors', result.errors.length === 0,
		result.errors.length ? `${result.errors.length} errors: ${JSON.stringify(result.errors.slice(0, 2))}` : '');

	const bundle = result.workerBundle || {};
	check(app, 'workerBundle has src/index.js', !!bundle['src/index.js']);
	check(app, 'workerBundle has wrangler.toml', !!bundle['wrangler.toml']);

	const indexJs = bundle['src/index.js'] || '';

	// 3. node --check
	if (indexJs) {
		const tmp = mkdtempSync(join(tmpdir(), 'cf-smoke-'));
		const tmpFile = join(tmp, 'index.mjs');
		try {
			writeFileSync(tmpFile, indexJs);
			execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
			check(app, 'src/index.js parses under node --check', true);
		} catch (e) {
			check(app, 'src/index.js parses under node --check', false,
				e.stderr?.toString().slice(0, 200) || e.message?.slice(0, 200));
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	}

	// 4. forbidden strings
	for (const f of FORBIDDEN) {
		const hit = indexJs.includes(f);
		check(app, `no "${f}" in src/index.js`, !hit,
			hit ? `found at offset ${indexJs.indexOf(f)}` : '');
	}

	// 5. fetch export
	check(app, 'exports default { fetch(request, env, ctx) }',
		indexJs.includes('export default') && indexJs.includes('fetch(request'));

	// 6. data-clear-line attrs preserved (when app has UI)
	const hasUI = src.includes('title:') || src.includes('page ') || src.includes('show ') || result.html;
	if (hasUI && result.html) {
		const emitHasDataLine = indexJs.includes('data-clear-line=');
		check(app, 'data-clear-line attrs in embedded HTML',
			emitHasDataLine || !result.html.includes('data-clear-line='),
			'');
	}

	// 7. wrangler.toml compat fields
	const wt = bundle['wrangler.toml'] || '';
	check(app, 'wrangler.toml has compatibility_date', /compatibility_date\s*=\s*"2025/.test(wt));
	check(app, 'wrangler.toml has nodejs_compat_v2 flag',
		wt.includes('nodejs_compat_v2'));
}

console.log(`\n---\n\nTotal checks: ${totalChecks}`);
console.log(`Passed: ${totalChecks - failedChecks}`);
console.log(`Failed: ${failedChecks}`);

if (failedChecks > 0) {
	process.exit(1);
}
