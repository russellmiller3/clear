// LAE Phase C cycle 4 — typed-confirmation phrase generator.
//
// Single source of truth for the canonical confirmation phrase for any
// destructive change. Imported by the ship endpoint to gate the request,
// and (inlined into) the widget to render the placeholder. If both sides
// derive the phrase from THE SAME helper, owner-typed input matching the
// placeholder will always satisfy the API check — no drift possible.
//
// Phrases use plain English verbs (DELETE / COERCE) instead of SQL DROP.
// Owners are not database engineers; the reading-friction comes from
// having to type the exact sentence, not from learning DBA jargon. See
// plan-lae-phase-c-04-25-2026.md locked-in decision #1.

// Map a destructive change into the exact confirmation phrase the owner
// must type to ship it. Returns null if the classification has no
// destructive change OR if the change kind has no phrase pattern (the
// caller treats null as "refuse — no canonical phrase").
export function requiredConfirmation(classification) {
	if (!classification) return null;
	if (!Array.isArray(classification.changes) || classification.changes.length === 0) return null;
	const change = classification.changes[0];
	if (!change || !change.kind) return null;

	switch (change.kind) {
		case 'remove_field':
			if (!change.field) return null;
			return `DELETE field ${change.field}`;
		case 'remove_endpoint':
			if (!change.method || !change.path) return null;
			return `DELETE endpoint ${change.method} ${change.path}`;
		case 'remove_page':
			if (!change.title) return null;
			return `DELETE page "${change.title}"`;
		case 'remove_table':
			if (!change.table) return null;
			return `DELETE table ${change.table}`;
		case 'change_type':
			if (!change.table || !change.field || !change.from || !change.to) return null;
			return `COERCE ${change.table}.${change.field} from ${change.from} to ${change.to}`;
		default:
			return null;
	}
}
