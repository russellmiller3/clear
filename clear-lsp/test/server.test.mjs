// clear-lsp tests — exercise the pure pieces (completions, jsonrpc framing,
// compiler-client error mapping) directly. Full server integration test
// would spawn the binary and pipe LSP messages; for v1 we trust the unit
// surfaces and cover the protocol later if behaviors regress.
//
// Run: node clear-lsp/test/server.test.mjs

import { describe, it, expect, run } from '../../lib/testUtils.js';
import { getCompletions, extractPrefix } from '../lib/completions.mjs';
import { createTransport } from '../lib/jsonrpc.mjs';
import { Readable, Writable } from 'node:stream';

describe('clear-lsp/completions — local scan', () => {
  it('finds component definitions in the document', () => {
    const doc = `
build for web
define component Card receiving title:
  heading title

define component Sidebar:
  text 'left'
`;
    const items = getCompletions(doc, '');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Card');
    expect(labels).toContain('Sidebar');
  });

  it('finds function definitions', () => {
    const doc = `
define function double(x):
  return x * 2
`;
    const items = getCompletions(doc, '');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('double');
  });

  it('finds page names with quotes', () => {
    const doc = `
page 'Home' at '/':
  heading 'hi'

page 'About' at '/about':
  heading 'about'
`;
    const items = getCompletions(doc, '');
    const labels = items.map((i) => i.label);
    expect(labels).toContain("'Home'");
    expect(labels).toContain("'About'");
  });

  it('suggests namespaced prefix when a module is imported', () => {
    const doc = `use 'ui'\npage 'x':\n  heading 'y'`;
    const items = getCompletions(doc, '');
    const labels = items.map((i) => i.label);
    expect(labels).toContain("ui's ");
  });

  it('filters by prefix (case-insensitive)', () => {
    const doc = `define component Greeting:\n  text 'hi'`;
    const items = getCompletions(doc, 'gre');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Greeting');
    // "page" doesn't match prefix
    expect(labels).not.toContain('page');
  });

  it('returns common keywords as fallback', () => {
    const items = getCompletions('', '');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('page');
    expect(labels).toContain('section');
    expect(labels).toContain('heading');
  });
});

describe('clear-lsp/completions — extractPrefix', () => {
  it('extracts the partial identifier ending at the cursor', () => {
    expect(extractPrefix('show Car', 8)).toBe('Car');
    expect(extractPrefix('  define com', 12)).toBe('com');
  });

  it('returns empty string when cursor is in whitespace', () => {
    expect(extractPrefix('show ', 5)).toBe('');
  });

  it('handles a cursor at the start of the line', () => {
    expect(extractPrefix('show', 0)).toBe('');
  });
});

describe('clear-lsp/jsonrpc — message framing', () => {
  it('parses a single Content-Length-framed message', async () => {
    const messages = [];
    const input = new Readable({ read() {} });
    const output = new Writable({ write(chunk, enc, cb) { cb(); } });
    createTransport(input, output, (m) => messages.push(m));

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    input.push(frame);
    input.push(null);

    // Wait one tick for the data event to drain
    await new Promise((res) => setImmediate(res));
    expect(messages).toHaveLength(1);
    expect(messages[0].method).toBe('initialize');
    expect(messages[0].id).toBe(1);
  });

  it('parses two messages arriving in one chunk', async () => {
    const messages = [];
    const input = new Readable({ read() {} });
    const output = new Writable({ write(chunk, enc, cb) { cb(); } });
    createTransport(input, output, (m) => messages.push(m));

    const a = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'a' });
    const b = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'b' });
    const buf = Buffer.from(
      `Content-Length: ${Buffer.byteLength(a, 'utf8')}\r\n\r\n${a}` +
      `Content-Length: ${Buffer.byteLength(b, 'utf8')}\r\n\r\n${b}`
    );
    input.push(buf);
    input.push(null);

    await new Promise((res) => setImmediate(res));
    expect(messages).toHaveLength(2);
    expect(messages[0].method).toBe('a');
    expect(messages[1].method).toBe('b');
  });

  it('buffers a message that arrives split across two chunks', async () => {
    const messages = [];
    const input = new Readable({ read() {} });
    const output = new Writable({ write(chunk, enc, cb) { cb(); } });
    createTransport(input, output, (m) => messages.push(m));

    const body = JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'split' });
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    input.push(frame.slice(0, 25));
    input.push(frame.slice(25));
    input.push(null);

    await new Promise((res) => setImmediate(res));
    expect(messages).toHaveLength(1);
    expect(messages[0].method).toBe('split');
  });

  it('send() writes a Content-Length-framed message', () => {
    const chunks = [];
    const input = new Readable({ read() {} });
    const output = new Writable({
      write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); },
    });
    const t = createTransport(input, output, () => {});
    t.send({ jsonrpc: '2.0', method: 'hello', params: { x: 1 } });
    const all = chunks.join('');
    expect(all).toContain('Content-Length: ');
    expect(all).toContain('"method":"hello"');
    expect(all).toContain('\r\n\r\n');
  });
});

run();
