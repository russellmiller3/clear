// playground/wfp-api.js
// Thin wrapper around Cloudflare's Workers for Platforms (WFP) REST API.
// Every HTTP surface that the deploy orchestrator talks to lives here:
//   - upload a Worker script         (Cycle 7.1)
//   - provision / list D1 databases  (Cycle 7.2 + 7.2b)
//   - apply D1 migrations            (Cycle 7.3)
//   - set script secrets             (Cycle 7.4)
//   - attach a custom domain         (Cycle 7.5)
//   - delete a script (rollback)     (Cycle 7.6)
//
// Design rules the wrapper enforces:
//   - Constructor-injected fetchImpl (defaults to globalThis.fetch). Tests
//     always inject their own — no test here hits the real Cloudflare API.
//   - Never string-interpolate user input into URLs. Every path segment we
//     derive from caller data is encodeURIComponent'd, full stop.
//   - API tokens and secret values NEVER leak into error messages, thrown
//     Error.message strings, or returned result objects. Errors hold a
//     sanitized `message` + numeric `status` + optional `code`.
//   - All network errors raise a WfpApiError (extends Error) with `.status`.
//
// The wrapper does NOT hold deploy orchestration. That lives in
// playground/deploy-cloudflare.js, which sequences these calls + rolls
// back when any step after D1 fails.

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Structured error for Cloudflare API failures. Never carries an auth token
 * or secret value — the constructor strips both from its message.
 */
export class WfpApiError extends Error {
	constructor(message, { status = 0, code = 'WFP_API_ERROR', cfErrors = [] } = {}) {
		super(String(message || 'Cloudflare API error'));
		this.name = 'WfpApiError';
		this.status = status;
		this.code = code;
		this.cfErrors = Array.isArray(cfErrors) ? cfErrors : [];
	}
}

/**
 * Build a deterministic D1 database name from a tenant and app slug.
 *
 * Tenant-prefixed so two tenants both deploying "crm" never collide in the
 * shared namespace. If tenantSlug already has the `clear-` prefix, we keep
 * it; if not, we don't fabricate one — the CF D1 namespace doesn't care
 * about the prefix, only uniqueness.
 *
 * @param {string} tenantSlug  e.g. 'clear-acme'
 * @param {string} appSlug     e.g. 'crm'
 * @returns {string}           e.g. 'clear-acme-crm'
 */
export function d1NameFor(tenantSlug, appSlug) {
	return `${String(tenantSlug || '').trim()}-${String(appSlug || '').trim()}`;
}

/** Tiny random-hex helper — deterministic enough for a 4-char collision suffix. */
function _randHex(n) {
	let out = '';
	for (let i = 0; i < n; i++) {
		out += Math.floor(Math.random() * 16).toString(16);
	}
	return out;
}

/**
 * Main wrapper class. Instantiate once per Studio process with a CF API token
 * + account id + namespace. All methods are async and return either a
 * `{ ok, ...data }` object or throw a WfpApiError on a structured failure.
 */
export class WfpApi {
	constructor({ apiToken, accountId, namespace, fetchImpl } = {}) {
		if (!apiToken) throw new Error('WfpApi: apiToken is required');
		if (!accountId) throw new Error('WfpApi: accountId is required');
		if (!namespace) throw new Error('WfpApi: namespace is required');
		// Stash token in a non-enumerable slot so JSON.stringify(instance) can't
		// leak it. The other fields are safe public config.
		Object.defineProperty(this, '_apiToken', {
			value: apiToken, enumerable: false, writable: false, configurable: false,
		});
		this.accountId = accountId;
		this.namespace = namespace;
		this._fetchImpl = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
		if (!this._fetchImpl) {
			throw new Error('WfpApi: no fetchImpl provided and globalThis.fetch is unavailable');
		}
		// Make the fetch ref non-enumerable too so it stays out of JSON.
		Object.defineProperty(this, '_fetchImpl', {
			value: this._fetchImpl, enumerable: false, writable: false, configurable: false,
		});
	}

	// ──────────────────────────────────────────────────────────────────────
	// Internal: low-level request + error normalization.
	// Every public method funnels through `_call`. Keep it tight.
	// ──────────────────────────────────────────────────────────────────────
	async _call(method, path, { headers, body, allowStatus } = {}) {
		const url = CF_API_BASE + path;
		const h = {
			Authorization: `Bearer ${this._apiToken}`,
			...(headers || {}),
		};
		// For non-FormData JSON bodies we set Content-Type here so callers
		// can pass a plain object. FormData sets its own boundary — leave
		// it alone.
		let finalBody = body;
		if (body && typeof body === 'object' && !(body instanceof FormData)) {
			finalBody = JSON.stringify(body);
			if (!h['Content-Type']) h['Content-Type'] = 'application/json';
		}
		let resp;
		try {
			resp = await this._fetchImpl(url, { method, headers: h, body: finalBody });
		} catch (e) {
			throw new WfpApiError('Cloudflare API request failed', {
				status: 0,
				code: 'CF_NETWORK_ERROR',
			});
		}
		const status = resp.status;
		let parsed = null;
		try {
			parsed = await resp.json();
		} catch (_e) {
			try {
				const text = await resp.text();
				parsed = { raw: text };
			} catch (_e2) {
				parsed = null;
			}
		}

		// The caller can opt into treating a non-2xx as a result (e.g. 404 on
		// delete is idempotent). Every other status code raises.
		if (!(status >= 200 && status < 300) && !(Array.isArray(allowStatus) && allowStatus.includes(status))) {
			const cfErrors = parsed && Array.isArray(parsed.errors) ? parsed.errors : [];
			const firstMsg = cfErrors[0]?.message || `HTTP ${status}`;
			// Sanitize: guarantee the message never contains the auth token.
			const safe = String(firstMsg).replace(new RegExp(this._apiToken, 'g'), '[redacted]');
			throw new WfpApiError(safe, {
				status,
				code: 'CF_API_ERROR',
				cfErrors,
			});
		}
		return { status, body: parsed };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.1 — uploadScript: multipart PUT with metadata + module files
	// ──────────────────────────────────────────────────────────────────────
	/**
	 * Upload a script bundle to the dispatch namespace.
	 *
	 * @param {object} p
	 * @param {string} p.scriptName          Slug under the namespace, e.g. 'deals-acme'
	 * @param {object} p.bundle              { 'src/index.js': '...', 'src/agents.js': '...', ... }
	 * @param {Array}  p.bindings            CF binding descriptors (d1, workflows, kv, service)
	 * @param {string} p.compatibilityDate   'YYYY-MM-DD'
	 * @param {string[]} [p.compatibilityFlags]
	 * @returns {Promise<{ok, status, result}>}
	 */
	async uploadScript({ scriptName, bundle, bindings = [], compatibilityDate, compatibilityFlags = ['nodejs_compat_v2'] }) {
		const form = new FormData();
		// Metadata part. CF requires this exact field name.
		const metadata = {
			main_module: 'src/index.js',
			bindings,
			compatibility_date: compatibilityDate,
			compatibility_flags: compatibilityFlags,
		};
		form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
		// Every bundle file becomes a form part. CF expects the module
		// files to have application/javascript+module content-type so the
		// runtime loader treats them as ESM.
		for (const [relPath, contents] of Object.entries(bundle || {})) {
			if (typeof contents !== 'string') continue;
			form.append(
				relPath,
				new Blob([contents], { type: 'application/javascript+module' }),
				relPath.split('/').pop(),
			);
		}
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts/${encodeURIComponent(scriptName)}`;
		const { status, body } = await this._call('PUT', path, { body: form });
		return { ok: true, status, result: body?.result || null };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.2 — provisionD1 with tenant-prefixed name + collision retry
	// ──────────────────────────────────────────────────────────────────────
	async provisionD1({ tenantSlug, appSlug }) {
		const baseName = d1NameFor(tenantSlug, appSlug);
		const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database`;
		const names = [baseName];
		// Up to 3 retries with a 4-hex collision suffix.
		for (let i = 0; i < 3; i++) {
			names.push(`${baseName}-${_randHex(4)}`);
		}
		let lastErr = null;
		for (const name of names) {
			try {
				const { body } = await this._call('POST', path, { body: { name } });
				const uuid = body?.result?.uuid;
				if (!uuid) {
					throw new WfpApiError('Cloudflare D1 response missing uuid', {
						status: 500,
						code: 'D1_PROVISION_MALFORMED',
					});
				}
				return { ok: true, d1_database_id: uuid, name };
			} catch (e) {
				lastErr = e;
				if (e.status !== 409) throw e;
				// 409 = name collision; try the next candidate.
			}
		}
		// Exhausted all 4 attempts.
		throw new WfpApiError('D1 database name collided 4 times in a row', {
			status: 409,
			code: 'D1_NAME_COLLISION',
			cfErrors: lastErr?.cfErrors || [],
		});
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.2b — listD1: list databases by name prefix
	// ──────────────────────────────────────────────────────────────────────
	async listD1({ namePrefix } = {}) {
		const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database`;
		const { body } = await this._call('GET', path);
		const all = Array.isArray(body?.result) ? body.result : [];
		const prefix = String(namePrefix || '');
		const filtered = prefix ? all.filter((d) => String(d?.name || '').startsWith(prefix)) : all;
		return { ok: true, databases: filtered };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.3 — applyMigrations: POST SQL to the D1 query endpoint
	// ──────────────────────────────────────────────────────────────────────
	async applyMigrations({ d1_database_id, sql }) {
		const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database/${encodeURIComponent(d1_database_id)}/query`;
		const { body } = await this._call('POST', path, { body: { sql } });
		return { ok: true, result: body?.result || [] };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.4 — setSecrets: one PUT per secret (concurrency 3)
	// ──────────────────────────────────────────────────────────────────────
	async setSecrets({ scriptName, secrets }) {
		const entries = Object.entries(secrets || {});
		if (entries.length === 0) return { ok: true, failed: [] };
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts/${encodeURIComponent(scriptName)}/secrets`;
		// Dispatch in chunks of 3 concurrent calls. Per-entry errors collect
		// into `failed` — we don't throw on a partial failure because the
		// orchestrator may want to roll back selectively.
		const concurrency = 3;
		const failed = [];
		for (let i = 0; i < entries.length; i += concurrency) {
			const batch = entries.slice(i, i + concurrency);
			await Promise.all(batch.map(async ([name, text]) => {
				try {
					await this._call('PUT', path, {
						body: { name, text, type: 'secret_text' },
					});
				} catch (e) {
					// Track ONLY the name + public error shape. Never the secret value.
					failed.push({ name, status: e.status || 0, code: e.code || 'SECRET_SET_FAILED' });
				}
			}));
		}
		return { ok: failed.length === 0, failed };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.5 — attachDomain: POST hostname to the script's domains endpoint
	// ──────────────────────────────────────────────────────────────────────
	async attachDomain({ scriptName, hostname }) {
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts/${encodeURIComponent(scriptName)}/domains`;
		try {
			const { body } = await this._call('POST', path, { body: { hostname } });
			return { ok: true, result: body?.result || null };
		} catch (e) {
			if (e.status === 409) {
				return { ok: false, code: 'DOMAIN_TAKEN', status: 409 };
			}
			return { ok: false, code: 'DOMAIN_ATTACH_FAILED', status: e.status || 0 };
		}
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.6 — deleteScript: DELETE the script (rollback path)
	// Idempotent — 404 means "already gone", treated as success.
	// ──────────────────────────────────────────────────────────────────────
	async deleteScript({ scriptName }) {
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts/${encodeURIComponent(scriptName)}`;
		const { status } = await this._call('DELETE', path, { allowStatus: [404] });
		if (status === 404) {
			return { ok: true, alreadyDeleted: true };
		}
		return { ok: true };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Cycle 7.12 — rollback: script versions API
	// Lists versions and promotes the previous one as the deployment target.
	// Kept here so `/api/rollback` has a single wrapper call to make.
	// ──────────────────────────────────────────────────────────────────────
	async listVersions({ scriptName }) {
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts/${encodeURIComponent(scriptName)}/versions`;
		const { body } = await this._call('GET', path);
		return { ok: true, versions: Array.isArray(body?.result) ? body.result : [] };
	}

	async rollbackToVersion({ scriptName, versionId }) {
		// CF exposes script-version deployment via a deployments endpoint.
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts/${encodeURIComponent(scriptName)}/deployments`;
		const { body } = await this._call('POST', path, {
			body: {
				strategy: 'percentage',
				versions: [{ version_id: versionId, percentage: 100 }],
			},
		});
		return { ok: true, result: body?.result || null };
	}

	// ──────────────────────────────────────────────────────────────────────
	// Small introspection helper: which dispatch namespace are we on?
	// Used by reconcile-wfp.js as a sanity check before listing scripts.
	// ──────────────────────────────────────────────────────────────────────
	async listScripts() {
		const path = `/accounts/${encodeURIComponent(this.accountId)}/workers/dispatch/namespaces/${encodeURIComponent(this.namespace)}/scripts`;
		const { body } = await this._call('GET', path);
		return { ok: true, scripts: Array.isArray(body?.result) ? body.result : [] };
	}
}
