# Plan — Ghost Meph cc-agent: tool-use upgrade

**Status:** planning. Text-only MVP shipped 2026-04-21 in
`feature/ghost-meph-cc`. This doc covers the next layer: Meph-style tool
dispatch through Claude Code subprocess.

**Why this isn't done yet:** the MVP unblocks the routing layer end-to-end
(Russell can `MEPH_BRAIN=cc-agent` and see Studio talk to his local Claude
Code subscription), but it doesn't satisfy the original GM-2 spec, which
called for "tool calls out, iterate" — i.e. the cc-agent backend should
expose Meph's tool set (edit_code, read_file, run_command, compile, run_app,
stop_app, http_request, write_file) and let the Claude Code sub-agent
dispatch them. That requires a real protocol bridge.

---

## The contract that has to hold

Anything that replaces the current text-only MVP must keep this invariant:
> The /api/chat tool-use loop in `playground/server.js` reads
> Anthropic-shaped SSE events and only cares about three event types:
> `content_block_start` (with `type: 'tool_use'`), `content_block_delta`
> (with `type: 'input_json_delta'`), and `message_delta` (with
> `delta.stop_reason`).

So whatever the cc-agent backend emits MUST translate Claude Code's
tool calls into those three event types. The /api/chat loop then runs the
tool, captures the result, and posts it back as a new user-role message
containing a `tool_result` block — same as it would for real Anthropic.

---

## Three architectures to choose between

### Option A — MCP server exposing Meph's tools

Stand up a local MCP server that exposes the 8 Meph tools as MCP tools.
Spawn `claude --mcp-config=<path> --print -` and the sub-agent can call
them directly.

**Pros:**
- Cleanest separation: Meph's tools become reusable across any MCP client.
- Claude Code already speaks MCP natively — minimal protocol translation.
- Tool inputs/outputs flow through MCP's typed JSON, which matches
  Anthropic's tool-use shape closely.

**Cons:**
- Requires a new long-running MCP server process (or an embedded one in
  Studio). Adds operational complexity.
- Tool definitions have to be ported from Meph's JSON schemas to MCP's
  schema format. Doable, but a chore.
- Permissions story: the MCP server runs in Russell's environment, which
  means the Claude Code sub-agent has the same FS/network access Russell
  has. That's the same as today, but worth flagging.

### Option B — Stream-JSON parsing of Claude Code's output

Run `claude --print --output-format stream-json` and parse each line as a
JSON event. Translate Claude Code's tool_use events into Anthropic's
SSE shape. Tool RESULTS need to be posted back to the sub-agent — that
requires running Claude Code with stdin-based interaction or re-spawning
with the result included in the next prompt.

**Pros:**
- No MCP server needed.
- Single subprocess per request.

**Cons:**
- Stream-json format isn't formally documented as a stable interface;
  could change between `claude` versions.
- Tool dispatch has to round-trip through subprocess restarts (or stdin
  protocol), adding latency.
- The full Meph tool set requires Meph-to-Claude-Code translation per
  tool: Meph's `edit_code` doesn't exist in CC's vocabulary; would need
  to be rephrased as "use Edit tool with these args."

### Option C — Hybrid: MCP server + persistent subprocess

Run an MCP server with the 8 Meph tools, AND keep the Claude Code
subprocess alive across requests (long-lived REPL via `claude --resume`
or similar). New /api/chat requests resume the same session.

**Pros:**
- Lowest latency (no subprocess spawn per request).
- Same tool semantics as today.

**Cons:**
- Session lifecycle gets fiddly: if Claude Code subprocess dies, /api/chat
  needs to re-spawn cleanly. Per-tenant or per-session state must not
  leak.
- Hardest to test deterministically.

**Recommended:** **Option A** for MVP, **Option C** if profile shows
subprocess spawn dominates request time at sweep scale.

---

## Concrete step list (Option A path)

1. **Create `playground/ghost-meph/mcp-server/`** — a tiny ESM Node program
   that implements the MCP server protocol over stdio. One file per
   tool (`edit-code.js`, `read-file.js`, ...) with a JSON schema and a
   handler. ~30 lines per tool × 8 tools = ~240 lines of straightforward
   per-tool code, plus ~150 lines of MCP protocol wiring (initialization,
   tool listing, tool call dispatch). Total: ~400 lines.

2. **Bridge the tool implementations to the existing Meph tools.** The
   current Meph tool implementations live in `playground/server.js` —
   `executeTool(name, input)`. Refactor that into a standalone module
   (`playground/meph-tools.js`) so both /api/chat and the MCP server can
   import it. The refactor is mechanical (move 8 cases out of a switch).

3. **Generate Claude Code's MCP config dynamically per request.** Studio
   knows which working dir the user is in; the MCP config needs the
   absolute path to the tool implementations. Write a tempfile per
   request OR use a single config and key tools by working dir.

4. **Replace the text-only MVP in `playground/ghost-meph/cc-agent.js`**:
   - Spawn `claude --print --mcp-config=<config> --output-format stream-json`
   - Read each JSON event from stdout
   - Translate `tool_use` events to Anthropic SSE
     - `{type:"tool_use", name:"edit_code", id:"..."}` →
       `content_block_start` (type tool_use) + sequence of
       `content_block_delta` (input_json_delta) + `content_block_stop`
   - Translate `text` events to text_delta events (already done in MVP)
   - Translate the final stop event to `message_delta` with
     `stop_reason: 'end_turn'` (or `'tool_use'` if a tool was called and
     the loop should iterate)

5. **Tool result feedback loop.** When /api/chat runs a tool and posts
   the result back as a `tool_result` content block in the next assistant
   call, the cc-agent backend needs to forward that to the Claude Code
   subprocess. Two approaches:
   - **Re-spawn per turn** — each /api/chat iteration spawns a fresh
     `claude` process with the full message history. Simple, slow.
   - **Persistent subprocess** — keep `claude` alive, write tool results
     to its stdin. Faster but Claude Code's stdin protocol for resumed
     sessions needs to be understood (likely undocumented).
   Start with re-spawn; profile; switch to persistent if needed.

6. **Test plan.** The tests should mock the `claude` subprocess so they
   don't depend on the CLI being installed:
   - Mock spawn → return canned stream-json sequences for: text-only,
     single tool call, multi-tool sequence, error.
   - Assert that translated SSE events match Anthropic's exact shape.
   - Add an integration test that runs /api/chat with `MEPH_BRAIN=cc-agent`
     and a mocked subprocess to verify the full loop (chat → tool_use →
     /api/chat runs tool → post back as tool_result → next iteration).

---

## Effort estimate

- MCP server skeleton + protocol wiring: 1 day
- Refactor `executeTool` into shared module: 0.5 day
- 8 tool ports (mostly mechanical): 0.5 day
- cc-agent.js replacement (stream-json parser + SSE translation): 1.5 days
- Tool result feedback loop: 0.5 day (re-spawn approach)
- Tests + docs: 1 day

**Total: ~5 days of focused work** by one person who understands both
Meph's tool surface and Claude Code's subprocess interface.

---

## What unlocks once this lands

- `node playground/eval-meph.js` runs against `MEPH_BRAIN=cc-agent`.
  Cost: $0 (Russell's $200/mo Anthropic unlimited subscription via
  Claude Code instead of metered API).
- Curriculum sweeps default to `MEPH_BRAIN=cc-agent` (GM-6 follow-up).
- Pre-push Meph eval stops being skipped (no more `SKIP_MEPH_EVAL=1`).
- Factor DB rows accumulate from cc-agent runs — same shape as Anthropic
  rows since the request/response envelope matches. The reranker doesn't
  care which backend produced the row.
- Queue F (RL flywheel work blocked on Ghost Meph) becomes executable.

---

## Risks

1. **Claude Code's `--output-format stream-json` may change shape** —
   it's not a documented stable API. Mitigation: pin tested CLI version
   in CI; surface CLI version in startup logs.
2. **MCP server permissions** — anything Russell can do, the cc-agent
   sub-agent can do (delete files, hit the network, run commands).
   That's true today but worth a security audit pass when MCP is added.
3. **Subprocess spawn latency** — first request will pay 2–5s of warmup.
   Mitigation: persistent subprocess (Option C) once volume justifies it.
4. **Tool name collisions** — Meph's `read_file` and Claude Code's
   built-in `Read` tool both exist. The MCP server's `read_file` must
   resolve unambiguously without bouncing to the wrong implementation.
   Mitigation: prefix MCP tools with `meph_` (e.g. `meph_read_file`).
