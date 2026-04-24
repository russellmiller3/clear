// JSON-RPC 2.0 framing over stdio (LSP transport).
//
// Each message is `Content-Length: N\r\n\r\n<JSON>`. We read raw bytes off
// the input stream, buffer them, and emit each parsed message via onMessage.
//
// To send: serialize to JSON, prepend the header, write to the output stream.
//
// Zero deps. Works in Node 18+.

export function createTransport(input, output, onMessage) {
  let buffer = Buffer.alloc(0);

  input.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buffer.slice(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Malformed frame — drop the header and resync.
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const contentLength = parseInt(match[1], 10);
      const totalLength = headerEnd + 4 + contentLength;
      if (buffer.length < totalLength) break;
      const body = buffer.slice(headerEnd + 4, totalLength).toString('utf8');
      buffer = buffer.slice(totalLength);
      let message;
      try {
        message = JSON.parse(body);
      } catch (err) {
        continue;
      }
      onMessage(message);
    }
  });

  function send(message) {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    output.write(header + body);
  }

  return { send };
}
