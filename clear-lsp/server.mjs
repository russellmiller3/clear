#!/usr/bin/env node
// Clear Language Server (LSP) — entry point
//
// Speaks LSP over stdio. Editors (VSCode, Cursor, Zed, JetBrains via plugin)
// launch this binary, and we publish:
//
//   - Diagnostics (errors + warnings) by calling the Clear Compiler API.
//   - Completions by scanning the open document locally for keywords +
//     defined components / functions / pages.
//
// Diagnostics fire on didOpen + didChange (debounced) + didSave.
// Completions are synchronous (no network).
//
// Configuration (passed in initialize.initializationOptions):
//   - compilerApi: URL of the Compiler API (default: https://compile.clearlang.dev)
//   - debounceMs: wait this long after the last keystroke before validating (default: 400)
//
// Run standalone for debugging: node server.mjs

import { createTransport } from './lib/jsonrpc.mjs';
import { createCompilerClient } from './lib/compiler-client.mjs';
import { getCompletions, extractPrefix } from './lib/completions.mjs';

const documents = new Map(); // uri -> { text, version }
const debounceTimers = new Map(); // uri -> timeoutId

let transport;
let client;
let debounceMs = 400;

const transportInput = process.stdin;
const transportOutput = process.stdout;

transport = createTransport(transportInput, transportOutput, handleMessage);

function send(message) {
  transport.send(message);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

function handleMessage(msg) {
  if (msg.method === 'initialize') {
    const opts = (msg.params && msg.params.initializationOptions) || {};
    if (opts.compilerApi) client = createCompilerClient(opts.compilerApi);
    if (typeof opts.debounceMs === 'number' && opts.debounceMs >= 0) debounceMs = opts.debounceMs;
    if (!client) client = createCompilerClient();
    reply(msg.id, {
      capabilities: {
        textDocumentSync: { openClose: true, change: 1 }, // full doc on every change
        completionProvider: { triggerCharacters: ["'", ' '] },
        hoverProvider: false,
        definitionProvider: false,
      },
      serverInfo: { name: 'clear-lsp', version: '0.1.0' },
    });
    return;
  }

  if (msg.method === 'initialized') return;

  if (msg.method === 'shutdown') {
    reply(msg.id, null);
    return;
  }

  if (msg.method === 'exit') {
    process.exit(0);
  }

  if (msg.method === 'textDocument/didOpen') {
    const { textDocument } = msg.params;
    documents.set(textDocument.uri, { text: textDocument.text, version: textDocument.version });
    scheduleValidate(textDocument.uri, 0); // validate immediately on open
    return;
  }

  if (msg.method === 'textDocument/didChange') {
    const { textDocument, contentChanges } = msg.params;
    const doc = documents.get(textDocument.uri) || { text: '', version: 0 };
    // We registered Full sync (capability code 1), so the last change has the whole text.
    if (contentChanges && contentChanges.length > 0) {
      doc.text = contentChanges[contentChanges.length - 1].text;
      doc.version = textDocument.version;
      documents.set(textDocument.uri, doc);
    }
    scheduleValidate(textDocument.uri, debounceMs);
    return;
  }

  if (msg.method === 'textDocument/didSave') {
    scheduleValidate(msg.params.textDocument.uri, 0);
    return;
  }

  if (msg.method === 'textDocument/didClose') {
    documents.delete(msg.params.textDocument.uri);
    notify('textDocument/publishDiagnostics', {
      uri: msg.params.textDocument.uri,
      diagnostics: [],
    });
    return;
  }

  if (msg.method === 'textDocument/completion') {
    handleCompletion(msg);
    return;
  }
}

function scheduleValidate(uri, delay) {
  const existing = debounceTimers.get(uri);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(uri);
    validate(uri);
  }, delay);
  debounceTimers.set(uri, timer);
}

async function validate(uri) {
  const doc = documents.get(uri);
  if (!doc) return;
  let result;
  try {
    result = await client.compile(doc.text);
  } catch (err) {
    notify('window/logMessage', { type: 1, message: `clear-lsp: compile call failed: ${err.message}` });
    return;
  }
  const diagnostics = [];
  for (const e of (result.errors || [])) {
    diagnostics.push(toDiagnostic(e, 1, doc.text));
  }
  for (const w of (result.warnings || [])) {
    diagnostics.push(toDiagnostic(w, 2, doc.text));
  }
  notify('textDocument/publishDiagnostics', { uri, diagnostics });
}

// Convert a Clear compiler error/warning to an LSP Diagnostic.
// Severity 1=Error, 2=Warning.
// Compiler line numbers are 1-indexed; LSP positions are 0-indexed.
function toDiagnostic(item, severity, text) {
  const lineNum = Math.max(0, (item.line || 1) - 1);
  const lines = text.split('\n');
  const lineText = lines[lineNum] || '';
  return {
    severity,
    range: {
      start: { line: lineNum, character: 0 },
      end: { line: lineNum, character: lineText.length },
    },
    message: item.message || 'Unknown',
    source: 'clear',
  };
}

function handleCompletion(msg) {
  const { textDocument, position } = msg.params;
  const doc = documents.get(textDocument.uri);
  if (!doc) {
    reply(msg.id, { isIncomplete: false, items: [] });
    return;
  }
  const lines = doc.text.split('\n');
  const line = lines[position.line] || '';
  const prefix = extractPrefix(line, position.character);
  const completions = getCompletions(doc.text, prefix);
  reply(msg.id, {
    isIncomplete: false,
    items: completions.map((c) => ({
      label: c.label,
      kind: c.kind,
      detail: c.detail,
    })),
  });
}
