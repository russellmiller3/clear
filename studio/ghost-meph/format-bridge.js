/*
 * Ghost Meph - Anthropic <-> OpenAI format bridge.
 *
 * OpenRouter, Ollama, and most local-model gateways speak OpenAI's
 * chat-completions shape. /api/chat speaks Anthropic's tool-use shape.
 * This module translates between them so backends do not repeat the work.
 */

import { buildSSEEvents } from './router.js';

/**
 * Translate an Anthropic /v1/messages payload to an OpenAI /v1/chat/completions
 * payload. System prompt becomes a leading system message. Anthropic tool
 * definitions and tool-use turns become OpenAI-compatible function tools.
 */
export function anthropicToOpenAI(payload = {}) {
  const { model, messages = [], system, max_tokens, temperature, tools } = payload;
  const out = {
    model,
    messages: [],
  };

  if (typeof max_tokens === 'number') out.max_tokens = max_tokens;
  if (typeof temperature === 'number') out.temperature = temperature;
  if (Array.isArray(tools) && tools.length > 0) {
    out.tools = tools
      .filter(tool => tool && tool.name)
      .map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || { type: 'object', properties: {} },
        },
      }));
    out.tool_choice = 'auto';
  }

  const sysText = flattenSystem(system);
  if (sysText) out.messages.push({ role: 'system', content: sysText });

  for (const message of messages) {
    if (!message || !message.role) continue;
    for (const mapped of mapAnthropicMessage(message)) {
      out.messages.push(mapped);
    }
  }

  return out;
}

function mapAnthropicMessage(message) {
  if (typeof message.content === 'string') {
    return [{ role: message.role, content: message.content }];
  }

  if (!Array.isArray(message.content)) {
    return [{ role: message.role, content: flattenContent(message.content) }];
  }

  const textParts = [];
  const toolCalls = [];
  const toolResults = [];

  for (const block of message.content) {
    if (!block) continue;

    if (block.type === 'tool_result') {
      toolResults.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: stringifyToolResult(block.content),
      });
      continue;
    }

    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        },
      });
      continue;
    }

    if (block.type === 'text' || typeof block.text === 'string') {
      textParts.push(block.text || '');
    }
  }

  if (toolResults.length > 0) return toolResults;

  const mapped = {
    role: message.role,
    content: textParts.join('\n') || null,
  };
  if (toolCalls.length > 0) mapped.tool_calls = toolCalls;
  return [mapped];
}

function flattenSystem(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .map(block => (typeof block === 'string' ? block : (block && block.text) || ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(block => block && (block.type === 'text' || typeof block.text === 'string'))
      .map(block => block.text)
      .join('\n');
  }
  return String(content || '');
}

function stringifyToolResult(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (!block) return '';
        if (typeof block === 'string') return block;
        if (typeof block.text === 'string') return block.text;
        return JSON.stringify(block);
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

/**
 * Read an OpenAI streaming response body and return an Anthropic-shaped
 * Response-like object whose body streams Anthropic SSE.
 */
export async function wrapOpenAIStreamAsAnthropicSSE(openaiBody, modelLabel, opts = {}) {
  const result = await accumulateOpenAITextAndToolCalls(openaiBody);
  if (opts.generationId && !result.generationId) result.generationId = opts.generationId;
  const events = openAIResultToAnthropicSSEEvents(result, modelLabel);
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const ev of events) controller.enqueue(enc.encode(ev));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => events.join(''),
  };
}

/**
 * Backwards-compatible helper for text-only callers and tests.
 */
export async function accumulateOpenAIText(stream) {
  const result = await accumulateOpenAITextAndToolCalls(stream);
  return result.text;
}

/**
 * Drain an OpenAI SSE stream and accumulate text plus streamed function calls.
 */
export async function accumulateOpenAITextAndToolCalls(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const result = {
    text: '',
    toolCalls: [],
    stopReason: 'end_turn',
    generationId: null,
    usage: null,
  };
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      processOpenAISSELine(line, result);
    }
  }

  if (buf.trim()) processOpenAISSELine(buf, result);
  return result;
}

function processOpenAISSELine(line, result) {
  if (!line.startsWith('data:')) return;
  const raw = line.slice('data:'.length).trim();
  if (!raw || raw === '[DONE]') return;

  let chunk;
  try {
    chunk = JSON.parse(raw);
  } catch {
    return;
  }

  if (chunk.id && !result.generationId) result.generationId = chunk.id;
  if (chunk.usage) result.usage = normalizeOpenAIUsage(chunk.usage);

  const choice = chunk?.choices?.[0] || {};
  const delta = choice.delta || {};
  const finalMessage = choice.message || {};

  if (choice.finish_reason === 'tool_calls') result.stopReason = 'tool_use';
  if (choice.finish_reason && choice.finish_reason !== 'tool_calls') result.stopReason = 'end_turn';

  if (typeof delta.content === 'string') result.text += delta.content;
  if (typeof finalMessage.content === 'string' && !result.text) {
    result.text = finalMessage.content;
  }

  for (const toolCall of delta.tool_calls || []) {
    result.stopReason = 'tool_use';
    mergeToolCallDelta(result.toolCalls, toolCall);
  }

  for (const toolCall of finalMessage.tool_calls || []) {
    result.stopReason = 'tool_use';
    mergeToolCallDelta(result.toolCalls, toolCall);
  }
}

function normalizeOpenAIUsage(usage = {}) {
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage.total_tokens ?? (promptTokens + completionTokens),
    cost: typeof usage.cost === 'number' ? usage.cost : null,
    cost_details: usage.cost_details || null,
    prompt_tokens_details: usage.prompt_tokens_details || null,
    completion_tokens_details: usage.completion_tokens_details || null,
  };
}

function mergeToolCallDelta(toolCalls, delta) {
  const index = Number.isInteger(delta.index) ? delta.index : toolCalls.length;
  if (!toolCalls[index]) {
    toolCalls[index] = { id: '', name: '', argumentsJson: '' };
  }

  const current = toolCalls[index];
  if (delta.id) current.id = delta.id;
  const fn = delta.function || {};
  if (fn.name) current.name = fn.name;
  if (typeof fn.arguments === 'string') current.argumentsJson += fn.arguments;
}

export function openAIResultToAnthropicSSEEvents(result, modelLabel = 'openai-compatible') {
  const sse = (type, data) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const usage = usageForAnthropicSSE(result);
  const events = [
    sse('message_start', {
      message: {
        id: 'ghost_msg_' + Date.now().toString(36),
        type: 'message',
        role: 'assistant',
        model: modelLabel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage,
      },
    }),
  ];

  let index = 0;
  if (result.text) {
    events.push(
      sse('content_block_start', {
        index,
        content_block: { type: 'text', text: '' },
      }),
      sse('content_block_delta', {
        index,
        delta: { type: 'text_delta', text: result.text },
      }),
      sse('content_block_stop', { index }),
    );
    index++;
  }

  for (const toolCall of result.toolCalls.filter(Boolean)) {
    events.push(
      sse('content_block_start', {
        index,
        content_block: {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: {},
        },
      }),
      sse('content_block_delta', {
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: toolCall.argumentsJson || '{}',
        },
      }),
      sse('content_block_stop', { index }),
    );
    index++;
  }

  const stopReason =
    result.stopReason || (result.toolCalls.length > 0 ? 'tool_use' : 'end_turn');
  events.push(
    sse('message_delta', {
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage,
    }),
    sse('message_stop', {}),
  );
  return events;
}

function usageForAnthropicSSE(result = {}) {
  const openAIUsage = result.usage || {};
  const inputTokens = openAIUsage.prompt_tokens ?? 0;
  const outputTokens = openAIUsage.completion_tokens ?? (result.text || '').length;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: openAIUsage.total_tokens ?? (inputTokens + outputTokens),
    openrouter_cost: openAIUsage.cost,
    openrouter_generation_id: result.generationId || null,
    openrouter_cost_details: openAIUsage.cost_details || null,
    openrouter_prompt_tokens_details: openAIUsage.prompt_tokens_details || null,
    openrouter_completion_tokens_details: openAIUsage.completion_tokens_details || null,
  };
}

/**
 * Wrap a single non-streamed OpenAI JSON response body as Anthropic SSE.
 */
export function wrapOpenAIJsonAsAnthropicSSE(json) {
  const choice = json?.choices?.[0] || {};
  const result = {
    text: choice.message?.content || choice.text || '',
    toolCalls: [],
    stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
  };
  for (const toolCall of choice.message?.tool_calls || []) {
    result.stopReason = 'tool_use';
    mergeToolCallDelta(result.toolCalls, toolCall);
  }

  if (!result.text && result.toolCalls.length === 0) {
    const events = buildSSEEvents('');
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        for (const ev of events) controller.enqueue(enc.encode(ev));
        controller.close();
      },
    });
    return {
      ok: true,
      status: 200,
      body: stream,
      text: async () => events.join(''),
    };
  }

  const events = openAIResultToAnthropicSSEEvents(result, json?.model || 'openai-compatible');
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const ev of events) controller.enqueue(enc.encode(ev));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => events.join(''),
  };
}
