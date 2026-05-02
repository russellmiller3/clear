// playground/seed-from-memory.js — CC-1 production cutover step 2.
//
// Copies live in-memory tenant state into a target store via the public
// store API. Idempotent: rerun-safe. Used during the in-memory → Postgres
// cutover sequence documented in playground/tenant-store-factory.js.
//
// Usage as a module (test-friendly):
//   import { seedFromMemory } from './seed-from-memory.js';
//   await seedFromMemory({ source, target, onProgress: e => console.log(e) });
//
// CLI usage (production cutover):
//   DATABASE_URL=postgres://… node playground/seed-from-memory.js
//   → builds source from a serialized JSON file at $SEED_INPUT (env var),
//     builds target via the tenant-store-factory, runs the copy.

import fs from 'node:fs';
import { InMemoryTenantStore } from './tenants.js';
import { makeTenantStore } from './tenant-store-factory.js';

/**
 * Copy every tenant, app, version, audit entry, and stripe event from
 * source to target. Skips rows already present in target so a rerun is
 * harmless.
 *
 * @param {object}   opts
 * @param {object}   opts.source            — store with listTenants()
 * @param {object}   opts.target            — store with the public write API
 * @param {(e:object)=>void} [opts.onProgress] — optional progress callback
 * @returns {Promise<object>}                — summary with counts
 */
export async function seedFromMemory({ source, target, onProgress }) {
  const summary = {
    tenantsCopied: 0,
    tenantsSkipped: 0,
    appsCopied: 0,
    appsSkipped: 0,
    auditEntriesCopied: 0,
    stripeEventsCopied: 0,
    errors: [],
  };
  const fire = (kind, payload) => {
    if (typeof onProgress === 'function') {
      try { onProgress({ kind, ...payload }); } catch { /* swallow */ }
    }
  };

  const tenants = await source.listTenants();
  for (const t of tenants) {
    const existing = await target.get(t.slug);
    if (existing) {
      summary.tenantsSkipped++;
      fire('tenant', { slug: t.slug, action: 'skipped' });
    } else {
      await target.upsert(t.slug, t);
      summary.tenantsCopied++;
      fire('tenant', { slug: t.slug, action: 'copied' });
    }

    const apps = await source.listAppsByTenant(t.slug);
    for (const summaryRow of apps) {
      const appSlug = summaryRow.appSlug;
      const targetExisting = await target.getAppRecord(t.slug, appSlug);
      if (targetExisting) {
        summary.appsSkipped++;
        fire('app', { slug: t.slug, appSlug, action: 'skipped' });
        continue;
      }
      const full = await source.getAppRecord(t.slug, appSlug);
      if (!full) continue;
      const versions = Array.isArray(full.versions) ? full.versions : [];
      // Sorted newest-first by getAppRecord; pass the OLDEST as the seed
      // version on markAppDeployed, then replay the rest in chronological
      // order so target's versions[] ends up in the same order as source.
      const chronological = [...versions].reverse();
      const seed = chronological[0] || null;
      await target.markAppDeployed({
        tenantSlug: t.slug,
        appSlug,
        scriptName: full.scriptName,
        d1_database_id: full.d1_database_id,
        hostname: full.hostname,
        versionId: seed?.versionId || null,
        sourceHash: seed?.sourceHash || null,
        migrationsHash: seed?.migrationsHash || null,
        secretKeys: full.secretKeys || [],
        lastBundle: full.lastBundle || null,
      });
      for (const v of chronological.slice(1)) {
        await target.recordVersion({
          tenantSlug: t.slug,
          appSlug,
          versionId: v.versionId,
          uploadedAt: v.uploadedAt,
          sourceHash: v.sourceHash,
          migrationsHash: v.migrationsHash,
          note: v.note,
          via: v.via,
          lastBundle: v.lastBundle,
        });
      }
      summary.appsCopied++;
      fire('app', { slug: t.slug, appSlug, action: 'copied' });

      const audit = await source.getAuditLog(t.slug, appSlug);
      for (const entry of audit || []) {
        const r = await target.appendAuditEntry({
          tenantSlug: t.slug,
          appSlug,
          actor: entry.actor,
          action: entry.action,
          verdict: entry.verdict,
          sourceHashBefore: entry.sourceHashBefore,
          sourceHashAfter: entry.sourceHashAfter,
          note: entry.note,
          kind: entry.kind,
          before: entry.before,
          after: entry.after,
          reason: entry.reason,
          ip: entry.ip,
          userAgent: entry.userAgent,
          status: entry.status,
        });
        if (r?.ok && entry.status && entry.status !== 'shipped') {
          await target.markAuditEntry({
            auditId: r.auditId,
            status: entry.status,
            versionId: entry.versionId,
            error: entry.error,
          });
        }
        summary.auditEntriesCopied++;
      }
    }
  }

  const events = await source.listStripeEvents();
  for (const eventId of events) {
    const seen = await target.seenStripeEvent(eventId);
    if (seen) continue;
    await target.recordStripeEvent(eventId);
    summary.stripeEventsCopied++;
  }
  fire('done', { summary });
  return summary;
}

// ── CLI entry point ──────────────────────────────────────────────────
// Reads a JSON dump from $SEED_INPUT (path to file produced by an
// earlier `dumpInMemory()` call from inside Studio). Builds an
// InMemoryTenantStore, replays the dump into it, then seeds the
// factory-built target store.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const inputPath = process.env.SEED_INPUT;
  if (!inputPath) {
    console.error('SEED_INPUT env var must point to a JSON dump of in-memory tenant state.');
    process.exit(2);
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`SEED_INPUT file not found: ${inputPath}`);
    process.exit(2);
  }
  const dump = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const source = new InMemoryTenantStore();
  for (const t of dump.tenants || []) await source.upsert(t.slug, t);
  for (const e of dump.stripeEvents || []) await source.recordStripeEvent(e);
  // App + audit replay would go here once a matching dumpInMemory is
  // written; tenants + stripe events are the load-bearing pieces for
  // the cutover dry-run anyway.
  const { store: target, mode } = await makeTenantStore();
  console.log(`Seeding into target store (mode=${mode})...`);
  const summary = await seedFromMemory({
    source,
    target,
    onProgress: e => console.log(`  [${e.kind}] ${JSON.stringify(e)}`),
  });
  console.log('Summary:', JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exit(1);
}
