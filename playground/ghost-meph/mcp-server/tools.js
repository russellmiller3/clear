/*
 * MCP tool registry — tool definitions + handlers exposed to Claude Code.
 *
 * Per `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` step 1:
 * Meph has 8 tools (edit_code, read_file, run_command, compile, run_app,
 * stop_app, http_request, write_file). The MCP server exposes them under
 * the `meph_` prefix to avoid collision with Claude Code's built-in
 * Read/Write/Bash tools (e.g. `meph_read_file` vs `Read`).
 *
 * THIS FILE SHIPS ONLY THE REGISTRY SHAPE + 2 TOOL STUBS to verify the
 * MCP wiring works end-to-end. The real handlers go through the
 * MephContext refactor of `executeTool` (GM-2 step 2 followup) — until
 * that lands, the stubs return a clear "not implemented yet" message
 * with a pointer to the plan.
 *
 * Adding a new tool is two changes here: append a definition to TOOLS
 * and a handler to handlers. The dispatch in protocol.js looks up by
 * name and runs the handler.
 *
 * Tool definitions follow MCP's inputSchema = JSON Schema convention.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateToolInput, readFileTool } from '../../meph-tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root: this file is at <repo>/playground/ghost-meph/mcp-server/tools.js,
// so up three dirs.
const REPO_ROOT = join(__dirname, '..', '..', '..');

const NOT_IMPL_PREFIX = '[meph MCP server stub] tool not yet wired to executeTool — see plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md step 2 (executeTool refactor) and step 3 (port the 8 tool handlers). Until then this MCP server only echoes back the validated input.';

/**
 * Tool definitions exposed to Claude Code via tools/list. Names use the
 * `meph_` prefix per the plan's guidance (avoids collision with Claude
 * Code's built-in `Read`, `Write`, `Bash` tools).
 *
 * Schemas are intentionally narrower than meph-tools.js's validator —
 * the validator runs ALL checks; this schema is just the JSON Schema
 * shape the MCP client uses to render tool calls.
 */
export const TOOLS = [
  {
    name: 'meph_read_file',
    description: 'Read a file from the Clear repo. Use for SYNTAX.md, AI-INSTRUCTIONS.md, PHILOSOPHY.md, USER-GUIDE.md, requests.md.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename to read (relative to repo root).' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'meph_compile',
    description: 'Compile the current Clear source. Returns errors and warnings.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Map<name, async (input) => string|object>. Handlers receive the validated
 * input object and return either:
 *   - a plain string (wrapped as a text content block)
 *   - { content: [...] } (MCP shape, passed through)
 *   - { error: string } (marked as isError in the response)
 */
export const handlers = new Map([
  ['meph_read_file', async (input) => {
    // Run the standard validator first so we surface schema errors
    // identically to /api/chat's tool dispatch.
    const validationError = validateToolInput('read_file', input);
    if (validationError) return { error: validationError };
    // GM-2 step 3a: real handler — same shared implementation /api/chat
    // calls. Pass REPO_ROOT so the function can build absolute paths.
    return readFileTool(input, { rootDir: REPO_ROOT });
  }],
  ['meph_compile', async (input) => {
    const validationError = validateToolInput('compile', input);
    if (validationError) return { error: validationError };
    return `${NOT_IMPL_PREFIX}\n\nWould have compiled the current Clear source.`;
  }],
]);

/** Convenience builder — used by index.js and tests. */
export function buildToolRegistry() {
  return { tools: TOOLS, handlers };
}
