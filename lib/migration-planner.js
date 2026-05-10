// Migration planner — rename detection (LAE Phase C cycle 7).
//
// Pure function. Looks at the classifier's changes for a single
// remove_field paired with an add_field on the same table. When the
// pair exists, surface it as a rename candidate with two options:
//   keep    — copy old values into the new column, then drop the old
//   discard — drop the old column outright; new column starts empty
//
// Wider negotiation (split / coerce / archive) is Phase D-or-later.
// This is the simplest cycle that lets the widget say "looks like a
// rename — copy the values?" instead of letting Marcus drop data
// when he meant to rename a field.

import { classifyChange } from './change-classifier.js';

function tableField(program, tableName, fieldName) {
	const body = program && Array.isArray(program.body) ? program.body : [];
	const table = body.find((n) => n && n.type === 'data_shape' && n.name === tableName);
	if (!table || !Array.isArray(table.fields)) return null;
	return table.fields.find((f) => f && f.name === fieldName) || null;
}

export function planRename({ beforeProgram = null, afterProgram = null } = {}) {
	if (!beforeProgram || !afterProgram) return { detected: null };

	let classification;
	try {
		classification = classifyChange(beforeProgram, afterProgram);
	} catch {
		return { detected: null };
	}
	if (!classification || !Array.isArray(classification.changes)) {
		return { detected: null };
	}

	const removed = classification.changes.find((c) => c && c.kind === 'remove_field');
	if (!removed) return { detected: null };

	const added = classification.changes.find(
		(c) => c && c.kind === 'add_field' && c.table === removed.table,
	);
	if (!added) return { detected: null };

	const beforeField = tableField(beforeProgram, removed.table, removed.field);
	const fromType = beforeField ? beforeField.fieldType : null;
	const toType = added.fieldType || null;

	const result = {
		detected: 'rename',
		from: removed.field,
		to: added.field,
		table: removed.table,
		options: [
			{
				id: 'keep',
				label: `Copy ${removed.field} values into ${added.field}, then drop ${removed.field}`,
			},
			{
				id: 'discard',
				label: `Drop ${removed.field}, leave ${added.field} empty`,
			},
		],
	};

	if (fromType && toType && fromType !== toType) {
		result.warning = `type mismatch: ${removed.field} was ${fromType}, ${added.field} is ${toType}`;
	}

	return result;
}
