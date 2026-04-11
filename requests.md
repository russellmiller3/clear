# Requests

Bug reports and feature gaps discovered while building apps in Clear Studio.
Filed by Meph (the Studio agent) or by the user. Read by the compiler team.

## How to File a Request

- **Newest requests go at the top**, below this section
- **Order by priority:** CRITICAL → MAJOR → MINOR
- **Always include the compiled JS output** — that's the smoking gun, not just the error message
- **Include steps to reproduce** if the bug depends on a sequence of action

### Request Template
## Request: [short name]
**Priority:** CRITICAL | MAJOR | MINOR
**What I was building:** [one sentence]
**What I wrote in Clear:**
```clear
[the exact line(s)]
```
**What I expected:** [one sentence]
**What actually happened:** [exact error message]
**Compiled output (if applicable):**
```javascript
[paste the mangled JS — this is the most useful artifact]
```
**Steps to reproduce:** [numbered list if it's a multi-step issue]
**Workaround used:** [what I did instead, or "blocked"]
**Impact:** [one sentence on what this blocks]
```

---

## Request: Inspect compiled code ✅ FIXED
**Priority:** MAJOR (FIXED — compile tool now always returns compiled output alongside errors)
**What I was building:** Any app that hits a compile error — specifically trying to debug a broken button handler
**What I wrote in Clear:**
```clear
button 'Add Task':
  post to '/api/tasks' with form data
  refresh page
```
**What I expected:** The `compile` tool (used by the Studio agent) returns both the error messages AND the partial or full compiled JS — even when the build fails — so the agent can see exactly what broken code was generated.

**What actually happened:** When compilation fails (e.g. due to auth warnings treated as errors, or syntax issues), the `compile` tool returns errors only. No compiled output is returned. The agent is flying blind — it can see that something is wrong but cannot inspect the generated JS to understand *why*.

The only way to see compiled JS is:
1. Satisfy every compiler warning (e.g. add `requires auth` everywhere)
2. Build successfully
3. Read the output file

This means the agent **cannot inspect compiled output for broken code** — which is exactly the scenario where inspection is most needed.

---

### What "perfect" looks like

The `compile` tool should always return compiled output, even on failure. Two options:

**Option A — Return partial output with errors:**
```json
{
  "errors": ["line 4: auth required on POST endpoint"],
  "warnings": [],
  "compiledJS": "// PARTIAL OUTPUT — build failed\n...(whatever was generated before the error)..."
}
```

**Option B — Return full output with a --force flag:**
Add a `force` option that compiles past errors and returns the full JS anyway, flagged as unsafe:
```json
{
  "errors": ["line 4: auth required on POST endpoint"],
  "warnings": [],
  "forcedOutput": true,
  "compiledJS": "// WARNING: compiled with errors\n...(full output)..."
}
```

**Option B is better.** Partial output is ambiguous — was the rest missing due to the error, or just not generated yet? A forced full compile gives the agent a complete picture.

---

### Why this matters for the agent loop

The agent's debugging loop is:
```
write code → compile → see error → inspect compiled JS → fix → repeat
```

Without compiled output on failure, step 3 stalls. The agent has to:
- Guess what the compiler generated
- Add workarounds (like `requires auth`) just to get a build
- Then remove them again after inspecting

That's 2-3 extra round trips per bug. For a runtime bug like `refresh page → console.log(refresh)`, the agent would never have found it without a successful build first.

---

**Steps to reproduce:**
1. Write any Clear code with a known compiler warning (e.g. POST endpoint without `requires auth`)
2. Call `compile` from the Studio agent
3. Observe: errors returned, compiled JS field is empty or absent
4. Agent cannot see what JS was generated for the broken lines

**Workaround used:** Add `requires auth` to all endpoints to force a clean build, inspect the JS, then remove it. Costs 2-3 extra round trips per debugging session.

**Impact:** MAJOR. Slows down every debugging session. The agent is most useful when things are broken — but that's exactly when it's most blind. Returning compiled output unconditionally (or with a force flag) would cut debugging time in half.

---

## Request: Runtime errors are a black box — no structured error surface ✅ FIXED
**Priority:** MAJOR (FIXED — _clearError now always returns structured { error, hint, clear_line } even in production)
**What I was building:** A task CRUD app. GET /api/tasks returned a 500 with no message when the table was empty.
**What I wrote in Clear:**
```clear
when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks
```
**What I expected:** Either the data, or a structured error like `{ error: "No records found", hint: "The Tasks table is empty" }` — something a human can read and act on.

**What actually happened:** Silent HTTP 500. No body. No message. No hint. The terminal showed nothing useful. The frontend showed a blank screen. A non-developer has zero signal about what went wrong or how to fix it.

---

### What "perfect" looks like

**In the API response (JSON):**
```json
{
  "error": "Database read failed",
  "context": "GET /api/tasks",
  "hint": "The Tasks table may be empty or not yet created. Try adding a record first.",
  "code": "DB_READ_ERROR"
}
```

**In the terminal (structured, not a raw stack trace):**
```
[Runtime Error] GET /api/tasks → DB_READ_ERROR
  Cause: Tasks table returned null
  Hint:  Table may be empty. Seed some data or check your table definition.
  Line:  tasks = get all Tasks
```

**In the preview panel (inline toast — most important for non-devs):**
```
┌─────────────────────────────────────────────────────┐
│ ⚠️  GET /api/tasks failed                           │
│  The Tasks table appears to be empty.               │
│  Add a record first, then reload.                   │
└─────────────────────────────────────────────────────┘
```

---

### Where should runtime errors surface?

Three surfaces, each serving a different audience:

```
┌──────────────────┬──────────────────────────────────────────────┐
│ Surface          │ Audience + Content                           │
├──────────────────┼──────────────────────────────────────────────┤
│ Preview panel    │ Non-dev user. Friendly toast with plain       │
│ (inline toast)   │ English. "Something broke and here's why."   │
├──────────────────┼──────────────────────────────────────────────┤
│ Terminal         │ Developer. Full structured log with cause,   │
│                  │ hint, and the Clear line that triggered it.  │
├──────────────────┼──────────────────────────────────────────────┤
│ API response     │ HTTP client / Meph testing with http_request │
│ (JSON body)      │ Structured JSON with error + hint fields.    │
└──────────────────┴──────────────────────────────────────────────┘
```

**Do NOT add a separate "Runtime Errors" panel.** That's more UI complexity for no gain. The preview toast + terminal combo covers both audiences cleanly.

---

### Known cases that should produce structured errors (not silent 500s)

| Scenario | Current behavior | Should say |
|----------|-----------------|------------|
| `get all X` on empty table | 500, no body | "X table is empty. Add a record first." |
| `get all X` on undefined table | 500, no body | "X table doesn't exist. Check your table definition." |
| `save data to X` with missing required field | 500, no body | "Missing required field: [fieldname]" |
| `remove from X with this id` — id not found | 500, no body | "No record found with that id in X." |
| `ask claude` with no API key | 500, no body | "ANTHROPIC_API_KEY is not set. Add it in Studio settings." |
| Auth fails on protected endpoint | 401 (works) | Already good ✅ |
| Compiler error caught at runtime | 500, no body | Should never reach runtime — catch at compile time |

---

**Steps to reproduce (empty table case):**
1. Create any table (e.g. Tasks)
2. Write `GET /api/tasks` that does `get all Tasks`
3. Don't insert any data
4. Call GET /api/tasks
5. Observe: HTTP 500, empty body, no terminal message

**Workaround used:** None — the error is invisible. User has no debugging signal.

**Impact:** HIGH. This is the #1 reason a non-developer gives up. The compiler errors are genuinely excellent (plain English, inline hints, patchable fixes). The runtime errors are a completely different — and much worse — experience. Fixing this makes Clear feel consistent end-to-end.

---

## Request: `refresh page` compiles to `console.log(refresh)` — crashes frontend ✅ FIXED
**Priority:** CRITICAL (FIXED — compiles to `location.reload()` now)
**What I was building:** A task CRUD app with a button that posts a form and refreshes the page
**What I wrote in Clear:**
```clear
button 'Add Task':
  post to '/api/tasks' with form data
  refresh page
```
**What I expected:** After the POST succeeds, the page reloads (or the task list re-fetches)
**What actually happened:** Frontend JS crashes silently. The button click handler throws a ReferenceError because `refresh` is undefined.
**Compiled output (if applicable):**
```javascript
document.getElementById('btn_Add_Task').addEventListener('click', async function() {
  try {
    { const _r = await fetch("/api/tasks", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_state) });
      if (!_r.ok) { const _e = await _r.json().catch(() => ({})); throw new Error(_e.error || _e.message || 'POST failed'); } }
    console.log(refresh);  // <-- BUG: should be location.reload() or re-fetch
  } catch(_err) { _toast(_err.message || 'Something went wrong', 'error'); }
});
```
**Steps to reproduce:**
1. Write any button block with `refresh page` as the last action
2. Compile and run
3. Click the button — frontend throws `ReferenceError: refresh is not defined`
**Workaround used:** Blocked. No way to trigger a page refresh or data re-fetch from a button.
**Impact:** Kills every CRUD form. After a POST, the user has no way to see the updated data. Affects all interactive apps.

---

## Request: `post to` with form data sends entire `_state` instead of form fields only ✅ FIXED
**Priority:** MAJOR (FIXED — `with form data` sends only input fields, `with name, email` sends specific fields)
**What I was building:** A task CRUD app — button POSTs form inputs to an API
**What I wrote in Clear:**
```clear
button 'Add Task':
  post to '/api/tasks' with form data
```
**What I expected:** POST body contains only the form fields defined in that section (title, description, priority)
**What actually happened:** POST body is `JSON.stringify(_state)` — the entire app state object, including unrelated fields. This sends garbage to the API and breaks validation.
**Compiled output (if applicable):**
```javascript
body: JSON.stringify(_state)  // sends ALL state, not just form fields
```
**Workaround used:** None — no syntax to specify a subset of state fields in a POST
**Impact:** Any app with multiple inputs or sections will send polluted data to the API.

---

## Request: Studio should inject ANTHROPIC_API_KEY at runtime ✅ FIXED
**Priority:** CRITICAL (FIXED — API key from chat settings now passed to child processes)
**What I was building:** Any app with an `agent` block using `ask claude`
**What I wrote in Clear:**
```clear
agent 'Helper' receives question:
  response = ask claude 'You are helpful' with question
  send back response
```
**What I expected:** The agent calls Claude and returns a response during studio testing
**What actually happened:** Runtime error — no API key available. The compiled server has no `ANTHROPIC_API_KEY` injected, so every agent call fails in the sandbox.
**Workaround used:** Blocked. Can't test agents at all without a key.
**Impact:** Agents are a flagship feature. Nobody can test them in the studio. This needs to be an env var injected automatically when running inside Clear Studio — users shouldn't have to wire this up themselves.

---

## Request: `post to` in button handler generates broken JS ✅ FIXED
**Priority:** CRITICAL (FIXED — dispatch unification resolved the post_to canonicalization, parser now handles `with` clause)
**What I was building:** A digest generator app with a submit button that POSTs form data to an API endpoint
**What I wrote in Clear:**
```clear
button 'Generate':
  post to '/api/digest/generate' with event_text
```
**What I expected:** Button click triggers a fetch POST to the endpoint with the variable as the body
**What actually happened:** Parser crashes at parser.js line 2033. Compiled output produces `let result = post_to;` — the entire async fetch is dropped. Server throws a syntax error at runtime.
**Workaround used:** Blocked. No way to POST from a button without this working.
**Impact:** Blocks all form-based frontends. Every CRUD app needs this.

---

## Request: `ask agent 'X'` from inside an endpoint ✅ FIXED
**Priority:** MAJOR (FIXED — parser now skips optional 'agent' keyword: `ask agent 'Helper' with data` works)
**What I was building:** A digest generator where an endpoint orchestrates an agent call
**What I wrote in Clear:**
```clear
when user calls POST /api/digest/generate sending data:
  result = ask agent 'DigestAgent' with data
  send back result
```
**What I expected:** The endpoint calls the named agent and returns its response
**What actually happened:** Compiler error — treats `agent` as a literal variable name, not a reference to a defined agent block
**Workaround used:** Inlined the `ask claude` call directly inside the endpoint instead of using a named agent
**Impact:** Agents can't be reused across endpoints. Kills composability.
