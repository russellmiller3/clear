import { buildOpenRouterRequestBody, resolveOpenRouterModel } from './openrouter.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ok ${message}`);
  } else {
    failed++;
    console.error(`  FAIL ${message}`);
  }
}

console.log('\nGhost Meph OpenRouter backend');

assert(
  resolveOpenRouterModel({}, {}) === 'deepseek/deepseek-v4-flash',
  'defaults to cheap DeepSeek V4 Flash, not Sonnet',
);
assert(
  resolveOpenRouterModel({}, { OPENROUTER_MODEL: 'z-ai/glm-4.5-air' }) === 'z-ai/glm-4.5-air',
  'OPENROUTER_MODEL overrides the cheap default',
);
assert(
  resolveOpenRouterModel({ model: '~anthropic/claude-sonnet-latest' }, {}) === '~anthropic/claude-sonnet-latest',
  'explicit caller model still wins',
);
{
  const body = buildOpenRouterRequestBody({
    model: 'google/gemini-3-flash-preview',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert(body.stream === true, 'OpenRouter requests stream mode');
  assert(body.usage === undefined, 'OpenRouter does not send deprecated usage include parameter');
  assert(body.stream_options === undefined, 'OpenRouter does not send deprecated stream_options include_usage parameter');
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
