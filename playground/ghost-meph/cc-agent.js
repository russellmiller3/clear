/*
 * Ghost Meph backend — Claude Code sub-agent (cc-agent).
 *
 * Spawns the local `claude` CLI as a one-shot subprocess and pipes the
 * user's latest message into it. Captures stdout as plain text and wraps
 * the result in an Anthropic-shaped SSE response so /api/chat's existing
 * tool-use loop sees the same envelope it would from real Anthropic.
 *
 * THIS IS THE TEXT-ONLY MVP. Tool support (edit_code, read_file, compile,
 * etc.) is the GM-2-tools follow-up — see
 * `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` for design.
 *
 * Why text-only first:
 *   1. Every backend in Ghost Meph (cc-agent, openrouter:qwen, ollama) needs
 *      to translate Anthropic's tool-use protocol to whatever the underlying
 *      model speaks. That's 1–3 days of careful work per backend.
 *   2. A text-only MVP unlocks the routing layer end-to-end TODAY: Russell
 *      can MEPH_BRAIN=cc-agent and see Studio talk to his local Claude Code
 *      subscription. That alone proves the architecture before we invest
 *      in MCP server setup for tool dispatch.
 *   3. Curriculum sweeps still need tools to compile/test, so they stay on
 *      real Anthropic until the tool-use upgrade. No regression on the
 *      flywheel — sweeps just opt out of cc-agent for now.
 *
 * Required: `claude` CLI on PATH. We exec `claude --print "<prompt>"` and
 * read stdout. If `claude` isn't found, return an Anthropic-shaped error
 * stream (not a thrown exception) so /api/chat handles it gracefully.
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildSSEEvents } from './router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname, '..', 'system-prompt.md');

// 3 minute hard cap — same order of magnitude as a typical Meph turn against
// real Anthropic. If `claude` hangs we surface a helpful error rather than
// leaking a subprocess.
const SUBPROCESS_TIMEOUT_MS = 180_000;

/**
 * Public entry — called from `router.js` when MEPH_BRAIN=cc-agent.
 * Mirrors the Anthropic-shaped Response contract:
 *   { ok: boolean, status: number, body: ReadableStream<Uint8Array>, text(): Promise<string> }
 */
export async function chatViaClaudeCode(payload) {
  const userPrompt = extractUserPrompt(payload);
  if (!userPrompt) {
    return wrapAsResponse('[cc-agent: no user message in payload — nothing to send to Claude Code]');
  }
  const systemPrompt = loadSystemPromptOrEmpty();
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${userPrompt}`
    : userPrompt;

  let text;
  try {
    text = await runClaudeCli(fullPrompt);
  } catch (err) {
    text = `[cc-agent error: ${err.message}. Is the \`claude\` CLI on PATH? Drop MEPH_BRAIN to fall back to the real Anthropic API.]`;
  }
  return wrapAsResponse(text);
}

function extractUserPrompt(payload) {
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) return null;
  // Find the most recent user message and concatenate its text content blocks.
  for (let i = payload.messages.length - 1; i >= 0; i--) {
    const m = payload.messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter(b => b && (b.type === 'text' || typeof b.text === 'string'))
        .map(b => b.text)
        .join('\n');
      if (text.trim()) return text;
    }
  }
  return null;
}

function loadSystemPromptOrEmpty() {
  try {
    if (existsSync(SYSTEM_PROMPT_PATH)) {
      return readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
    }
  } catch { /* fall through to empty */ }
  return '';
}

/**
 * Run `claude --print` with the given prompt. Captures stdout, returns
 * the trimmed text. Rejects on timeout, on non-zero exit code, or if the
 * subprocess fails to spawn (CLI not on PATH).
 *
 * Exported for tests so they can mock it.
 */
export function runClaudeCli(prompt) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    let child;
    try {
      // --print runs once and exits (vs. the default interactive mode).
      // Pass prompt on stdin so we don't blow the argv length cap on long messages.
      child = spawn('claude', ['--print'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      return reject(new Error('failed to spawn `claude` CLI: ' + err.message));
    }

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      finish(reject, new Error(`subprocess timed out after ${SUBPROCESS_TIMEOUT_MS / 1000}s`));
    }, SUBPROCESS_TIMEOUT_MS);

    child.stdout.on('data', d => { stdout += d.toString('utf8'); });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });

    child.on('error', err => {
      clearTimeout(timer);
      finish(reject, new Error('`claude` CLI not found on PATH (' + err.code + ')'));
    });

    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = (stderr || '').split('\n').slice(-5).join('\n').trim();
        finish(reject, new Error(`\`claude\` exited with code ${code}: ${tail || '(no stderr)'}`));
        return;
      }
      finish(resolve, stdout.trim());
    });

    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      finish(reject, new Error('failed to write to `claude` stdin: ' + err.message));
    }
  });
}

function wrapAsResponse(text) {
  const events = buildSSEEvents(text);
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
