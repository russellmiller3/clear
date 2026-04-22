/*
 * MephContext — bundles the closure state /api/chat's tool dispatch needs
 * so individual tool implementations can be ported out of the request
 * closure into pure(-ish) functions.
 *
 * GM-2 of `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`. Each
 * tool that mutates closure state takes `(input, ctx)` where `ctx` is a
 * MephContext. Mutations are made through the context (e.g.
 * `ctx.setSource(s)`) so server.js can shadow into _workerLastSource and
 * the MCP server can do whatever bookkeeping it needs without touching
 * the tool implementation.
 *
 * Design philosophy: GROW THIS CLASS LAZILY. Add a field only when the
 * tool being ported needs it. This first cut has the minimum the
 * source_map port requires (source + rootDir + setters/getters). When
 * `compile` ports it'll grow factorDB / sessionId / sessionSteps / hint
 * tracking; when `edit_code` ports it'll grow sourceBeforeEdit; etc. By
 * the time all tools are ported, every field will have at least one
 * consumer — no speculative shape.
 *
 * Construction options (all optional, sensible defaults):
 *   rootDir       — string, repo root for read_file / write_file
 *   source        — initial Clear source
 *   errors        — initial validator/compiler errors array
 *   send          — fn(obj) — emit SSE-style event back to caller
 *   termLog       — fn(msg) — append to terminal pane
 *   onSourceChange — fn(newSource) — fired AFTER ctx.setSource() updates
 *                    internal state. /api/chat hooks this to mirror into
 *                    _workerLastSource for the supervisor's polling endpoint.
 *   onErrorsChange — fn(newErrors) — same shape, mirrors to _workerLastErrors.
 */

export class MephContext {
  constructor(options = {}) {
    this.rootDir = options.rootDir || '.';
    this.source = options.source || '';
    this.errors = options.errors || [];

    // Captured source state — populated by setSource() before each write
    // so subsequent compile/Factor-DB rows can reference what Meph edited
    // FROM (used for source_before logging and undo).
    this.sourceBeforeEdit = options.sourceBeforeEdit || '';

    // The full compile result from the most recent compileProgram() call.
    // Tools that need the compiled JS / Python / HTML / errors / warnings
    // can read it here without recompiling. Updated by edit_code (write)
    // and by compile.
    this.lastCompileResult = options.lastCompileResult || null;

    // Diagnostic buffers — read-only from the tool's perspective. /api/chat
    // mirrors its closure-level terminalBuffer + frontendErrors +
    // _networkBuffer + _websocketBuffer arrays through these so the
    // surface tools (read_terminal, read_network, websocket_log) can slice
    // a tail back to Meph in tool results.
    this.terminal = options.terminal || [];
    this.frontendErrors = options.frontendErrors || [];
    this.networkBuffer = options.networkBuffer || [];
    this.websocketBuffer = options.websocketBuffer || [];

    // Callbacks default to no-ops so handlers can call them
    // unconditionally without null-checking.
    this.send = options.send || (() => {});
    this.termLog = options.termLog || (() => {});
    this.onSourceChange = options.onSourceChange || (() => {});
    this.onErrorsChange = options.onErrorsChange || (() => {});

    // Bridge-tool callbacks. /api/chat hooks these to /api/run's
    // runningChild + sendBridgeCommandFromServer; the MCP server can
    // mock or skip them depending on whether tools are connected to
    // a real running app.
    this.isAppRunning = options.isAppRunning || (() => false);
    this.sendBridgeCommand = options.sendBridgeCommand || (async () => ({ error: 'Bridge command not wired in this MephContext.' }));
    // Subprocess-tool callbacks. stopRunningApp() kills the child started
    // by run_app. /api/chat hooks it to runningChild.kill('SIGTERM') +
    // runningChild = null.
    this.stopRunningApp = options.stopRunningApp || (() => false);

    // Build directory — where the compiled child app writes its SQLite
    // database (BUILD_DIR/clear-data.db). db_inspect reads from there.
    this.buildDir = options.buildDir || '';

    // Allowlist of command prefixes that run_command is permitted to exec.
    // /api/chat passes the closure-level ALLOWED_PREFIXES (currently
    // ['node ', 'curl ', 'ls ', 'cat ']). Defaults to empty array — no
    // command runs unless the caller explicitly populates this.
    this.allowedCommandPrefixes = options.allowedCommandPrefixes || [];

    // Meph todo state. /api/chat owns a closure-level mephTodos array;
    // setTodos() fires onTodosChange so the closure var stays in sync.
    this.todos = options.todos || [];
    this.onTodosChange = options.onTodosChange || (() => {});

    // URL for the recorder-buffer endpoint (used by read_actions). Defaults
    // to the same Studio server the tool is running inside; injection point
    // for tests.
    this.mephActionsUrl = options.mephActionsUrl || `http://localhost:${process.env.PORT || 3456}/api/meph-actions`;

    // Playwright page accessor (async). /api/chat hooks this to its
    // closure-level getPage() which lazy-launches chromium and caches the
    // page. screenshot_output uses it to take a PNG of the running app.
    // Defaults to throwing so unwired contexts (e.g. the MCP server when no
    // Studio is up) fail loudly instead of silently returning nothing.
    this.getPage = options.getPage || (async () => { throw new Error('Screenshot not wired in this MephContext — no Playwright page available.'); });

    // Port the child app started by run_app is listening on. /api/chat's
    // closure tracks runningPort; screenshot_output references it for the
    // user-facing caption. Returns null when no app is running.
    this.getRunningPort = options.getRunningPort || (() => null);

    // run_app callbacks. /api/chat's closure owns `runningChild` + the
    // `runningPort` counter that wraps 4001→4100. getRunningChild returns
    // the current child (so run_app can kill it before respawning);
    // setRunningChild stores the new child (and fires the exit cleanup);
    // allocatePort returns the next TCP port to bind, increments + wraps
    // the counter server-side. Defaults here are safe no-ops that return
    // null so unwired contexts (MCP server without a running app) behave
    // predictably — run_app will fail at the spawn step instead of silently
    // running on a random port.
    this.getRunningChild = options.getRunningChild || (() => null);
    this.setRunningChild = options.setRunningChild || (() => {});
    this.allocatePort = options.allocatePort || (() => null);

    // Anthropic API key forwarded into `node cli/clear.js test` so agent-
    // backed tests can call real Claude. /api/chat hooks this to the
    // closure-level storedApiKey populated from Meph's config pane.
    // Unset → no ANTHROPIC_API_KEY in the child env (agent tests will fail
    // cleanly with a missing-key error from cli/clear.js).
    this.apiKey = options.apiKey || null;
  }

  /**
   * Update the editor source. Captures the previous source into
   * sourceBeforeEdit (so callers can log source_before for Factor DB
   * rows or implement undo) and fires onSourceChange so /api/chat can
   * mirror into _workerLastSource for supervisor polling.
   */
  setSource(newSource) {
    this.sourceBeforeEdit = this.source;
    this.source = newSource;
    this.onSourceChange(newSource);
  }

  /**
   * Update the editor errors array. Fires onErrorsChange the same way.
   */
  setErrors(newErrors) {
    this.errors = newErrors;
    this.onErrorsChange(newErrors);
  }

  /**
   * Update lastCompileResult after a compile. No callback — internal cache.
   */
  setLastCompileResult(result) {
    this.lastCompileResult = result;
  }

  /**
   * Replace the Meph todos list. Fires onTodosChange so /api/chat can
   * mirror back to its closure-level mephTodos var.
   */
  setTodos(newTodos) {
    this.todos = Array.isArray(newTodos) ? newTodos : [];
    this.onTodosChange(this.todos);
  }
}

/**
 * Convenience builder for tests + the MCP server. Returns a context
 * with whatever defaults the caller chose, no side effects.
 */
export function createMephContext(options = {}) {
  return new MephContext(options);
}
