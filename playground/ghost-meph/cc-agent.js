/*
 * Ghost Meph backend — Claude Code sub-agent (cc-agent).
 *
 * Two modes, selected by environment:
 *   GHOST_MEPH_CC_TOOLS=1  → TOOL MODE (step 2b/2c/2d of the cc-agent plan)
 *                              Spawns claude with --mcp-config + --output-format
 *                              stream-json. Claude Code auto-dispatches Meph's
 *                              28 tools through our MCP server. The resulting
 *                              stream-json is translated to Anthropic SSE.
 *   unset / any other value → TEXT MODE (the original text-only MVP)
 *                              Spawns claude --print, captures stdout as one
 *                              blob, wraps as a single text_delta SSE.
 *
 * Why two modes:
 *   TOOL mode depends on `claude --output-format stream-json` which isn't
 *   formally documented as a stable interface. We keep the text MVP around
 *   so Studio still falls back cleanly if a future claude version breaks
 *   the tool-mode parser. Flip the env var once tool mode is validated.
 *
 * What's intentionally limited (known gaps to close later):
 *   1. State sharing. Claude Code's MCP child has its own module-level
 *      currentSource / currentErrors (see ghost-meph/mcp-server/tools.js).
 *      Edits made via meph_edit_code update THAT child's state, not
 *      /api/chat's closure. Studio's editor won't reflect mid-turn changes
 *      until the cc-agent returns the final source. Followup: HTTP bridge
 *      from MCP server to Studio's /api/set-source.
 *   2. Tool result feedback loop. Plan step 2d called for re-spawn-per-turn
 *      to feed tool_result events back to claude. In tool mode as designed
 *      here, claude handles its own tool loop INTERNALLY via MCP — we don't
 *      need to re-spawn. Each /api/chat request spawns claude once; claude
 *      iterates until its own end_turn; we stream the translated events
 *      back. If we later need manual tool-result injection (e.g. for
 *      tools the MCP server can't run), switch to `--input-format stream-json`
 *      and pipe tool_result envelopes via stdin.
 *
 * Required: `claude` CLI on PATH. Missing CLI → Anthropic-shaped error
 * stream (not a thrown exception) so /api/chat handles it gracefully.
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { buildSSEEvents } from './router.js';
import { translateStreamJsonBuffer, extractFinalSourceFromStreamJson } from './cc-agent-stream-json.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname, '..', 'system-prompt.md');
// Absolute path to the MCP server entry point — used when building the
// temp MCP config. Stable across any cwd because we resolve from __dirname.
const MCP_SERVER_PATH = join(__dirname, 'mcp-server', 'index.js');

// 3 minute hard cap — same order of magnitude as a typical Meph turn against
// real Anthropic. If `claude` hangs we surface a helpful error rather than
// leaking a subprocess.
const SUBPROCESS_TIMEOUT_MS = 180_000;

/** Tool mode is opt-in while the stream-json parser is being battle-tested. */
function toolModeEnabled() {
  return process.env.GHOST_MEPH_CC_TOOLS === '1';
}

/**
 * Public entry — called from `router.js` when MEPH_BRAIN=cc-agent.
 * Mirrors the Anthropic-shaped Response contract:
 *   { ok: boolean, status: number, body: ReadableStream<Uint8Array>, text(): Promise<string> }
 */
export async function chatViaClaudeCode(payload) {
  const userPrompt = extractUserPrompt(payload);
  if (!userPrompt) {
    return wrapAsTextResponse('[cc-agent: no user message in payload — nothing to send to Claude Code]');
  }
  const systemPrompt = loadSystemPromptOrEmpty();
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${userPrompt}`
    : userPrompt;

  if (toolModeEnabled()) {
    return chatViaClaudeCodeWithTools(fullPrompt);
  }
  // Text-only fallback path (original MVP).
  let text;
  try {
    text = await runClaudeCli(fullPrompt);
  } catch (err) {
    text = `[cc-agent error: ${err.message}. Is the \`claude\` CLI on PATH? Drop MEPH_BRAIN to fall back to the real Anthropic API.]`;
  }
  return wrapAsTextResponse(text);
}

/**
 * TOOL MODE: spawn claude with MCP + stream-json, translate events
 * to Anthropic SSE, stream back.
 */
async function chatViaClaudeCodeWithTools(prompt) {
  const configPath = writeMcpConfigOrNull();
  if (!configPath) {
    return wrapAsTextResponse('[cc-agent tool mode: failed to write temp MCP config — falling back to text mode message. Check /tmp permissions.]');
  }
  let ndjson;
  try {
    ndjson = await runClaudeCliStreamJson(prompt, configPath);
  } catch (err) {
    // Surface the error as a text-only SSE so /api/chat's loop terminates
    // cleanly rather than hanging on an incomplete stream.
    try { unlinkSync(configPath); } catch {}
    return wrapAsTextResponse(`[cc-agent tool-mode error: ${err.message}. Set GHOST_MEPH_CC_TOOLS=0 to fall back to text mode, or drop MEPH_BRAIN to use real Anthropic.]`);
  }
  try { unlinkSync(configPath); } catch {}
  const events = translateStreamJsonBuffer(ndjson);
  // Pull the final source Claude wrote (if any) out of the event log and
  // attach it to the Response as a sidecar field. /api/chat reads this
  // on the cc-agent path to update its closure-level currentSource after
  // the turn — without it, Studio's editor stays stale across turns when
  // MEPH_BRAIN=cc-agent and Meph edits code via MCP.
  const finalSource = extractFinalSourceFromStreamJson(ndjson);
  const response = wrapAsSseResponse(events);
  if (finalSource !== null) response.ccAgentFinalSource = finalSource;
  return response;
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
 * Write a tmp MCP config JSON that registers our Meph MCP server. Returns
 * the absolute path, or null on failure. Caller is responsible for
 * unlinking after the subprocess exits.
 *
 * MCP config format:
 *   {
 *     "mcpServers": {
 *       "meph": {
 *         "command": "node",
 *         "args": ["<absolute path to mcp-server/index.js>"]
 *       }
 *     }
 *   }
 *
 * The server name "meph" is arbitrary but prefixes all tool names in
 * Claude Code's tool listing — e.g. our registered `meph_compile` becomes
 * `mcp__meph__meph_compile`. That's why the MCP server emits tool names
 * as-is; the double-prefix is harmless.
 */
export function writeMcpConfigOrNull() {
  try {
    const dir = join(tmpdir(), 'ghost-meph-mcp-configs');
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, `config-${Date.now()}-${process.pid}.json`);
    // STUDIO_URL tells the MCP child how to proxy tools that need live
    // Studio infrastructure (specifically run_tests + run_evals, which both
    // depend on the evalChild subprocess lifecycle the MCP child can't
    // own on its own). When absent, those tools fail clean with a
    // "backend not available" error from the MCP server.
    const studioPort = process.env.PORT || '3456';
    const studioUrl = `http://localhost:${studioPort}`;
    const config = {
      mcpServers: {
        meph: {
          command: 'node',
          args: [MCP_SERVER_PATH],
          env: { STUDIO_URL: studioUrl },
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return configPath;
  } catch {
    return null;
  }
}

/**
 * Run `claude --print` with the given prompt (text mode). Captures stdout,
 * returns the trimmed text. Rejects on timeout, on non-zero exit code, or
 * if the subprocess fails to spawn (CLI not on PATH).
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

/**
 * Run `claude --print --mcp-config=<path> --output-format stream-json`.
 * Captures NDJSON stdout. Same lifecycle contract as runClaudeCli.
 *
 * Exported for tests so they can mock it.
 */
export function runClaudeCliStreamJson(prompt, configPath) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    let child;
    try {
      child = spawn(
        'claude',
        ['--print', '--mcp-config', configPath, '--output-format', 'stream-json'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
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
      // Return raw NDJSON — parser handles empty/malformed lines.
      finish(resolve, stdout);
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

/** Wrap a plain text reply as the minimal Anthropic SSE sequence. */
function wrapAsTextResponse(text) {
  const events = buildSSEEvents(text);
  return wrapAsSseResponse(events);
}

/** Wrap a pre-built SSE event array as the Response /api/chat expects. */
function wrapAsSseResponse(events) {
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
