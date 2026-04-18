// playground/sanitize.js
// Single home for input validation that hits untrusted strings. Everything
// that eventually becomes a Fly app name, a domain, a tenant slug, or a
// shell argument goes through here first. Sanitizers throw structured
// errors (code + input) so callers can map them to precise HTTP responses
// without leaking regex details to end users.

export class ValidationError extends Error {
	constructor(code, input) {
		super(`${code}: ${input}`);
		this.code = code;
		this.input = input;
	}
}

// Fly accepts lowercase alphanumeric + hyphen, 3–63 chars. We're stricter
// in both directions: reject consecutive hyphens at the boundaries (they
// look like negotiation flags and confuse some CLIs) but allow them in
// the middle.
export function sanitizeAppName(s) {
	if (typeof s !== 'string') throw new ValidationError('INVALID_APP_NAME', s);
	if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(s)) {
		throw new ValidationError('INVALID_APP_NAME', s);
	}
	return s;
}

// App slug is what the customer types; we tighten the same rules. Used
// before we build the full app name so we fail at Studio, not at Fly.
export function sanitizeAppSlug(s) {
	if (typeof s !== 'string') throw new ValidationError('INVALID_APP_SLUG', s);
	if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(s)) {
		throw new ValidationError('INVALID_APP_SLUG', s);
	}
	return s;
}

export function sanitizeTenantSlug(s) {
	if (typeof s !== 'string') throw new ValidationError('INVALID_TENANT_SLUG', s);
	if (!/^clear-[a-f0-9]{6,}$/.test(s)) throw new ValidationError('INVALID_TENANT_SLUG', s);
	return s;
}

export function sanitizeDomain(s) {
	if (typeof s !== 'string') throw new ValidationError('INVALID_DOMAIN', s);
	const trimmed = s.trim().toLowerCase();
	// RFC 1035-ish: labels of a-z 0-9 -, TLD at least 2 chars, no leading/trailing hyphens
	if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(trimmed)) {
		throw new ValidationError('INVALID_DOMAIN', s);
	}
	return trimmed;
}

// Ownership: every app we ever create has the form `clear-<tenantSlug>-...`.
// The tenant slug is at the start of the Fly app name. If the current
// tenant isn't the owner, we refuse to operate on the app.
export function assertOwnership(tenantSlug, appName) {
	if (!appName || !appName.startsWith(`clear-${tenantSlug.replace(/^clear-/, '')}-`)) {
		throw new ValidationError('CROSS_TENANT', appName);
	}
	return true;
}

// Returns a short error code for a ValidationError, or 'UNKNOWN' otherwise.
// Used by endpoint handlers to translate throws to JSON bodies without a
// try/catch that swallows the structured fields.
export function errorCode(e) {
	if (e && e.code) return e.code;
	return 'UNKNOWN';
}
