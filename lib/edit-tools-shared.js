// Shared helpers for the LAE propose-tools (Phase B + Phase C).
//
// These are pure-string + AST primitives that locate a table block in
// source by name and a single field line within that block. Phase B
// (hide / rename) and Phase C (remove field, drop endpoint, change type)
// both need them — keeping them here means one source of truth for
// "where does this field live in the source?" and any future fix
// (e.g. tabs vs spaces, comments inside blocks) lands in one place.

export function ensureTrailingNewline(s) {
	return s.endsWith('\n') ? s : s + '\n';
}

// Locate a `create [a|an|the] <Name> table:` header in the source.
// Returns { headerIdx, headerIndent } or null.
export function findTableBlock(source, tableName) {
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

// Find the line index of a field within a table block. Returns -1 if not found.
// Stops scanning when the indent drops back to (or below) the header's indent.
export function findFieldLine(lines, headerIdx, headerIndent, fieldName) {
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

// Detect the body indent (e.g. two spaces) inside a table block by reading
// the first non-blank child line. Returns null if the block is empty.
export function detectBlockIndent(lines, headerIdx, headerIndent) {
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') continue;
		const leading = line.match(/^(\s*)/)[1];
		if (leading.length > headerIndent.length) return leading;
		return null;
	}
	return null;
}

// Last line index that still belongs to the table's body (for inserts).
export function findBlockEnd(lines, headerIdx, headerIndent) {
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

// Look up a data_shape AST node by name. Returns the node or undefined.
export function tableAst(program, tableName) {
	return (program.body || []).find(
		(n) => n.type === 'data_shape' && n.name === tableName,
	);
}
