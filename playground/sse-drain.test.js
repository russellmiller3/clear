// =============================================================================
// SSE DRAIN — UNIT TESTS
// =============================================================================
// Covers _extractSSEFrameText and _parseSSEFrames, the server-side helpers
// that drain a streaming endpoint's response body into a single string for
// grading. Historically dropped anything that wasn't a bare string or a
// {text:"..."} chunk — so `send back {score: 8}` inside a stream block made
// the grader see an empty body and score the eval zero.
// =============================================================================

import { _extractSSEFrameText, _parseSSEFrames } from './server.js';

let passed = 0, failed = 0, total = 0;

function assert(cond, msg) {
  total++;
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

function eq(actual, expected, msg) {
  total++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++; console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
  }
}

console.log('\n📦 _extractSSEFrameText — frame shapes\n');

// The format the compiler emits most commonly: { text: chunk } for streaming AI
eq(_extractSSEFrameText('data: {"text":"hi"}\n\n'), 'hi', 'chunk frame with {text} returns the text');

// `send back "literal"` inside a stream block emits `data: "literal"\n\n`
eq(_extractSSEFrameText('data: "hello"\n\n'), 'hello', 'string payload frame returns the string');

// Object payloads: `send back { score: 8 }` — was previously dropped, now preserved.
// Graders need to see the structured body to judge it.
eq(_extractSSEFrameText('data: {"score":8,"reason":"good fit"}\n\n'),
   '{"score":8,"reason":"good fit"}',
   'object payload returns compact JSON so grader can read it');

// Number payloads
eq(_extractSSEFrameText('data: 42\n\n'), '42', 'number payload returns its stringified form');

// Array payloads
eq(_extractSSEFrameText('data: [1,2,3]\n\n'), '[1,2,3]', 'array payload returns its stringified form');

// [DONE] sentinel is intentionally empty — it's a stream-end marker, not content
eq(_extractSSEFrameText('data: [DONE]\n\n'), '', '[DONE] sentinel returns empty');

// Empty payload after `data:` is also nothing
eq(_extractSSEFrameText('data: \n\n'), '', 'empty payload returns empty');

// Malformed JSON gets returned as raw payload (preserves whatever the endpoint said)
eq(_extractSSEFrameText('data: not-valid-json\n\n'), 'not-valid-json', 'non-JSON payload returns the raw text');

// Frames without the data: prefix (comments, heartbeats like `:`) are ignored
eq(_extractSSEFrameText(': heartbeat\n\n'), '', 'non-data frames are ignored');

// Error frames from our error-path emission
eq(_extractSSEFrameText('data: {"error":"boom"}\n\n'),
   '{"error":"boom"}',
   'error frame returns the error JSON so grader sees the failure reason');

console.log('\n📦 _parseSSEFrames — full response bodies\n');

// Typical streaming AI response: several text chunks then [DONE]
const streamingBody = [
  'data: {"text":"Hello, "}\n\n',
  'data: {"text":"world."}\n\n',
  'data: [DONE]\n\n',
].join('');
eq(_parseSSEFrames(streamingBody), 'Hello, world.', 'streaming chunks concatenate into full text');

// Structured-body response: one frame with a complete object
const structuredBody = 'data: {"score":8,"reason":"clear fit"}\n\n';
eq(_parseSSEFrames(structuredBody), '{"score":8,"reason":"clear fit"}', 'single object frame returns its JSON');

// Mixed: AI chunks followed by a final structured result — the grader sees both
const mixedBody = [
  'data: {"text":"Analyzing..."}\n\n',
  'data: {"text":" done."}\n\n',
  'data: {"summary":"Analysis done.","ok":true}\n\n',
].join('');
const mixedOut = _parseSSEFrames(mixedBody);
assert(mixedOut.includes('Analyzing... done.'),
       'mixed body preserves streamed text');
assert(mixedOut.includes('"summary":"Analysis done."'),
       'mixed body preserves the structured tail');

console.log(`\n${'='.repeat(40)}\n✅ Passed: ${passed}\n❌ Failed: ${failed}\n${'='.repeat(40)}`);
process.exit(failed > 0 ? 1 : 0);
