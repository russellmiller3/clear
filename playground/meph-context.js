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

    // Meph todo state. /api/chat owns a closure-level mephTodos array;
    // setTodos() fires onTodosChange so the closure var stays in sync.
    this.todos = options.todos || [];
    this.onTodosChange = options.onTodosChange || (() => {});

    // URL for the recorder-buffer endpoint (used by read_actions). Defaults
    // to the same Studio server the tool is running inside; injection point
    // for tests.
    this.mephActionsUrl = options.mephActionsUrl || `http://localhost:${process.env.PORT || 3456}/api/meph-actions`;
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
