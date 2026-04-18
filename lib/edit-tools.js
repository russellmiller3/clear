// Restricted edit tools available to Meph in widget mode.
//
// Phase A: three tools only, all additive-by-construction:
//   proposeAddField({table, fieldLine})     — inserts a field into a table block
//   proposeAddEndpoint({block})             — appends a new endpoint block
//   proposeAddPage({block})                 — appends a new page block
//
// Every tool:
//   1. Mutates the source string by insertion, never by rewrite
//   2. Parses the result to produce a new AST
//   3. Runs the change classifier against before/after
//   4. Returns ok:false if the classifier reports anything but 'additive'
//
// This gives us two layers of safety — the tool can only *add*, and the
// classifier independently confirms the diff is purely additive.

import { parse } from '../parser.js';
import { classifyChange } from './change-classifier.js';

function problem(error) {
	return { ok: false, error };
}

function ok(newSource, diff, classification) {
	return { ok: true, newSource, diff, classification };
}

function ensureTrailingNewline(s) {
	return s.endsWith('\n') ? s : s + '\n';
}

// ---------------------------------------------------------------------------
// proposeAddField
// ---------------------------------------------------------------------------

function findTableBlock(source, tableName) {
	const lines = source.split('\n');
	const headerPattern = new RegExp(
		`^(\\s*)create\\s+(a|an|the)\\s+${tableName}\\s+table\\s*:\\s*$`,
		'i',
	);
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(headerPattern);
		if (m) {
			return { headerIdx: i, headerIndent: m[1] };
		}
	}
	return null;
}

function detectBlockIndent(lines, headerIdx, headerIndent) {
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') continue;
		const leading = line.match(/^(\s*)/)[1];
		if (leading.length > headerIndent.length) return leading;
		return null; // block has no fields
	}
	return null;
}

function findBlockEnd(lines, headerIdx, headerIndent) {
	// Walk forward; the block ends at the first non-blank line whose indent
	// is <= headerIndent.
	let lastBodyIdx = headerIdx;
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') {
			continue; // blank lines are in-block-or-boundary, ambiguous
		}
		const leading = line.match(/^(\s*)/)[1];
		if (leading.length > headerIndent.length) {
			lastBodyIdx = i;
		} else {
			return lastBodyIdx;
		}
	}
	return lastBodyIdx;
}

export function proposeAddField(source, { table, fieldLine }) {
	if (!table || !fieldLine) return problem('table and fieldLine are required');

	const located = findTableBlock(source, table);
	if (!located) return problem(`table '${table}' not found`);

	const beforeAst = parse(source);
	const existingTable = (beforeAst.body || []).find(
		(n) => n.type === 'data_shape' && n.name === table,
	);
	if (!existingTable) return problem(`table '${table}' not found in AST`);

	const newFieldName = fieldLine.split(/[\s,(]/)[0].trim();
	if (existingTable.fields.some((f) => f.name === newFieldName)) {
		return problem(`field '${newFieldName}' already exists on ${table}`);
	}

	const lines = ensureTrailingNewline(source).split('\n');
	const blockIndent =
		detectBlockIndent(lines, located.headerIdx, located.headerIndent) ||
		located.headerIndent + '  ';
	const blockEnd = findBlockEnd(lines, located.headerIdx, located.headerIndent);
	lines.splice(blockEnd + 1, 0, blockIndent + fieldLine);
	const newSource = lines.join('\n');

	const afterAst = parse(newSource);
	const classification = classifyChange(beforeAst, afterAst);
	if (classification.type !== 'additive') {
		const kinds = classification.changes.map((c) => c.kind).join(', ');
		return problem(
			`change would be ${classification.type} (${kinds}), not additive`,
		);
	}

	const diff = `+ ${blockIndent}${fieldLine}`;
	return ok(newSource, diff, classification);
}

// ---------------------------------------------------------------------------
// proposeAddEndpoint
// ---------------------------------------------------------------------------

export function proposeAddEndpoint(source, { block }) {
	if (!block || typeof block !== 'string') return problem('block is required');

	const blockAst = parse(block);
	const blockEndpoints = (blockAst.body || []).filter((n) => n.type === 'endpoint');
	if (blockEndpoints.length === 0) {
		return problem('block does not contain an endpoint definition');
	}

	const beforeAst = parse(source);
	const existingEndpoints = new Set(
		(beforeAst.body || [])
			.filter((n) => n.type === 'endpoint')
			.map((n) => `${n.method} ${n.path}`),
	);
	for (const ep of blockEndpoints) {
		const key = `${ep.method} ${ep.path}`;
		if (existingEndpoints.has(key)) {
			return problem(`endpoint ${key} already exists`);
		}
	}

	const newSource = ensureTrailingNewline(source) + '\n' + ensureTrailingNewline(block);
	const afterAst = parse(newSource);
	const classification = classifyChange(beforeAst, afterAst);
	if (classification.type !== 'additive') {
		return problem(`change would be ${classification.type}, not additive`);
	}

	const diff = block
		.split('\n')
		.map((l) => '+ ' + l)
		.join('\n');
	return ok(newSource, diff, classification);
}

// ---------------------------------------------------------------------------
// proposeAddPage
// ---------------------------------------------------------------------------

export function proposeAddPage(source, { block }) {
	if (!block || typeof block !== 'string') return problem('block is required');

	const blockAst = parse(block);
	const blockPages = (blockAst.body || []).filter((n) => n.type === 'page');
	if (blockPages.length === 0) {
		return problem('block does not contain a page definition');
	}

	const beforeAst = parse(source);
	const existingTitles = new Set(
		(beforeAst.body || [])
			.filter((n) => n.type === 'page')
			.map((n) => n.title),
	);
	for (const pg of blockPages) {
		if (existingTitles.has(pg.title)) {
			return problem(`page '${pg.title}' already exists`);
		}
	}

	const newSource = ensureTrailingNewline(source) + '\n' + ensureTrailingNewline(block);
	const afterAst = parse(newSource);
	const classification = classifyChange(beforeAst, afterAst);
	if (classification.type !== 'additive') {
		return problem(`change would be ${classification.type}, not additive`);
	}

	const diff = block
		.split('\n')
		.map((l) => '+ ' + l)
		.join('\n');
	return ok(newSource, diff, classification);
}
