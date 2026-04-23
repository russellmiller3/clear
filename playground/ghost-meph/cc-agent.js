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
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir, homedir, platform } from 'os';
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

// Cache the resolved binary path so we don't re-scan the filesystem on
// every Meph turn. Resets per-process (any new Studio start re-resolves).
let _cachedClaudeBinary = undefined;

/**
 * Resolve the absolute path to the `claude` CLI. Prefers PATH (bare
 * "claude" name — spawn handles the lookup); falls back to known install
 * locations when PATH is empty — which is especially common on Windows
 * where Node doesn't pick up the PATH additions `claude-code` installer
 * made because the installer updated the user-level PATH, not whatever
 * shell actually launched Studio.
 *
 * Returns either:
 *   - "claude" (the bare name — let spawn use PATH)
 *   - an absolute path to the newest installed claude binary
 *   - null if nothing was found
 *
 * Exported for tests.
 */
export function resolveClaudeBinary(env = process.env) {
  if (_cachedClaudeBinary !== undefined) return _cachedClaudeBinary;

  // Honor explicit override unconditionally — if Russell / CI / a test sets
  // CLAUDE_CLI_PATH, use that path verbatim without fallback. If the path
  // doesn't exist, spawn will ENOENT cleanly (and tests rely on this to
  // simulate missing-CLI states).
  if (env.CLAUDE_CLI_PATH) {
    _cachedClaudeBinary = env.CLAUDE_CLI_PATH;
    return _cachedClaudeBinary;
  }

  const isWindows = platform() === 'win32';
  const exe = isWindows ? 'claude.exe' : 'claude';

  // Fast path: check PATH. If the binary is there, spawn can find it — no
  // need to compute the absolute path.
  const pathDirs = (env.PATH || env.Path || '').split(isWindows ? ';' : ':');
  for (const dir of pathDirs) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (existsSync(candidate)) {
      _cachedClaudeBinary = 'claude';  // let spawn do the PATH lookup
      return _cachedClaudeBinary;
    }
  }

  // Fallback: known install locations. Claude Code's Windows installer
  // drops builds into %APPDATA%\Claude\claude-code\<version>\claude.exe;
  // macOS/Linux installs typically use ~/.claude/local/claude or Homebrew.
  const home = homedir();
  const candidates = [];
  if (isWindows) {
    const appData = env.APPDATA || join(home, 'AppData', 'Roaming');
    candidates.push(join(appData, 'Claude', 'claude-code'));        // versioned builds
    candidates.push(join(appData, 'Claude', 'claude-code-vm'));     // VM builds
  } else {
    candidates.push(join(home, '.claude', 'local'));                 // canonical install location
    candidates.push('/usr/local/bin');                                // Homebrew / manual
    candidates.push('/opt/homebrew/bin');                             // Apple Silicon Homebrew
  }

  // For versioned directories (Windows), pick the newest sub-version.
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    // Either the directory IS the versioned root (has sub-dirs like "2.1.111")
    // or it directly contains claude[.exe].
    const direct = join(dir, exe);
    if (existsSync(direct)) {
      _cachedClaudeBinary = direct;
      return _cachedClaudeBinary;
    }
    // Scan for versioned subdirs and pick the newest by mtime.
    let subdirs;
    try {
      subdirs = readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => join(dir, d.name));
    } catch { continue; }
    if (subdirs.length === 0) continue;
    // Sort by mtime descending — newest first.
    subdirs.sort((a, b) => {
      try { return statSync(b).mtimeMs - statSync(a).mtimeMs; } catch { return 0; }
    });
    for (const sub of subdirs) {
      const candidate = join(sub, exe);
      if (existsSync(candidate)) {
        _cachedClaudeBinary = candidate;
        return _cachedClaudeBinary;
      }
    }
  }

  _cachedClaudeBinary = null;
  return _cachedClaudeBinary;
}

/** Test hook — reset the cached resolution. */
export function _resetClaudeBinaryCache() {
  _cachedClaudeBinary = undefined;
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

  if (toolModeEnabled()) {
    // Tool mode: keep system + user prompts separate so we can feed the
    // ~48KB system prompt via --system-prompt-file (avoids Windows 32KB
    // argv ceiling) and the ~1-2KB user prompt as a positional arg
    // (avoids the claude.exe stdin-race on Windows pipes).
    return chatViaClaudeCodeWithTools(userPrompt, systemPrompt);
  }
  // Text-only fallback path (original MVP).
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${userPrompt}`
    : userPrompt;
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
async function chatViaClaudeCodeWithTools(userPrompt, systemPrompt) {
  const configPath = writeMcpConfigOrNull();
  if (!configPath) {
    return wrapAsTextResponse('[cc-agent tool mode: failed to write temp MCP config — falling back to text mode message. Check /tmp permissions.]');
  }
  // Write the 48KB system prompt to a temp file so we can pass it via
  // --system-prompt-file. Trying to pass it as an argv (concatenated with
  // the user prompt) hits Windows' 32KB argv ceiling → ENAMETOOLONG.
  // Trying to pipe the combined prompt via stdin hits claude.exe 2.1.111's
  // 3-second stdin-data-received check, which races Node's async pipe
  // write and loses 100% of the time on Windows. File + positional-arg
  // sidesteps both.
  let systemPromptPath = null;
  if (systemPrompt && systemPrompt.length > 0) {
    try {
      const dir = join(tmpdir(), 'ghost-meph-system-prompts');
      mkdirSync(dir, { recursive: true });
      systemPromptPath = join(dir, `sys-${Date.now()}-${process.pid}.txt`);
      writeFileSync(systemPromptPath, systemPrompt, 'utf8');
    } catch {
      systemPromptPath = null; // fall through — claude will use its default system prompt
    }
  }
  let ndjson;
  try {
    ndjson = await runClaudeCliStreamJson(userPrompt, configPath, systemPromptPath);
  } catch (err) {
    // Surface the error as a text-only SSE so /api/chat's loop terminates
    // cleanly rather than hanging on an incomplete stream.
    try { unlinkSync(configPath); } catch {}
    if (systemPromptPath) { try { unlinkSync(systemPromptPath); } catch {} }
    return wrapAsTextResponse(`[cc-agent tool-mode error: ${err.message}. Set GHOST_MEPH_CC_TOOLS=0 to fall back to text mode, or drop MEPH_BRAIN to use real Anthropic.]`);
  }
  try { unlinkSync(configPath); } catch {}
  if (systemPromptPath) { try { unlinkSync(systemPromptPath); } catch {} }
  // Debug hook: set GHOST_MEPH_CC_DEBUG=1 to dump the raw claude stream-json
  // to /tmp/ghost-meph-last-stream.ndjson so we can inspect the exact
  // event shape if translation produces unexpected results.
  if (process.env.GHOST_MEPH_CC_DEBUG === '1') {
    try {
      writeFileSync(join(tmpdir(), 'ghost-meph-last-stream.ndjson'), ndjson, 'utf8');
    } catch {}
  }
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
    //
    // FACTOR_DB_PATH pipes the Factor DB location through so the MCP
    // server's compile tool can log trajectory rows during cc-agent
    // curriculum sweeps (flywheel-feeds the training signal). Forwarded
    // from Studio's parent env if set, else pointed at the canonical
    // local path — same logic Studio uses at server.js:1599.
    const studioPort = process.env.PORT || '3456';
    const studioUrl = `http://localhost:${studioPort}`;
    const factorDbPath = process.env.FACTOR_DB_PATH
      || join(__dirname, '..', 'factor-db.sqlite');
    const config = {
      mcpServers: {
        meph: {
          command: 'node',
          args: [MCP_SERVER_PATH],
          env: {
            STUDIO_URL: studioUrl,
            FACTOR_DB_PATH: factorDbPath,
            // Propagate the supervisor's session id so every row this MCP
            // child logs stitches back to the sweep task worker.
            ...(process.env.MEPH_SESSION_ID ? { MEPH_SESSION_ID: process.env.MEPH_SESSION_ID } : {}),
          },
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

    const claudeBin = resolveClaudeBinary();
    if (!claudeBin) {
      return reject(new Error('`claude` CLI not found — checked PATH and known install locations (%APPDATA%/Claude on Windows, ~/.claude/local on Unix). Install Claude Code or set CLAUDE_CLI_PATH.'));
    }
    let child;
    try {
      child = spawn(claudeBin, ['--print'], {
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
/**
 * Build the exact argv vector we hand to `claude` in stream-json mode.
 * Exported so tests can assert on the flags without actually spawning.
 *
 * Flag notes:
 *  --print: single-shot mode (not interactive)
 *  --verbose: required when pairing --print with --output-format=stream-json
 *             (claude 2.x enforces it — without, CLI exits 1)
 *  --permission-mode=bypassPermissions: auto-run MCP tool calls instead of
 *             asking the user to approve each one. Without this, every
 *             meph_edit_code / meph_compile call ends the turn with
 *             "Waiting on your permission" and nothing gets done.
 *  --tools "": disable Claude Code's built-in tools (Bash, Read, Write,
 *             Edit, Glob, Grep, WebFetch, etc). Forces claude through the
 *             MCP surface only — our 28 meph_* tools. Critical for Factor
 *             DB instrumentation: if claude grabs the Bash tool to curl
 *             an endpoint, the request bypasses meph_http_request and the
 *             test_pass=1 write never happens. MCP tools registered via
 *             --mcp-config stay available regardless of --tools.
 *
 * prompt (optional): appended as the final positional argument when
 *             non-empty. Required on Windows — claude.exe 2.1.111 emits
 *             "Warning: no stdin data received in 3s" and exits code 1
 *             when we try to pipe the prompt via stdin (Node's async
 *             stdin.write races with claude's 3s stdin-check timer).
 *             Passing as positional arg sidesteps the race entirely.
 * systemPromptPath (optional): passed via --system-prompt-file when
 *             non-empty. The Meph system prompt is ~48KB; concatenating
 *             it with the user prompt into a single argv blows past the
 *             32KB Windows argv ceiling (ENAMETOOLONG). File delivery
 *             keeps the positional argv tiny (just the ~1-2KB user
 *             prompt) and the 48KB stays in a tmp file.
 */
export function buildClaudeStreamJsonSpawnArgs(configPath, prompt, systemPromptPath) {
  const args = [
    '--print',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--tools', '',
    '--mcp-config', configPath,
    '--output-format', 'stream-json',
  ];
  if (typeof systemPromptPath === 'string' && systemPromptPath.length > 0) {
    args.push('--system-prompt-file', systemPromptPath);
  }
  if (typeof prompt === 'string' && prompt.length > 0) args.push(prompt);
  return args;
}

export function runClaudeCliStreamJson(prompt, configPath, systemPromptPath) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const claudeBin = resolveClaudeBinary();
    if (!claudeBin) {
      return reject(new Error('`claude` CLI not found — checked PATH and known install locations. Install Claude Code or set CLAUDE_CLI_PATH.'));
    }
    let child;
    try {
      // Pass prompt as positional arg + system prompt via --system-prompt-file
      // (not via stdin). On Windows claude.exe 2.1.111's stdin-data-received
      // check (3s) races with Node's async pipe write and loses 100% of the
      // time. Combined prompts (~48KB system + ~1KB user) exceed the 32KB
      // Windows argv ceiling (ENAMETOOLONG). Splitting system→file +
      // user→argv sidesteps both failures. stdio[0]='ignore' closes stdin
      // so claude doesn't wait on it at all; the harmless stderr warning
      // claude emits about closed stdin is filtered below.
      child = spawn(
        claudeBin,
        buildClaudeStreamJsonSpawnArgs(configPath, prompt, systemPromptPath),
        { stdio: ['ignore', 'pipe', 'pipe'] },
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
        // Filter the benign "no stdin data received in 3s" warning — it's
        // emitted when stdin is ignored AND claude ran fine via positional
        // arg, so we don't want it surfaced as an error tail.
        const tail = (stderr || '')
          .split('\n')
          .filter(l => !/no stdin data received/i.test(l))
          .slice(-5).join('\n').trim();
        finish(reject, new Error(`\`claude\` exited with code ${code}: ${tail || '(no stderr)'}`));
        return;
      }
      // Return raw NDJSON — parser handles empty/malformed lines.
      finish(resolve, stdout);
    });
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
