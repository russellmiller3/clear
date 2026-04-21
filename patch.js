// =============================================================================
// CLEAR LANGUAGE — PROGRAM DIFF / PATCH API
// =============================================================================
//
// PURPOSE: Structured edits to a Clear program. Instead of rewriting the whole
// file, an AI agent can issue patch operations like "add endpoint" or "fix line."
//
// This is the ACTION SPACE for RL training — each episode is a sequence of
// patch operations that transform a skeleton into a working program.
//
// USAGE:
//   import { patch } from './patch.js';
//   const result = patch(source, [
//     { op: 'add_endpoint', method: 'GET', path: '/api/health', body: "send back 'OK'" },
//     { op: 'add_field', table: 'User', field: 'email', constraints: 'required, unique, email' },
//     { op: 'fix_line', line: 7, replacement: "  send back user" },
//   ]);
//   // result: { source: "...", applied: 3, skipped: 0, errors: [] }
//
// TABLE OF CONTENTS:
//   1. patch() .............. main entry point, applies ops in order
//   2. op: add_endpoint ..... append an endpoint block
//   3. op: add_field ........ add a field to an existing table
//   4. op: remove_field ..... remove a field from a table
//   5. op: add_test ......... append a test block
//   6. op: fix_line ......... replace a specific line
//   7. op: insert_line ...... insert a line at a position
//   8. op: remove_line ...... delete a specific line
//   9. op: add_validation ... add validation rules to an endpoint
//  10. op: add_table ........ add a new data shape / table
//  11. op: add_agent ........ add an agent definition
// =============================================================================

/**
 * Apply a sequence of patch operations to a Clear source program.
 * Operations are applied in order. Each op modifies the source for the next.
 *
 * @param {string} source - The Clear source code
 * @param {Array<Object>} ops - Array of patch operations
 * @returns {{ source: string, applied: number, skipped: number, errors: string[] }}
 */
export function patch(source, ops) {
  let lines = source.split('\n');
  let applied = 0;
  let skipped = 0;
  const errors = [];

  for (const op of ops) {
    try {
      const result = applyOp(lines, op);
      if (result.ok) {
        lines = result.lines;
        applied++;
      } else {
        skipped++;
        errors.push(result.error);
      }
    } catch (err) {
      skipped++;
      errors.push(`${op.op}: ${err.message}`);
    }
  }

  return { source: lines.join('\n'), applied, skipped, errors };
}

function applyOp(lines, op) {
  switch (op.op) {
    case 'add_endpoint': return addEndpoint(lines, op);
    case 'add_field': return addField(lines, op);
    case 'remove_field': return removeField(lines, op);
    case 'add_test': return addTest(lines, op);
    case 'fix_line': return fixLine(lines, op);
    case 'insert_line': return insertLine(lines, op);
    case 'remove_line': return removeLine(lines, op);
    case 'add_validation': return addValidation(lines, op);
    case 'add_table': return addTable(lines, op);
    case 'add_agent': return addAgent(lines, op);
    default:
      return { ok: false, error: `Unknown op: ${op.op}` };
  }
}

// ── add_endpoint ──────────────────────────────────────────────────────────────
// { op: 'add_endpoint', method: 'GET', path: '/api/health', body: "send back 'OK'" }
// body can be a string (single line) or array of strings (multi-line)
function addEndpoint(lines, op) {
  if (!op.method || !op.path) return { ok: false, error: 'add_endpoint requires method and path' };
  const method = op.method.toUpperCase();
  const receiving = op.receiving ? ` receiving ${op.receiving}` : '';
  const header = `when user calls ${method} ${op.path}${receiving}:`;
  const bodyLines = Array.isArray(op.body) ? op.body : (op.body || '').split('\n');
  const indented = bodyLines.map(l => '  ' + l);

  // Check for duplicate
  const existing = lines.findIndex(l => l.includes(op.path) && l.toLowerCase().includes(method.toLowerCase()));
  if (existing !== -1) return { ok: false, error: `Endpoint ${method} ${op.path} already exists at line ${existing + 1}` };

  const newLines = [...lines, '', header, ...indented];
  return { ok: true, lines: newLines };
}

// ── add_field ─────────────────────────────────────────────────────────────────
// { op: 'add_field', table: 'User', field: 'email', constraints: 'required, unique' }
function addField(lines, op) {
  if (!op.table || !op.field) return { ok: false, error: 'add_field requires table and field' };

  // Find the table definition line
  const tableIdx = lines.findIndex(l =>
    l.toLowerCase().includes(`${op.table.toLowerCase()} table`) ||
    l.toLowerCase().includes(op.table.toLowerCase() + 's table')
  );
  if (tableIdx === -1) return { ok: false, error: `Table '${op.table}' not found` };

  // Find the last field line (indented lines after the table header)
  let lastFieldIdx = tableIdx;
  for (let i = tableIdx + 1; i < lines.length; i++) {
    if (lines[i].match(/^\s+\S/) && !lines[i].match(/^\S/)) {
      lastFieldIdx = i;
    } else if (lines[i].trim() === '') {
      // Allow blank lines within the block
      continue;
    } else {
      break;
    }
  }

  const constraint = op.constraints ? `, ${op.constraints}` : '';
  const newLine = `  ${op.field}${constraint}`;

  // Check if field already exists
  for (let i = tableIdx + 1; i <= lastFieldIdx; i++) {
    if (lines[i].trim().startsWith(op.field)) {
      return { ok: false, error: `Field '${op.field}' already exists in table '${op.table}'` };
    }
  }

  const newLines = [...lines];
  newLines.splice(lastFieldIdx + 1, 0, newLine);
  return { ok: true, lines: newLines };
}

// ── remove_field ──────────────────────────────────────────────────────────────
// { op: 'remove_field', table: 'User', field: 'email' }
function removeField(lines, op) {
  if (!op.table || !op.field) return { ok: false, error: 'remove_field requires table and field' };

  const tableIdx = lines.findIndex(l =>
    l.toLowerCase().includes(`${op.table.toLowerCase()} table`)
  );
  if (tableIdx === -1) return { ok: false, error: `Table '${op.table}' not found` };

  for (let i = tableIdx + 1; i < lines.length; i++) {
    if (lines[i].match(/^\S/) && i > tableIdx + 1) break;
    if (lines[i].trim().startsWith(op.field)) {
      const newLines = [...lines];
      newLines.splice(i, 1);
      return { ok: true, lines: newLines };
    }
  }
  return { ok: false, error: `Field '${op.field}' not found in table '${op.table}'` };
}

// ── add_test ──────────────────────────────────────────────────────────────────
// { op: 'add_test', name: 'create user', body: ["call POST /api/users with name is 'Alice'", "expect response status is 201"] }
function addTest(lines, op) {
  if (!op.name || !op.body) return { ok: false, error: 'add_test requires name and body' };
  const bodyLines = Array.isArray(op.body) ? op.body : [op.body];
  const indented = bodyLines.map(l => l.startsWith('  ') ? l : '  ' + l);
  const newLines = [...lines, '', `test '${op.name}':`, ...indented];
  return { ok: true, lines: newLines };
}

// ── fix_line ──────────────────────────────────────────────────────────────────
// { op: 'fix_line', line: 7, replacement: "  send back user" }
function fixLine(lines, op) {
  if (!op.line || !op.replacement) return { ok: false, error: 'fix_line requires line and replacement' };
  const idx = op.line - 1; // 1-based to 0-based
  if (idx < 0 || idx >= lines.length) return { ok: false, error: `Line ${op.line} out of range (1-${lines.length})` };
  const newLines = [...lines];
  newLines[idx] = op.replacement;
  return { ok: true, lines: newLines };
}

// ── insert_line ───────────────────────────────────────────────────────────────
// { op: 'insert_line', after: 5, content: "  validate todo:" }
function insertLine(lines, op) {
  if (op.after == null || !op.content) return { ok: false, error: 'insert_line requires after and content' };
  const idx = op.after; // insert after this line (1-based), so index = op.after
  if (idx < 0 || idx > lines.length) return { ok: false, error: `Line ${op.after} out of range` };
  const newLines = [...lines];
  const contentLines = Array.isArray(op.content) ? op.content : [op.content];
  newLines.splice(idx, 0, ...contentLines);
  return { ok: true, lines: newLines };
}

// ── remove_line ───────────────────────────────────────────────────────────────
// { op: 'remove_line', line: 7 }
function removeLine(lines, op) {
  if (!op.line) return { ok: false, error: 'remove_line requires line' };
  const idx = op.line - 1;
  if (idx < 0 || idx >= lines.length) return { ok: false, error: `Line ${op.line} out of range` };
  const newLines = [...lines];
  newLines.splice(idx, 1);
  return { ok: true, lines: newLines };
}

// ── add_validation ────────────────────────────────────────────────────────────
// { op: 'add_validation', path: '/api/users', rules: ['name must not be empty', 'email must be a valid email'] }
function addValidation(lines, op) {
  if (!op.path || !op.rules) return { ok: false, error: 'add_validation requires path and rules' };

  // Find the endpoint
  const epIdx = lines.findIndex(l => l.includes(op.path) && l.includes(':'));
  if (epIdx === -1) return { ok: false, error: `Endpoint with path '${op.path}' not found` };

  // Find the receiving var name from the endpoint line
  const match = lines[epIdx].match(/receiving\s+(\w+)/);
  const varName = match ? match[1] : 'data';

  // Insert validation block right after the endpoint header
  const newLines = [...lines];
  const validationLines = [
    `  validate ${varName}:`,
    ...op.rules.map(r => `    ${r}`)
  ];
  newLines.splice(epIdx + 1, 0, ...validationLines);
  return { ok: true, lines: newLines };
}

// ── add_table ─────────────────────────────────────────────────────────────────
// { op: 'add_table', name: 'Users', fields: [{ name: 'email', constraints: 'required, unique' }, { name: 'password', constraints: 'required' }] }
function addTable(lines, op) {
  if (!op.name || !op.fields) return { ok: false, error: 'add_table requires name and fields' };

  // Check for duplicate
  const exists = lines.findIndex(l => l.toLowerCase().includes(`${op.name.toLowerCase()} table`));
  if (exists !== -1) return { ok: false, error: `Table '${op.name}' already exists` };

  // Find the right insertion point — after build target, before endpoints
  let insertIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('build for')) { insertIdx = i + 1; continue; }
    if (lines[i].toLowerCase().includes('table:')) { insertIdx = i; }
    if (lines[i].match(/^(when user calls|endpoint)/i)) break;
  }

  // Find end of last table block
  while (insertIdx < lines.length && (lines[insertIdx].match(/^\s/) || lines[insertIdx].trim() === '')) {
    insertIdx++;
  }

  const fieldLines = op.fields.map(f => {
    const c = f.constraints ? `, ${f.constraints}` : '';
    return `  ${f.name}${c}`;
  });

  const newLines = [...lines];
  newLines.splice(insertIdx, 0, '', `create a ${op.name} table:`, ...fieldLines);
  return { ok: true, lines: newLines };
}

// ── add_agent ─────────────────────────────────────────────────────────────────
// { op: 'add_agent', name: 'Summarizer', prompt: 'Summarize the given text...', returns: [{ name: 'summary' }, { name: 'key_points' }] }
function addAgent(lines, op) {
  if (!op.name || !op.prompt) return { ok: false, error: 'add_agent requires name and prompt' };

  const agentLines = [`define agent ${op.name}:`, `  your job is '${op.prompt}'`];
  if (op.returns && op.returns.length > 0) {
    agentLines.push('  returning:');
    for (const field of op.returns) {
      const type = field.type || 'text';
      agentLines.push(`    ${field.name}, ${type}`);
    }
  }

  const newLines = [...lines, '', ...agentLines];
  return { ok: true, lines: newLines };
}
