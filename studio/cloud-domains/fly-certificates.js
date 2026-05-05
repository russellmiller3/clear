/*
 * CC-5c Fly certificate provisioner helper.
 *
 * Boundary rules:
 *   - callers pass fetchImpl in tests, so no test hits the real Fly network
 *   - every public function returns normalized states: ready | pending | failed
 *   - CC-5b owns the trigger; this module only gives it a clean call surface
 */

const DEFAULT_FLY_API_BASE = 'https://api.machines.dev/v1';

function trimSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

function encodePart(s) {
  return encodeURIComponent(String(s || ''));
}

function requireNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`fly-certificates: ${name} is required.`);
  }
  return value.trim();
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function messageFromPayload(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  if (typeof payload.error === 'string') return payload.error;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map(err => typeof err === 'string' ? err : err?.message || JSON.stringify(err))
      .join('; ');
  }
  if (typeof payload.message === 'string') return payload.message;
  return fallback;
}

function unwrap(payload) {
  if (payload && typeof payload === 'object' && payload.data) return payload.data;
  return payload;
}

function normalizeState(cert) {
  if (!cert || typeof cert !== 'object') return 'failed';
  const raw = String(cert.client_status || cert.status || cert.state || '').toLowerCase();
  if (cert.configured === true || raw === 'ready' || raw === 'configured' || raw === 'issued') {
    return 'ready';
  }
  if (raw === 'failed' || raw === 'error' || raw === 'expired') return 'failed';
  return 'pending';
}

function normalizeCertificate(cert, fallback = {}) {
  const data = unwrap(cert) || {};
  return {
    ok: true,
    certId: data.id || data.certificate_id || fallback.certId || null,
    domain: data.hostname || data.domain || fallback.domain || null,
    state: normalizeState(data),
    raw: data,
  };
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch {
    return { message: text };
  }
}

async function flyFetch({ path, method = 'GET', token, body, fetchImpl, apiBase }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fly-certificates: fetch is unavailable; pass fetchImpl in tests or use Node 18+.');
  }
  const base = trimSlash(apiBase || DEFAULT_FLY_API_BASE);
  const res = await fetchFn(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireNonEmpty('token', token)}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await readJsonResponse(res);
  if (!res.ok) {
    return {
      ok: false,
      state: 'failed',
      status: res.status,
      error: messageFromPayload(payload, `Fly API returned ${res.status}`),
      raw: payload,
    };
  }
  return { ok: true, status: res.status, payload };
}

export async function createFlyCertificate({
  appName,
  domain,
  token,
  fetchImpl,
  apiBase,
} = {}) {
  const app = requireNonEmpty('appName', appName);
  const hostname = requireNonEmpty('domain', domain).toLowerCase();
  const res = await flyFetch({
    path: `/apps/${encodePart(app)}/certificates`,
    method: 'POST',
    token,
    fetchImpl,
    apiBase,
    body: { hostname },
  });
  if (!res.ok) return res;
  return normalizeCertificate(res.payload, { domain: hostname });
}

export async function getFlyCertificateStatus({
  appName,
  certId,
  token,
  fetchImpl,
  apiBase,
} = {}) {
  const app = requireNonEmpty('appName', appName);
  const cert = requireNonEmpty('certId', certId);
  const res = await flyFetch({
    path: `/apps/${encodePart(app)}/certificates/${encodePart(cert)}`,
    method: 'GET',
    token,
    fetchImpl,
    apiBase,
  });
  if (!res.ok) return res;
  return normalizeCertificate(res.payload, { certId: cert });
}

export async function pollFlyCertificateReady({
  appName,
  certId,
  token,
  fetchImpl,
  apiBase,
  maxAttempts = 20,
  intervalMs = 5000,
} = {}) {
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  for (let i = 0; i < attempts; i++) {
    const status = await getFlyCertificateStatus({ appName, certId, token, fetchImpl, apiBase });
    if (!status.ok || status.state === 'ready' || status.state === 'failed') {
      return { ...status, attempts: i + 1 };
    }
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return {
    ok: false,
    certId,
    state: 'pending',
    attempts,
    error: `Certificate ${certId} was not ready after ${attempts} attempts.`,
  };
}

export async function provisionFlyCertificateForDomain({
  domainRow,
  token,
  fetchImpl,
  apiBase,
  maxAttempts,
  intervalMs,
} = {}) {
  const row = domainRow || {};
  const appName = row.fly_app_name || row.flyAppName || row.appName;
  const domain = row.domain;
  const created = await createFlyCertificate({ appName, domain, token, fetchImpl, apiBase });
  if (!created.ok) {
    return { ...created, domainId: row.id || null };
  }
  const ready = await pollFlyCertificateReady({
    appName,
    certId: created.certId,
    token,
    fetchImpl,
    apiBase,
    maxAttempts,
    intervalMs,
  });
  return {
    ...ready,
    domainId: row.id || null,
    domain: ready.domain || created.domain || domain,
    certId: ready.certId || created.certId,
  };
}
