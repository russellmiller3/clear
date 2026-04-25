/*
 * Subdomain router — CC-1b scaffold.
 *
 * HTTP middleware that extracts the subdomain from `Host:` and proxies
 * the request to the right Fly app's internal URL. Designed to run as
 * an edge service in front of all Clear Cloud traffic.
 *
 * Flow on every request:
 *   1. Parse Host: header → subdomain (e.g. "acme-approvals.buildclear.dev"
 *      → "acme-approvals")
 *   2. Look up tenants-db: app + tenant metadata
 *   3. Authorize — tenant status = active, app status = active, plan
 *      quota OK (CC-4 billing enforcement can hook in here)
 *   4. Proxy the full request to the app's internal Fly URL, streaming
 *      request body through and response body back
 *
 * This module exports three layers so each is testable in isolation:
 *   - extractSubdomain(hostHeader)  — pure function, no I/O
 *   - resolveAppTarget(hostHeader, lookupFn)  — wraps extract + lookup
 *   - createRouterMiddleware(options)  — Express-compatible middleware
 *     that does the full dance
 *
 * Phase 85a blockers: end-to-end testing requires a real Fly Trust
 * Verified account with internal networking enabled. Scaffold tests
 * work against local mock targets (http://localhost:<port>).
 */

import { URL } from 'url';
import http from 'http';
import https from 'https';

/**
 * The root DNS zone we're routing under. Defaulting to buildclear.dev
 * — the production domain Russell's Phase 85a registers. Override via
 * CLEAR_CLOUD_ROOT_DOMAIN env var for staging / dev.
 */
export function getRootDomain() {
  return (process.env.CLEAR_CLOUD_ROOT_DOMAIN || 'buildclear.dev').toLowerCase();
}

/**
 * Extract the tenant-app subdomain from a Host header.
 *
 * Rules:
 *   - Input format: "<subdomain>.<root>" or "<subdomain>.<root>:<port>"
 *     (port stripped for parsing).
 *   - Root match is case-insensitive; subdomain returned lowercase.
 *   - Returns null when:
 *     - Host doesn't end in the root domain (direct IP / misrouted)
 *     - Host IS the root domain with no subdomain (buildclear.dev itself)
 *     - Subdomain is "www" (reserved — marketing site / redirect, not a tenant app)
 *     - Subdomain contains a dot (nested subdomains not supported yet)
 *
 * Pure function — no I/O. All tenant resolution happens in
 * resolveAppTarget which calls the tenants-db lookup.
 *
 * @param {string} hostHeader - the raw Host: header value
 * @param {string} [root] - override root domain (defaults to getRootDomain())
 * @returns {string|null} subdomain or null if the request can't route to a tenant app
 */
export function extractSubdomain(hostHeader, root = getRootDomain()) {
  if (!hostHeader || typeof hostHeader !== 'string') return null;
  // Strip port — browsers send "host:port" for non-default ports.
  const hostNoPort = hostHeader.split(':')[0].toLowerCase().trim();
  if (!hostNoPort) return null;
  const rootLower = root.toLowerCase();
  if (hostNoPort === rootLower) return null;  // root itself, no tenant
  if (!hostNoPort.endsWith('.' + rootLower)) return null;  // wrong domain entirely
  // Remove the root suffix, leaving the subdomain portion.
  const sub = hostNoPort.slice(0, -('.' + rootLower).length);
  if (!sub) return null;
  if (sub.includes('.')) return null;  // nested subdomains (a.b.root) not supported
  if (sub === 'www') return null;       // reserved
  if (sub === 'api') return null;       // reserved — future API/admin plane
  return sub;
}

/**
 * Resolve a Host header through the tenants-db lookup to a routing target.
 *
 * Returns one of:
 *   - { ok: true, target: { appId, tenantId, flyAppName, plan, url } }
 *   - { ok: false, status: 404, reason: 'subdomain not found' }
 *   - { ok: false, status: 502, reason: 'no current deploy' }
 *   - { ok: false, status: 403, reason: 'tenant frozen' | 'app paused' }
 *   - { ok: false, status: 400, reason: 'unable to extract subdomain' }
 *
 * `lookupFn` is injected so tests can stub without a real tenants-db.
 * /api/chat or the edge service wires it to tenants-db/index.js's
 * lookupAppBySubdomain.
 *
 * @param {string} hostHeader
 * @param {(subdomain: string) => Promise<object|null>} lookupFn
 * @returns {Promise<object>}
 */
export async function resolveAppTarget(hostHeader, lookupFn) {
  const subdomain = extractSubdomain(hostHeader);
  if (!subdomain) {
    return { ok: false, status: 400, reason: 'unable to extract subdomain', hostHeader };
  }
  let row;
  try {
    row = await lookupFn(subdomain);
  } catch (err) {
    return { ok: false, status: 502, reason: 'tenants-db lookup failed: ' + err.message };
  }
  if (!row) {
    return { ok: false, status: 404, reason: 'subdomain not found', subdomain };
  }
  // Belt-and-suspenders status check — the SQL query already filters
  // on active/active, but defensive re-check in case the caller wired
  // a looser lookup.
  if (row.tenant_status && row.tenant_status !== 'active') {
    return { ok: false, status: 403, reason: 'tenant ' + row.tenant_status };
  }
  if (row.status && row.status !== 'active') {
    return { ok: false, status: 403, reason: 'app ' + row.status };
  }
  // CC-4 cycle 3 — Cloudflare-target arm.
  // Cloudflare-deployed rows have `scriptName` + `hostname` populated by
  // markAppDeployed (cfDeploys), but no `fly_app_name`. In production,
  // *.buildclear.dev DNS goes straight to Cloudflare's edge, never
  // through Studio. In dev, Russell may want Studio to proxy to the real
  // CF URL so he can verify the full Publish flow on his laptop —
  // gated behind CLEAR_CLOUD_CF_PROXY=1 (strict equality so a stray
  // truthy env doesn't silently turn Studio into a hot reverse-proxy
  // bottleneck in production).
  if (row.scriptName && row.hostname) {
    const proxyEnabled = process.env.CLEAR_CLOUD_CF_PROXY === '1';
    if (!proxyEnabled) {
      return {
        ok: false,
        status: 502,
        reason: 'cloudflare-deployed app — set CLEAR_CLOUD_CF_PROXY=1 to proxy through Studio (dev mode only; do not use in production)',
        subdomain,
      };
    }
    return {
      ok: true,
      target: {
        appId: row.id,
        tenantId: row.tenant_id,
        plan: row.tenant_plan || null,
        backend: 'cloudflare',
        scriptName: row.scriptName,
        hostname: row.hostname,
        url: `https://${row.hostname}`,
        subdomain,
      },
    };
  }
  if (!row.fly_app_name) {
    return { ok: false, status: 502, reason: 'app has no fly_app_name assigned' };
  }
  // Build the Fly internal URL. Production uses Fly's .internal DNS
  // (6PN / WireGuard private network). Override for dev.
  const portPart = process.env.CLEAR_CLOUD_TARGET_PORT || '8080';
  const hostPattern = process.env.CLEAR_CLOUD_TARGET_HOST || '{fly_app_name}.internal';
  const internalHost = hostPattern.replace('{fly_app_name}', row.fly_app_name);
  const scheme = process.env.CLEAR_CLOUD_TARGET_SCHEME || 'http';
  const url = `${scheme}://${internalHost}:${portPart}`;
  return {
    ok: true,
    target: {
      appId: row.id,
      tenantId: row.tenant_id,
      flyAppName: row.fly_app_name,
      plan: row.tenant_plan || null,
      backend: 'fly',
      url,
      subdomain,
    },
  };
}

/**
 * Proxy an incoming HTTP request to a target URL. Streams request body
 * through and response body back. Designed to be call-site-compatible
 * with Node's http/https request handler signature (req, res).
 *
 * Error handling:
 *   - Target unreachable → 502 + short error text
 *   - Target timeout (15s default) → 504
 *   - Request body stream error → 500
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} targetUrl - full URL including scheme + port
 * @param {object} [opts] - { timeoutMs? }
 */
export function proxyToTarget(req, res, targetUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || 15000;
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    res.statusCode = 502;
    res.end('Bad target URL: ' + err.message);
    return;
  }
  const lib = parsed.protocol === 'https:' ? https : http;
  // Preserve the request path + query on the downstream call.
  const reqUrl = new URL(req.url || '/', 'http://placeholder');
  const forwardedHeaders = { ...req.headers };
  // Drop hop-by-hop headers per RFC 7230.
  for (const h of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer']) {
    delete forwardedHeaders[h];
  }
  // Set the downstream Host to the target's authority — some apps use
  // Host for routing/assertions. Keep X-Forwarded-Host for the original.
  forwardedHeaders['x-forwarded-host'] = req.headers.host || '';
  forwardedHeaders['x-forwarded-proto'] =
    (req.socket && req.socket.encrypted) ? 'https' : 'http';
  forwardedHeaders['host'] = parsed.host;

  const outgoing = lib.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: reqUrl.pathname + reqUrl.search,
    headers: forwardedHeaders,
    timeout: timeoutMs,
  }, (proxyRes) => {
    res.statusCode = proxyRes.statusCode || 502;
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      try { res.setHeader(k, v); } catch { /* some headers are restricted */ }
    }
    proxyRes.pipe(res);
  });

  outgoing.on('error', (err) => {
    if (!res.headersSent) {
      res.statusCode = err.code === 'ECONNREFUSED' ? 502 : 500;
      res.end('Proxy error: ' + err.message);
    } else {
      res.end();
    }
  });
  outgoing.on('timeout', () => {
    outgoing.destroy(new Error('target timeout after ' + (timeoutMs / 1000) + 's'));
    if (!res.headersSent) {
      res.statusCode = 504;
      res.end('Target timeout');
    }
  });

  // Stream request body (if any) to the outgoing request.
  req.pipe(outgoing);
  req.on('error', (err) => {
    try { outgoing.destroy(err); } catch {}
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Request stream error: ' + err.message);
    }
  });
}

/**
 * Express-compatible middleware — puts the whole flow together.
 *
 * @param {object} opts
 * @param {(subdomain: string) => Promise<object|null>} opts.lookupApp - required; wire to tenants-db
 * @param {(req, resolution) => void} [opts.onResolved] - hook called before proxy (logging, metrics)
 * @param {(req, err) => void} [opts.onError] - hook called on failed resolution (metrics)
 * @param {number} [opts.timeoutMs] - passed through to proxyToTarget
 */
export function createRouterMiddleware(opts) {
  if (!opts || typeof opts.lookupApp !== 'function') {
    throw new Error('createRouterMiddleware: opts.lookupApp is required — wire to tenants-db lookupAppBySubdomain');
  }
  return async function subdomainRouter(req, res, next) {
    const resolution = await resolveAppTarget(req.headers.host || '', opts.lookupApp);
    if (opts.onResolved) {
      try { opts.onResolved(req, resolution); } catch { /* hooks are non-fatal */ }
    }
    if (!resolution.ok) {
      if (opts.onError) {
        try { opts.onError(req, resolution); } catch {}
      }
      // If a `next` was passed, let downstream handle (e.g. an Express
      // app that routes non-tenant traffic to its own handlers). Else
      // surface the error directly.
      if (typeof next === 'function') return next();
      res.statusCode = resolution.status || 500;
      res.end(`Subdomain routing error: ${resolution.reason}`);
      return;
    }
    // CC-4 cycle 3 — CF-target arm. resolveAppTarget guarantees that
    // when backend === 'cloudflare', target.url is the public CF edge
    // URL (https://<hostname>) — proxyToTarget already handles the
    // https scheme. The "proxy not enabled" path returns ok:false above,
    // so by the time we get here, url is a real URL.
    proxyToTarget(req, res, resolution.target.url, { timeoutMs: opts.timeoutMs });
  };
}
