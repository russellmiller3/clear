// Classify a proposed change between two Clear ASTs.
//
// Taxonomy (see plans/plan-live-editing-phase-a-04-18-2026.md):
//   additive    — adds a table/field/endpoint/page; nothing existing altered
//   reversible  — hides a field, renames (expand+copy+hide), relabels, reorders;
//                 data stays in place, one-click un-hide
//   destructive — physically removes a field/endpoint/page, changes a type
//                 incompatibly, or adds a required field without a default
//
// The classifier returns the worst severity across all detected changes.

const ADDITIVE = 'additive';
const REVERSIBLE = 'reversible';
const DESTRUCTIVE = 'destructive';

const SEVERITY_RANK = { additive: 0, reversible: 1, destructive: 2 };
const RANK_TO_SEVERITY = ['additive', 'reversible', 'destructive'];

function indexByKey(list, keyFn) {
	const map = new Map();
	for (const item of list) {
		map.set(keyFn(item), item);
	}
	return map;
}

function extractNodes(program) {
	const body = program && program.body ? program.body : [];
	return {
		tables: body.filter((n) => n.type === 'data_shape'),
		endpoints: body.filter((n) => n.type === 'endpoint'),
		pages: body.filter((n) => n.type === 'page'),
	};
}

function classifyFieldDiff(tableName, beforeField, afterField) {
	const changes = [];

	if (beforeField.fieldType !== afterField.fieldType) {
		changes.push({
			kind: 'change_type',
			severity: DESTRUCTIVE,
			table: tableName,
			field: afterField.name,
			from: beforeField.fieldType,
			to: afterField.fieldType,
		});
	}

	if (beforeField.name !== afterField.name) {
		changes.push({
			kind: 'rename_field',
			severity: REVERSIBLE,
			table: tableName,
			from: beforeField.name,
			to: afterField.name,
		});
	}

	if (!beforeField.hidden && afterField.hidden) {
		if (afterField.renamedTo) {
			changes.push({
				kind: 'rename_field',
				severity: REVERSIBLE,
				table: tableName,
				from: afterField.name,
				to: afterField.renamedTo,
			});
		} else {
			changes.push({
				kind: 'hide_field',
				severity: REVERSIBLE,
				table: tableName,
				field: afterField.name,
			});
		}
	}

	return changes;
}

function classifyTableFieldChanges(beforeTable, afterTable) {
	const changes = [];
	const beforeByName = indexByKey(beforeTable.fields, (f) => f.name);
	const afterByName = indexByKey(afterTable.fields, (f) => f.name);

	// New fields
	for (const [name, afterField] of afterByName) {
		if (beforeByName.has(name)) continue;
		// Required field with no default is destructive — breaks existing rows
		if (afterField.required && afterField.defaultValue == null) {
			changes.push({
				kind: 'require_without_default',
				severity: DESTRUCTIVE,
				table: afterTable.name,
				field: name,
			});
		} else {
			changes.push({
				kind: 'add_field',
				severity: ADDITIVE,
				table: afterTable.name,
				field: name,
				fieldType: afterField.fieldType,
			});
		}
	}

	// Removed or modified fields
	for (const [name, beforeField] of beforeByName) {
		const afterField = afterByName.get(name);
		if (!afterField) {
			// Not present by name — may be a rename (new field marked with
			// matching renamedTo on the hidden version), or a physical removal.
			const renamedTarget = [...afterByName.values()].find(
				(f) => f.hidden && f.renamedTo && f.name === beforeField.name,
			);
			if (!renamedTarget) {
				// Check whether a hidden same-named field exists in `after` under
				// a different name via renamedTo — if so, treat as rename.
				// Otherwise, physical removal => destructive.
				changes.push({
					kind: 'remove_field',
					severity: DESTRUCTIVE,
					table: beforeTable.name,
					field: name,
				});
			}
			continue;
		}
		changes.push(...classifyFieldDiff(beforeTable.name, beforeField, afterField));
	}

	return changes;
}

export function classifyChange(beforeProgram, afterProgram) {
	const before = extractNodes(beforeProgram);
	const after = extractNodes(afterProgram);
	const changes = [];

	// Tables
	const bTables = indexByKey(before.tables, (t) => t.name);
	const aTables = indexByKey(after.tables, (t) => t.name);
	for (const [name, tbl] of aTables) {
		if (!bTables.has(name)) {
			changes.push({ kind: 'add_table', severity: ADDITIVE, table: name });
		}
	}
	for (const [name, tbl] of bTables) {
		if (!aTables.has(name)) {
			changes.push({ kind: 'remove_table', severity: DESTRUCTIVE, table: name });
			continue;
		}
		changes.push(...classifyTableFieldChanges(tbl, aTables.get(name)));
	}

	// Endpoints
	const endpointKey = (e) => `${e.method} ${e.path}`;
	const bEndpoints = indexByKey(before.endpoints, endpointKey);
	const aEndpoints = indexByKey(after.endpoints, endpointKey);
	for (const [key, ep] of aEndpoints) {
		if (!bEndpoints.has(key)) {
			changes.push({
				kind: 'add_endpoint',
				severity: ADDITIVE,
				method: ep.method,
				path: ep.path,
			});
		}
	}
	for (const [key, ep] of bEndpoints) {
		if (!aEndpoints.has(key)) {
			changes.push({
				kind: 'remove_endpoint',
				severity: DESTRUCTIVE,
				method: ep.method,
				path: ep.path,
			});
		}
	}

	// Pages
	const pageKey = (p) => p.title;
	const bPages = indexByKey(before.pages, pageKey);
	const aPages = indexByKey(after.pages, pageKey);
	for (const [key, pg] of aPages) {
		if (!bPages.has(key)) {
			changes.push({
				kind: 'add_page',
				severity: ADDITIVE,
				title: pg.title,
				route: pg.route || null,
			});
		}
	}
	for (const [key, pg] of bPages) {
		if (!aPages.has(key)) {
			changes.push({
				kind: 'remove_page',
				severity: DESTRUCTIVE,
				title: pg.title,
			});
		}
	}

	// Severity = worst change. Empty changes => additive (no-op).
	let worst = 0;
	for (const c of changes) {
		const rank = SEVERITY_RANK[c.severity];
		if (rank > worst) worst = rank;
	}
	return { type: RANK_TO_SEVERITY[worst], changes };
}
