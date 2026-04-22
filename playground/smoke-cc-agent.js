#!/usr/bin/env node
/*
 * cc-agent smoke test — one-shot Meph turn via the Claude Code subscription.
 *
 * Proves the whole chain works end-to-end without needing a grader or an
 * ANTHROPIC_API_KEY. Meant for Russell to run locally once, after
 * GHOST_MEPH_CC_TOOLS=1 lands, to validate that:
 *   - Studio's /api/chat accepts the request (ghost-meph router active)
 *   - cc-agent spawns `claude` with MCP + stream-json
 *   - Claude's output gets translated to Anthropic SSE
 *   - /api/chat streams the translated events back to us
 *   - The final source (if any) shows up in the done event
 *
 * Requires:
 *   - Studio running on localhost:3456
 *   - `claude` CLI on PATH (the whole point of cc-agent)
 *   - GHOST_MEPH_CC_TOOLS=1 env var set when Studio was started
 *   - MEPH_BRAIN=cc-agent env var set when Studio was started
 *
 * Run: node playground/smoke-cc-agent.js
 *
 * What it prints:
 *   - Every SSE event type the loop saw (should include message_start,
 *     content_block_start for tool_use, message_delta with stop_reason=end_turn)
 *   - Whether any tool_use blocks appeared (proves MCP routing)
 *   - The final source (proves the post-turn sync sidecar works)
 *   - Exit code 0 on success, 1 on any failure
 */

const BASE = process.env.PLAYGROUND_URL || 'http://localhost:3456';

async function main() {
  console.log('[smoke] POSTing a minimal Meph task to', BASE + '/api/chat');

  const body = JSON.stringify({
    messages: [
      { role: 'user', content: 'Write a tiny Clear app with one GET / endpoint that sends "hello". One line of source is fine.' },
    ],
    // apiKey is intentionally empty — cc-agent mode doesn't need it.
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
  });

  let r;
  try {
    r = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(180000),
    });
  } catch (err) {
    console.error('[smoke] ✗ fetch failed:', err.message);
    console.error('[smoke]   Is Studio running at', BASE + '?');
    process.exit(1);
  }

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error(`[smoke] ✗ /api/chat returned ${r.status}:`, text.slice(0, 400));
    process.exit(1);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const seenEventTypes = new Set();
  const toolUseNames = [];
  let doneFired = false;
  let finalSource = null;
  let textSoFar = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(raw); } catch { continue; }
      seenEventTypes.add(ev.type);

      // /api/chat consumes Anthropic's raw SSE and emits its OWN events
      // (text, tool_start, tool_done, code_update, done, etc.). We watch
      // those — the raw Anthropic message_delta / content_block_start never
      // make it to the SSE consumer.
      if (ev.type === 'tool_start' && typeof ev.name === 'string') {
        toolUseNames.push(ev.name);
      }
      if (ev.type === 'code_update' && typeof ev.code === 'string') {
        finalSource = ev.code;
      }
      if (ev.type === 'text' && typeof ev.delta === 'string') {
        textSoFar += ev.delta;
      }
      if (ev.type === 'done') {
        doneFired = true;
        if (typeof ev.source === 'string' && ev.source) finalSource = ev.source;
      }
      if (ev.type === 'error') {
        console.error('[smoke] ✗ Studio emitted error event:', ev.message || ev);
        process.exit(1);
      }
    }
  }

  // --- Report ---
  console.log('\n[smoke] SSE event types seen:');
  for (const t of [...seenEventTypes].sort()) {
    console.log(`  - ${t}`);
  }

  console.log('\n[smoke] tool_start events:', toolUseNames.length);
  for (const name of toolUseNames) {
    console.log(`  - ${name}`);
  }

  if (textSoFar) {
    console.log('\n[smoke] text preview:', textSoFar.slice(0, 200).replace(/\n/g, ' '));
  }

  if (finalSource) {
    console.log('\n[smoke] final source (first 300 chars):');
    console.log('  ' + finalSource.slice(0, 300).split('\n').join('\n  '));
  } else {
    console.log('\n[smoke] (no final source — Meph did not call edit_code write, or the sync sidecar did not fire)');
  }

  // --- Pass/fail signal ---
  // Minimum bar: `done` event fired → Studio's tool-use loop terminated
  // cleanly. /api/chat emits `done` only after processing stop_reason=end_turn
  // (or end of iterations), so this is the right proxy for "end_turn reached".
  if (seenEventTypes.size === 0) {
    console.error('\n[smoke] ✗ No SSE events received. Did Studio crash mid-stream?');
    process.exit(1);
  }
  if (!doneFired) {
    console.error('\n[smoke] ✗ `done` event never fired — Studio did not complete the turn cleanly.');
    process.exit(1);
  }
  // The smoke test considers a run successful if `done` fires AND at least
  // one MCP tool was invoked. A bare-text response (no tool calls) means
  // Claude didn't actually use Meph's tool surface — likely a permission
  // issue or a prompt that didn't require tools.
  const mephToolsCalled = toolUseNames.filter(n => n.includes('meph')).length;
  if (mephToolsCalled === 0) {
    console.error(`\n[smoke] ⚠ done fired but no meph_* tools were called (saw ${toolUseNames.length} other tool_start events).`);
    console.error('[smoke]   Check the text preview — Claude may have hit a permission prompt or punted.');
    process.exit(1);
  }
  console.log(`\n[smoke] ✓ cc-agent round-trip works end-to-end (${mephToolsCalled} meph_* tool calls)`);
}

main().catch(err => {
  console.error('[smoke] ✗ unexpected error:', err);
  process.exit(1);
});
