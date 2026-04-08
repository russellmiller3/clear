# Plan: Tier 7 — First-Class AI Agents (Phases 75-84)

**Branch:** `feature/agent-tier7`
**Date:** 2026-04-08
**Status:** Red-teamed. 6 issues found, all patched.

---

## Overview

Clear already has basic agents: `agent 'Name' receiving data:`, `ask claude 'prompt' with context`, `call 'Agent' with data`, structured output, scheduled agents, model selection. 1337 tests passing.

This plan adds 10 features that make Clear the best way to build AI agents — better than LangChain, CrewAI, or raw Python. ~45 lines of Clear for a complete customer support agent with tool use, RAG, conversation memory, guardrails, observability, and tests.

---

## Implementation Order (reordered by dependency)

The roadmap lists these as Phases 75-84. We reorder for incremental buildability:

| Order | Phase | Feature | Days | Why This Order |
|-------|-------|---------|------|----------------|
| 1 | 80 | Parallel Agent Execution | 0.5 | Easiest — extends existing `do all:` pattern, no new node type needed |
| 2 | 77 | Agent Chains / Pipelines | 0.5 | New node type but simple sequential await, no runtime changes |
| 3 | 82 | Agent Observability | 0.5 | Logging wrapper — useful for debugging everything that follows |
| 4 | 75 | Tool Use / Function Calling | 1.0 | **Foundational** — phases 83 and 84 depend on this |
| 5 | 83 | Guardrails / Safety | 0.5 | Compile-time check on tool use — must come after phase 75 |
| 6 | 76 | Multi-Turn Conversation | 1.0 | DB-backed history, modifies `_askAI` calling convention |
| 7 | 79 | Agent Memory | 0.5 | Same pattern as conversation — load facts, inject into context |
| 8 | 81 | Human-in-the-Loop | 0.5 | Approval workflow — needs DB table, async resume pattern |
| 9 | 84 | Agent Testing | 0.5 | Mock infrastructure — tests all the above, so comes late |
| 10 | 78 | RAG / Knowledge Base | 1.5 | Heaviest — needs embedding model + similarity search |

**Total: ~7 days**

---

## Existing Code (read per-phase)

### Always read first (every phase):
| File | Why |
|------|-----|
| `intent.md` lines 217-241 | Authoritative spec — Agent Primitives section. Update when adding new node types |
| `parser.js` lines 2369-2431 (after `parseMatch`) | `parseAgent()` — all new directives parsed here |
| `parser.js` lines 1207-1215 (in `parseBlock`) | Agent entry point — `if (firstToken.value === 'agent')` |
| `compiler.js` lines 1566-1590 (after `compileRespond`) | `compileAgent()` — agent code generation |
| `compiler.js` lines 287-326 (in `UTILITY_FUNCTIONS`) | `_askAI` utility function — tree-shaken into output |
| `compiler.js` lines 3101-3118 (in `exprToCode`) | ASK_AI and RUN_AGENT expression compilation |
| `compiler.js` line 1956 (in `_compileNodeInner`) | `case NodeType.AGENT: return compileAgent(node, ctx, pad)` |
| `validator.js` line 116 | Agent name registration in function names set |
| `synonyms.js` | **MUST scan before each phase** for collision risks |

---

## Phase 1: Parallel Agent Execution (Phase 80) — 0.5 day

**What it does:** Run multiple agent calls at the same time. Fan-out pattern.

**SYNONYM COLLISION (found by Red Team):** `run` is already a synonym for `raw_run` (SQL execution, synonyms.js line 350). The roadmap syntax `run these at the same time:` will tokenize `run` as `raw_run`, breaking parsing. Two options:
1. Register `run these at the same time` as a 6-word multi-word synonym (longest-match wins over single `run`)
2. Use different syntax: `do all at the same time:` or `call all at once:`

**Decision: Use `do these at the same time:`.** This avoids the `run` collision entirely. `do` is not a registered synonym. It also mirrors the existing `do all:` pattern.

```clear
when user calls POST /api/analyze sending data:
  do these at the same time:
    sentiment = call 'Sentiment' with data's text
    topic = call 'Topic' with data's text
    language = call 'Language' with data's text
  send back result
```

**Compiles to:** `const [sentiment, topic, language] = await Promise.all([...]);`

**Why first:** Clear already has `do all:` (Phase 28, DO_ALL node type, parser.js line 985) which compiles to `Promise.all` (compiler.js line 3239). This is nearly the same thing with agent-friendly syntax. Minimal new code.

### Parser changes (`parser.js`)
- In `parseBlock()` (line ~985, near the existing `do all:` block), detect `do these at the same time:`
- Detection: first token is `do` (identifier, not a synonym), second token is `these`
- **Do NOT register a synonym** — detect by raw token values in parseBlock, before general assignment parsing
- Create a new node type `PARALLEL_AGENTS` or reuse assignment wrapping DO_ALL
- Each child line is parsed as a full assignment via `parseBlock()` — the child lines are `name = call 'Agent' with data`
- Children are ASSIGN nodes with RUN_AGENT expressions

### Compiler changes (`compiler.js`)
- **Key difference from `do all:`:** DO_ALL stores tasks as expressions and returns an array. PARALLEL_AGENTS needs individual named results: `const [a, b, c] = await Promise.all([...])`
- Add new case in `_compileNodeInner` for PARALLEL_AGENTS
- Extract variable names from child ASSIGN nodes, extract RUN_AGENT expressions, wrap in Promise.all with destructuring

### Validator changes
- None — existing variable tracking handles assignments

### Tests (8 minimum)
1. Parser: `do these at the same time:` creates correct AST
2. Parser: error on non-assignment children
3. Compiler: generates `Promise.all` with correct agent calls
4. Compiler: destructures results into separate variables `const [a, b, c] = ...`
5. E2E: 3-agent parallel call compiles and has correct structure
6. E2E: 2-agent parallel (minimum case)
7. E2E: parallel inside endpoint with send back
8. Error: empty parallel block

### Decision: New node type, not reusing DO_ALL
DO_ALL wraps arbitrary async expressions into an array result (`results = do all:`). PARALLEL_AGENTS destructures named results into individual variables. Different compilation. New node type: `NodeType.PARALLEL_AGENTS = 'parallel_agents'` (add at parser.js ~line 311, near DO_ALL).

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | lines 985-1018 (`do all:` parsing) | Mirror the pattern — detect in same block |
| `compiler.js` | lines 3239-3248 (DO_ALL in `exprToCode`) | Similar but PARALLEL_AGENTS goes in `_compileNodeInner` not `exprToCode` |
| `synonyms.js` line 350 | `raw_run: ['run']` — verify `do` is NOT registered |

---

## Phase 2: Agent Chains / Pipelines (Phase 77) — 0.5 day

**What it does:** Chain agents sequentially — output of one feeds into the next. Error at any step stops the chain.

```clear
pipeline 'Process Inbound' with text:
  classify with 'Classifier'
  score with 'Scorer'
  route with 'Router'

when user calls POST /api/inbound sending data:
  result = call pipeline 'Process Inbound' with data's text
  send back result
```

**Compiles to:** Sequential `await` calls with error propagation. Each step's output becomes next step's input. Pipeline result = final step's output.

```js
async function pipeline_process_inbound(text) {
  let _pipe = text;
  _pipe = await agent_classifier(_pipe);
  _pipe = await agent_scorer(_pipe);
  _pipe = await agent_router(_pipe);
  return _pipe;
}
```

### New node types
- `PIPELINE`: `{ type: 'pipeline', name, inputVar, steps: [{varName, agentName}], line }` — add to NodeType enum at parser.js ~line 311
- `RUN_PIPELINE` (expression): `{ type: 'run_pipeline', pipelineName, argument, line }` — add to NodeType enum

### Parser changes (`parser.js`)
- New `parsePipeline()` function — detect `pipeline 'Name' with var:` (first token value `pipeline`, not a synonym)
- Each indented line: `varname with 'Agent Name'` → step
- **Invocation syntax: `call pipeline 'Name' with data`** — NOT `run pipeline` because `run` is synonym for `raw_run` (line 350 of synonyms.js). Detect in `parseAssignment` (parser.js ~line 5207): after existing `call 'Agent'` check, add `call pipeline 'Name'` check (token after `call` is identifier `pipeline`, then STRING)
- Add `parsePipeline` call in `parseBlock()` — detect `pipeline` as first token (add BEFORE the general assignment parsing, near agent detection at line 1207)

### Compiler changes (`compiler.js`)
- `compilePipeline()`: emit `async function pipeline_name(input) { let _pipe = input; ... return _pipe; }`
- In `exprToCode`, add `RUN_PIPELINE` case: `await pipeline_name(arg)`
- In `_compileNodeInner`, add `case NodeType.PIPELINE: return compilePipeline(node, ctx, pad);`

### Validator changes
- Register pipeline function names (like agents at validator.js line 116)
- Verify agents referenced in pipeline steps exist — scan AST body for AGENT nodes matching step names

### Tests (8 minimum)
1. Parser: pipeline declaration creates correct AST with steps
2. Parser: `call pipeline` in assignment creates RUN_PIPELINE expression
3. Compiler: pipeline generates sequential await chain with `let _pipe`
4. Compiler: call pipeline generates `await pipeline_name(arg)`
5. E2E: 3-step pipeline with endpoint compiles to valid JS
6. E2E: 2-step pipeline (minimum)
7. Validator: error when pipeline references undefined agent
8. Error: empty pipeline body

### Synonym collision check
- `pipeline` — not currently a synonym or keyword. Safe.
- ~~`run pipeline`~~ **CHANGED to `call pipeline`** — `call` + `pipeline` (identifier) + STRING. Detected before `call` + STRING (existing agent call). Order: check `call pipeline` first, then `call 'AgentName'`.

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `parser.js` lines 2369-2431 (parseAgent) | Mirror the pattern for parsePipeline |
| `parser.js` lines 5207-5223 (`call 'Agent'` parsing) | Add `call pipeline` detection BEFORE this block |
| `compiler.js` lines 1566-1590 (compileAgent) | Mirror for compilePipeline |

---

## Phase 3: Agent Observability (Phase 82) — 0.5 day

**What it does:** Every LLM call, tool use, and decision logged with input, output, latency, token count. One line enables it.

```clear
create a AgentLogs table:
  agent_name, required
  action, required
  input
  output
  tokens_used (number)
  latency_ms (number)
  created_at (timestamp), auto

agent 'Support Bot' receiving message:
  track agent decisions
  response = ask claude 'Help the customer' with message
  send back response
```

**Compiles to:** Wrapper around every `_askAI` call that records timing + token count to AgentLogs table.

```js
async function agent_support_bot(message) {
  const _agentLog = async (action, input, fn) => {
    const _start = Date.now();
    const result = await fn();
    await db.insert('AgentLogs', { agent_name: 'Support Bot', action, input: JSON.stringify(input), output: JSON.stringify(result), latency_ms: Date.now() - _start, tokens_used: result?._tokens || 0 });
    return result;
  };
  const response = await _agentLog('ask_ai', message, () => _askAI("Help the customer", message));
  return response;
}
```

### SYNONYM COLLISION (found by Red Team)
`log` is a synonym for `show` (synonyms.js line 42). So `track agent decisions` tokenizes as `show agent decisions`, which the parser will try to handle as a SHOW statement. **Fix:** Parse this directive INSIDE `parseAgent()` before calling `parseBlock()` on the body. Scan the body lines for this directive by checking raw token values (before synonym resolution) or use a different keyword.

**Decision: Change syntax to `track agent decisions`.** The word `track` is not a synonym. This avoids the collision entirely and reads naturally.

### Parser changes (`parser.js`)
- In `parseAgent()` (line 2420, before `parseBlock` call): scan upcoming indented lines for directives
- Detect `track agent decisions` — first token raw value `track`, second `agent`, third `decisions`
- **Important:** Check raw token values, not canonical, to avoid synonym interference
- Store as `node.trackDecisions = true` on the AGENT node (not a separate child node)
- Remove the directive line from the body before passing to `parseBlock`

### Compiler changes (`compiler.js`)
- In `compileAgent()`: if `node.trackDecisions`, emit `_agentLog` helper at top of function
- Wrap every `_askAI` call in the body with `_agentLog('ask_ai', ...)`
- The wrapper records to AgentLogs table via `db.insert`
- Token count: modify `_askAI` to return `{ text, _tokens }` object when logging enabled, OR parse from API response `usage.output_tokens`

### Key decision: Modify `_askAI` return type?
**No.** Don't change `_askAI` — it would break existing agents. Instead, the logging wrapper calls `_askAI` and separately tracks the response metadata. The Anthropic API response already includes `usage.output_tokens` — we just need to expose it. Add a new `_askAIWithMeta()` that returns `{ result, tokens }`.

### Tests (7 minimum)
1. Parser: `track agent decisions` sets `trackDecisions = true` on agent node
2. Parser: directive is consumed — not present in agent body nodes
3. Compiler: tracking agent emits `_agentLog` wrapper function inside agent
4. Compiler: non-tracking agent unchanged (no regression)
5. E2E: full agent with tracking + AgentLogs table compiles to valid JS
6. E2E: compiled output includes `db.insert` call to `AgentLogs`
7. Error: `track agent decisions` outside agent body → parse error

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `compiler.js` | ~287-326 | `_askAI` implementation — understand return shape |
| `compiler.js` | ~1566-1590 | `compileAgent()` — where to add logging wrapper |

---

## Phase 4: Tool Use / Function Calling (Phase 75) — 1 day

**What it does:** Agent declares which functions it can call. The compiler maps Clear functions to Anthropic `tool_use` API definitions. Agent LLM decides at runtime which tools to invoke.

```clear
agent 'Customer Support' receiving message:
  can use: look_up_orders, check_status, send_email

  response = ask claude 'Help this customer resolve their issue' with message
  send back response

define function look_up_orders(customer_email):
  orders = look up all Orders where email is customer_email
  return orders
```

**Compiles to:** Tool definitions array + agentic loop that executes tool calls and feeds results back.

```js
async function agent_customer_support(message) {
  const _tools = [
    { name: "look_up_orders", description: "look_up_orders(customer_email)", input_schema: { type: "object", properties: { customer_email: { type: "string" } } } },
    { name: "check_status", description: "check_status(order_id)", input_schema: { type: "object", properties: { order_id: { type: "string" } } } }
  ];
  const _toolFns = { look_up_orders, check_status, send_email };
  const response = await _askAIWithTools("Help this customer resolve their issue", message, _tools, _toolFns);
  return response;
}
```

### This is the hardest phase. Here's why:
1. Need to introspect function signatures at compile time to generate `input_schema`
2. Need an agentic loop: call LLM → get tool_use → execute tool → feed result back → repeat until LLM gives final answer
3. CRUD operations referenced in `can use` need to be wrapped as callable tools
4. The `_askAI` utility needs a new variant `_askAIWithTools` for the tool loop

### Parser changes (`parser.js`)
- In `parseAgent()`: detect `can use:` directive line inside agent body
- Parse comma-separated function names: `can use: fn1, fn2, fn3`
- Store as `node.tools = ['fn1', 'fn2', 'fn3']` on the AGENT node
- These are just names — the compiler resolves them to actual function definitions

### Compiler changes (`compiler.js`)
- **New utility function `_askAIWithTools`:** Agentic loop:
  1. Call Anthropic API with `tools` array
  2. If response has `tool_use` blocks, execute each tool function
  3. Feed `tool_result` back as next message
  4. Repeat until response has no more tool_use (just text)
  5. Return final text response
- **In `compileAgent()`:** If `node.tools` exists:
  - Scan AST for FUNCTION_DEF nodes matching tool names
  - Generate `_tools` array with name + generated input_schema from function params
  - Generate `_toolFns` map binding names to functions
  - Replace `_askAI` calls with `_askAIWithTools` calls
- **Schema generation:** For each function in `can use`, extract parameters from its FUNCTION_DEF node. Each param becomes `{ type: "string" }` by default. If the function body contains CRUD operations, we can infer richer types from the table schema.

### New utility function: `_askAIWithTools`

Add to `UTILITY_FUNCTIONS` array in compiler.js (line ~287), after the existing `_askAI` entry. Must be a string template like the others. Key fixes from Red Team: `endpoint`, `headers`, and `model` must be defined inline (the utility is self-contained).

```js
async function _askAIWithTools(prompt, context, tools, toolFns, model) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLEAR_AI_KEY;
  if (!key) throw new Error("Set ANTHROPIC_API_KEY environment variable with your Anthropic API key");
  const endpoint = process.env.CLEAR_AI_ENDPOINT || "https://api.anthropic.com/v1/messages";
  const headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  const _model = model || "claude-sonnet-4-20250514";
  const userContent = context ? prompt + "\\n\\nContext: " + (typeof context === "string" ? context : JSON.stringify(context)) : prompt;
  const messages = [{ role: "user", content: userContent }];
  const maxTurns = 10;
  for (let i = 0; i < maxTurns; i++) {
    const payload = { model: _model, max_tokens: 4096, messages, tools };
    const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
    if (!r.ok) { const e = await r.text(); throw new Error("AI request failed: " + r.status + " " + e); }
    const data = await r.json();
    const msg = data.content;
    messages.push({ role: "assistant", content: msg });
    const toolUses = msg.filter(b => b.type === "tool_use");
    if (toolUses.length === 0) return msg.find(b => b.type === "text")?.text || "";
    const results = [];
    for (const tu of toolUses) {
      const fn = toolFns[tu.name];
      if (!fn) throw new Error("Agent tried to call unknown tool: " + tu.name);
      try {
        const result = await fn(...Object.values(tu.input));
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
      } catch (toolErr) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: toolErr.message }), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent exceeded maximum tool use turns (10)");
}
```

**Red Team additions:** (1) Missing tool → clear error instead of `fn is undefined`. (2) Tool errors return `is_error: true` to the LLM so it can retry or explain. (3) Timeout set to 60s for tool use (longer than basic 30s). (4) `max_tokens: 4096` (agents need more room for tool reasoning).

### Validator changes (`validator.js`)
- When processing AGENT node with `tools`, verify each tool name matches a FUNCTION_DEF in the AST
- Error: `agent 'X' uses tool 'Y' but no function 'Y' is defined`

### Tests (12 minimum)
1. Parser: `can use:` directive parsed into tools array
2. Parser: multiple tools comma-separated
3. Parser: single tool
4. Compiler: agent with tools generates `_tools` array
5. Compiler: agent with tools generates `_toolFns` map
6. Compiler: `_askAIWithTools` utility is tree-shaken in
7. Compiler: agent WITHOUT tools still uses `_askAI` (no regression)
8. Validator: error on undefined tool function
9. E2E: full agent with 3 tools + endpoint compiles
10. E2E: tool schema includes function parameters
11. E2E: agent with tools + structured returning compiles
12. Error: `can use:` outside agent body

### Synonym collision check
- `can` — not currently a synonym. Will tokenize as plain IDENTIFIER. Safe.
- `use` — registered as canonical `use` (synonyms.js line 153, aliases: import, include, load). The tokenizer will emit `use` with `canonical: 'use'`. Since `can use:` is detected inside `parseAgent()` body scanning (not in main parseBlock), we check: token[0].value === 'can' && token[1].canonical === 'use'. This is safe because `parseAgent` processes its own body lines before `parseBlock` sees them.
- **Critical:** The directive parsing must happen INSIDE `parseAgent()` before calling `parseBlock()` on the body lines, otherwise `parseBlock` will see `use` and try to parse it as a module import.

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | ~2200 (parseFunctionDef) | Need to extract param names from function signatures |
| `compiler.js` | ~287-326 | `_askAI` — base implementation to extend |
| `compiler.js` | ~330 (_getUsedUtilities) | How utility tree-shaking works |
| `validator.js` | full | Add tool validation |

---

## Phase 5: Guardrails / Safety (Phase 83) — 0.5 day

**What it does:** Compile-time constraints on what an agent can access. Compiler verifies tool set doesn't touch restricted tables/operations. Violations are compile errors.

```clear
agent 'Public Bot' receiving question:
  can use: search_products, check_availability
  must not: modify prices, delete records, access users

  response = ask claude 'Help the customer find products' with question
  send back response
```

**Compile error if violated:**
```
Error: agent 'Public Bot' uses 'search_products' which deletes from Products,
  but the agent has 'must not: delete records'. Remove the restriction or
  change the tool.
```

**This is a compile-time guarantee, not a runtime check.** The code won't compile if violations exist.

### Parser changes (`parser.js`)
- In `parseAgent()`: detect `must not:` directive
- Parse comma-separated restrictions: `must not: delete records, modify prices, access users`
- Store as `node.restrictions = ['delete records', 'modify prices', 'access users']`
- Restriction categories: `delete records`, `modify X` (table), `access X` (table)

### Validator changes (`validator.js`) — THIS IS THE CORE
- For each agent with both `tools` and `restrictions`:
  - Scan each tool function's body for CRUD operations
  - Map CRUD ops to restriction categories:
    - `remove`/`delete` → "delete records"
    - `save`/`update` on table X → "modify X"
    - Any CRUD on table X → "access X"
  - If any tool violates a restriction → compile error with specific message
- This is static analysis — follow function bodies, check CRUD node types

### Compiler changes
- None. This is purely a validator feature. If validation passes, compilation proceeds normally.

### Tests (8 minimum)
1. Parser: `must not:` parsed into restrictions array
2. Validator: error when tool deletes and restriction says `delete records`
3. Validator: error when tool accesses restricted table
4. Validator: passes when tools don't violate restrictions
5. Validator: error message includes agent name, tool name, and restriction
6. E2E: agent with guardrails compiles when clean
7. E2E: agent with guardrails errors when violated
8. Parser: `must not:` without `can use:` → warning (no tools to restrict)

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `validator.js` | full | Add restriction checking pass |
| `parser.js` | ~2369 (parseAgent) | Add `must not:` parsing |

---

## Phase 6: Multi-Turn Conversation (Phase 76) — 1 day

**What it does:** Agent maintains context across messages. Conversation history stored in DB, loaded on each turn.

```clear
create a Conversations table:
  user_id, required
  messages, default '[]'
  created_at (timestamp), auto

agent 'Assistant' receiving message:
  remember conversation context
  can use: look_up_contacts, create_task

  response = ask claude 'You are a helpful assistant' with message
  send back response
```

**Compiles to:** Load conversation history from DB before LLM call, append user message + response after.

```js
async function agent_assistant(message, _userId) {
  // Load conversation history
  let _conv = await db.findOne('Conversations', { user_id: _userId });
  if (!_conv) { _conv = await db.insert('Conversations', { user_id: _userId, messages: '[]' }); }
  const _history = JSON.parse(_conv.messages || '[]');
  _history.push({ role: 'user', content: typeof message === 'string' ? message : JSON.stringify(message) });

  const response = await _askAI("You are a helpful assistant", message, null, null, _history);

  // Save updated history
  _history.push({ role: 'assistant', content: response });
  await db.update('Conversations', { ..._conv, messages: JSON.stringify(_history) });
  return response;
}
```

### Parser changes (`parser.js`)
- In `parseAgent()`: detect `remember conversation context` directive
- Store as `node.rememberConversation = true`

### Compiler changes (`compiler.js`)
- In `compileAgent()`: if `node.rememberConversation`:
  - Add `_userId` parameter to agent function
  - Emit conversation load from Conversations table at top
  - Emit history append + save after `_askAI` call
  - Modify `_askAI` calls to pass `_history` for multi-turn
- **Modify `_askAI` utility:** Add optional `history` parameter. If provided, use it as the messages array instead of a single user message.
- **Endpoint integration:** When an endpoint calls a conversation agent, pass `req.user?.id` or `incoming.user_id` as `_userId`

### Key decision: How does `_userId` get passed?
The agent is called from an endpoint via `call 'Assistant' with message`. The endpoint has access to `req.user` from auth middleware. The compiler auto-passes `req.user?.id` as second arg when calling a conversation agent. The RUN_AGENT compilation needs to detect this.

### Tests (8 minimum)
1. Parser: `remember conversation context` sets flag
2. Compiler: conversation agent has `_userId` parameter
3. Compiler: emits conversation load/save code
4. Compiler: `_askAI` call includes `_history` argument
5. Compiler: non-conversation agent unchanged
6. E2E: full chat app with conversation agent compiles
7. Compiler: endpoint calling conversation agent passes userId
8. Error: `remember conversation context` without Conversations table → warning

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `compiler.js` | ~287-326 | `_askAI` — add history parameter |
| `compiler.js` | ~3114-3118 | RUN_AGENT compilation — add userId passing |
| `runtime/db.js` | full | Understand findOne/insert/update for conversation ops |

---

## Phase 7: Agent Memory (Phase 79) — 0.5 day

**What it does:** Per-user long-term memory. Agent remembers facts across sessions. Stored in DB, injected into context on each call.

```clear
create a Memories table:
  user_id, required
  fact, required
  created_at (timestamp), auto

agent 'Personal Assistant' receiving message:
  remember user's preferences
  can use: create_task, send_email, check_calendar

  response = ask claude 'Help the user. Use their preferences when relevant.' with message
  send back response
```

**Compiles to:** (1) Load recent memories for this user from Memories table, (2) inject as system context, (3) if LLM response includes a `[REMEMBER: ...]` tag, store the new fact.

```js
async function agent_personal_assistant(message, _userId) {
  const _memories = await db.findAll('Memories', { user_id: _userId });
  const _memContext = _memories.length ? "\n\nUser preferences: " + _memories.map(m => m.fact).join("; ") : "";

  const response = await _askAI("Help the user. Use their preferences when relevant." + _memContext, message);

  // Extract and store new memories
  const _newFacts = response.match(/\[REMEMBER: (.+?)\]/g);
  if (_newFacts) {
    for (const f of _newFacts) {
      await db.insert('Memories', { user_id: _userId, fact: f.replace(/\[REMEMBER: (.+)\]/, '$1') });
    }
  }
  return response.replace(/\[REMEMBER: .+?\]/g, '').trim();
}
```

### Parser changes
- Detect `remember user's preferences` directive in agent body
- Store as `node.rememberPreferences = true`

### Compiler changes
- Nearly identical pattern to conversation context (Phase 6)
- Load memories, inject into prompt, extract `[REMEMBER:]` tags from response
- Add instruction to system prompt: "If the user shares a preference, wrap it in [REMEMBER: preference]"

### Tests (6 minimum)
1. Parser: directive sets flag
2. Compiler: emits memory load code
3. Compiler: emits memory extraction from response
4. E2E: full agent with memory table compiles
5. Compiler: memory agent has _userId parameter
6. Compiler: non-memory agent unchanged

---

## Phase 8: Human-in-the-Loop (Phase 81) — 0.5 day

**What it does:** Agent pauses for human approval on high-stakes actions.

```clear
create a Approvals table:
  action, required
  details, required
  status, default 'pending'
  decided_by
  decided_at (timestamp)

agent 'Refund Processor' receiving request:
  can use: look_up_order, process_refund

  order = look_up_order(request's order_id)
  if order's amount is greater than 100:
    ask user to confirm 'Process refund of $' + order's amount + '?'

  process_refund(order)
  send back 'Refund processed'
```

**Compiles to:** (1) Create Approvals record with status='pending', (2) return 202 Accepted with approval_id, (3) when approval is granted via PUT /api/approvals/:id, resume agent.

### Parser changes
- Detect `ask user to confirm 'message'` — new node type `HUMAN_CONFIRM`
- Store: `{ type: 'HUMAN_CONFIRM', message: expr, line }`
- This is a statement, not an expression — it appears as a standalone line or inside if blocks

### Compiler changes
- `HUMAN_CONFIRM` compiles to:
  1. Insert into Approvals table with status='pending'
  2. Return 202 Accepted with approval_id
  3. The "resume" part is handled by a generated PUT /api/approvals/:id endpoint
- **Auto-generated endpoint:** When an agent has `ask user to confirm`, the compiler generates a PUT endpoint that resumes processing

### Key complexity: Resumable execution
The agent function splits at the confirm point. Code before confirm runs immediately. Code after runs when approval is granted. This is essentially a coroutine/continuation.

**Simplification:** Instead of true coroutines, store the pending action as data. The approval endpoint re-executes from the confirm point. This means the code after `ask user to confirm` must be idempotent.

### Tests (6 minimum)
1. Parser: `ask user to confirm` creates HUMAN_CONFIRM node
2. Compiler: emits Approvals insert + 202 response
3. Compiler: generates approval PUT endpoint
4. E2E: agent with confirmation compiles
5. Compiler: confirm inside if-block compiles correctly
6. Error: `ask user to confirm` outside agent body

---

## Phase 9: Agent Testing (Phase 84) — 0.5 day

**What it does:** Deterministic tests with mocked LLM responses. Test block specifies input + expected output. Compiler generates test harness that intercepts `_askAI`.

```clear
test 'Classifier handles positive review':
  set input to 'This product is amazing!'
  mock claude responding:
    sentiment is 'positive'
    confidence = 0.95
  result = call 'Classifier' with input
  check result's sentiment is 'positive'
  check result's confidence is greater than 0.9
```

**Compiles to:** Test function that replaces `_askAI` with a mock returning the specified response.

```js
it('Classifier handles positive review', async () => {
  const _origAskAI = _askAI;
  _askAI = async () => ({ sentiment: "positive", confidence: 0.95 });
  try {
    const input = "This product is amazing!";
    const result = await agent_classifier(input);
    expect(result.sentiment).toBe("positive");
    expect(result.confidence).toBeGreaterThan(0.9);
  } finally { _askAI = _origAskAI; }
});
```

### Parser changes
- In `parseTestDef()`: detect `mock claude responding:` inside test blocks
- Parse indented block as field definitions (like structured AI output)
- Store as `{ type: 'MOCK_AI', fields: [...] }` node in test body

### Compiler changes
- When compiling test blocks: if body contains MOCK_AI node, emit `_askAI` override
- The mock returns an object built from the field definitions
- Wrap test body in try/finally to restore original `_askAI`

### Key decision: Multiple mocks in one test?
**Support it.** If there are multiple `mock claude responding:` blocks, they're consumed in order (first call gets first mock, second call gets second mock). Use an array + counter.

### Tests (8 minimum)
1. Parser: `mock claude responding:` creates MOCK_AI node
2. Parser: mock with multiple fields
3. Compiler: test with mock emits `_askAI` override
4. Compiler: mock fields compile to correct object
5. Compiler: try/finally restores original `_askAI`
6. E2E: full agent test with mock compiles
7. Compiler: multiple mocks in one test use array
8. Error: `mock claude responding:` outside test block

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | (parseTestDef) | Where to add mock parsing |
| `compiler.js` | (test compilation) | Where to add mock emission |
| `clear.test.js` | ~last 500 lines | See existing test block patterns |

---

## Phase 10: RAG / Knowledge Base (Phase 78) — 1.5 days

**What it does:** Agent automatically retrieves relevant context from specified tables before prompting. Embedding + similarity search.

```clear
create a Documents table:
  title, required
  content, required
  category

agent 'Knowledge Bot' receiving question:
  knows about: Documents, Products, FAQ
  using 'claude-sonnet-4-6'

  answer = ask claude 'Answer this question using the provided context' with question
  send back answer
```

**Compiles to:** (1) Embed the question, (2) search across specified tables for relevant content, (3) inject top-k results as context, (4) call LLM.

### Why this is last
RAG is the heaviest phase because it needs:
1. An embedding model (Anthropic or OpenAI)
2. Embedding storage (new column on tables, or separate embeddings table)
3. Similarity search (cosine distance computation)
4. Chunking strategy for large documents

### Parser changes
- Detect `knows about:` directive in agent body
- Parse comma-separated table names
- Store as `node.knowsAbout = ['Documents', 'Products', 'FAQ']`

### Compiler changes
- **New utility `_embedAndSearch`:**
  1. Call embedding API to embed the question
  2. For each table in `knowsAbout`, load records and compute similarity
  3. Return top-k most relevant records
- **In `compileAgent()`:** If `node.knowsAbout`, emit context retrieval before `_askAI` call
- **Embedding storage:** First call embeds all records and caches. Subsequent calls use cache.

### Simplification for v1
Skip vector embeddings entirely for v1. Use **keyword-based search** instead:
- Split question into keywords
- Search each `knowsAbout` table for records containing those keywords
- Rank by keyword match count
- Inject top 5 results as context

This is much simpler, works without an embedding API, and can be upgraded to vector search later.

### Tests (8 minimum)
1. Parser: `knows about:` parsed into table list
2. Compiler: RAG agent emits context retrieval code
3. Compiler: keyword search logic generated
4. Compiler: context injected into `_askAI` call
5. E2E: agent with `knows about` + table compiles
6. Validator: error when `knows about` references non-existent table
7. Compiler: multiple tables searched
8. Compiler: non-RAG agent unchanged

### Files to read for this phase:
| File | Lines | Why |
|------|-------|-----|
| `compiler.js` | DATA_SHAPE compilation | Understand table schema access |
| `runtime/db.js` | findAll | Understand how to search records |

---

## Critical Architecture Decision: Agent Directive Parsing

**ALL agent directives** (`can use:`, `must not:`, `remember conversation context`, `remember user's preferences`, `track agent decisions`, `knows about:`) must be parsed INSIDE `parseAgent()` BEFORE calling `parseBlock()` on the body. Here's why:

1. `use` (in `can use:`) is synonym for module import — `parseBlock` would parse it as USE node
2. `log` (if we'd used it) is synonym for `show` — `parseBlock` would parse it as SHOW node
3. Directives are metadata on the agent, not executable statements — they belong on the node, not in the body

**Implementation pattern in `parseAgent()` (parser.js line 2420):**
```
// After parsing receivingVar, before parseBlock:
// Scan upcoming indented lines for directives
const directives = { tools: null, restrictions: null, rememberConversation: false,
                     rememberPreferences: false, trackDecisions: false, knowsAbout: null };
let bodyStartIdx = startIdx + 1;
while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > blockIndent) {
  const dTokens = lines[bodyStartIdx].tokens;
  if (dTokens[0]?.value === 'can' && dTokens[1]?.canonical === 'use') {
    // parse comma-separated tool names after colon
    directives.tools = [...];
    bodyStartIdx++;
  } else if (dTokens[0]?.value === 'must' && dTokens[1]?.value === 'not') {
    directives.restrictions = [...];
    bodyStartIdx++;
  } else if (dTokens[0]?.value === 'remember') {
    // check for 'conversation context' or 'user's preferences'
    bodyStartIdx++;
  } else if (dTokens[0]?.value === 'track') {
    directives.trackDecisions = true;
    bodyStartIdx++;
  } else if (dTokens[0]?.value === 'knows') {
    directives.knowsAbout = [...];
    bodyStartIdx++;
  } else break; // first non-directive line = start of body
}
const result = parseBlock(lines, bodyStartIdx, blockIndent, errors);
```

This is the single most important architectural decision in this plan. Get it wrong and synonym collisions break everything.

---

## Edge Cases (all phases)

| Scenario | How We Handle |
|----------|--------------|
| Agent has `can use` but referenced function doesn't exist | Validator error with suggestion |
| Agent has `must not` but no `can use` | Warning: restrictions without tools are meaningless |
| Pipeline references undefined agent | Validator error |
| `remember conversation context` without Conversations table | Compiler warning |
| `remember user's preferences` without Memories table | Compiler warning |
| `track agent decisions` without AgentLogs table | Compiler warning |
| `use` token in `can use:` triggers module import in parseBlock | Parse directives INSIDE parseAgent before parseBlock — see Phase 4 |
| `run` in syntax tokenizes as `raw_run` | Changed to `do these at the same time:` and `call pipeline` — see Phases 1, 2 |
| `log` in syntax tokenizes as `show` | Changed to `track agent decisions` — see Phase 3 |
| `knows about` references non-existent table | Validator error |
| Multiple directives on same agent | All composable — agent can have tools + memory + logging |
| `ask user to confirm` in non-agent context | Parser error |
| `mock claude responding` outside test block | Parser error |
| Tool function has no parameters | Schema with empty properties object |
| Agent calls another agent that has conversation memory | Inner agent gets same userId |
| Parallel agents where one fails | Promise.all rejects — error includes which agent failed |
| Pipeline step returns null | Next step receives null — user's responsibility to guard |

---

## intent.md Updates

Add these new node types to intent.md after implementation:

```
| PARALLEL_AGENTS | `do these at the same time:` + call assignments | `Promise.all([...])` |
| PIPELINE | `pipeline 'Name' with var:` + steps | Sequential async function |
| RUN_PIPELINE | `call pipeline 'Name' with data` | `await pipeline_name(data)` |
| HUMAN_CONFIRM | `ask user to confirm 'message'` | Approvals table + 202 response |
| MOCK_AI | `mock claude responding:` + fields | Test `_askAI` override |
```

Agent directives (stored as flags on AGENT node, not separate nodes):
```
| can use: fn1, fn2 | node.tools = ['fn1', 'fn2'] | Tool use / function calling |
| must not: X, Y | node.restrictions = ['X', 'Y'] | Compile-time safety guardrails |
| remember conversation context | node.rememberConversation = true | Multi-turn history |
| remember user's preferences | node.rememberPreferences = true | Long-term memory |
| track agent decisions | node.trackDecisions = true | Observability logging |
| knows about: Table1, Table2 | node.knowsAbout = ['Table1', 'Table2'] | RAG context retrieval |
```

---

## Success Criteria

- [ ] All 10 phases implemented and tested
- [ ] Existing 1337 tests still pass (no regressions)
- [ ] 80+ new tests across all phases
- [ ] The "complete customer support agent" example from ROADMAP.md (~45 lines) compiles
- [ ] intent.md updated with all new node types and directives
- [ ] Parser and compiler TOCs updated
- [ ] learnings.md updated with agent tier gotchas

---

## Update Learnings

After each phase, run update-learnings skill to capture:
- Synonym collisions discovered
- Parser ordering gotchas
- Compilation patterns that worked/didn't
- Testing patterns for agent features

