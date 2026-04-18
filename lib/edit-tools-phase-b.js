// Phase B edit tools — hide a field, rename a field.
//
// Hide = append `, hidden` to the field's line. Data stays in the DB,
// UI stops showing it, one-click un-hide by removing the marker.
//
// Rename = expand (add new field) + hide (mark old with hidden + renamedTo).
// Phase C will add a data-copy step that runs at migration time; for now
// the rename tool only emits the AST-level intent. Classifier sees both
// the add and the hide and reports the change as reversible.

import { parse } from '../parser.js';
import { classifyChange } from './change-classifier.js';

function problem(error) {
	return { ok: false, error };
}
function ensureTrailingNewline(s) {
	return s.endsWith('\n') ? s : s + '\n';
}

function findTableBlock(source, tableName) {
	const lines = source.split('\n');
	const headerPattern = new RegExp(
		`^(\\s*)create\\s+(a|an|the)\\s+${tableName}\\s+table\\s*:\\s*$`,
		'i',
	);
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(headerPattern);
		if (m) return { headerIdx: i, headerIndent: m[1] };
	}
	return null;
}

function findFieldLine(lines, headerIdx, headerIndent, fieldName) {
	const fieldPattern = new RegExp(
		`^${headerIndent}\\s+(${fieldName})(\\b[^\\n]*)?$`,
	);
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') continue;
		const leading = line.match(/^(\s*)/)[1];
		if (leading.length <= headerIndent.length) return -1;
		const m = line.match(fieldPattern);
		if (m) return i;
	}
	return -1;
}

function detectBlockIndent(lines, headerIdx, headerIndent) {
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') continue;
		const leading = line.match(/^(\s*)/)[1];
		if (leading.length > headerIndent.length) return leading;
		return null;
	}
	return null;
}

function findBlockEnd(lines, headerIdx, headerIndent) {
	let lastBodyIdx = headerIdx;
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') continue;
		const leading = line.match(/^(\s*)/)[1];
		if (leading.length > headerIndent.length) lastBodyIdx = i;
		else return lastBodyIdx;
	}
	return lastBodyIdx;
}

function tableAst(program, tableName) {
	return (program.body || []).find(
		(n) => n.type === 'data_shape' && n.name === tableName,
	);
}

// ---------------------------------------------------------------------------
// proposeHideField
// ---------------------------------------------------------------------------

export function proposeHideField(source, { table, field }) {
	if (!table || !field) return problem('table and field are required');

	const located = findTableBlock(source, table);
	if (!located) return problem(`table '${table}' not found`);

	const beforeAst = parse(source);
	const beforeTable = tableAst(beforeAst, table);
	if (!beforeTable) return problem(`table '${table}' not found in AST`);
	const beforeField = beforeTable.fields.find((f) => f.name === field);
	if (!beforeField) return problem(`field '${field}' not found on ${table}`);
	if (beforeField.hidden) return problem(`field '${field}' is already hidden`);

	const lines = ensureTrailingNewline(source).split('\n');
	const fieldIdx = findFieldLine(lines, located.headerIdx, located.headerIndent, field);
	if (fieldIdx < 0) {
		return problem(`could not locate source line for field '${field}'`);
	}

	const orig = lines[fieldIdx];
	const trimmed = orig.replace(/\s+$/, '');
	lines[fieldIdx] = trimmed + ', hidden';
	const newSource = lines.join('\n');

	const afterAst = parse(newSource);
	const classification = classifyChange(beforeAst, afterAst);
	if (classification.type === 'destructive') {
		return problem(
			'hide produced a destructive classification: ' +
				classification.changes.map((c) => c.kind).join(', '),
		);
	}
	return {
		ok: true,
		newSource,
		diff: `- ${orig}\n+ ${lines[fieldIdx]}`,
		classification,
	};
}

// ---------------------------------------------------------------------------
// proposeRenameField  (= add new field + hide old with renamedTo marker)
// ---------------------------------------------------------------------------

export function proposeRenameField(source, { table, from, to }) {
	if (!table || !from || !to) {
		return problem('table, from, and to are required');
	}

	const located = findTableBlock(source, table);
	if (!located) return problem(`table '${table}' not found`);

	const beforeAst = parse(source);
	const beforeTable = tableAst(beforeAst, table);
	if (!beforeTable) return problem(`table '${table}' not found in AST`);

	const fromField = beforeTable.fields.find((f) => f.name === from);
	if (!fromField) return problem(`field '${from}' not found on ${table}`);

	if (beforeTable.fields.some((f) => f.name === to)) {
		return problem(`field '${to}' already exists on ${table}`);
	}

	const lines = ensureTrailingNewline(source).split('\n');
	const fieldIdx = findFieldLine(lines, located.headerIdx, located.headerIndent, from);
	if (fieldIdx < 0) {
		return problem(`could not locate source line for field '${from}'`);
	}

	const origLine = lines[fieldIdx];
	const trimmed = origLine.replace(/\s+$/, '');
	lines[fieldIdx] = `${trimmed}, hidden, renamed to ${to}`;

	const blockIndent =
		detectBlockIndent(lines, located.headerIdx, located.headerIndent) ||
		located.headerIndent + '  ';
	const blockEnd = findBlockEnd(lines, located.headerIdx, located.headerIndent);

	// Mirror the old field's type but without required (new field starts empty)
	let newLine = blockIndent + to;
	if (fromField.fieldType && fromField.fieldType !== 'text' && fromField.fieldType !== 'fk') {
		newLine += ` (${fromField.fieldType})`;
	}
	lines.splice(blockEnd + 1, 0, newLine);

	const newSource = lines.join('\n');
	const afterAst = parse(newSource);
	const classification = classifyChange(beforeAst, afterAst);
	if (classification.type === 'destructive') {
		return problem(
			'rename produced a destructive classification: ' +
				classification.changes.map((c) => c.kind).join(', '),
		);
	}
	return {
		ok: true,
		newSource,
		diff:
			`- ${origLine}\n+ ${lines[fieldIdx]}\n+ ${newLine}`,
		classification,
	};
}
