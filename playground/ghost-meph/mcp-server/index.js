#!/usr/bin/env node
/*
 * MCP server entry point — JSON-RPC 2.0 over stdio.
 *
 * Run: node playground/ghost-meph/mcp-server/index.js
 * Used by: Claude Code via `claude --mcp-config=<path>` once the cc-agent
 *          tool-use upgrade lands.
 *
 * Wire format: newline-delimited JSON. Each line on stdin is one request;
 * each line on stdout is one response. The MCP spec also supports
 * Content-Length-framed messages (LSP-style) but NDJSON is simpler and
 * what most reference servers use; we can swap later if needed.
 *
 * This file is just the I/O loop. Protocol logic lives in protocol.js.
 * Tool definitions + handlers live in tools.js. Both pure modules so
 * they're testable in isolation without spawning a subprocess.
 */

import { dispatch } from './protocol.js';
import { buildToolRegistry } from './tools.js';

const registry = buildToolRegistry();

// Accumulate stdin chunks and parse newline-delimited JSON.
let buffer = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();  // keep incomplete final line for next chunk

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (err) {
      // Per JSON-RPC 2.0: a parse error gets an error response with id=null.
      writeMessage({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: ' + err.message },
      });
      continue;
    }
    const response = await dispatch(message, registry);
    if (response !== null) writeMessage(response);
  }
});

process.stdin.on('end', () => {
  // Client closed stdin — exit cleanly.
  process.exit(0);
});

function writeMessage(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// Optional: log boot to stderr so the parent process can confirm we're alive.
// stdout is reserved for protocol responses, so anything diagnostic must go to stderr.
process.stderr.write(`[meph-mcp] server ready (protocol 2024-11-05, ${registry.tools.length} tools)\n`);
