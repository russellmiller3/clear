/*
 * Meph tool helpers — extracted from playground/server.js.
 *
 * GM-2 of `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`: the
 * cc-agent tool-use upgrade needs an MCP server exposing Meph's 8 tools.
 * Both /api/chat AND the MCP server need the same validation, the same
 * descriptions, and the same tool implementations. Each tool that doesn't
 * touch /api/chat's stateful closure (Factor DB, sessionId, send, etc.)
 * gets ported here as a standalone function; tools that DO need closure
 * state stay inline pending the MephContext refactor.
 *
 * Exports:
 *   - `validateToolInput(name, input)` — runtime schema validation. Pure.
 *   - `describeMephTool(name, input)` — one-line human-readable tool call
 *     summary for the `[meph]` terminal mirror line. Pure.
 *   - `readFileTool(input, ctx)` — read a docs file from the repo root.
 *     Stateless except for ctx.rootDir. Used by both /api/chat read_file
 *     case and the MCP server's meph_read_file handler.
 *
 * Tool ports still pending (need the MephContext refactor):
 *   edit_code, compile, run_command, run_app, stop_app, http_request,
 *   write_file, run_tests, patch_code, edit_file, click_element,
 *   fill_input, browse_templates, screenshot_output, db_inspect, etc.
 *   See plan step 2-3 followups.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
// Shape-search retrieval (Lean Lesson 2): finds canonical worked examples
// whose program shape matches Meph's current source — additive layer next to
// the existing text-match (querySuggestions) hint pipeline below. Defers the
// canonical-examples.md read until first use so module load stays cheap.
import { loadCanonicalExamples, matchShape } from '../scripts/match-shape.mjs';

/**
 * Top-level tool dispatcher. Routes a validated tool_use to the right
 * per-tool function, threading ctx + helpers through. Replaces the ~330-line
 * inline switch that used to live inside /api/chat's executeTool closure in
 * playground/server.js.
 *
 * Contract:
 *   - `name` is the tool name exactly as the model emitted it.
 *   - `input` is the validated-or-not input object. dispatchTool runs the
 *     schema validator first and short-circuits on failure, so callers don't
 *     need to re-validate.
 *   - `ctx` is ONE MephContext with every callback + state slice wired up.
 *     Tools only read the fields they care about; unrelated defaults are
 *     no-ops. No per-tool sub-contexts to build at the call site.
 *   - `helpers` is the pure-function bundle: compileProgram, compileForEval,
 *     patch, parseTestOutput, runEvalSuite, plus the reranker/Factor-DB
 *     helpers. These are injected (not imported inside meph-tools.js) so
 *     the module stays free of heavy deps.
 *
 * Side effects:
 *   - Tools that need to surface progress to the Studio UI (run_tests,
 *     run_evals, run_eval) emit their own SSE events through ctx.send —
 *     dispatchTool only does the tab-switch wrapper sends. In an MCP/CC
 *     context where ctx.send is a no-op, nothing UI-shaped leaks out.
 *   - Closure state mirroring (e.g. compile's hintState, edit_code's
 *     lastCompileResult) happens INSIDE the tool on the ctx object;
 *     server.js reads ctx.* after dispatchTool returns and mirrors back
 *     into its closure vars.
 *
 * @param {string} name
 * @param {object} input
 * @param {MephContext} ctx
 * @param {object} helpers
 * @returns {Promise<string|object|Array>} tool_result content
 */
export async function dispatchTool(name, input, ctx, helpers) {
  const validationError = validateToolInput(name, input);
  if (validationError) {
    return JSON.stringify({ error: validationError, schemaError: true });
  }
  switch (name) {
    case 'edit_code':
      return editCodeTool(input, ctx, helpers.compileProgram);

    case 'compile':
      return compileTool(input, ctx, {
        compileProgram: helpers.compileProgram,
        sha1: helpers.sha1,
        currentStep: helpers.currentStep,
        safeArchetype: helpers.safeArchetype,
        classifyErrorCategory: helpers.classifyErrorCategory,
        rankPairwise: helpers.rankPairwise,
        rankEBM: helpers.rankEBM,
        featurizeRow: helpers.featurizeRow,
      });

    case 'run_command':
      return runCommandTool(input, ctx);

    case 'run_app':
      return runAppTool(input, ctx);

    case 'stop_app':
      return stopAppTool(input, ctx);

    case 'read_file':
      return readFileTool(input, ctx);

    case 'edit_file':
      return editFileTool(input, ctx);

    case 'read_terminal':
      return readTerminalTool(input, ctx);

    case 'screenshot_output':
      return await screenshotOutputTool(input, ctx);

    case 'http_request':
      return await httpRequestTool(input, ctx);

    case 'source_map':
      return sourceMapTool(input, ctx, helpers.compileProgram);

    case 'highlight_code':
      return highlightCodeTool(input);

    case 'patch_code':
      return patchCodeTool(input, ctx, helpers.patch);

    case 'run_tests': {
      const testResult = runTestsTool(input, ctx, helpers.parseTestOutput);
      // Tab switch + test_results fan-out are Studio-specific niceties; in an
      // MCP/CC context these are no-ops because ctx.send defaults to () => {}.
      ctx.send({ type: 'switch_tab', tab: 'tests' });
      ctx.send({ type: 'test_results', testType: 'app', ...testResult });
      return JSON.stringify(testResult);
    }

    case 'list_evals':
      return listEvalsTool(input, ctx, helpers.compileForEval);

    case 'run_evals': {
      ctx.send({ type: 'switch_tab', tab: 'tests' });
      const evalResult = await runEvalsTool(input, ctx, helpers.runEvalSuite);
      ctx.send({ type: 'eval_results', ...evalResult });
      return JSON.stringify(evalResult);
    }

    case 'run_eval': {
      ctx.send({ type: 'switch_tab', tab: 'tests' });
      const evalResult = await runEvalTool(input, ctx, helpers.runEvalSuite);
      ctx.send({ type: 'eval_results', ...evalResult });
      return JSON.stringify(evalResult);
    }

    case 'click_element':
      return await clickElementTool(input, ctx);
    case 'fill_input':
      return await fillInputTool(input, ctx);
    case 'inspect_element':
      return await inspectElementTool(input, ctx);
    case 'read_storage':
      return await readStorageTool(input, ctx);
    case 'read_dom':
      return await readDomTool(input, ctx);

    case 'read_network': {
      // Lazy-launch the browser so the network listeners wire before we slice
      // the buffer. The tool itself doesn't touch Playwright — it just reads
      // ctx.networkBuffer, which server.js pre-populates via page listeners.
      if (ctx.isAppRunning()) { try { await ctx.getPage(); } catch {} }
      return readNetworkTool(input, ctx);
    }

    case 'read_actions':
      return await readActionsTool(input, ctx);

    case 'websocket_log': {
      if (ctx.isAppRunning()) { try { await ctx.getPage(); } catch {} }
      return websocketLogTool(input, ctx);
    }

    case 'db_inspect':
      return await dbInspectTool(input, ctx);

    case 'todo':
      return todoTool(input, ctx);

    case 'browse_templates':
      return browseTemplatesTool(input, ctx);

    default:
      return JSON.stringify({ error: 'Unknown tool: ' + name });
  }
}

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

/**
 * read_file tool — reads a doc file from the repo root.
 *
 * Why this is the FIRST stateful tool to port: it has the simplest closure
 * contact surface (just a single ROOT_DIR constant). Everything else is
 * file I/O and string handling. Establishes the pattern for porting the
 * other 7 tools as they each get freed from /api/chat's closure.
 *
 * Behavior matches the inline `case 'read_file':` in playground/server.js
 * exactly — same READABLE allowlist, same start/end-line slicing, same
 * <800-line full-content vs >=800-line TOC fallback. Returns a STRING
 * (the JSON-stringified result), matching the existing tool-result
 * convention so /api/chat's loop is byte-for-byte unchanged.
 *
 * @param {object} input - { filename, startLine?, endLine? }
 * @param {object} ctx - { rootDir } - absolute path to the repo root
 * @returns {string} JSON-stringified tool result
 */
export function readFileTool(input, ctx) {
  const READABLE = ['SYNTAX.md', 'AI-INSTRUCTIONS.md', 'PHILOSOPHY.md', 'USER-GUIDE.md', 'requests.md', 'meph-memory.md'];
  const fname = input.filename;
  if (!READABLE.includes(fname)) return JSON.stringify({ error: `Can only read: ${READABLE.join(', ')}` });
  const fpath = join(ctx.rootDir, fname);
  if (!existsSync(fpath)) return JSON.stringify({ error: `File not found: ${fname}` });
  const lines = readFileSync(fpath, 'utf8').split('\n');

  // Line-range mode: return specific section
  if (input.startLine && input.endLine) {
    const start = Math.max(1, input.startLine) - 1;
    const end = Math.min(lines.length, input.endLine);
    const section = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
    return JSON.stringify({ filename: fname, lines: `${start + 1}-${end}`, totalLines: lines.length, content: section });
  }

  // Small files (<800 lines): return in full
  const SMALL_THRESHOLD = 800;
  if (lines.length < SMALL_THRESHOLD) {
    return JSON.stringify({ filename: fname, totalLines: lines.length, content: lines.join('\n') });
  }

  // Large files: return TOC (headings with line numbers)
  const toc = [];
  lines.forEach((line, i) => {
    if (line.startsWith('## ') || line.startsWith('### ') || line.startsWith('# ')) {
      toc.push(`${i + 1}: ${line}`);
    }
  });
  return JSON.stringify({
    filename: fname,
    totalLines: lines.length,
    mode: 'toc',
    hint: 'Large file. Use startLine/endLine to read specific sections.',
    toc: toc.join('\n'),
  });
}

/**
 * highlight_code tool — UI-only acknowledgement. The actual highlight effect
 * is sent via SSE from the calling tool loop (`send({type:'highlight',...})`).
 * This function just produces the success message that goes back into the
 * tool result, so Meph doesn't see "Unknown tool".
 *
 * Stateless. The caller is responsible for emitting the SSE event before/after.
 *
 * @param {object} input - { start_line, end_line? }
 * @returns {string} JSON-stringified ack
 */
export function highlightCodeTool(input) {
  return JSON.stringify({
    ok: true,
    message: `Highlighted lines ${input.start_line}–${input.end_line || input.start_line}`,
  });
}

/**
 * edit_code tool — read/write/undo on the editor source.
 *
 *   action='read'  → return current source + errors as JSON
 *   action='write' → mutate source (via ctx.setSource which captures
 *                    sourceBeforeEdit + fires the change callback),
 *                    auto-compile via the passed-in compileProgram, store
 *                    the result on ctx.lastCompileResult, return errors+warnings
 *   action='undo'  → emit ctx.send({type:'undo'}) so the editor undoes
 *                    client-side
 *
 * Uses MephContext for source state so /api/chat can mirror into
 * _workerLastSource via the onSourceChange callback. compileProgram is
 * passed in to keep meph-tools.js tree-shakable for callers that don't
 * need the full Clear compiler.
 *
 * @param {object} input - { action, code? }
 * @param {MephContext} ctx
 * @param {function} compileProgram - the Clear compiler entry point
 * @returns {string} JSON-stringified result
 */
export function editCodeTool(input, ctx, compileProgram) {
  if (input.action === 'read') {
    return JSON.stringify({ source: ctx.source, errors: ctx.errors });
  }
  if (input.action === 'write') {
    ctx.setSource(input.code);  // captures sourceBeforeEdit + fires onSourceChange
    try {
      const r = compileProgram(input.code);
      ctx.setErrors(r.errors);
      ctx.setLastCompileResult(r);
      return JSON.stringify({ applied: true, errors: r.errors, warnings: r.warnings });
    } catch (err) {
      return JSON.stringify({ applied: true, compileError: err.message });
    }
  }
  if (input.action === 'undo') {
    ctx.send({ type: 'undo' });
    return JSON.stringify({ undone: true });
  }
  return JSON.stringify({ error: 'Invalid action' });
}

/*
 * Bridge tools — uniform shape: check ctx.isAppRunning(), then delegate to
 * ctx.sendBridgeCommand(cmd, payload, timeoutMs) which Studio wires up to
 * its postMessage bridge. Each tool just picks the bridge command name and
 * forwards the relevant input fields. The error message phrasing is preserved
 * verbatim from the inline implementations so existing Meph eval scenarios
 * keep matching.
 */

const NO_APP_ERR = 'No app running. Start with run_app first.';

/** click_element — clicks the element matching the CSS selector in the running app's iframe. */
export async function clickElementTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: NO_APP_ERR });
  const result = await ctx.sendBridgeCommand('click', { selector: input.selector }, 4000);
  return JSON.stringify(result);
}

/** fill_input — types a value into the element matching the CSS selector. */
export async function fillInputTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: NO_APP_ERR });
  const result = await ctx.sendBridgeCommand('fill', { selector: input.selector, value: input.value }, 4000);
  return JSON.stringify(result);
}

/** inspect_element — returns computed style + bounding-box for an element. */
export async function inspectElementTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: NO_APP_ERR });
  const result = await ctx.sendBridgeCommand('inspect', { selector: input.selector }, 4000);
  return JSON.stringify(result);
}

/** read_storage — reads localStorage / sessionStorage from the running app. */
export async function readStorageTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: NO_APP_ERR });
  const result = await ctx.sendBridgeCommand('read-storage', {}, 4000);
  return JSON.stringify(result);
}

/** read_dom — returns a structured snapshot of the running app's DOM. */
export async function readDomTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: NO_APP_ERR });
  const result = await ctx.sendBridgeCommand('read-dom', {}, 4000);
  return JSON.stringify(result);
}

/**
 * read_network — surface the most recent HTTP requests captured from the
 * running app's iframe. Reads ctx.networkBuffer (mirrored from /api/run's
 * Playwright network listener). Optional `filter` substring narrows by URL.
 *
 * @param {object} input - { limit?: number, filter?: string }
 * @param {MephContext} ctx
 * @returns {string} JSON-stringified result
 */
export function readNetworkTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: 'No app running. Network capture starts when the app runs.' });
  const limit = Math.min(input.limit || 20, 100);
  let requests = ctx.networkBuffer.slice(-limit);
  if (input.filter) {
    requests = requests.filter(r => r.url.includes(input.filter));
  }
  return JSON.stringify({ count: requests.length, requests });
}

/**
 * todo tool — get or set Meph's per-session todo list.
 *
 *   action='get' → returns ctx.todos
 *   action='set' → ctx.setTodos(input.todos) (fires onTodosChange so /api/chat
 *                  mirrors back to its closure mephTodos), emits a todo_update
 *                  SSE event so the editor pane can re-render the list, returns
 *                  { ok, count }
 *
 * @param {object} input - { action, todos? }
 * @param {MephContext} ctx
 * @returns {string} JSON-stringified result
 */
export function todoTool(input, ctx) {
  if (input.action === 'get') {
    return JSON.stringify({ todos: ctx.todos });
  }
  if (input.action === 'set') {
    ctx.setTodos(input.todos || []);
    ctx.send({ type: 'todo_update', todos: ctx.todos });
    return JSON.stringify({ ok: true, count: ctx.todos.length });
  }
  return JSON.stringify({ error: 'action must be "set" or "get"' });
}

/**
 * read_actions tool — fetch the user-action recorder buffer from Studio's
 * own API. Used by Meph to see what the user just clicked/typed in the
 * iframe before deciding what to do next.
 *
 * Stateless except for ctx.mephActionsUrl. fetchFn defaults to global fetch
 * but can be injected for tests. Returns the most recent N actions (default
 * 50, capped at 100).
 *
 * @param {object} input - { limit? }
 * @param {MephContext} ctx - mephActionsUrl required
 * @param {function} [fetchFn] - optional fetch override for tests
 * @returns {string} JSON-stringified result
 */
export async function readActionsTool(input, ctx, fetchFn = fetch) {
  try {
    const limit = Math.min(input.limit || 50, 100);
    const r = await fetchFn(ctx.mephActionsUrl);
    const data = await r.json();
    return JSON.stringify({
      count: Math.min(data.actions.length, limit),
      actions: data.actions.slice(-limit),
    });
  } catch (err) {
    return JSON.stringify({ error: err.message.slice(0, 300) });
  }
}

/**
 * websocket_log — surface the most recent WebSocket messages captured from
 * the running app. Reads ctx.websocketBuffer (mirrored from /api/run's WS
 * frame listener).
 *
 * @param {object} input - { limit?: number }
 * @param {MephContext} ctx
 * @returns {string} JSON-stringified result
 */
export function websocketLogTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: 'No app running. WebSocket capture starts when the app runs.' });
  const limit = Math.min(input.limit || 20, 100);
  const messages = ctx.websocketBuffer.slice(-limit);
  return JSON.stringify({ count: messages.length, messages });
}

/**
 * browse_templates tool — list all template apps in the apps/ directory or
 * read one template's main.clear source.
 *
 *   action='list' → enumerate apps/<dir>/main.clear, return [{name,
 *                   description (first # comment), lines}]
 *   action='read' → read apps/<safe-name>/main.clear and return source
 *
 * Stateless except for ctx.rootDir. Uses fs (readdirSync, statSync,
 * readFileSync, existsSync) imported at the top of meph-tools.js.
 *
 * @param {object} input - { action, name? }
 * @param {MephContext} ctx
 * @returns {string} JSON-stringified result
 */
export function browseTemplatesTool(input, ctx) {
  const TEMPLATE_DIR = join(ctx.rootDir, 'apps');
  if (input.action === 'list') {
    try {
      const dirs = readdirSync(TEMPLATE_DIR).filter(d => {
        try { return statSync(join(TEMPLATE_DIR, d)).isDirectory(); } catch { return false; }
      });
      const templates = dirs.map(d => {
        const mainFile = join(TEMPLATE_DIR, d, 'main.clear');
        if (!existsSync(mainFile)) return null;
        const src = readFileSync(mainFile, 'utf8');
        const firstComment = src.match(/^#\s*(.+)/m);
        const lineCount = src.split('\n').filter(l => l.trim()).length;
        return { name: d, description: firstComment?.[1] || '', lines: lineCount };
      }).filter(Boolean);
      return JSON.stringify({ templates, count: templates.length });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  }
  if (input.action === 'read') {
    if (!input.name) return JSON.stringify({ error: 'Need a template name. Use action="list" first to see available templates.' });
    const safeName = input.name.replace(/[^a-zA-Z0-9_-]/g, '');
    const mainFile = join(TEMPLATE_DIR, safeName, 'main.clear');
    if (!existsSync(mainFile)) return JSON.stringify({ error: `Template "${safeName}" not found. Use action="list" to see available templates.` });
    return JSON.stringify({ name: safeName, source: readFileSync(mainFile, 'utf8') });
  }
  return JSON.stringify({ error: 'action must be "list" or "read"' });
}

/**
 * run_command tool — exec a shell command from the repo root. Restricted
 * to the prefixes in ctx.allowedCommandPrefixes (default empty so unwired
 * contexts can't accidentally exec). 15s timeout. Returns stdout + exitCode
 * (or stdout + stderr + exitCode on failure).
 *
 * @param {object} input - { command }
 * @param {MephContext} ctx - rootDir + allowedCommandPrefixes used
 * @returns {string} JSON-stringified result
 */
export function runCommandTool(input, ctx) {
  const cmd = input.command;
  const allowed = ctx.allowedCommandPrefixes.some(p => cmd.startsWith(p));
  if (!allowed) return JSON.stringify({ error: `Not allowed. Use: ${ctx.allowedCommandPrefixes.join(', ')}` });
  try {
    const stdout = execSync(cmd, { cwd: ctx.rootDir, encoding: 'utf8', timeout: 15000 });
    return JSON.stringify({ stdout, exitCode: 0 });
  } catch (err) {
    return JSON.stringify({ stdout: err.stdout || '', stderr: err.stderr || err.message, exitCode: err.status || 1 });
  }
}

/**
 * screenshot_output tool — capture a PNG of the running app via Playwright.
 * Returns an Anthropic content-block array (image + caption text) on success
 * so the LLM can actually see the rendered output; returns JSON-stringified
 * error on failure.
 *
 * The page is supplied through ctx.getPage() so this function stays free of
 * Playwright imports — /api/chat's getPage() caches the chromium launch and
 * wires request/response listeners into the closure-level network and
 * websocket buffers. The running app's port comes through ctx.getRunningPort()
 * for the user-facing caption.
 *
 * @param {object} input - unused (screenshot takes no args)
 * @param {MephContext} ctx - isAppRunning + getPage + getRunningPort required
 * @returns {Promise<Array|string>} Anthropic content-block array on success,
 *   JSON-stringified { error } on failure
 */
export async function screenshotOutputTool(input, ctx) {
  if (!ctx.isAppRunning()) {
    return JSON.stringify({ error: 'No app running. Start with run_app first.' });
  }
  try {
    const page = await ctx.getPage();
    // Wait for any reactive updates to settle before the shot — bounded so
    // a chatty app doesn't stall the whole tool call.
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    const buffer = await page.screenshot({ fullPage: false, type: 'png' });
    const imageBase64 = buffer.toString('base64');
    const port = ctx.getRunningPort();
    return [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
      { type: 'text', text: `Screenshot of the running app at localhost:${port}. This is the actual rendered output — verify layout, colors, and content.` },
    ];
  } catch (err) {
    return JSON.stringify({ error: 'Screenshot failed: ' + err.message.slice(0, 200) });
  }
}

/**
 * stop_app tool — kill the child Node app started by run_app. Stateless
 * except for the ctx.stopRunningApp() callback which /api/chat hooks to
 * runningChild.kill('SIGTERM') + runningChild = null. Always returns
 * { stopped: true } even if no app was running (matches inline behavior).
 *
 * @param {object} input - unused
 * @param {MephContext} ctx - stopRunningApp callback used
 * @returns {string} JSON-stringified ack
 */
export function stopAppTool(input, ctx) {
  ctx.stopRunningApp();
  return JSON.stringify({ stopped: true });
}

/**
 * db_inspect tool — run a SELECT query against the running compiled app's
 * SQLite database (BUILD_DIR/clear-data.db). Read-only — non-SELECT queries
 * are rejected up front. Returns the first 100 rows.
 *
 * Dynamic imports better-sqlite3 inside the try so the module load only
 * happens when the tool is actually called (and the parent module doesn't
 * pull better-sqlite3 in transitively).
 *
 * @param {object} input - { query: string }
 * @param {MephContext} ctx - isAppRunning + buildDir required
 * @returns {Promise<string>} JSON-stringified result
 */
export async function dbInspectTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: 'No app running. Start with run_app first.' });
  const q = String(input.query || '').trim();
  if (!q) return JSON.stringify({ error: 'Missing query' });
  // Security: only allow SELECT queries
  if (!/^select\s/i.test(q)) return JSON.stringify({ error: 'Only SELECT queries allowed. Use db_inspect for reads, not writes.' });
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = join(ctx.buildDir, 'clear-data.db');
    if (!existsSync(dbPath)) return JSON.stringify({ error: 'No database file yet. Make a request that writes data first.' });
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(q).all();
    db.close();
    return JSON.stringify({ ok: true, rowCount: rows.length, rows: rows.slice(0, 100) });
  } catch (err) {
    return JSON.stringify({ error: err.message.slice(0, 300) });
  }
}

/**
 * run_app tool — materialize the most recent compile result into ctx.buildDir,
 * detect runtime deps (bcryptjs/jsonwebtoken/nodemailer/multer via require()
 * substring match), npm install if missing, then spawn `node server.js` on
 * the next allocated port. Previous child is SIGTERM'd first. After spawn,
 * a short-lived CJS polling script probes the TCP port (25 tries × 200ms)
 * so Meph can immediately fire http_request without racing the server.
 *
 * Requires on ctx:
 *   - lastCompileResult   { serverJS?, javascript?, html?, css? } — from compile
 *   - buildDir            — where to write server.js + package.json + static assets
 *   - rootDir             — repo root; `runtime/` gets copied into buildDir/clear-runtime
 *   - getRunningChild()   — returns the child to kill, or null
 *   - setRunningChild(c)  — stores the new child (and nulls it on exit)
 *   - allocatePort()      — returns the next port number; must NOT return null
 *
 * @param {object} input - unused
 * @param {MephContext} ctx
 * @returns {string} JSON-stringified { started, port } or { error }
 */
export function runAppTool(input, ctx) {
  const compiled = ctx.lastCompileResult;
  // Full-stack apps put backend in .serverJS; backend-only apps put it in
  // .javascript but only when there's no .html (otherwise .javascript is
  // frontend code).
  const agentBackendCode = compiled?.serverJS || (!compiled?.html && compiled?.javascript) || null;
  if (!agentBackendCode) return JSON.stringify({ error: 'No compiled server code. Compile first.' });

  // Kill previous child before respawning so we don't leak ports.
  const prev = ctx.getRunningChild();
  if (prev) {
    try { prev.kill('SIGTERM'); } catch {}
    ctx.setRunningChild(null);
  }

  const rtDir = join(ctx.buildDir, 'clear-runtime');
  mkdirSync(rtDir, { recursive: true });
  writeFileSync(join(ctx.buildDir, 'server.js'), agentBackendCode);

  // Runtime dep detection by substring — cheap and deterministic. Every
  // compiled app needs `ws` (the compiler's WebSocket layer); the others
  // only land when the Clear source uses auth, email, or file upload.
  const agentDeps = { ws: '*' };
  if (agentBackendCode.includes("require('bcryptjs')")) agentDeps.bcryptjs = '*';
  if (agentBackendCode.includes("require('jsonwebtoken')")) agentDeps.jsonwebtoken = '*';
  if (agentBackendCode.includes("require('nodemailer')")) agentDeps.nodemailer = '*';
  if (agentBackendCode.includes("require('multer')")) agentDeps.multer = '*';
  writeFileSync(join(ctx.buildDir, 'package.json'), JSON.stringify({ dependencies: agentDeps }));

  const depsNeeded = Object.keys(agentDeps).filter(d => !existsSync(join(ctx.buildDir, 'node_modules', d)));
  if (depsNeeded.length > 0) {
    try { execSync('npm install --production --silent', { cwd: ctx.buildDir, timeout: 15000, stdio: 'pipe' }); } catch {}
  }

  if (compiled.html) writeFileSync(join(ctx.buildDir, 'index.html'), compiled.html);
  writeFileSync(join(ctx.buildDir, 'style.css'), compiled.css || '');

  // Copy runtime helpers the compiled server imports (db.js for SQLite,
  // auth.js for bcrypt/JWT helpers, rateLimit.js for limits). Optional —
  // apps that don't use them just don't require() them.
  const runtimeSrc = join(ctx.rootDir, 'runtime');
  for (const f of ['db.js', 'auth.js', 'rateLimit.js']) {
    if (existsSync(join(runtimeSrc, f))) copyFileSync(join(runtimeSrc, f), join(rtDir, f));
  }

  const port = ctx.allocatePort();
  if (port === null || port === undefined) {
    return JSON.stringify({ error: 'run_app: ctx.allocatePort() returned null — no port allocator wired.' });
  }
  const env = { ...process.env, PORT: String(port) };
  const child = spawn('node', ['server.js'], { cwd: ctx.buildDir, env, stdio: 'pipe' });
  ctx.setRunningChild(child);
  child.on('exit', () => {
    if (ctx.getRunningChild() === child) ctx.setRunningChild(null);
  });

  // Sync-poll TCP until port is open (max 5s) so Meph can immediately use
  // http_request on the next turn without racing the server's listen().
  // Scripted as a .cjs file because the parent package.json might declare
  // type:module — writing inline `require()` into an ESM file crashes.
  const pollPath = join(ctx.buildDir, '_port-poll.cjs');
  writeFileSync(pollPath, [
    "var net=require('net'),n=0;",
    "(function t(){",
    `  var s=net.createConnection(${port},'127.0.0.1');`,
    "  s.on('connect',function(){s.destroy();process.exit(0);});",
    "  s.on('error',function(){if(++n<25)setTimeout(t,200);else process.exit(1);});",
    "})();",
  ].join('\n'));
  try { execSync(`node "${pollPath}"`, { timeout: 6000 }); } catch {}
  try { unlinkSync(pollPath); } catch {}

  return JSON.stringify({ started: true, port });
}

/**
 * run_tests tool — exec `node cli/clear.js test <tmp>` against ctx.source
 * and parse the PASS/FAIL lines out of stdout. Writes the current source
 * to a timestamped tmp file in ctx.buildDir so concurrent tool calls don't
 * stomp each other (we still clean it up in `finally`). ANTHROPIC_API_KEY
 * is forwarded via ctx.apiKey so agent-backed tests can call real Claude.
 *
 * The outer timeout (default 180s, overridable via CLEAR_STUDIO_TEST_TIMEOUT_MS)
 * wraps the whole child — npm install, server startup, and the actual test
 * execution. On Windows this is the only reliable way to time out an
 * execSync that's stuck inside a child process.
 *
 * Exit-code contract from cli/clear.js test:
 *   0 — all tests passed
 *   1 — compile errors (JSON on stdout)
 *   4 — some tests failed (normal PASS/FAIL output on stdout)
 *
 * @param {object} input - unused
 * @param {MephContext} ctx - source + rootDir + buildDir + apiKey used
 * @param {(stdout: string) => {passed, failed, results}} parseTestOutput - injected
 *   so meph-tools.js doesn't need to duplicate the parser. server.js passes its
 *   existing parseTestOutput; tests pass their own.
 * @returns {object} parsed test result — caller stringifies before returning to Meph
 */
/**
 * Write the test outcome (pass/fail counts + ok flag) back to the most
 * recent compile row in Factor DB. Extracted from server.js's /api/chat
 * inline block so cc-agent-driven sweeps get the same training signal
 * (same cross-path bug class as the http_request 2xx→test_pass=1 move).
 *
 * Rules:
 *   - No-op when ctx.factorDB is null or no lastFactorRowId on hintState.
 *   - test_pass=1 requires ok=true AND failed=0 AND at least one passed.
 *     Mixed runs (some pass, some fail) leave test_pass=0 — we only
 *     reward all-green runs so the flywheel's "pass" signal stays honest.
 *   - test_score = passed/total when any tests ran, else 1.0 for ok runs
 *     (no tests counts as a non-win with a high score) and 0.0 for failed.
 *   - Non-fatal on any error (DB locked, prepared-statement failure, etc.).
 *
 * @param {MephContext} ctx - factorDB + hintState.lastFactorRowId required
 * @param {{ok:boolean, passed?:number, failed?:number}} result - test outcome
 * @returns {void}
 */
export function _applyTestOutcomeToFactorDb(ctx, result) {
  if (!ctx?.factorDB || !ctx.hintState?.lastFactorRowId) return;
  const passed = Number(result?.passed || 0);
  const failed = Number(result?.failed || 0);
  const total = passed + failed;
  const testScore = total > 0 ? passed / total : (result?.ok === true ? 1.0 : 0.0);
  const testPass = (result?.ok === true && failed === 0 && total > 0) ? 1 : 0;
  try {
    ctx.factorDB._db.prepare(
      'UPDATE code_actions SET test_pass = ?, test_score = ? WHERE id = ?',
    ).run(testPass, testScore, ctx.hintState.lastFactorRowId);
  } catch { /* non-fatal */ }
}

export function runTestsTool(input, ctx, parseTestOutput) {
  const start = Date.now();
  const source = ctx.source;
  if (!source || !source.trim()) {
    return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  }
  mkdirSync(ctx.buildDir, { recursive: true });
  const tmpPath = join(ctx.buildDir, '_test-source-' + Date.now() + '.clear');
  writeFileSync(tmpPath, source);
  const outerTimeoutMs = Math.max(15000, Number(process.env.CLEAR_STUDIO_TEST_TIMEOUT_MS) || 180000);
  try {
    const testEnv = { ...process.env, ...(ctx.apiKey ? { ANTHROPIC_API_KEY: ctx.apiKey } : {}) };
    const stdout = execSync(`node cli/clear.js test "${tmpPath}"`, {
      cwd: ctx.rootDir,
      encoding: 'utf8',
      timeout: outerTimeoutMs,
      maxBuffer: 5 * 1024 * 1024,
      env: testEnv,
    });
    const parsed = parseTestOutput(stdout);
    const ok = { ok: true, ...parsed, duration: Date.now() - start };
    _applyTestOutcomeToFactorDb(ctx, ok);
    return ok;
  } catch (err) {
    if (err.status === 4) {
      const parsed = parseTestOutput(err.stdout || '');
      const fail = { ok: false, ...parsed, duration: Date.now() - start };
      _applyTestOutcomeToFactorDb(ctx, fail);
      return fail;
    }
    if (err.status === 1) {
      try {
        const errData = JSON.parse(err.stdout);
        return { ok: false, error: 'Compile errors', errors: errData.errors || [], duration: Date.now() - start };
      } catch {
        return { ok: false, error: (err.stdout || err.stderr || err.message).slice(0, 2000), duration: Date.now() - start };
      }
    }
    // Timeout shows as ETIMEDOUT on Windows, killed=true + SIGTERM on Unix.
    // Translate both to a message the user can act on, not a stack trace
    // pointing at cmd.exe.
    const timedOut = err.code === 'ETIMEDOUT' || (err.killed && err.signal === 'SIGTERM');
    if (timedOut) {
      const secs = Math.round(outerTimeoutMs / 1000);
      return {
        ok: false,
        error: `Test runner timed out after ${secs}s. Templates with live agent calls can be slow — try running fewer tests, or set CLEAR_STUDIO_TEST_TIMEOUT_MS to raise the limit.`,
        timedOut: true,
        duration: Date.now() - start,
      };
    }
    return { ok: false, error: (err.stderr || err.message || 'Test runner failed').slice(0, 2000), duration: Date.now() - start };
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

/**
 * compile tool — the biggest Meph tool + the heart of the RL flywheel.
 *
 * Runs ctx.source through the passed-in compileProgram, mirrors result state
 * back through ctx.setErrors + ctx.setLastCompileResult, logs a Factor DB
 * trajectory row, retrieves + reranks hints for any failing compile, and
 * returns a token-trimmed result payload.
 *
 * The Factor DB + reranker machinery is optional — when ctx.factorDB is null,
 * the tool skips trajectory logging and hint retrieval entirely. That path
 * lets the MCP server compile on behalf of a cc-agent-driven session without
 * needing the training-signal infrastructure wired up.
 *
 * helpers bundle:
 *   - compileProgram(source)         — the real compiler (from index.js)
 *   - sha1(str)                      — used to build error signatures + file hashes
 *   - currentStep(source, steps)     — map source to a curriculum step {id,index,name}
 *   - safeArchetype(source)          — classify source into archetype name
 *   - classifyErrorCategory(msg)     — bucket error message into reranker category
 *   - rankPairwise(bundle, ctx, rows)— pairwise logistic reranker (preferred)
 *   - rankEBM(bundle, rows, feat)    — pointwise EBM reranker (fallback)
 *   - featurizeRow(row)              — feature extraction for EBM
 *
 * The mutable hint-tracking state lives on ctx.hintState. The tool reads
 * it to drive the inference fallback + writes back to it so server.js can
 * mirror the updated values into its closure vars after the call.
 *
 * @param {object} input - { include_compiled?: boolean }
 * @param {MephContext} ctx - source + errors + factorDB + sessionId + sessionSteps + pairwiseBundle + ebmBundle + hintState
 * @param {object} helpers - see bundle description above
 * @returns {string} JSON-stringified compile result with optional hints
 */
export function compileTool(input, ctx, helpers) {
  const {
    compileProgram,
    sha1,
    currentStep,
    safeArchetype,
    classifyErrorCategory,
    rankPairwise,
    rankEBM,
    featurizeRow,
  } = helpers;
  try {
    const source = ctx.source;
    const r = compileProgram(source);
    // Mirror compile state back into the context — server.js's
    // onErrorsChange callback will update _workerLastErrors so the
    // supervisor polling endpoint sees the new errors immediately.
    ctx.setErrors(r.errors);
    ctx.setLastCompileResult(r);

    // ── Factor DB: log this compile attempt ─────────────────────────
    // One row per compile. test_pass gets updated by a subsequent run_tests.
    if (ctx.factorDB && source) {
      try {
        const compileOk = r.errors.length === 0 ? 1 : 0;
        const errorSig = r.errors.length > 0
          ? sha1(r.errors.map(e => e.message).join('\n') + '\x00' + sha1(source))
          : null;
        // source_before captures what Meph compiled. If he called edit_code
        // + compile in sequence, sourceBeforeEdit has the pre-edit state.
        // Fall back to source so we always have SOMETHING — otherwise we lose
        // the whole point of the trajectory row.
        const sourceForLog = ctx.sourceBeforeEdit && ctx.sourceBeforeEdit.length > 0
          ? ctx.sourceBeforeEdit
          : source;
        const step = currentStep(source, ctx.sessionSteps);
        ctx.hintState.lastFactorRowId = ctx.factorDB.logAction({
          session_id: ctx.sessionId,
          archetype: safeArchetype(source),
          task_type: 'compile_cycle',
          error_sig: errorSig,
          file_state_hash: sha1(source),
          source_before: sourceForLog.slice(0, 5000),
          patch_ops: [],
          patch_summary: r.errors.length === 0
            ? `Clean compile (${source.split('\n').length} lines)`
            : `Compile with ${r.errors.length} error(s): ${r.errors[0]?.message?.slice(0, 120) || 'unknown'}`,
          compile_ok: compileOk,
          test_pass: 0,
          test_score: 0.0,
          score_delta: 0.0,
          step_id: step?.id || null,
          step_index: step?.index ?? null,
          step_name: step?.name || null,
        });
        // Inference fallback: if hints were already served on an earlier
        // compile in this turn, track the minimum error count seen since.
        // If Meph later forgets to emit HINT_APPLIED, a drop in errors is
        // a reasonable signal that the hint helped.
        if (ctx.hintState.hintsInjectedRowId
            && ctx.hintState.lastFactorRowId !== ctx.hintState.hintsInjectedRowId) {
          if (ctx.hintState.postHintMinErrorCount === null
              || r.errors.length < ctx.hintState.postHintMinErrorCount) {
            ctx.hintState.postHintMinErrorCount = r.errors.length;
          }
        }
      } catch { /* non-fatal */ }
    }
    // ────────────────────────────────────────────────────────────────

    // ── Context-size optimizations (Session 41 cost-reduction pass) ──
    // 155:1 input:output ratio in April meant most API cost was context.
    // Four trims that preserve Meph's ability to fix errors while cutting
    // ~40-60% of per-compile input tokens at sweep scale.

    // (1) Strip `Example: ...` blocks from error messages. Meph's system
    //     prompt already covers canonical Clear; the Example blocks duplicate
    //     that at ~300-600 chars per error.
    const trimmedErrors = (r.errors || []).map(e => {
      if (!e || typeof e !== 'object') return e;
      const msg = String(e.message || '');
      const exIdx = msg.search(/\n?\s*Example:/i);
      const trimmed = exIdx > 0 ? msg.slice(0, exIdx).trim() : msg;
      return { ...e, message: trimmed };
    });

    // (2) Cap warnings at 3. On apps with 8-10 security/quality warnings Meph
    //     only reads the first few; the rest are noise × every compile ×
    //     every sweep.
    const cappedWarnings = (r.warnings || []).slice(0, 3);
    const warningsMore = (r.warnings || []).length - cappedWarnings.length;

    const result = {
      errors: trimmedErrors,
      warnings: cappedWarnings,
      hasHTML: !!r.html,
      hasServerJS: !!r.serverJS,
      hasJavascript: !!r.javascript,
      hasPython: !!r.python,
    };
    if (warningsMore > 0) result.warningsTruncated = warningsMore;

    // (3) Tests field dropped from compile result — Meph uses run_tests tool
    //     separately. The auto-generated test source was ~1-3KB per compile
    //     and Meph never read it directly. (No code needed — just don't add
    //     it to `result`.)

    // (4) Handled below at the hints block: we now emit `hints.text` only
    //     (the prose Meph actually reads) and drop the duplicate
    //     `hints.references` JSON array (~1-2KB per hint-serve).

    // ── Factor DB suggestion injection (flywheel closes here) ──
    // When compile fails, retrieve up-to-3 hints using layered retrieval:
    //   Tier 1: exact same error_sig previously fixed in this archetype
    //   Tier 2: exact same error_sig previously fixed anywhere
    //   Tier 3: same-archetype passing gold rows (archetype-only fallback)
    // Tier is attached to each hint so Meph sees which signal produced it.
    //
    // CLEAR_HINT_DISABLE=1 short-circuits the entire retrieval path. Enables
    // honest A/B measurement of hint effect on Meph's live pass rate
    // (Session 44 Track 1.2). Passive observational data is confounded by
    // selection bias — hints fire on hard tasks Meph is already struggling
    // with, so "hints correlate with failure" is uninterpretable. A sweep
    // controlling this flag produces a clean counterfactual. We skip the
    // ENTIRE block (including querySuggestions + rerankers) so the hint-off
    // arm pays zero DB-query cost — the A/B measures hint *effect*, not
    // hint *compute overhead*.
    const hintsDisabled = process.env.CLEAR_HINT_DISABLE === '1';
    if (ctx.factorDB && r.errors.length > 0 && source && !hintsDisabled) {
      try {
        const archetype = safeArchetype(source);
        const errorSig = sha1(r.errors.map(e => e.message).join('\n') + '\x00' + sha1(source));
        // Retrieve wider pool (topK=10) when any reranker is loaded so the
        // reranker has room to reorder. Without rerankers, keep the historical
        // topK=3 behavior so no regression from retrieval alone.
        const retrievalK = (ctx.pairwiseBundle || ctx.ebmBundle) ? 10 : 3;
        let hintRows = ctx.factorDB.querySuggestions({
          archetype,
          error_sig: errorSig,
          topK: retrievalK,
        });

        // Rerank order of preference (highest → fallback):
        //   1. Pairwise logistic — scores each candidate AGAINST the current
        //      error, so a high-test_score fix for a different problem gets
        //      demoted. This is the one that answers the retrieval question
        //      directly.
        //   2. Pointwise EBM — regression on row quality; some lift over BM25.
        //   3. BM25 raw — ordering from querySuggestions.
        let rerankedBy = 'bm25';
        if (ctx.pairwiseBundle && hintRows.length > 0) {
          try {
            const errorCategory = classifyErrorCategory(
              'Compile with ' + r.errors.length + ' error(s): ' +
              (r.errors[0]?.message || '')
            );
            const currentStepHere = currentStep(source, ctx.sessionSteps);
            for (const c of hintRows) {
              try {
                const prev = ctx.factorDB._db.prepare(
                  'SELECT patch_summary FROM code_actions WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1'
                ).get(c.session_id, c.created_at);
                c.target_error_category = classifyErrorCategory(prev?.patch_summary || '');
              } catch { c.target_error_category = 'none'; }
            }
            const rerankerCtx = {
              archetype,
              error_sig: errorSig,
              error_category: errorCategory,
              step_index: currentStepHere?.index ?? 0,
              source_before: source,
            };
            const ranked = rankPairwise(ctx.pairwiseBundle, rerankerCtx, hintRows);
            hintRows = ranked.slice(0, 3);
            rerankedBy = 'pairwise';
          } catch {
            // Fall through to EBM on any failure — better to ship a hint
            // ranked by the older model than to ship nothing.
          }
        }
        if (rerankedBy === 'bm25' && ctx.ebmBundle && hintRows.length > 0) {
          try {
            const ranked = rankEBM(ctx.ebmBundle, hintRows, featurizeRow);
            hintRows = ranked.slice(0, 3);
            rerankedBy = 'ebm';
          } catch {
            hintRows = hintRows.slice(0, 3);
          }
        } else if (rerankedBy === 'bm25') {
          hintRows = hintRows.slice(0, 3);
        }
        // Observability: always log retrieval outcome so we can distinguish
        // "no candidates found" from "Meph ignored the hints he saw".
        console.log(`[hints] archetype=${archetype} retrieved=${hintRows.length} reranked_by=${rerankedBy}${hintRows.length > 0 ? ' top_tier=' + hintRows[0].tier : ''}`);
        if (hintRows.length > 0) {
          const tiers = hintRows.map(h => h.tier);
          const hasExact = tiers.some(t => t.startsWith('exact_error'));
          const note = hasExact
            ? `Found ${hintRows.length} past session(s) that hit this exact error and fixed it. Study the reference snippets and adapt the fix.`
            : `No past session hit this exact error yet. Here are ${hintRows.length} working ${archetype} apps for shape-level reference.`;

          // Prose-formatted hint block. This is what Meph actually reads —
          // the JSON `references` array dropped in Session 41 was a duplicate
          // of content in `text` plus scoring metadata Meph never reasoned
          // about. Session 38 finding: Meph ignored hints buried in JSON.
          // Prose works better because Meph's attention is text-first.
          const tierLabel = (t) => {
            if (!t) return 'retrieved match';
            if (t.startsWith('exact_error_same_archetype')) return 'SAME ERROR in same archetype';
            if (t.startsWith('exact_error')) return 'SAME ERROR anywhere';
            if (t.startsWith('same_archetype')) return 'same archetype, different error';
            return t.replace(/_/g, ' ');
          };
          const hintBlocks = hintRows.map((h, i) => {
            const scoreLabel = typeof h.pairwise_score === 'number'
              ? `pairwise=${h.pairwise_score.toFixed(3)}`
              : typeof h.ebm_score === 'number'
                ? `EBM=${h.ebm_score.toFixed(3)}`
                : 'score=n/a';
            const header = `── Past Fix #${i + 1} [${tierLabel(h.tier)}, ${scoreLabel}, test_score=${h.test_score || 0}] ──`;
            const summary = h.patch_summary ? `What happened: ${h.patch_summary}` : '';
            const raw = (h.source_before || '').slice(0, 600);
            const trimmed = raw.lastIndexOf('\n') > 400 ? raw.slice(0, raw.lastIndexOf('\n')) : raw;
            const code = trimmed ? `Source that worked:\n\`\`\`clear\n${trimmed}\n\`\`\`` : '';
            return [header, summary, code].filter(Boolean).join('\n');
          }).join('\n\n');
          const guidance = `\nHow to use: pattern-match the FIX, don't copy-paste. These are from different tasks — look at what structure works (validate blocks, guard clauses, auth placement, endpoint shape) and adapt to your current error.`;

          // Per-hint-serve REQUIRED-tag line, placed in the hint payload itself
          // (not just the system prompt) so Meph's attention catches it right
          // where he's reading the hint. Measured: system-prompt-only reminders
          // land ~45% of the time.
          const topTier = hintRows[0]?.tier || '';
          const tagRequired = `\n\n⚠ REQUIRED: Start your very next text block with \`HINT_APPLIED: yes, tier=${topTier}, helpful=<yes|no|partial>\` if you're going to use these hints, OR \`HINT_APPLIED: no, reason=<short reason>\` if they don't fit your real problem. Tag first, then your analysis. This is tracking signal, not optional.`;

          const text = `${note}\n\n${hintBlocks}\n${guidance}${tagRequired}`;

          result.hints = {
            note,
            reranked_by: rerankedBy,
            text,
          };
          // Remember which row carried the hints so the end-of-response
          // HINT_APPLIED parse can update the right row.
          ctx.hintState.hintsInjectedRowId = ctx.hintState.lastFactorRowId;
          // Snapshot error count + best-hint-tier at hint-serve time — used
          // for the inference fallback if Meph forgets the tag.
          ctx.hintState.hintsInjectedErrorCount = r.errors.length;
          ctx.hintState.hintsInjectedTier = hintRows[0]?.tier || null;
          ctx.hintState.postHintMinErrorCount = null; // reset window
        }
      } catch { /* non-fatal */ }
    }
    // ────────────────────────────────────────────────────────────

    // ── Shape-search retrieval (Lean Lesson 2 — additive layer) ──
    // Find canonical worked examples whose program shape matches Meph's
    // current source. Layered ON TOP of the text-match hints above — does
    // not replace them. Fires on EVERY compile (success or failure) because
    // Meph's program shape changes as he writes; the shape-matched examples
    // teach him pre-emptively, before he hits the wall.
    //
    // Cap: top 2 examples (text-match already returned up to 3, so combined
    // ceiling stays at 5 — well under the prompt-cost gate the plan flags).
    // Gracefully no-op if canonical-examples.md isn't present.
    //
    // CLEAR_HINT_DISABLE=1 ALSO disables this block, so the hint A/B keeps
    // its clean off-arm (no hint compute, no extra tokens).
    if (source && !hintsDisabled) {
      try {
        // Cache the parsed examples on ctx so subsequent compiles in the same
        // session reuse the parsed feature vectors. First call is ~2-5ms;
        // every other call is microseconds.
        if (!ctx._canonicalExamplesLoaded) {
          try {
            ctx._canonicalExamples = loadCanonicalExamples();
          } catch {
            // File missing or unreadable — don't block compile. The shape-
            // match path silently turns off until the file lands.
            ctx._canonicalExamples = [];
          }
          ctx._canonicalExamplesLoaded = true;
        }
        const examples = ctx._canonicalExamples;
        if (examples && examples.length > 0) {
          const shapeMatches = matchShape(source, { top: 2, examples });
          if (shapeMatches.length > 0) {
            const shapeBlocks = shapeMatches.map(m => {
              const ex = m.example;
              const arch = m.signature.archetype;
              const trimmed = (ex.source || '').slice(0, 600);
              const code = trimmed
                ? `\n\`\`\`clear\n${trimmed}\n\`\`\``
                : '';
              const header = `── Canonical Example #${ex.number} [${arch}, shape_score=${m.score.toFixed(3)}] — ${ex.title} ──`;
              return `${header}${code}`;
            }).join('\n\n');
            const shapeNote = `Shape-matched canonical examples (your program looks like these — reference for idiomatic Clear):`;
            const shapeText = `${shapeNote}\n\n${shapeBlocks}`;

            // Layer onto whatever the text-match path produced. If text-match
            // already filled result.hints, append; otherwise create the hints
            // record fresh. Either way `result.hints.shape_text` and
            // `result.hints.shape_count` are populated so Meph and the
            // observability log can both see the shape signal independently.
            if (!result.hints) {
              result.hints = { note: shapeNote, reranked_by: 'shape', text: shapeText };
            } else {
              result.hints.text = (result.hints.text || '') + '\n\n' + shapeText;
            }
            result.hints.shape_text = shapeText;
            result.hints.shape_count = shapeMatches.length;
            result.hints.shape_top_archetype = shapeMatches[0].signature.archetype;
            console.log(`[hints] shape_match retrieved=${shapeMatches.length} top_archetype=${shapeMatches[0].signature.archetype} top_score=${shapeMatches[0].score.toFixed(3)}`);
          }
        }
      } catch { /* non-fatal — shape-search is additive, never blocks compile */ }
    }
    // ────────────────────────────────────────────────────────────

    // Only embed compiled output when compile HAS errors OR when Meph
    // explicitly opted in via input.include_compiled. On a clean compile
    // with no opt-in, he just needs to know it worked — hasServerJS /
    // hasHTML flags signal that. Saves ~8-28KB of tool-result payload per
    // clean compile = ~1-2K tokens at Haiku input rate × thousands of
    // compiles per sweep. Meph can:
    //   • pass include_compiled=true to force it in
    //   • use edit_code action='read' for source
    //   • use source_map for compiled-line↔source-line mapping
    const wantCompiled = r.errors.length > 0 || input.include_compiled === true;
    if (wantCompiled) {
      if (r.serverJS) result.serverJS = r.serverJS.slice(0, 8000);
      if (r.javascript) result.javascript = r.javascript.slice(0, 8000);
      if (r.html) result.html = r.html.slice(0, 4000);
      if (r.python) result.python = r.python.slice(0, 8000);
      if (r.serverJS || r.javascript || r.html || r.python) {
        result.note = r.errors.length > 0
          ? 'Compiled output included because compile had errors — inspect for debugging.'
          : 'Compiled output included because you set include_compiled=true.';
      }
    }
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

/**
 * http_request tool — fetch the running child app at ctx.getRunningPort().
 * Used by Meph to drive the app end-to-end — hitting endpoints, pushing
 * form submissions, reading back JSON. 10s timeout (matches the pre-port
 * inline behavior) so a hung request can't stall the whole tool-use loop.
 *
 * Returns JSON-stringified { status, data } on success where data is the
 * parsed JSON body if parseable, else the raw text. On failure returns
 * { error } with the fetch exception message.
 *
 * Requires on ctx:
 *   - isAppRunning()    — gate: no app running → clear error, no fetch attempted
 *   - getRunningPort()  — port the child app is bound to
 *
 * @param {object} input - { method: GET|POST|PUT|DELETE|PATCH, path, body? }
 * @param {MephContext} ctx
 * @returns {Promise<string>} JSON-stringified { status, data } or { error }
 */
export async function httpRequestTool(input, ctx) {
  if (!ctx.isAppRunning()) return JSON.stringify({ error: 'No app running. Use run_app first.' });
  try {
    const port = ctx.getRunningPort();
    const url = `http://localhost:${port}${input.path || '/'}`;
    const opts = { method: input.method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (input.body && input.method !== 'GET') opts.body = JSON.stringify(input.body);
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    // Training signal: a 2xx against the running child app is a weak test
    // pass on the most recent compile row. Curriculum sweeps tell Meph to
    // verify via http_request (Clear `test` blocks don't exist in curriculum
    // skeletons), so without this hop Factor DB never records a passing row
    // for cc-agent sweeps. Guarded by compile_ok=1 so a successful fetch
    // against stale binaries doesn't false-positive. Non-fatal on any error.
    if (r.status >= 200 && r.status < 300 && ctx.factorDB && ctx.hintState?.lastFactorRowId) {
      try {
        ctx.factorDB._db.prepare(`
          UPDATE code_actions
          SET test_pass = 1,
              test_score = CASE WHEN test_score > 0.9 THEN test_score ELSE 0.9 END
          WHERE id = ? AND compile_ok = 1
        `).run(ctx.hintState.lastFactorRowId);
      } catch { /* non-fatal */ }
    }
    return JSON.stringify({ status: r.status, data });
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

/**
 * run_evals tool — run the full agent eval suite against ctx.source. Per-spec
 * progress events fire through ctx.send as { type: 'eval_row', ... } so the
 * Studio Tests pane can render a live list as each eval lands; the final
 * aggregate result is returned as an object (caller JSON.stringifies for
 * tool_result + also fans out eval_results via send).
 *
 * Delegates the heavy lifting to runEvalSuite from server.js (closure state
 * around evalChild + grading + LLM-scoring). We inject it as a third arg
 * rather than importing so meph-tools.js stays free of the eval-harness
 * dependency tree.
 *
 * @param {object} input - unused
 * @param {MephContext} ctx - source + send required
 * @param {(source, id, onProgress) => Promise<object>} runEvalSuite - injected
 * @returns {Promise<object>} aggregate eval result
 */
export async function runEvalsTool(input, ctx, runEvalSuite) {
  const onProgress = (ev) => ctx.send({ type: 'eval_row', ...ev });
  return runEvalSuite(ctx.source, undefined, onProgress);
}

/**
 * run_eval tool — run ONE eval by id. Returns a structured error if the
 * caller forgot the id (Meph has hallucinated this more than once). Otherwise
 * identical to runEvalsTool with a specific id passed through.
 *
 * @param {object} input - { id: string } (required)
 * @param {MephContext} ctx - source + send required
 * @param {(source, id, onProgress) => Promise<object>} runEvalSuite - injected
 * @returns {Promise<object>} single-eval result, or { ok: false, error } on missing id
 */
export async function runEvalTool(input, ctx, runEvalSuite) {
  if (!input.id) {
    return { ok: false, error: "Missing 'id' — use list_evals to see available ids." };
  }
  const onProgress = (ev) => ctx.send({ type: 'eval_row', ...ev });
  return runEvalSuite(ctx.source, input.id, onProgress);
}

/**
 * edit_file tool — read / append / insert / replace / overwrite on files in
 * the repo root. Restricted to safe extensions (.clear/.md/.json/.txt/.csv/
 * .html/.css/.js/.py) and a writable allowlist (.clear files anywhere,
 * requests.md, meph-memory.md). Path traversal blocked by stripping
 * non-alphanumerics from the filename.
 *
 * Stateless except for ctx.rootDir. Behavior matches the inline version
 * exactly so existing Meph eval scenarios stay valid.
 *
 * @param {object} input - { filename, action, content?, line?, find?, replace_all? }
 * @param {MephContext} ctx - rootDir required
 * @returns {string} JSON-stringified result
 */
export function editFileTool(input, ctx) {
  if (!input || !input.filename) {
    return JSON.stringify({ error: 'Missing required parameter "filename". You called edit_file without specifying which file. Example: edit_file({ filename: "requests.md", action: "append", content: "..." })' });
  }
  if (!input.action) {
    return JSON.stringify({ error: `Missing required parameter "action" for file "${input.filename}". Must be one of: append, insert, replace, overwrite, read. For adding content to the end of a file, use action="append".` });
  }
  const safeName = String(input.filename).replace(/[^a-zA-Z0-9._-]/g, '-');
  const ALLOWED_EXT = ['.clear', '.md', '.json', '.txt', '.csv', '.html', '.css', '.js', '.py'];
  const ext = safeName.includes('.') ? '.' + safeName.split('.').pop() : '';
  if (!ALLOWED_EXT.includes(ext)) {
    return JSON.stringify({ error: `File extension "${ext}" is not allowed. Allowed: ${ALLOWED_EXT.join(', ')}. You tried to access "${safeName}" — check the filename.` });
  }
  const dest = join(ctx.rootDir, safeName);
  const fileExists = existsSync(dest);
  // Safety: only allow modifying .clear files and requests.md/meph-memory.md
  const WRITABLE_EXISTING = ['requests.md', 'meph-memory.md'];
  const canWrite = !fileExists || ext === '.clear' || WRITABLE_EXISTING.includes(safeName);
  if (!canWrite && input.action !== 'read') {
    return JSON.stringify({ error: `Permission denied: "${safeName}" is read-only. You can only modify .clear files, requests.md, and meph-memory.md. To read this file instead, use action="read". To create a new file, pick a name that doesn't already exist.` });
  }

  switch (input.action) {
    case 'read': {
      if (!fileExists) return JSON.stringify({ error: `File "${safeName}" does not exist in the project root. Check the filename. Available writable files: requests.md, meph-memory.md, and any .clear files.` });
      const text = readFileSync(dest, 'utf8');
      const lines = text.split('\n');
      return JSON.stringify({ content: text, lines: lines.length, path: safeName });
    }
    case 'append': {
      if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for append action on "${safeName}". You need to provide the text to add. Example: edit_file({ filename: "${safeName}", action: "append", content: "new text here" })` });
      const existing = fileExists ? readFileSync(dest, 'utf8') : '';
      const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
      writeFileSync(dest, existing + separator + input.content, 'utf8');
      const newLines = (existing + separator + input.content).split('\n').length;
      return JSON.stringify({ ok: true, appended: true, path: safeName, bytes_added: input.content.length, total_lines: newLines });
    }
    case 'insert': {
      if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for insert action on "${safeName}". Provide the text to insert. Example: edit_file({ filename: "${safeName}", action: "insert", line: 10, content: "new line" })` });
      if (!input.line || input.line < 1) return JSON.stringify({ error: `Missing or invalid "line" parameter for insert action on "${safeName}". Provide a line number >= 1 where content should be inserted. Example: edit_file({ filename: "${safeName}", action: "insert", line: 5, content: "..." })` });
      const existing = fileExists ? readFileSync(dest, 'utf8') : '';
      const lines = existing.split('\n');
      if (input.line > lines.length + 1) {
        return JSON.stringify({ error: `Line ${input.line} is past the end of "${safeName}" (file has ${lines.length} lines). Use line=${lines.length + 1} to insert at the end, or use action="append" instead.` });
      }
      const idx = Math.min(input.line - 1, lines.length);
      lines.splice(idx, 0, ...input.content.split('\n'));
      writeFileSync(dest, lines.join('\n'), 'utf8');
      return JSON.stringify({ ok: true, inserted: true, path: safeName, at_line: input.line, total_lines: lines.length });
    }
    case 'replace': {
      if (!input.find) return JSON.stringify({ error: `Missing "find" parameter for replace action on "${safeName}". Provide the exact string to search for. Example: edit_file({ filename: "${safeName}", action: "replace", find: "old text", content: "new text" })` });
      if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for replace action on "${safeName}". Provide the replacement text. Example: edit_file({ filename: "${safeName}", action: "replace", find: "${(input.find || '').slice(0, 30)}", content: "replacement" })` });
      if (!fileExists) return JSON.stringify({ error: `Cannot replace in "${safeName}" — file does not exist. Use action="overwrite" or action="append" to create it.` });
      const text = readFileSync(dest, 'utf8');
      let result;
      if (input.replace_all) {
        const count = text.split(input.find).length - 1;
        if (count === 0) return JSON.stringify({ error: `String not found anywhere in "${safeName}" (${text.split('\n').length} lines). Your find string was: "${input.find.slice(0, 120)}". Try action="read" first to see the actual file content, then use the exact text from the file. Common causes: extra whitespace, wrong line endings, or the text was already changed by a previous edit.` });
        result = text.split(input.find).join(input.content);
        writeFileSync(dest, result, 'utf8');
        return JSON.stringify({ ok: true, replaced: true, path: safeName, occurrences: count });
      } else {
        const pos = text.indexOf(input.find);
        if (pos === -1) {
          // Help the AI debug: show nearby content
          const findLower = input.find.toLowerCase().slice(0, 40);
          const lowerText = text.toLowerCase();
          const nearIdx = lowerText.indexOf(findLower.slice(0, 20));
          const hint = nearIdx >= 0
            ? `Partial match found near character ${nearIdx}. The actual text there is: "${text.slice(Math.max(0, nearIdx - 10), nearIdx + 60).replace(/\n/g, '\\n')}"`
            : `No partial match found either. The file has ${text.split('\n').length} lines.`;
          return JSON.stringify({ error: `Exact string not found in "${safeName}". Your find string (first 120 chars): "${input.find.slice(0, 120)}". ${hint} Suggestion: use action="read" to see the current file content, then copy the exact text you want to replace. Common issues: extra/missing whitespace, the text was already changed, or line endings differ.` });
        }
        result = text.slice(0, pos) + input.content + text.slice(pos + input.find.length);
        writeFileSync(dest, result, 'utf8');
        return JSON.stringify({ ok: true, replaced: true, path: safeName, occurrences: 1 });
      }
    }
    case 'overwrite': {
      if (input.content == null) return JSON.stringify({ error: `Missing "content" parameter for overwrite action on "${safeName}". Provide the full file content. Warning: this replaces the entire file. If you only need to add content, use action="append" instead.` });
      writeFileSync(dest, input.content, 'utf8');
      const newLines = input.content.split('\n').length;
      return JSON.stringify({ ok: true, written: true, path: safeName, bytes: input.content.length, total_lines: newLines });
    }
    default:
      return JSON.stringify({ error: `Unknown action "${input.action}" for file "${safeName}". Valid actions: append (add to end), insert (add at line N), replace (find and replace text), overwrite (replace entire file), read (view content). You probably want "append" for adding new content or "replace" for modifying existing text.` });
  }
}

/**
 * read_terminal tool — surface the most recent terminal output + frontend
 * errors to Meph. Stateless except for ctx.terminal + ctx.frontendErrors,
 * which /api/chat mirrors from its closure-level buffers.
 *
 * Returns the last 80 terminal lines (matches the inline behavior) and the
 * last 20 frontend errors. No mutation, no I/O.
 *
 * @param {object} input - unused
 * @param {MephContext} ctx
 * @returns {string} JSON-stringified result
 */
export function readTerminalTool(input, ctx) {
  return JSON.stringify({
    terminal: ctx.terminal.slice(-80).join('\n'),
    frontendErrors: ctx.frontendErrors.slice(-20),
  });
}

/**
 * list_evals tool — compile the current source in eval mode and return the
 * eval suite (the per-agent + per-endpoint specs the test runner uses).
 *
 * Stateless. compileForEval is passed in to keep meph-tools.js free of
 * the eval-specific compile path import.
 *
 * @param {object} input - unused
 * @param {MephContext} ctx - source field is required
 * @param {function} compileForEval - eval-mode compiler entry point
 * @returns {string} JSON-stringified result
 */
export function listEvalsTool(input, ctx, compileForEval) {
  const compiled = compileForEval(ctx.source);
  if (!compiled.ok) return JSON.stringify(compiled);
  const suite = compiled.compiled.evalSuite || [];
  return JSON.stringify({ ok: true, suite, count: suite.length });
}

/**
 * patch_code tool — apply an array of structured edit operations to the
 * current source. Uses patch.js's 11-op grammar (fix_line, add_endpoint,
 * add_field, etc.). On any successful application, mutates ctx.source via
 * ctx.setSource() (which captures sourceBeforeEdit + fires the change
 * callback) and emits a code_update SSE event so the editor re-renders.
 *
 * Same shape as editCodeTool — patch is just passed in instead of
 * compileProgram so meph-tools.js doesn't import patch.js directly.
 *
 * @param {object} input - { operations: PatchOp[] }
 * @param {MephContext} ctx
 * @param {function} patch - the patch.js entry point (source, ops) => {applied, skipped, errors, source}
 * @returns {string} JSON-stringified result
 */
export function patchCodeTool(input, ctx, patch) {
  if (!ctx.source) return JSON.stringify({ error: 'No code in editor. Write code first.' });
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) {
    return JSON.stringify({ error: 'Need an operations array. Example: [{ op: "fix_line", line: 5, replacement: "  send back user" }]' });
  }
  const result = patch(ctx.source, ops);
  if (result.applied > 0) {
    ctx.setSource(result.source);
    ctx.send({ type: 'code_update', code: result.source });
  }
  return JSON.stringify({
    applied: result.applied,
    skipped: result.skipped,
    errors: result.errors,
    totalLines: result.source.split('\n').length,
  });
}

/**
 * source_map tool — given current Clear source, compile it with the source
 * map flag and return either the full mapping or just the compiled lines
 * for one Clear line (when input.clear_line is set).
 *
 * First port to take a MephContext — reads ctx.source, doesn't mutate
 * anything. The compileProgram dependency is passed in to avoid pulling
 * the full ../index.js into meph-tools.js (keeps the module tree-shakable
 * for the MCP server scenario where compileProgram might not be needed).
 *
 * @param {object} input - { clear_line? }
 * @param {MephContext} ctx - source field is required
 * @param {function} compileProgram - the Clear compiler entry point
 * @returns {string} JSON-stringified result
 */
export function sourceMapTool(input, ctx, compileProgram) {
  if (!ctx.source) return JSON.stringify({ error: 'No code in editor. Write code first.' });
  const compiled = compileProgram(ctx.source, { sourceMap: true });
  const target = compiled.serverJS || compiled.javascript || compiled.python;
  if (!target) return JSON.stringify({ error: 'No compiled output.' });

  const targetLines = target.split('\n');
  const map = {};
  let current = null;
  for (let i = 0; i < targetLines.length; i++) {
    const m = targetLines[i].match(/(?:\/\/|#) clear:(\d+)/);
    if (m) current = parseInt(m[1]);
    if (current != null) {
      (map[current] = map[current] || []).push(i + 1);
    }
  }

  if (input.clear_line) {
    const cl = input.clear_line;
    const compiledLines = map[cl];
    if (!compiledLines) return JSON.stringify({ result: `No compiled output maps to Clear line ${cl}.` });
    const snippet = compiledLines.map(n => `${n}: ${targetLines[n - 1]}`).join('\n');
    return JSON.stringify({ result: `Clear line ${cl} compiles to:\n${snippet}` });
  }

  const summary = Object.entries(map)
    .sort(([a], [b]) => a - b)
    .map(([cl, cls]) => `Clear ${cl} → compiled lines ${cls[0]}-${cls[cls.length - 1]}`)
    .join('\n');
  return JSON.stringify({ result: summary });
}
