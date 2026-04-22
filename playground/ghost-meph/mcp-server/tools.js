/*
 * MCP tool registry — definitions + handlers exposed to Claude Code.
 *
 * Per `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` step 2a:
 * every ported Meph tool gets a `meph_<name>` MCP handler that routes
 * through the shared dispatchTool export from `playground/meph-tools.js`.
 * The `meph_` prefix avoids collision with Claude Code's built-in
 * Read/Write/Bash tools (e.g. `meph_read_file` vs `Read`).
 *
 * The MCP server runs as a stdio child of Claude Code — isolated from the
 * Studio process. Module-level state below (currentSource, currentErrors,
 * lastCompileResult, hintState) mirrors what /api/chat tracks in its
 * closure. Each tool call mutates this state; subsequent calls see the
 * latest version. This lets Meph drive a multi-turn build-compile-test
 * loop through the MCP protocol the same way he does through /api/chat.
 *
 * Tools that need infrastructure the MCP server doesn't have (a live
 * child app for http_request / db_inspect, a Playwright browser for
 * screenshot_output / click_element, a Factor DB for the re-ranker)
 * still route through dispatchTool — the per-tool guards inside each
 * ported function surface a clean error ("No app running. Use run_app
 * first.") which Claude Code relays back to the model.
 *
 * Adding a new tool is one change: add an entry to MEPH_TOOLS below.
 * The handler-registration loop at the bottom handles the rest.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { compileProgram } from '../../../index.js';
import { patch } from '../../../patch.js';
import { FactorDB } from '../../supervisor/factor-db.js';
import {
  rank as rankEBM,
  featurizeFactorRow as featurizeRow,
  rankPairwise,
  classifyErrorCategory,
} from '../../supervisor/ebm-scorer.js';
import { classifyArchetype } from '../../supervisor/archetype.js';
import { dispatchTool, validateToolInput } from '../../meph-tools.js';
import { MephContext } from '../../meph-context.js';
import { parseTestOutput, compileForEval as _compileForEval } from '../../meph-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root: this file is at <repo>/playground/ghost-meph/mcp-server/tools.js,
// so up three dirs.
const REPO_ROOT = join(__dirname, '..', '..', '..');

// ── Module-level state ──────────────────────────────────────────────
// Mutates across tool calls. Persists for the life of this MCP subprocess
// (one Claude Code session). Reset when the process exits — no crash recovery
// because each sweep/session gets a fresh MCP child anyway.
let currentSource = '';
let currentErrors = [];
let lastCompileResult = null;
let mephTodos = [];
const hintState = {
  lastFactorRowId: null,
  hintsInjectedRowId: null,
  hintsInjectedErrorCount: null,
  hintsInjectedTier: null,
  postHintMinErrorCount: null,
};

// ── Helpers (pure) ──────────────────────────────────────────────────
// Mirror the server.js closure helpers. sha1 uses crypto directly;
// safeArchetype wraps classifyArchetype; currentStep is a no-op in MCP
// mode because sessionSteps is always empty (no curriculum tracking yet).
const sha1 = (str) => createHash('sha1').update(String(str || ''), 'utf8').digest('hex');
const safeArchetype = (source) => {
  try { return classifyArchetype(source) || 'unknown'; }
  catch { return 'unknown'; }
};
const currentStep = () => null;

/**
 * Build a MephContext wired to this MCP subprocess's state. Each
 * tool call gets a fresh ctx but the state fields it reads (source,
 * errors, lastCompileResult, hintState) reference the module-level
 * vars so mutations persist across calls.
 *
 * Fields that need live infrastructure the MCP server can't provide
 * (Playwright page, running child app, Factor DB) default to safe
 * no-ops so the ported tool functions fail with a clean "not available"
 * error rather than crashing.
 */
// Lazy-opened FactorDB instance. Shared across all tool calls in a single
// MCP subprocess. Opened on first buildMephContext() if FACTOR_DB_PATH env
// is set AND the file exists. Stays null otherwise — the compile tool
// already handles a null factorDB gracefully (skips logAction + hint
// retrieval, just compiles and returns).
let _factorDb = null;
let _factorDbChecked = false;
function getFactorDb() {
  if (_factorDbChecked) return _factorDb;
  _factorDbChecked = true;
  const path = process.env.FACTOR_DB_PATH;
  if (!path) return null;
  try {
    if (!existsSync(path)) return null;
    _factorDb = new FactorDB(path);
    return _factorDb;
  } catch {
    return null;
  }
}

/** Test hook — forget the cached factorDB handle so env changes take effect. */
export function _resetFactorDbCache() {
  try { _factorDb?.close?.(); } catch {}
  _factorDb = null;
  _factorDbChecked = false;
}

function buildMephContext() {
  const ctx = new MephContext({
    source: currentSource,
    errors: currentErrors,
    lastCompileResult,
    rootDir: REPO_ROOT,
    buildDir: join(REPO_ROOT, '.meph-build'),
    todos: mephTodos,
    onTodosChange: (t) => { mephTodos = t; },
    onSourceChange: (s) => { currentSource = s; },
    onErrorsChange: (e) => { currentErrors = e; },
    // Factor DB wired when FACTOR_DB_PATH env points at an existing SQLite
    // file. cc-agent.js sets this automatically during sweep runs so
    // compile cycles feed the flywheel. Null otherwise (interactive
    // cc-agent sessions without sweep infrastructure).
    factorDB: getFactorDb(),
    // Session id so every row belongs to a traceable run. Falls back to
    // a per-process stamp if caller didn't provide one.
    sessionId: process.env.MEPH_SESSION_ID || ('mcp_' + process.pid + '_' + Date.now()),
    hintState,
  });
  return ctx;
}

function buildHelpers() {
  return {
    compileProgram,
    patch,
    sha1,
    currentStep,
    safeArchetype,
    classifyErrorCategory,
    rankPairwise,
    rankEBM,
    featurizeRow,
    // parseTestOutput + compileForEval extracted from server.js so the
    // MCP server can run run_tests + list_evals without starting Studio.
    parseTestOutput,
    compileForEval: (source) => _compileForEval(source, compileProgram),
    // runEvalSuite proxies back to Studio's /api/run-eval endpoint when
    // STUDIO_URL is set in the MCP child's env. Studio owns the
    // evalChild subprocess lifecycle (spawn, port 4999, auth bootstrap,
    // grader calls); we just forward {source, id} and unwrap the JSON
    // result. In cc-agent mode the cc-agent.js config writer sets
    // STUDIO_URL automatically. Without it, we return a clean error.
    runEvalSuite: async (source, id, onProgress) => {
      const studioUrl = process.env.STUDIO_URL;
      if (!studioUrl) {
        return {
          ok: false,
          error: 'MCP server has no STUDIO_URL set — run_evals / run_eval not available in standalone mode. Set STUDIO_URL to the Studio host (e.g. http://localhost:3456) in the MCP config env.',
        };
      }
      // onProgress callbacks can't cross the HTTP boundary cleanly
      // (Studio would need SSE + we'd need to parse it) so we drop them
      // here. Meph gets the final aggregate result; per-spec progress
      // happens in Studio's terminal pane and is visible there.
      try {
        const res = await fetch(`${studioUrl}/api/run-eval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, id }),
          // 5-minute cap matches Studio's own test runner; eval suites
          // can exceed this but the 180s-per-spec default × up to 17
          // specs = ~50 minutes worst case. If Meph hits the cap it's
          // a real signal the suite is too big for one call.
          signal: AbortSignal.timeout(300000),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, error: `Studio /api/run-eval returned ${res.status}: ${text.slice(0, 200)}` };
        }
        return await res.json();
      } catch (err) {
        return { ok: false, error: `Studio proxy failed: ${err.message}` };
      }
    },
  };
}

// ── Tool definitions ────────────────────────────────────────────────
//
// The input schemas are intentionally minimal: each is `type: object` with
// the name in the description. The real validation happens inside
// dispatchTool via validateToolInput from meph-tools.js — same rules as
// /api/chat enforces. This keeps the MCP surface tight without duplicating
// the 120-line JSON Schema for every tool.
//
// If a Claude Code user needs richer schemas (for tool-call UX), the
// schemas can grow later without changing the wire contract.

const MEPH_TOOLS = [
  { name: 'edit_code',         desc: 'Read, write, or undo the current Clear source. Input: { action: "read"|"write"|"undo", code?: string }.' },
  { name: 'read_file',         desc: 'Read a Clear repo doc (SYNTAX.md, AI-INSTRUCTIONS.md, PHILOSOPHY.md, USER-GUIDE.md, requests.md, meph-memory.md). Input: { filename, startLine?, endLine? }.' },
  { name: 'edit_file',         desc: 'Read / append / insert / replace / overwrite a writable file. Input: { filename, action, content?, line?, find? }.' },
  { name: 'compile',           desc: 'Compile the current Clear source. Returns errors + warnings + shape flags. Input: { include_compiled?: boolean }.' },
  { name: 'run_command',       desc: 'Exec an allowlisted shell command from the repo root. Input: { command: string }. 15s timeout.' },
  { name: 'http_request',      desc: 'Fetch a running app endpoint. Input: { method, path, body? }. Requires run_app first.' },
  { name: 'run_app',           desc: 'Spawn `node server.js` from the compiled output. Returns { started, port }. Not yet available in MCP mode.' },
  { name: 'stop_app',          desc: 'Kill the child started by run_app. Not yet available in MCP mode.' },
  { name: 'run_tests',         desc: 'Run the app\'s test blocks via `node cli/clear.js test`. Not yet available in MCP mode (needs parseTestOutput extraction).' },
  { name: 'list_evals',        desc: 'List agent-eval specs the current source would run. Not yet available in MCP mode (needs compileForEval extraction).' },
  { name: 'run_evals',         desc: 'Run the full agent eval suite. Not yet available in MCP mode (needs runEvalSuite extraction).' },
  { name: 'run_eval',          desc: 'Run one agent eval by id. Not yet available in MCP mode.' },
  { name: 'click_element',     desc: 'Click a DOM element in the running app. Not yet available in MCP mode (no Playwright).' },
  { name: 'fill_input',        desc: 'Fill a form input in the running app. Not yet available in MCP mode.' },
  { name: 'inspect_element',   desc: 'Inspect CSS of a DOM element. Not yet available in MCP mode.' },
  { name: 'read_storage',      desc: 'Read localStorage / sessionStorage / cookies. Not yet available in MCP mode.' },
  { name: 'read_dom',          desc: 'Snapshot the DOM structure. Not yet available in MCP mode.' },
  { name: 'read_network',      desc: 'Read the last N network requests the running app made. Not yet available in MCP mode.' },
  { name: 'read_terminal',     desc: 'Read recent terminal + frontend-error buffer. Not yet available in MCP mode (needs Studio buffer bridge).' },
  { name: 'read_actions',      desc: 'Read the user-action recorder buffer. Not yet available in MCP mode.' },
  { name: 'websocket_log',     desc: 'Read recent WebSocket messages. Not yet available in MCP mode.' },
  { name: 'db_inspect',        desc: 'Run a SELECT against the running app\'s SQLite DB. Not yet available in MCP mode.' },
  { name: 'screenshot_output', desc: 'Capture a PNG of the running app. Not yet available in MCP mode.' },
  { name: 'source_map',        desc: 'Map between Clear source lines and compiled output lines. Input: { clear_line? }.' },
  { name: 'highlight_code',    desc: 'Highlight a line range in the editor. Input: { start_line, end_line?, message? }.' },
  { name: 'patch_code',        desc: 'Apply structured edit operations to the source. Input: { operations: [{op, ...}] }.' },
  { name: 'todo',              desc: 'Get or set Meph\'s todo list. Input: { action: "get"|"set", todos?: [...] }.' },
  { name: 'browse_templates',  desc: 'List or read Clear example templates. Input: { action: "list"|"read", name? }.' },
];

/**
 * MCP tool definitions. The wire format is JSON Schema in inputSchema;
 * meph-tools.js's validator enforces the actual argument shapes.
 */
export const TOOLS = MEPH_TOOLS.map(t => ({
  name: `meph_${t.name}`,
  description: t.desc,
  inputSchema: {
    type: 'object',
    // Leave properties empty so Claude Code treats the tool as "any object".
    // validateToolInput inside dispatchTool enforces the real schema.
    properties: {},
    // additionalProperties permits Meph to pass whatever the validator expects.
    additionalProperties: true,
  },
}));

/**
 * Handler factory — one per tool. Each handler strips the `meph_` prefix,
 * builds a fresh MephContext around the module-level state, and routes
 * through dispatchTool. Tool-side state mutations (source, errors,
 * compile result, hints) persist because the context callbacks write
 * back to the module vars.
 *
 * MCP response shape is handled by protocol.js's normalizeToolResult:
 *   - string → { content: [{type:"text", text}] }
 *   - { error } → marked isError, message wrapped as text
 *   - array → passed through (so screenshot_output's image+text content
 *     blocks flow correctly once that tool is MCP-eligible)
 */
function buildHandler(mephName) {
  return async (args) => {
    const ctx = buildMephContext();
    const helpers = buildHelpers();
    try {
      const result = await dispatchTool(mephName, args, ctx, helpers);
      // Mirror state the tools mutated on ctx back to module vars.
      if (ctx.lastCompileResult) lastCompileResult = ctx.lastCompileResult;
      // hintState is shared by reference so no mirroring needed.

      // When dispatchTool returns a schema-error string, surface it as an
      // MCP error result (isError: true) so Claude Code flags it in the
      // tool-result UI rather than silently passing it to the model as a
      // plain tool output. validateToolInput's rejection prefixes the
      // string with a schemaError flag; we look for that here.
      if (typeof result === 'string') {
        try {
          const parsed = JSON.parse(result);
          if (parsed && parsed.schemaError === true) {
            return { error: parsed.error || 'Schema error' };
          }
        } catch { /* not JSON — just a plain tool output string */ }
      }
      return result;
    } catch (err) {
      return { error: `meph_${mephName} threw: ${err.message || String(err)}` };
    }
  };
}

export const handlers = new Map(
  MEPH_TOOLS.map(t => [`meph_${t.name}`, buildHandler(t.name)])
);

/** Convenience builder — used by index.js and tests. */
export function buildToolRegistry() {
  return { tools: TOOLS, handlers };
}

/** Testing hook — lets tests reset module state between scenarios. */
export function _resetMcpState() {
  currentSource = '';
  currentErrors = [];
  lastCompileResult = null;
  mephTodos = [];
  hintState.lastFactorRowId = null;
  hintState.hintsInjectedRowId = null;
  hintState.hintsInjectedErrorCount = null;
  hintState.hintsInjectedTier = null;
  hintState.postHintMinErrorCount = null;
}

/** Testing hook — inspect the MephContext the MCP server would build. */
export function _testBuildMephContext() {
  return buildMephContext();
}
