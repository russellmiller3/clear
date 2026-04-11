# Requests

Bug reports and feature gaps discovered while building apps in Clear Studio.
Filed by Meph (the Studio agent) or by the user. Read by the compiler team.

## How to File a Request

- **Newest requests go at the top**, below this section
- **Order by priority:** CRITICAL → MAJOR → MINOR
- **Always include the compiled JS output** — that's the smoking gun, not just the error message
- **Include steps to reproduce** if the bug depends on a sequence of actions

### Request Template
```
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

## Request: `post to` with form data sends entire `_state` instead of form fields only
**Priority:** MAJOR
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

## Request: `post to` in button handler generates broken JS
**Priority:** CRITICAL
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

## Request: `ask agent 'X'` from inside an endpoint
**Priority:** MAJOR
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
