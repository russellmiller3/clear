/*
 * CC-1 — Multi-tenant routing wiring helper.
 *
 * Composes the existing pieces (subdomain-router + tenants store) into a
 * single mountable middleware. The Studio dev server stays single-tenant
 * by default; setting CLEAR_CLOUD_MODE=1 flips it into edge-router mode
 * where requests like `acme-deals.buildclear.dev` get proxied to the
 * matching deployed app.
 *
 * Why this lives in its own module: the wiring is small (~30 lines) but
 * it pulls together subdomain extraction, tenants-db lookup, and the
 * Express middleware contract. Co-locating in server.js would bury it;
 * a dedicated module makes the gate behavior trivially testable.
 *
 * Tests: playground/cloud-routing/index.test.js
 */

import { createRouterMiddleware } from '../subdomain-router/index.js';

/**
 * Decide whether multi-tenant routing should be active for this process.
 * Default off — Studio dev mode is single-tenant. Production edge nodes
 * set CLEAR_CLOUD_MODE=1 to opt in.
 */
export function isCloudRoutingEnabled(env = process.env) {
  return env.CLEAR_CLOUD_MODE === '1';
}

/**
 * Mount the subdomain router on the given Express app, gated by env.
 *
 * Returns true when mounted, false when skipped — useful for telemetry
 * and for the test suite to assert gate behavior without spinning up
 * a full server.
 *
 * The lookup function is built from the tenants store's
 * lookupAppBySubdomain method. Production passes a Postgres-backed store
 * with the same surface; the in-memory store is the dev path.
 *
 * @param {object} app - Express app (must have .use)
 * @param {object} opts
 * @param {object} opts.store - tenant store with lookupAppBySubdomain(subdomain)
 * @param {object} [opts.env] - env to read for the gate (default process.env)
 * @param {function} [opts.onResolved] - hook called after each resolution
 * @param {function} [opts.onError] - hook called on each failed resolution
 * @returns {boolean} whether routing was mounted
 */
export function mountCloudRouting(app, opts) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('mountCloudRouting: app must be an Express app with .use()');
  }
  if (!opts || !opts.store || typeof opts.store.lookupAppBySubdomain !== 'function') {
    throw new Error('mountCloudRouting: opts.store must implement lookupAppBySubdomain(subdomain)');
  }
  if (!isCloudRoutingEnabled(opts.env)) return false;

  const lookupApp = (subdomain) => opts.store.lookupAppBySubdomain(subdomain);
  const middleware = createRouterMiddleware({
    lookupApp,
    onResolved: opts.onResolved,
    onError: opts.onError,
    timeoutMs: opts.timeoutMs,
  });
  app.use(middleware);
  return true;
}
