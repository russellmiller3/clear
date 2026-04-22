/*
 * Meph tool helpers — pure functions extracted from playground/server.js.
 *
 * GM-2 step 2 of `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`:
 * the cc-agent tool-use upgrade needs an MCP server exposing Meph's 8
 * tools. Both /api/chat AND the future MCP server need the same input
 * validation and the same human-readable tool-call descriptions.
 * Extracting the pure helpers now unblocks the MCP server work without
 * touching the much larger stateful `executeTool` function (which lives
 * inside /api/chat's request closure and accesses ~12 closure vars —
 * that extraction is its own follow-up step).
 *
 * Exports:
 *   - `validateToolInput(name, input)` — runtime schema validation. Returns
 *     null on valid input, error string on invalid. Anthropic's tool schemas
 *     are advisory; Meph can send malformed JSON (missing required fields,
 *     wrong types, invented keys) and this catches it BEFORE the tool runs
 *     so we return a teaching error instead of a stack trace.
 *   - `describeMephTool(name, input)` — one-line human-readable summary of a
 *     tool call. Used by /api/chat's `[meph]` terminal mirror line so the
 *     user can watch what Meph is doing in real time.
 *
 * No state, no I/O — both functions are referentially transparent.
 */

/**
 * Runtime schema validation for Meph's tool inputs.
 * @param {string} name - tool name
 * @param {object} input - the input object from Anthropic's tool_use block
 * @returns {string|null} - error message on invalid input, null on valid
 */
export function validateToolInput(name, input) {
  if (input === null || typeof input !== 'object') {
    return `Tool "${name}" expects a JSON object, got ${typeof input}. Send properly-shaped arguments.`;
  }
  const str = (v) => typeof v === 'string';
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const arr = (v) => Array.isArray(v);
  const inEnum = (v, choices) => str(v) && choices.includes(v);

  switch (name) {
    case 'edit_code': {
      if (!inEnum(input.action, ['read', 'write', 'undo'])) return `edit_code.action must be "read", "write", or "undo" — got ${JSON.stringify(input.action)}.`;
      if (input.action === 'write' && !str(input.code)) return `edit_code action="write" requires a "code" string field with the new Clear source.`;
      return null;
    }
    case 'run_command': return str(input.command) ? null : `run_command requires a "command" string.`;
    case 'http_request': {
      if (!inEnum(input.method, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])) return `http_request.method must be GET/POST/PUT/DELETE/PATCH — got ${JSON.stringify(input.method)}.`;
      if (!str(input.path)) return `http_request requires a "path" string (e.g. "/api/todos").`;
      return null;
    }
    case 'read_file': return str(input.filename) ? null : `read_file requires a "filename" string (e.g. SYNTAX.md, AI-INSTRUCTIONS.md).`;
    case 'edit_file': {
      if (!str(input.filename)) return `edit_file requires a "filename" string.`;
      if (!inEnum(input.action, ['append', 'insert', 'replace', 'overwrite', 'read'])) return `edit_file.action must be one of: append, insert, replace, overwrite, read.`;
      return null;
    }
    case 'click_element': return str(input.selector) ? null : `click_element requires a "selector" string (CSS selector).`;
    case 'fill_input': return str(input.selector) && (str(input.value) || num(input.value)) ? null : `fill_input requires "selector" (string) and "value" (string or number).`;
    case 'highlight_code': {
      if (!num(input.start_line) || input.start_line < 1) return `highlight_code requires "start_line" (positive integer).`;
      if (input.end_line !== undefined && !num(input.end_line)) return `highlight_code "end_line" must be a number if provided.`;
      return null;
    }
    case 'inspect_element': return str(input.selector) ? null : `inspect_element requires a "selector" string.`;
    case 'read_network': return (input.limit === undefined || num(input.limit)) ? null : `read_network "limit" must be a number if provided.`;
    case 'db_inspect': return str(input.table) ? null : `db_inspect requires a "table" string.`;
    case 'todo': {
      if (!inEnum(input.action, ['set', 'get'])) return `todo.action must be "set" or "get".`;
      if (input.action === 'set') {
        if (!arr(input.todos)) return `todo action="set" requires a "todos" array.`;
        for (let i = 0; i < input.todos.length; i++) {
          const t = input.todos[i];
          if (!t || typeof t !== 'object') return `todo.todos[${i}] must be an object with { content, status, activeForm }.`;
          if (!str(t.content)) return `todo.todos[${i}].content must be a string.`;
          if (!inEnum(t.status, ['pending', 'in_progress', 'completed'])) return `todo.todos[${i}].status must be pending/in_progress/completed.`;
          if (!str(t.activeForm)) return `todo.todos[${i}].activeForm must be a string (present-tense verb phrase).`;
        }
      }
      return null;
    }
    case 'patch_code': {
      if (!arr(input.operations) || input.operations.length === 0) return `patch_code requires a non-empty "operations" array. Example: [{op:"fix_line",line:5,replacement:"  send back user"}].`;
      const VALID_OPS = new Set(['fix_line', 'insert_line', 'remove_line', 'add_endpoint', 'add_field', 'remove_field', 'add_test', 'add_validation', 'add_table', 'add_agent']);
      for (let i = 0; i < input.operations.length; i++) {
        const op = input.operations[i];
        if (!op || typeof op !== 'object') return `patch_code.operations[${i}] must be an object.`;
        if (!VALID_OPS.has(op.op)) return `patch_code.operations[${i}].op is "${op.op}" — must be one of: ${[...VALID_OPS].join(', ')}.`;
        if (['fix_line', 'insert_line', 'remove_line'].includes(op.op) && !num(op.line)) return `patch_code.operations[${i}] op="${op.op}" requires "line" (number).`;
        if (op.op === 'fix_line' && !str(op.replacement)) return `patch_code fix_line requires "replacement" (string).`;
        if (op.op === 'insert_line' && !str(op.content)) return `patch_code insert_line requires "content" (string).`;
        if (op.op === 'add_endpoint' && (!str(op.method) || !str(op.path) || !str(op.body))) return `patch_code add_endpoint requires "method", "path", and "body" strings.`;
        if (op.op === 'add_field' && (!str(op.table) || !str(op.field))) return `patch_code add_field requires "table" and "field" strings.`;
        if (op.op === 'add_test' && (!str(op.name) || !str(op.body))) return `patch_code add_test requires "name" and "body" strings.`;
      }
      return null;
    }
    // Tools with empty schemas (no required fields): compile, run_app, stop_app,
    // read_terminal, screenshot_output, run_tests, read_dom, read_actions,
    // read_storage, source_map, browse_templates, websocket_log — pass through.
    case 'compile':
    case 'run_app':
    case 'stop_app':
    case 'read_terminal':
    case 'screenshot_output':
    case 'run_tests':
    case 'list_evals':
    case 'run_evals':
    case 'read_dom':
    case 'read_actions':
    case 'read_storage':
    case 'source_map':
    case 'browse_templates':
    case 'websocket_log':
      return null;
    case 'run_eval': {
      if (!str(input.id)) return `run_eval requires "id" (string). Use list_evals first to get available ids.`;
      return null;
    }
    // Reject any tool we don't recognize so Meph stops hallucinating
    // names like "run_file" or "write_file" (neither exists). Earlier
    // the default case returned null which silently allowed unknown calls.
    default:
      return `Unknown tool "${name}". Valid tools: edit_code, read_file, edit_file, run_command, http_request, compile, run_app, stop_app, run_tests, list_evals, run_evals, run_eval, click_element, fill_input, highlight_code, inspect_element, read_network, read_storage, read_terminal, read_actions, read_dom, screenshot_output, browse_templates, source_map, websocket_log, db_inspect, todo, patch_code.`;
  }
}

/**
 * One-line human-readable summary of a Meph tool call. Used by /api/chat's
 * `[meph]` terminal mirror line so the user can watch what Meph is doing
 * in real time.
 *
 * @param {string} name - tool name
 * @param {object} input - the input object
 * @returns {string} - short description (no truncation needed by caller)
 */
export function describeMephTool(name, input) {
  switch (name) {
    case 'edit_code': return input.action === 'write' ? `edit_code (write, ${(input.code || '').length} chars)` : `edit_code (${input.action})`;
    case 'run_command': return `run_command: ${String(input.command || '').slice(0, 120)}`;
    case 'compile': return 'compile';
    case 'run_app': return 'run_app';
    case 'stop_app': return 'stop_app';
    case 'http_request': return `http_request ${input.method || 'GET'} ${input.path || ''}`;
    case 'read_file': return `read_file ${input.path || ''}`;
    case 'write_file': return `write_file ${input.path || ''}`;
    case 'run_tests': return 'run_tests';
    case 'click_element': return `click_element → ${input.selector || ''}`;
    case 'fill_input': return `fill_input → ${input.selector || ''} = ${JSON.stringify(String(input.value || '').slice(0, 60))}`;
    case 'screenshot_output': return 'screenshot_output';
    case 'highlight_code': return `highlight_code ${input.start_line || ''}-${input.end_line || ''}`;
    case 'browse_templates': return `browse_templates ${input.template || ''}`;
    case 'source_map': return `source_map`;
    case 'read_actions': return 'read_actions';
    case 'read_dom': return 'read_dom';
    case 'read_network': return `read_network ${input.filter || ''}`;
    case 'read_storage': return `read_storage ${input.key || ''}`;
    case 'websocket_log': return 'websocket_log';
    case 'db_inspect': return `db_inspect ${input.table || ''}`;
    case 'inspect_element': return `inspect_element ${input.selector || ''}`;
    case 'todo': return `todo (${input.action || 'set'})`;
    default: return name;
  }
}
