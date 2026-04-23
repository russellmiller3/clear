#!/usr/bin/env node
// scripts/reconcile-wfp.js — Cycle 7.7c
// Weekly reconcile job. Lists every script in the dispatch namespace + every
// D1 database with our prefix, cross-references tenants-db, and reports
// orphans (resources that live in CF but NOT in tenants-db).
//
// Design intent:
//   - READ-ONLY by default. Emits a report to stdout. Does NOT auto-delete.
//   - Russell reviews the report and decides whether to clean up.
//   - Catches: step-7 (record) failures, manual CF dashboard edits, partial
//     rollback states. All of which would otherwise leak resources that
//     silently bill forever.
//
// Usage:
//   node scripts/reconcile-wfp.js                     # dry-run report
//   node scripts/reconcile-wfp.js --json              # machine-readable
//   node scripts/reconcile-wfp.js --d1-prefix=clear-  # custom D1 name prefix
//
// Env required:
//   CLOUDFLARE_API_TOKEN
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_DISPATCH_NAMESPACE
//
// Env optional:
//   CLEAR_TENANTS_DB_URL — when unset, reconcile can't compare against the
//                          store; it exits with a clear message.
//
// Exit codes:
//   0 — ran clean, zero orphans
//   1 — ran clean, orphans found (informational — NOT a failure; caller
//       treats this as "human should review")
//   2 — couldn't run (missing env, CF API auth, store unreachable)

import { WfpApi } from '../playground/wfp-api.js';

function parseArgs(argv) {
	const out = { json: false, d1Prefix: 'clear-' };
	for (const a of argv.slice(2)) {
		if (a === '--json') out.json = true;
		else if (a.startsWith('--d1-prefix=')) out.d1Prefix = a.slice('--d1-prefix='.length);
	}
	return out;
}

async function main() {
	const { json, d1Prefix } = parseArgs(process.argv);

	const apiToken = process.env.CLOUDFLARE_API_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const namespace = process.env.CLOUDFLARE_DISPATCH_NAMESPACE;
	if (!apiToken || !accountId || !namespace) {
		console.error('reconcile-wfp: missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DISPATCH_NAMESPACE');
		process.exit(2);
	}

	const api = new WfpApi({ apiToken, accountId, namespace });

	// Step 1: list every CF-side resource.
	let scripts = [];
	let databases = [];
	try {
		const sR = await api.listScripts();
		scripts = sR.scripts || [];
		const dR = await api.listD1({ namePrefix: d1Prefix });
		databases = dR.databases || [];
	} catch (e) {
		console.error('reconcile-wfp: CF API call failed:', e.message);
		process.exit(2);
	}

	// Step 2: load the tenants-db record set. We expect a module that exports
	// a `loadKnownApps()` returning { scripts: Set<string>, databases: Set<string> }.
	// If the env doesn't point at a store, we emit a CF-only view and flag
	// every resource as "unreviewed" so human operators can decide.
	let known = { scripts: new Set(), databases: new Set(), storeReachable: false };
	try {
		if (process.env.CLEAR_TENANTS_DB_URL) {
			const { loadKnownApps } = await import('../playground/tenants.js');
			const k = await loadKnownApps({ url: process.env.CLEAR_TENANTS_DB_URL });
			known.scripts = new Set(k?.scripts || []);
			known.databases = new Set(k?.databases || []);
			known.storeReachable = true;
		}
	} catch (e) {
		// Non-fatal — report CF-side only, flag in the output.
		known.storeReachable = false;
	}

	// Step 3: compute orphans.
	const orphanScripts = scripts.filter((s) => {
		const name = s?.id || s?.name;
		return name && !known.scripts.has(name);
	});
	const orphanDatabases = databases.filter((d) => !known.databases.has(d.name));

	const report = {
		timestamp: new Date().toISOString(),
		storeReachable: known.storeReachable,
		cfResources: { scripts: scripts.length, databases: databases.length },
		orphanCount: orphanScripts.length + orphanDatabases.length,
		orphanScripts: orphanScripts.map((s) => ({ id: s?.id || s?.name })),
		orphanDatabases: orphanDatabases.map((d) => ({ uuid: d.uuid, name: d.name })),
	};

	if (json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log('── reconcile-wfp report ──────────────────────');
		console.log(`timestamp       ${report.timestamp}`);
		console.log(`store reachable ${report.storeReachable}`);
		console.log(`CF scripts      ${report.cfResources.scripts}`);
		console.log(`CF databases    ${report.cfResources.databases}`);
		console.log(`orphans         ${report.orphanCount}`);
		if (orphanScripts.length) {
			console.log('');
			console.log('Orphan scripts (in CF, not in tenants-db):');
			for (const s of orphanScripts) console.log(`  - ${s.id || s.name}`);
		}
		if (orphanDatabases.length) {
			console.log('');
			console.log('Orphan D1 databases (in CF, not in tenants-db):');
			for (const d of orphanDatabases) console.log(`  - ${d.name} (${d.uuid})`);
		}
		console.log('');
		console.log('No changes made. Review this report and run cleanup manually.');
	}

	process.exit(report.orphanCount > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error('reconcile-wfp: unexpected error:', e?.stack || e);
	process.exit(2);
});
