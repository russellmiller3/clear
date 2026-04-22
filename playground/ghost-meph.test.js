// =============================================================================
// GHOST MEPH ROUTER — UNIT TESTS
// =============================================================================
// Verifies GM-1: env-gated routing works, the stub returns Anthropic-shaped
// SSE events, and the stub never makes HTTP calls (so it's safe to run
// without an API key and without spending budget).
//
// Run: node playground/ghost-meph.test.js
// =============================================================================

import {
  isGhostMephActive,
  getBackendId,
  fetchViaBackend,
  buildSSEEvents,
} from './ghost-meph/router.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function parseSSE(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean);
    let event = null, data = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = JSON.parse(line.slice(6));
    }
    if (data) events.push({ event, data });
  }
  return events;
}

(async () => {
  console.log('\n📦 Ghost Meph router\n');

  // =========================================================================
  // PHASE 1 — env-gate
  // =========================================================================
  console.log('🚪 Phase 1 — env gate');

  delete process.env.MEPH_BRAIN;
  assert(isGhostMephActive() === false, 'isGhostMephActive() false when MEPH_BRAIN unset');
  assert(getBackendId() === null, 'getBackendId() null when MEPH_BRAIN unset');

  process.env.MEPH_BRAIN = '';
  assert(isGhostMephActive() === false, 'isGhostMephActive() false when MEPH_BRAIN is empty string');

  process.env.MEPH_BRAIN = '   ';
  assert(isGhostMephActive() === false, 'isGhostMephActive() false when MEPH_BRAIN is whitespace');

  process.env.MEPH_BRAIN = 'cc-agent';
  assert(isGhostMephActive() === true, 'isGhostMephActive() true when MEPH_BRAIN=cc-agent');
  assert(getBackendId() === 'cc-agent', 'getBackendId() returns "cc-agent"');

  process.env.MEPH_BRAIN = '  CC-Agent  ';
  assert(getBackendId() === 'cc-agent', 'getBackendId() trims and lowercases');

  // =========================================================================
  // PHASE 2 — SSE event shape
  // =========================================================================
  console.log('\n📡 Phase 2 — SSE event shape (Anthropic protocol fidelity)');

  const events = parseSSE(buildSSEEvents('hello world').join(''));
  assert(events.length === 6, `6 SSE events emitted (got ${events.length})`);
  assert(events[0].data.type === 'message_start', 'first event is message_start');
  assert(events[0].data.message.role === 'assistant', 'message_start has role=assistant');
  assert(events[0].data.message.model === 'ghost-meph-stub', 'message_start declares model=ghost-meph-stub');
  assert(events[1].data.type === 'content_block_start', 'second event is content_block_start');
  assert(events[1].data.content_block.type === 'text', 'content block is type=text');
  assert(events[2].data.type === 'content_block_delta', 'third event is content_block_delta');
  assert(events[2].data.delta.type === 'text_delta', 'delta type is text_delta');
  assert(events[2].data.delta.text === 'hello world', 'delta text matches input');
  assert(events[3].data.type === 'content_block_stop', 'fourth event is content_block_stop');
  assert(events[4].data.type === 'message_delta', 'fifth event is message_delta');
  assert(events[4].data.delta.stop_reason === 'end_turn',
    'message_delta has stop_reason=end_turn (critical — without this, /api/chat tool loop spins until iteration cap)');
  assert(events[5].data.type === 'message_stop', 'sixth event is message_stop');

  // =========================================================================
  // PHASE 3 — fetchViaBackend returns Anthropic-shaped Response
  // =========================================================================
  console.log('\n🔌 Phase 3 — fetchViaBackend response envelope');

  process.env.MEPH_BRAIN = 'cc-agent';
  const r = await fetchViaBackend({ model: 'haiku', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }, {});
  assert(r.ok === true, 'response.ok is true');
  assert(r.status === 200, 'response.status is 200');
  assert(typeof r.body !== 'undefined' && r.body !== null, 'response has a body');
  assert(typeof r.body.getReader === 'function', 'response.body is a ReadableStream (has getReader)');

  const body = await streamToString(r.body);
  const parsed = parseSSE(body);
  assert(parsed.length === 6, `streamed body parses to 6 SSE events (got ${parsed.length})`);
  const stopEvent = parsed.find(e => e.data.type === 'message_delta');
  assert(!!stopEvent, 'stream contains message_delta event');
  assert(stopEvent.data.delta.stop_reason === 'end_turn', 'streamed message_delta has stop_reason=end_turn');

  const textEvent = parsed.find(e => e.data.type === 'content_block_delta');
  assert(textEvent.data.delta.text.includes('Ghost Meph stub'), 'stub text identifies itself');
  assert(textEvent.data.delta.text.includes('cc-agent'), 'stub text echoes selected MEPH_BRAIN value');

  // =========================================================================
  // PHASE 4 — unknown backends still respond (don't crash server)
  // =========================================================================
  console.log('\n⚠️  Phase 4 — unknown backend handling');

  process.env.MEPH_BRAIN = 'fake-backend-xyz';
  const r2 = await fetchViaBackend({ model: 'x', max_tokens: 1, messages: [] }, {});
  assert(r2.ok === true, 'unknown backend still returns ok=true (no crash)');
  const parsed2 = parseSSE(await streamToString(r2.body));
  const text2 = parsed2.find(e => e.data.type === 'content_block_delta')?.data.delta.text || '';
  assert(text2.includes('unknown:fake-backend-xyz'),
    'unknown-backend stub message names the unknown brain so debugging is obvious');
  assert(parsed2.find(e => e.data.type === 'message_delta')?.data.delta.stop_reason === 'end_turn',
    'unknown backend still emits stop_reason=end_turn (no infinite loop in /api/chat)');

  // =========================================================================
  // PHASE 5 — text() helper returns same content as streamed body
  // =========================================================================
  console.log('\n📜 Phase 5 — text() helper');

  process.env.MEPH_BRAIN = 'cc-agent';
  const r3 = await fetchViaBackend({}, {});
  const t = await r3.text();
  const tParsed = parseSSE(t);
  assert(tParsed.length === 6, `r.text() yields 6 events (got ${tParsed.length})`);
  assert(tParsed[4].data.delta.stop_reason === 'end_turn',
    'r.text() stop_reason matches streamed body');

  // Cleanup
  delete process.env.MEPH_BRAIN;

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
