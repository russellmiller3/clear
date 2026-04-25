// Phase C edit tools — destructive proposals.
//
// proposeRemoveField: splice a field's source line out of its table block,
// re-parse, and verify the classifier says exactly one `remove_field`
// destructive change. Pure-function: takes source string in, returns
// proposal data out. No file I/O, no DB, no destruction yet — that lands
// at the ship endpoint with the typed-confirmation gate (Phase C cycle 4).
//
// Defense in depth: same shape as proposeHideField in edit-tools-phase-b.
// We never trust the string splice alone; the round-trip through the parser
// and classifier is what makes the result trustworthy. If anything other
// than a single `remove_field` shows up, we reject — splicing a line
// shouldn't mutate anything else, so a surprise change kind means our
// understanding of the source diverged from reality.

import { parse } from '../parser.js';
import { classifyChange } from './change-classifier.js';
import {
	ensureTrailingNewline,
	findTableBlock,
	findFieldLine,
	tableAst,
} from './edit-tools-shared.js';

// Names treated as primary-key — refusing to remove these protects the user
// from a class of self-destruction the runtime can't recover from. Clear
// auto-injects `id INTEGER PRIMARY KEY AUTOINCREMENT` at compile time, so
// `id` is reserved by convention. If a user has explicitly written `id` as
// a field, removing it is still destructive in the worst way (orphans every
// row reference). Keep this list small and obvious.
const PK_LIKE_FIELDS = new Set(['id']);

function problem(error) {
	return { ok: false, error };
}

export function proposeRemoveField(source, { table, field } = {}) {
	if (!table || !field) return problem('table and field are required');

	if (PK_LIKE_FIELDS.has(field)) {
		return problem(
			`cannot remove primary-key field '${field}' — it identifies every row`,
		);
	}

	const located = findTableBlock(source, table);
	if (!located) return problem(`table '${table}' not found`);

	const beforeAst = parse(source);
	const beforeTable = tableAst(beforeAst, table);
	if (!beforeTable) return problem(`table '${table}' not found in AST`);
	const beforeField = beforeTable.fields.find((f) => f.name === field);
	if (!beforeField) return problem(`field '${field}' not found on ${table}`);

	const lines = ensureTrailingNewline(source).split('\n');
	const fieldIdx = findFieldLine(lines, located.headerIdx, located.headerIndent, field);
	if (fieldIdx < 0) {
		return problem(`could not locate source line for field '${field}'`);
	}

	const origLine = lines[fieldIdx];
	// Splice the field's line out — same array that was just split.
	lines.splice(fieldIdx, 1);
	const newSource = lines.join('\n');

	const afterAst = parse(newSource);
	const classification = classifyChange(beforeAst, afterAst);

	// Defense in depth: only accept if the classifier confirms exactly one
	// destructive `remove_field` change. Anything else means the splice
	// somehow produced a wider diff than expected.
	if (classification.type !== 'destructive') {
		return problem(
			`expected destructive classification, got '${classification.type}'`,
		);
	}
	if (
		classification.changes.length !== 1 ||
		classification.changes[0].kind !== 'remove_field'
	) {
		const kinds = classification.changes.map((c) => c.kind).join(', ');
		return problem(
			`expected a single remove_field change, got: ${kinds || '(none)'}`,
		);
	}

	return {
		ok: true,
		newSource,
		diff: `- ${origLine}`,
		classification,
	};
}
