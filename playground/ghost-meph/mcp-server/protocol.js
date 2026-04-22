/*
 * MCP protocol — JSON-RPC 2.0 message handling.
 *
 * GM-2 step 1 of `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`.
 * The cc-agent backend will spawn `claude` with `--mcp-config=<path>`
 * pointing at our MCP server (index.js). When the sub-agent calls a tool,
 * Claude Code dispatches the call to this server via JSON-RPC over stdio.
 * We translate to Meph's tool implementations and return the result.
 *
 * MCP wire format reference (per the Model Context Protocol spec):
 *   Request:      {jsonrpc: "2.0", id: N, method: "X", params: {...}}
 *   Response:     {jsonrpc: "2.0", id: N, result: {...}}
 *   Error:        {jsonrpc: "2.0", id: N, error: {code, message, data?}}
 *   Notification: {jsonrpc: "2.0", method: "X", params: {...}}  (no id)
 *
 * Methods we implement (subset of full MCP spec):
 *   - initialize             — handshake, returns server info + capabilities
 *   - notifications/initialized — client confirmation, no response
 *   - tools/list             — returns the tool definitions
 *   - tools/call             — runs a tool, returns content blocks
 *
 * Methods we do NOT implement yet (return -32601 method not found):
 *   - resources/*            — Meph doesn't expose static resources
 *   - prompts/*              — Meph doesn't expose prompt templates
 *   - sampling/*             — server-initiated LLM calls (advanced)
 *
 * Pure module — exports two functions:
 *   - dispatch(message, toolHandlers): returns the response (or null for
 *     notifications). Async — tool handlers can await.
 *   - The server (index.js) does the stdio I/O; this file is just protocol.
 */

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'meph-tools',
  version: '0.1.0',
};

/** Standard JSON-RPC 2.0 error codes plus a few MCP-specific ones. */
export const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

/**
 * Dispatch a single parsed JSON-RPC message to the right handler.
 *
 * @param {object} message - parsed JSON-RPC envelope
 * @param {object} toolRegistry - { tools: ToolDef[], handlers: Map<name, fn> }
 * @returns {Promise<object|null>} - response message (id matches request),
 *                                    or null for notifications (no reply)
 */
export async function dispatch(message, toolRegistry) {
  // Notifications have no id and expect no response.
  const isNotification = message.id === undefined || message.id === null;

  // Top-level shape check
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return isNotification ? null : errorResponse(message.id, ERROR_CODES.INVALID_REQUEST, 'Invalid JSON-RPC envelope');
  }

  try {
    switch (message.method) {
      case 'initialize':
        return isNotification ? null : okResponse(message.id, handleInitialize(message.params));

      case 'notifications/initialized':
        // Fire-and-forget — client telling us they're ready. Nothing to send back.
        return null;

      case 'tools/list':
        return isNotification ? null : okResponse(message.id, { tools: toolRegistry.tools });

      case 'tools/call': {
        if (isNotification) return null;
        const params = message.params || {};
        const name = params.name;
        const args = params.arguments || {};
        const handler = toolRegistry.handlers.get(name);
        if (!handler) {
          return errorResponse(message.id, ERROR_CODES.METHOD_NOT_FOUND, `Tool not found: ${name}`);
        }
        const result = await handler(args);
        // MCP tools/call result shape: { content: [{type: "text", text: "..."}], isError?: bool }
        return okResponse(message.id, normalizeToolResult(result));
      }

      // Methods we don't implement — fail cleanly so the client knows.
      case 'resources/list':
      case 'resources/read':
      case 'prompts/list':
      case 'prompts/get':
        return isNotification ? null : errorResponse(message.id, ERROR_CODES.METHOD_NOT_FOUND, `Not implemented: ${message.method}`);

      default:
        return isNotification ? null : errorResponse(message.id, ERROR_CODES.METHOD_NOT_FOUND, `Unknown method: ${message.method}`);
    }
  } catch (err) {
    if (isNotification) return null;
    return errorResponse(message.id, ERROR_CODES.INTERNAL_ERROR, err && err.message ? err.message : String(err));
  }
}

function handleInitialize(params) {
  // Echo the protocol version the client requested when we support it,
  // else return our own version. Clients are expected to handle either.
  const requested = params && params.protocolVersion;
  return {
    protocolVersion: requested || PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
  };
}

function normalizeToolResult(result) {
  // Handlers can return either:
  //   - a plain string → wrap in a text content block
  //   - an object with .content array → pass through
  //   - an object with .error string → mark as error result
  //   - anything else → JSON-stringify and wrap
  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }] };
  }
  if (result && Array.isArray(result.content)) {
    return result;  // already a valid MCP tool result
  }
  if (result && typeof result.error === 'string') {
    return { content: [{ type: 'text', text: result.error }], isError: true };
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

function okResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}
