// =============================================================================
// Ghost Meph Format Bridge Tests
// =============================================================================
// Run: node studio/ghost-meph/format-bridge.test.js
// =============================================================================

import {
  anthropicToOpenAI,
  accumulateOpenAITextAndToolCalls,
  openAIResultToAnthropicSSEEvents,
} from './format-bridge.js';

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

function streamFromText(text) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

function parseSSEEvents(events) {
  return events
    .join('')
    .split('\n\n')
    .map(frame => frame.split('\n').find(line => line.startsWith('data: ')))
    .filter(Boolean)
    .map(line => JSON.parse(line.slice(6)));
}

console.log('\nGhost Meph format bridge');

{
  const converted = anthropicToOpenAI({
    model: 'deepseek/deepseek-chat',
    system: [{ type: 'text', text: 'You are Meph.' }],
    tools: [{
      name: 'edit_code',
      description: 'Edit the Clear source.',
      input_schema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
    }],
    messages: [
      { role: 'user', content: 'write a todo app' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will edit it.' },
          { type: 'tool_use', id: 'toolu_1', name: 'edit_code', input: { code: 'build for web' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' },
        ],
      },
    ],
  });

  const assistantMessage = converted.messages.find(message => message.role === 'assistant');
  const toolMessage = converted.messages.find(message => message.role === 'tool');

  assert(converted.tools[0].type === 'function', 'Anthropic tools convert to OpenAI function tools');
  assert(converted.tool_choice === 'auto', 'OpenAI-compatible models are allowed to choose tools');
  assert(assistantMessage?.tool_calls?.[0]?.id === 'toolu_1', 'assistant tool_use becomes OpenAI tool_call');
  assert(toolMessage?.role === 'tool', 'tool_result becomes OpenAI tool role');
  assert(toolMessage?.tool_call_id === 'toolu_1', 'tool_result keeps the tool call id');
}

{
  const raw = [
    'data: {"choices":[{"delta":{"content":"Thinking. "}}]}',
    '',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"edit_code","arguments":"{\\"action\\":\\"write\\""}}]}}]}',
    '',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"code\\":\\"build for web\\"}"}}]}}]}',
    '',
    'data: {"choices":[{"finish_reason":"tool_calls","delta":{}}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  const result = await accumulateOpenAITextAndToolCalls(streamFromText(raw));

  assert(result.text === 'Thinking. ', 'OpenAI text deltas still accumulate');
  assert(result.stopReason === 'tool_use', 'OpenAI tool_calls finish maps to Anthropic tool_use stop');
  assert(result.toolCalls[0].id === 'call_1', 'OpenAI tool call id is captured');
  assert(result.toolCalls[0].name === 'edit_code', 'OpenAI tool call name is captured');
  assert(result.toolCalls[0].argumentsJson === '{"action":"write","code":"build for web"}', 'OpenAI tool arguments stream together');

  const events = parseSSEEvents(openAIResultToAnthropicSSEEvents(result, 'deepseek/deepseek-chat'));
  assert(events.some(ev => ev.type === 'content_block_start' && ev.content_block.type === 'tool_use'), 'Anthropic SSE includes tool_use block');
  assert(events.some(ev => ev.type === 'content_block_delta' && ev.delta.type === 'input_json_delta'), 'Anthropic SSE includes input_json_delta');
  assert(events.some(ev => ev.type === 'message_delta' && ev.delta.stop_reason === 'tool_use'), 'Anthropic SSE stop reason is tool_use');
}

{
  const raw = [
    'data:{"choices":[{"delta":{"content":"No-space stream. "}}]}',
    '',
    'data:[DONE]',
    '',
  ].join('\n');
  const result = await accumulateOpenAITextAndToolCalls(streamFromText(raw));

  assert(result.text === 'No-space stream. ', 'OpenAI data lines without a space still accumulate');
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
