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

    // Callbacks default to no-ops so handlers can call them
    // unconditionally without null-checking.
    this.send = options.send || (() => {});
    this.termLog = options.termLog || (() => {});
    this.onSourceChange = options.onSourceChange || (() => {});
    this.onErrorsChange = options.onErrorsChange || (() => {});
  }

  /**
   * Update the editor source. Fires onSourceChange so callers like
   * /api/chat can mirror into _workerLastSource for supervisor polling.
   */
  setSource(newSource) {
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
}

/**
 * Convenience builder for tests + the MCP server. Returns a context
 * with whatever defaults the caller chose, no side effects.
 */
export function createMephContext(options = {}) {
  return new MephContext(options);
}
