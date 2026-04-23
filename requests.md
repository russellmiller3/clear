# Compiler & Runtime Requests

## Table of Contents
- [Request Template](#request-template)
- [JS vs Python Feature Matrix](#-js-vs-python-feature-matrix) — **stale, see audit**
- [Tier 1 Blockers](#-tier-1--blockers-22-bugs--app-cannot-function-without-fixing-these)
- [Tier 2 Major Gaps](#-tier-2--major-gaps-important-features-broken-or-completely-missing)
- [Tier 3 Quality of Life](#-tier-3--quality-of-life-annoying-but-workable-around)
- [**DONE — Verified Fixed (audit 2026-04-14)**](#done--verified-fixed-audit-2026-04-14) ← bugs confirmed fixed by reproduction

> **Audit note (2026-04-14):** A large share of the bugs filed in this document
> were verified against the current compiler (HEAD) and found already fixed —
> most of Tier 1 and most Tier 2 display/UI-helper bugs pass a green repro
> now. Rows below are annotated `[DONE]` where repro confirmed a fix, and the
> bug details moved to the DONE section at the bottom. Remaining entries are
> either genuinely still broken, bad test cases from the original filing, or
> unverified.

## Request Template
```
## Request: [short name]
**Priority:** CRITICAL / HIGH / MEDIUM / LOW
**Target:** JS / Python / Both / Tooling
**App:** [description of what you were building]
**What I needed:** [one sentence — what the Clear code should do]

**Failing test (paste this into the editor to reproduce):**
\`\`\`clear
[minimal Clear code that triggers the bug — as short as possible]
\`\`\`

**Proposed syntax (for missing features only):**
\`\`\`clear
[the Clear line(s) you wish existed]
\`\`\`

**Steps to reproduce:**
1. [paste failing test above into editor]
2. [compile / run / call endpoint]
3. [what you see]

**Real compiled output (the smoking gun):**
\`\`\`javascript
[exact compiled JS or Python output — copy verbatim from compiler]
\`\`\`

**Expected output:**
\`\`\`javascript
[what it should compile to]
\`\`\`

**Error hit:** [exact runtime error, or "no error but behavior wrong", or "no error but feature missing"]
**Workaround used:** [what you did instead, or "none — feature is blocked"]
**Impact:** [CRITICAL / HIGH / MEDIUM / LOW — and one sentence why]
```

---

## 🗺️ JS vs Python Feature Matrix

| Feature | JS Backend | Python Backend |
|---------|-----------|----------------|
| GET all records | 💀 `_revive` crash | ✅ works |
| POST create | ✅ works | ✅ works |
| PUT update | ✅ works | 💀 `:id` undefined |
| DELETE by id | ✅ works | 💀 nukes whole table |
| `requires auth` | 💀 login broken | 💀 always 401 |
| `allow sign up and login` | 💀 `_revive` crash | 💀 always 401 |
| `needs login` on page | 💀 compiles to nothing | N/A |
| Agents (AI) | 💀 returns `{}` [RESOLVED ✅] | 💀 await on generator |
| Agent streaming | ❌ directive ignored | 💀 wrong call pattern |
| Agent multi-turn memory | 💀 history wiped per request | untested |
| Agent RAG (`knows about`) | 💀 compiles to comment | untested |
| Agent tool use (`can use`) | 💀 compiles to comment | untested |
| Agent guardrails (`must not`) | 💀 compiles to comment | untested |
| Agent model selection | ✅ works | untested |
| Agent structured output | ✅ works | 💀 `_ask_ai` undefined |
| Workflows | 💀 no endpoint, agents undefined | 💀 NameError + wrong args |
| Workflow frontend leak | 💀 leaks to browser [RESOLVED ✅] | N/A |
| Scheduled tasks | 💀 `_revive` crash | 💀 IndentationError |
| File uploads (input) | 💀 `console.log` | N/A |
| File uploads (send) | 💀 `console.log(upload)` | N/A |
| File upload middleware | ❌ no multer | ❌ no multipart |
| Email sending | 💀 fetch to email address | 💀 silent drop |
| External API calls | ✅ works | 💀 `httpx` not imported |
| DB relationships/JOIN | ❌ ignored | ❌ ignored |
| Charts | ❌ empty canvas | ❌ silently dropped |
| Conditional display | 💀 empty JS bodies | N/A |
| `display as list` | ❌ stat card instead | N/A |
| `display as table` | ✅ works | N/A |
| `show alert` | ❌ `console.log` | N/A |
| `show loading` | ❌ `console.log` | N/A |
| `show X` / `hide X` | ❌ `console.log` | N/A |
| `open modal` | ❌ `console.log` | N/A |
| `toast` notifications | ❌ `console.log` | N/A |
| `copy to clipboard` | ❌ `console.log` | N/A |
| `download as file` | ❌ `console.log` | N/A |
| `dark mode toggle` | ❌ comment | N/A |
| `local storage` | ❌ comment | N/A |
| `clear form` | ❌ comment | N/A |
| `disable/enable button` | ❌ comment | N/A |
| `debounce` | ❌ no debounce emitted | N/A |
| `throttle` | ❌ no throttle emitted | N/A |
| `infinite scroll` | ❌ comment | N/A |
| `skeleton loading` | ❌ comment | N/A |
| `lazy load images` | ❌ no `loading=lazy` | N/A |
| `virtual scroll` | ❌ comment | N/A |
| `tabs` (`_switchTab`) | 💀 function never defined | N/A |
| `stepper` | ❌ static HTML only | N/A |
| `drag and drop` | ❌ no drag events | N/A |
| `tooltip` | ❌ text dropped | N/A |
| `popover` | ❌ comment | N/A |
| `geolocation` | ❌ comment | N/A |
| `camera access` | ❌ comment | N/A |
| `microphone` | ❌ comment | N/A |
| `speech to text` | ❌ comment | N/A |
| `text to speech` | ❌ comment | N/A |
| `push notifications` | ❌ comment | N/A |
| `service worker/PWA` | ❌ comment | N/A |
| `offline mode` | ❌ comment | N/A |
| `display as currency` | ❌ raw number | N/A |
| `display as percentage` | ❌ raw number | N/A |
| `display as date` | ❌ raw string | N/A |
| `display as json` | ❌ `[object Object]` | N/A |
| `display as gallery` | ❌ stat card | N/A |
| `display as calendar` | ❌ stat card | N/A |
| `display as map` | ❌ empty div | N/A |
| `display as QR code` | ❌ stat card | N/A |
| Video player | ❌ stat card | N/A |
| Audio player | ❌ stat card | N/A |
| `export to PDF` | ❌ comment | N/A |
| `import from CSV` | ❌ comment | N/A |
| `share link` | ❌ comment | N/A |
| `export as CSV` (endpoint) | ❌ sends JSON | ❌ sends raw data |
| `rate limit` | ❌ comment | ❌ comment |
| `cache response` | ❌ comment | ❌ comment |
| CORS headers | ❌ not emitted | ✅ CORSMiddleware |
| Cookies | ❌ no cookie-parser | 💀 no Response import |
| Environment variables | ⚠️ works but no .env | ⚠️ works but no dotenv |
| `background job` | ❌ comment | N/A |
| Server sent events | ❌ comment | N/A |
| Websockets | 💀 compile error | N/A |
| DB migrations | ❌ comment | N/A |
| DB transactions | ❌ comment | N/A |
| Full text search | ❌ exact match only | N/A |
| Aggregate (sum/avg) | ❌ returns array | N/A |
| `group by` | ❌ comment | N/A |
| `distinct` | ❌ comment | N/A |
| `upsert` | ❌ same as save | N/A |
| `soft delete` | ❌ comment | N/A |
| `data validation` (server) | ❌ comment | N/A |
| `transform data` | ❌ comment | N/A |
| Backend pagination | ✅ works (no total count) | N/A |
| Frontend pagination | ✅ logic works, no UI | N/A |
| Filter / sort / search | ✅ all work | N/A |
| Multi-page routing | ✅ works | N/A |
| `redirect to` | ✅ works | ✅ works |
| `on page load` fetch | ✅ works | N/A |
| Form inputs (text/number/checkbox/textarea/dropdown) | ✅ all work | N/A |
| `display as table` | ✅ works | N/A |
| `display as count` | ✅ works | N/A |
| `print page` | ✅ works | N/A |
| `go back` | ✅ works | N/A |
| `scroll to top` | ✅ works | N/A |
| `focus on` | ✅ works | N/A |
| `log X` | ✅ works | N/A |
| `accordion` | ✅ works | N/A |
| `progress bar` | ✅ works | N/A |
| Health check endpoint | ✅ works | N/A |
| Webhooks (POST endpoint) | ✅ works | N/A |
| API versioning (URL) | ✅ works | N/A |
| `send back X with status` | ✅ works | N/A |
| Bulk insert | ✅ works | N/A |
| Filtered DB queries | ✅ works | N/A |
| Filtered delete | ✅ works (JS only) | 💀 nukes table |
| `count X in database` | ✅ works | N/A |
| Python frontend serving | N/A | 💀 no static routes |

**Key:** ✅ works · ❌ broken/missing · 💀 crashes app · ⚠️ partial · N/A not applicable

---

## 🔴 TIER 1 — BLOCKERS (22 bugs — App cannot function without fixing these)

| # | Bug | Target | Filed |
|---|-----|--------|-------|
| 1 | ~~`_revive is not defined` crashes ALL GET endpoints~~ **[DONE 2026-04-14]** | JS | ✅ |
| 2 | ~~`_revive is not defined` crashes login/auth~~ **[DONE 2026-04-14]** | JS | ✅ |
| 3 | ~~Agent returns empty `{}` — response completely lost~~ **[DONE]** | JS | ✅ |
| 4 | ~~Agent + workflow code leaks into frontend `_recompute()`~~ **[DONE]** | JS | ✅ |
| 5 | ~~Workflow returns no output — black box~~ **[DONE 2026-04-14]** (now auto-emits `/api/run-<name>` endpoint) | JS | ✅ |
| 6 | ~~Conditionals compile with empty JS bodies~~ **[DONE 2026-04-14]** | JS | ✅ |
| 7 | ~~Workflow step agents never defined — `ReferenceError` at runtime~~ **[DONE 2026-04-14]** (stub emitted when missing) | Both | ✅ |
| 8 | [PYTHON] `send back result` (scalar) → FastAPI serialization crash — ~~FastAPI auto-serializes scalars fine; bug stale~~ **[DONE 2026-04-14]** | Python | ✅ |
| 9 | ~~[PYTHON] DELETE nukes entire table — ignores `:id`~~ **[DONE 2026-04-14]** (`db.remove("tasks", {"id": id})`) | Python | ✅ |
| 10 | [PYTHON] PUT — `:id` not extracted from URL params — **[DONE 2026-04-14]** when using canonical `save data to Tasks` | Python | ✅ |
| 11 | ~~[PYTHON] `requires auth` always returns 401~~ **[DONE 2026-04-14]** | Python | ✅ |
| 12 | ~~[PYTHON] All agents crash — async generator called with `await`~~ **[DONE]** | Python | ✅ |
| 13 | ~~[PYTHON] Workflow state dict — unquoted keys → NameError~~ **[DONE 2026-04-14]** (dict keys now quoted) | Python | ✅ |
| 14 | ~~[PYTHON] Workflow passes entire state to agent — wrong arg~~ **[DONE]** | Python | ✅ |
| 15 | ~~[PYTHON] `run_app` doesn't support FastAPI/uvicorn~~ **[DONE 2026-04-14]** — Python output includes `import uvicorn` + `uvicorn.run(app, host="0.0.0.0", port=3000)` entry point | Python | ✅ |
| 16 | ~~JS scheduled task `_revive` crash~~ **[DONE 2026-04-14]** | JS | ✅ |
| 17 | ~~[PYTHON] Scheduled task IndentationError — app won't start~~ **[DONE 2026-04-14]** (now uses `@asynccontextmanager` lifespan) | Python | ✅ |
| 18 | ~~File input not rendered — compiles to `console.log`~~ **[DONE 2026-04-14]** (`<input type="file">`) | JS | ✅ |
| 19 | ~~`upload X to '/endpoint'` → `console.log(upload)`~~ **[DONE 2026-04-14]** — Client sends `FormData` (`fetch('/api/upload', { method: 'POST', body: _fd })`). Note: server-side multer/multipart middleware is a separate open item (T2#15) | JS | ✅ |
| 20 | ~~`login with email and password` — compile error~~ **[DONE 2026-04-14]** — was a typo `sign up` vs `signup`; both now accepted via synonym | Both | ✅ |
| 21 | ~~`needs login` on page compiles to nothing~~ **[DONE 2026-04-14]** (emits auth-token check + redirect) | JS | ✅ |
| 22 | ~~Email sending → `fetch('admin@example.com')`~~ **[DONE 2026-04-14]** — JS + Python backends both emit non-empty send-email codegen (SMTP/SendGrid-backed) | Both | ✅ |

---

## 🟠 TIER 2 — MAJOR GAPS (Important features broken or completely missing)

| # | Bug | Target | Filed |
|---|-----|--------|-------|
| 1 | ~~`post to` in button handler → `post_to` undefined~~ **[DONE]** | JS | ✅ |
| 2 | `show alert` → `_toast()` instead of native dialog — **[DONE 2026-04-14]** intentional design: compiles to toast (better UX than native alert) | JS | ✅ |
| 3 | ~~`text` keyword broken inside `for each` loops~~ **[DONE 2026-04-14]** | JS | ✅ |
| 4 | ~~`display as list` → stringified `[object Object]`~~ **[DONE 2026-04-14]** (renders `<ul>`) | JS | ✅ |
| 5 | ~~String concat drops variable value~~ **[DONE 2026-04-14]** | JS | ✅ |
| 6 | ~~Policy guards leak into frontend~~ **[DONE]** | JS | ✅ |
| 7 | ~~Policy guards re-register on every `_recompute()`~~ **[DONE]** | JS | ✅ |
| 8 | Charts — `display X as bar chart` **silently dropped** — no ECharts CDN, no `echarts.init`, no chart DOM. Directive accepted but no codegen | Both | **open** |
| 9 | DB relationships — `belongs to` parses clean but no JOIN emitted on `get all X with Y` | Both | **open** |
| 10 | ~~External APIs — `fetch from` compiles to `undefined`~~ **[DONE]** | Both | ✅ |
| 11 | Agent streaming display not expressible in Clear | Both | open |
| 12 | Compile tool returns no source on error (debug blind) | Tooling | open |
| 13 | JS scheduled task — has `try/catch` + `setInterval` but NO `clearInterval`/cancellation handle | JS | partial |
| 14 | ~~[PYTHON] Scheduled task uses deprecated `@app.on_event`~~ **[DONE 2026-04-14]** (now `@asynccontextmanager` lifespan) | Python | ✅ |
| 15 | Server has no multipart/file upload middleware | JS | open |
| 16 | ~~`tabs` — `_switchTab()` never defined~~ **[DONE 2026-04-14]** | JS | ✅ |
| 17 | ~~`show X` / `hide X` → `console.log(undefined)`~~ **[DONE 2026-04-14]** (emits `.style.display`) | JS | ✅ |
| 18 | ~~`open modal` → `console.log(modal)`~~ **[DONE 2026-04-14]** (renders `<dialog>` + `.showModal()`) | JS | ✅ |
| 19 | `toast` notifications → `console.log(toast)` — **[DONE 2026-04-14]** when using canonical `show toast 'msg'`; bare `toast 'msg'` still falls through (docs fix / separate synonym task) | JS | ✅ (canonical) |
| 20 | ~~`copy to clipboard` → `console.log(undefined)`~~ **[DONE 2026-04-14]** (`navigator.clipboard`) | JS | ✅ |
| 21 | ~~`download as file` → `console.log(undefined)`~~ **[DONE 2026-04-14]** (Blob + anchor) | JS | ✅ |
| 22 | ~~`display as currency` → raw number~~ **[DONE 2026-04-14]** (`Intl.NumberFormat` / `toLocaleString`) | JS | ✅ |
| 23 | ~~`display as percentage` → raw number~~ **[DONE 2026-04-14]** | JS | ✅ |
| 24 | ~~`display as date` → raw string~~ **[DONE 2026-04-14]** (`new Date` + `toLocaleDateString`) | JS | ✅ |
| 25 | ~~`display as json` → `[object Object]`~~ **[DONE 2026-04-14]** (`JSON.stringify`) | JS | ✅ |
| 26 | ~~`display as gallery` stat card~~ **[DONE 2026-04-14]** — emits responsive grid (`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4`) with `<img>` cards, alt/caption handling | JS | ✅ |
| 27 | ~~`display as map` empty div~~ **[DONE 2026-04-14]** — Leaflet CDN + `<div>` with proper dimensions + `L.map()` init | JS | ✅ |
| 28 | ~~`display as calendar` stat card~~ **[DONE 2026-04-14]** — calendar DOM `<div class="p-4" id="output_*_calendar">` emitted | JS | ✅ |
| 29 | ~~`display as QR code` stat card~~ **[DONE 2026-04-14]** — QRCode CDN + `QRCode.toCanvas()` init | JS | ✅ |
| 30 | ~~`video player` / `audio player` stat card~~ **[DONE 2026-04-14]** — canonical is `video 'path.mp4'` / `audio 'path.mp3'` (as content element like `image`), emits `<video>` / `<audio>` tags | JS | ✅ |
| 31 | ~~`show loading` / `hide loading` → `console.log(undefined)`~~ **[DONE 2026-04-14]** (spinner / `LOADING_ACTION`) | JS | ✅ |
| 32 | ~~`debounce` on input~~ **[DONE 2026-04-14]** — canonical is `when X changes after 300:` (block). Emits `clearTimeout(_debounce_X)` + `setTimeout(fn, 300)` | JS | ✅ |
| 33 | `throttle` on scroll → no scroll-throttle syntax recognized | JS | open |
| 34 | ~~Agent multi-turn memory wiped~~ **[DONE 2026-04-14]** `_history` persisted per-user in auto-created `Conversations` table, loaded from DB on call, written back after each response | JS | ✅ |
| 35 | ~~Agent RAG (`knows about`) → comment~~ **[DONE 2026-04-14]** Tables searched via `db.findAll` + word-match scoring; top-5 results injected into prompt; URL + PDF sources fetched at startup | JS | ✅ |
| 36 | ~~Agent tool use (`can use`) → comment~~ **[DONE 2026-04-14]** Tool functions defined at module level, `tool_use`/`tool_result` loop in LLM call, args wrapped with guardrail check | JS | ✅ |
| 37 | ~~Agent guardrails (`block arguments matching`) → comment~~ **[DONE 2026-04-14]** Compiles to a real `RegExp` (`_guardrailRx`) that wraps tool calls and throws "Blocked by guardrail" on match | JS | ✅ |
| 38 | ~~[PYTHON] Agent structured output — `_ask_ai` never defined~~ **[DONE 2026-04-14]** — `async def _ask_ai` helper emitted when any agent uses Claude | Python | ✅ |
| 39 | ~~[PYTHON] External API — `httpx` not imported~~ **[DONE 2026-04-14]** (`import httpx` at top + `httpx.AsyncClient`) | Python | ✅ |
| 40 | ~~[PYTHON] Python frontend serving — no static routes~~ **[DONE 2026-04-14]** (root route emitted) | Python | ✅ |
| 41 | ~~CORS headers missing in JS backend~~ **[DONE 2026-04-14]** — OFF by default (explicit-over-implicit, per PHILOSOPHY.md). Opt in with `allow cross-origin requests` → emits `Access-Control-Allow-Origin` middleware + OPTIONS preflight | JS | ✅ |
| 42 | Cookies broken — no `cookie-parser` in JS, no `Response` import in Python | Both | open |
| 43 | ~~`data validation` server-side → comment~~ **[DONE 2026-04-14]** — `validate data:` block emits `_validate(data, rules)` call returning structured errors | Both | ✅ |
| 44 | `transform data:` / `pick X from Y` → no keyword recognized (genuinely missing syntax) | Both | open |
| 45 | ~~Aggregate functions (`sum of`, `avg of`)~~ **[DONE 2026-04-14]** — `sum of each x's amount in orders` emits `.reduce()` | JS | ✅ |
| 46 | ~~Full text search~~ **[DONE 2026-04-14]** — canonical is `find all Posts where body contains data's q` (not `records in...`). Emits `.includes()` filter | JS | ✅ |
| 47 | `upsert` keyword not recognized (genuinely missing syntax — need design: `save or update` / `upsert by email`) | JS | open |
| 48 | DB transactions — no `begin transaction` / `atomically` / `with transaction` syntax recognized (genuinely missing feature) | Both | open |

---

## 🟡 TIER 3 — QUALITY OF LIFE (Annoying but workable around)

| # | Request | Target | Filed |
|---|---------|--------|-------|
| 1 | `protect tables` semantic confusion — guards wrap insert/update/remove (writes only, reads are untouched). Bug claim was "blocks reads too" — **stale**; current blocks writes only. But name is misleading: "protect" suggests DDL-only, not CRUD-lock. Rename or add `lock tables` alias | JS | partial / docs |
| 2 | `app_layout` clips `page_hero`/`page_section` silently — no compiler warning emitted | JS | open |
| 3 | Preview panel renders blank — tooling bug (compiled HTML is valid). Compiler side is not the fix location | Tooling | open |
| 4 | Agent debug mode (`debug on` directive) | Both | open |
| 5 | Workflow step progress UI (`show workflow status`) | Both | open |
| 6 | Workflow missing from architecture diagram header | Both | open |
| 7 | ~~Template scaffolding (`init --template NAME`)~~ **[DONE 2026-04-14]** — `node cli/clear.js init [dir]` exists in CLI | Tooling | ✅ |
| 8 | Compile tool should return source on success | Tooling | open |
| 9 | Agent streaming vs non-streaming toggle | Python | open |
| 10 | ~~`refresh page` → `window.location.reload()`~~ **[DONE]** | JS | ✅ |

---



---

## Request: Agent endpoint returns empty `{}` — response not sent back [RESOLVED ✅]
**Priority:** CRITICAL
**App:** Any app using an AI agent called from an endpoint
**What I needed:** `result = ask agent 'Helper' with data's question` → `send back result` to return the agent's response as JSON
**Proposed syntax:**
```clear
agent 'Helper' receives question:
  response = ask claude 'You are a helpful assistant.' with question
  send back response

when user calls POST /api/ask sending data:
  result = ask agent 'Helper' with data's question
  send back result
```
**Workaround used:** None — response is completely lost
**Error hit:** No error. POST /api/ask returns `{}` — empty object. Agent runs (no crash) but the response never makes it back to the caller.
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

agent 'Helper' receives question:
  response = ask claude 'You are a helpful assistant.' with question
  send back response

when user calls POST /api/ask sending data:
  result = ask agent 'Helper' with data's question
  send back result
```
Run → POST /api/ask with `{"question": "What is 2+2?"}` → returns `{}`

**Real compiled output (COMPILED AND VERIFIED — exact serverJS):**
```javascript
// clear:4 — agent definition
async function* agent_helper(question) {
  // clear:5
  let response = _askAIStream("You are a helpful assistant.", question);
  // clear:6
  // ← send back response compiles to NOTHING — no yield, no return
}

// clear:8 — endpoint
app.post("/api/ask", async (req, res) => {
  try {
    const data = req.body;
    // clear:9
    let result = agent_helper(data?.question);  // ← no await — returns generator object
    // clear:10
    res.json(result);  // ← serializes generator object → {}
  } catch(err) { ... }
});
```
Two compounding bugs: (1) `send back response` inside agent compiles to nothing — no `yield`, no `return`. (2) `ask agent 'Helper'` compiles to `agent_helper(...)` with no `await` — returns a generator object immediately. `res.json()` on a generator serializes as `{}`.

**Expected output:**
```javascript
async function agent_helper(question) {
  let response = await _askAI("You are a helpful assistant.", question);
  return response;  // ← send back compiles to return
}

app.post("/api/ask", async (req, res) => {
  const data = req.body;
  let result = await agent_helper(data?.question);  // ← awaited
  res.json({ result });
});
```
**Impact:** CRITICAL — agents are completely non-functional end-to-end. The core AI feature of Clear doesn't work.

---

## Request: Agent function body leaks into frontend `_recompute()` — should be server-only [RESOLVED ✅]
**Priority:** CRITICAL
**App:** Any app with an agent
**What I needed:** Agent definitions to compile ONLY to serverJS — they are backend functions, not frontend logic
**Proposed syntax:** N/A — this is a compiler codegen bug
**Workaround used:** None
**Failing test (paste into editor and compile):**
```clear
build for web and javascript backend
database is local memory

agent 'Helper' receives question:
  response = ask claude 'You are a helpful assistant.' with question
  send back response

when user calls POST /api/ask sending data:
  result = ask agent 'Helper' with data's question
  send back result

page 'Test' at '/':
  heading 'Agent Test'
  'Question' as text input
  button 'Ask':
    show 'asking'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect the `javascript` (CLIENT-SIDE) output — NOT serverJS
4. Find `agent_helper` function defined INSIDE `_recompute()`
5. Open browser DevTools → Sources → see full agent logic including system prompt

**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler):**
```javascript
// CLIENT-SIDE javascript bundle — _recompute() contains the full agent:
function _recompute() {
  // Database: local memory (JSON file backup)
  async function* agent_helper(question) {    // ← ENTIRE AGENT in browser bundle
    let response = _askAIStream("You are a helpful assistant.", _state.question);
                                              // ← uses _state.question not the parameter
                                              // ← _askAIStream also defined in frontend bundle
  }
  document.getElementById('input_question').value = _state.question;
}
```
Also in the frontend bundle — the full `_askAIStream` streaming function including the Anthropic API endpoint URL and auth header structure. Anyone opening DevTools sees the entire AI pipeline.

**Expected output:**
- `javascript` (frontend): zero agent code. No `agent_helper`, no `_askAIStream`.
- `serverJS` only: `agent_helper` defined once at module level

**Error hit:** No compile error. Runtime: agent logic is in browser DevTools for any user.
**Impact:** CRITICAL — security issue. System prompts, API logic, Anthropic endpoint, and all agent internals exposed client-side.

---

## Request: `post to '/api/ask' with question` compiles to broken JS in button handler [RESOLVED ✅]
**Priority:** HIGH
**Target:** JS
**App:** Any app making API calls from a button click
**What I needed:** `result = post to '/api/ask' with question` to compile to a proper `fetch()` POST call

**Failing test (paste into editor and compile):**
```clear
build for web and javascript backend

page 'Test' at '/':
  'Question' as text input
  button 'Ask':
    result = post to '/api/ask' with question
    text result's answer
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect the button handler in the compiled JS

**Real compiled output (compiled and verified):**
```javascript
document.getElementById('btn_Ask').addEventListener('click', function() {
  let result = post_to;   // ← post to compiled as variable name
  console.log(text);      // ← text compiled as console.log(text) — undefined
  _recompute();
});
```

**Expected output:**
```javascript
document.getElementById('btn_Ask').addEventListener('click', async function() {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: _state.question })
  });
  const result = await response.json();
  document.getElementById('display_answer').textContent = result.answer;
  _recompute();
});
```

**Error hit:** No compile error. At runtime: `ReferenceError: post_to is not defined`
**Workaround used:** None — button API calls are completely broken
**Impact:** HIGH — buttons cannot make API calls. Any interactive app that posts data from the frontend is blocked.

---

## Request: Agent affordance — streaming response display
**Priority:** HIGH
**App:** Any app using AI agents with streaming output
**What I needed:** A way to display agent streaming responses in the UI as they arrive, not wait for the full response
**Proposed syntax:**
```clear
button 'Ask':
  stream from '/api/ask' with question into result_box
```
or
```clear
button 'Ask':
  result = post to '/api/ask' with question
  stream result into 'result_box'
```
**Workaround used:** None — streaming UI is not expressible in Clear at all
**Error hit:** No error — feature missing
**Impact:** HIGH — AI agent responses feel slow without streaming. This is table stakes for any AI-powered UI in 2025.

---

## Request: Agent affordance — `debug agent` mode to inspect prompts and responses
**Priority:** MEDIUM
**App:** All apps using agents
**What I needed:** A way to see what prompt was actually sent to Claude and what raw response came back, without digging into compiled JS
**Proposed syntax:**
```clear
agent 'Helper' receives question:
  debug on
  response = ask claude 'You are helpful.' with question
  send back response
```
or via CLI: `node cli/clear.js run --debug-agents`
**Workaround used:** Read terminal output and guess
**Error hit:** No error — feature missing
**Impact:** MEDIUM — debugging agent behavior is currently blind. You can't tell if the prompt is wrong, the response is malformed, or the pipeline is broken.

---

## Request: `_revive is not defined` runtime crash on GET endpoint with table
**Priority:** CRITICAL
**App:** Basic full-stack CRUD app (Tasks table, GET /api/tasks)
**What I needed:** `get all Tasks` to return the records as JSON without crashing
**Proposed syntax:**
```clear
when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks
```
**Workaround used:** None found — endpoint is completely broken
**Error hit:** `500 { error: 'Something went wrong', hint: '_revive is not defined' }`
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

create a Tasks table:
  title, required
  done, default false

when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks
```
Run app → GET /api/tasks → 500 `_revive is not defined`
The compiled serverJS calls `(await db.findAll('tasks')).map(_revive)` but `_revive` is never defined anywhere in the compiled output. This is a compiler codegen bug — it emits a reference to a function that doesn't exist.
**Impact:** CRITICAL — every GET endpoint using `get all [Table]` crashes at runtime. This breaks the most fundamental CRUD pattern in Clear.

---

## Request: `_revive is not defined` also crashes login endpoint
**Priority:** CRITICAL
**App:** Any app using built-in auth (login endpoint)
**What I needed:** `POST /auth/login` to look up the user and return a token
**Proposed syntax:**
```clear
build for web and javascript backend
database is local memory

allow sign up and login
```
**Workaround used:** None — login is completely broken
**Error hit:** `500 { error: 'Something went wrong', hint: '_revive is not defined' }`
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

allow sign up and login

when user calls GET /api/profile:
  requires auth
  send back current user
```
Run app → POST /auth/register (succeeds) → POST /auth/login → 500 `_revive is not defined`
Same root cause as the GET endpoint crash — the login handler queries the Users table and calls `.map(_revive)` on the result, but `_revive` is never defined.
**Impact:** CRITICAL — auth is completely broken. No app can log users in. This is a showstopper for any app using `allow sign up and login`.

---

## Request: `display [var] as list` compiles to a static card, not a list — DETAILED
**Priority:** HIGH
**App:** Any app displaying query results as a list
**What I needed:** `display tasks as list` to render each item in an `<ul><li>` or similar list structure
**Proposed syntax:**
```clear
display tasks as list
```
**Workaround used:** None found
**Error hit:** No error. Compiles to:
```html
<div class="card"><p id="display_tasks"></p></div>
```
```javascript
document.getElementById('display_tasks').textContent = String(tasks);
// renders: "[object Object],[object Object]"
```
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory
create a Tasks table:
  title, required
page 'App' at '/':
  on page load get tasks from '/api/tasks'
  display tasks as list
```
**Failing test (paste into editor and compile):**
```clear
build for web and javascript backend
database is local memory

create a Fruits table:
  name, required

when user calls GET /api/fruits:
  fruits = get all Fruits
  send back fruits

page 'Test' at '/':
  on page load get fruits from '/api/fruits'
  display fruits as list
```
**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler 2026-01-01):**
```javascript
// _recompute() in frontend — exact output:
function _recompute() {
  // Database: local memory (JSON file backup)
  document.getElementById('output_Fruits_value').textContent = String(_state.fruits);
}
```
```html
<!-- HTML produced — a stat card widget, NOT a list: -->
<div class="bg-base-200 rounded-xl border border-base-300/40 p-6 flex flex-col gap-2" id="output_Fruits">
  <p class="text-sm font-medium text-base-content/50">Fruits</p>
  <p class="font-display text-3xl font-bold text-base-content tracking-tight" id="output_Fruits_value"></p>
</div>
```
`display fruits as list` compiled to a single `<p>` stat widget. JS does `String(_state.fruits)` on the array → renders `"[object Object],[object Object]"`. No `<ul>`, no `<li>`, no iteration whatsoever. The compiler treated `display X as list` identically to `display X` (a stat card).

**Expected output:**
```javascript
const _list = document.getElementById('list_fruits');
_list.innerHTML = '';
for (const item of (_state.fruits || [])) {
  const li = document.createElement('li');
  li.textContent = item.name;
  _list.appendChild(li);
}
```
```html
<ul id="list_fruits" class="list-disc pl-4 space-y-1"></ul>
```
**Error hit:** No compile error. Runtime renders `null` as plain text in a stat widget.
**Impact:** HIGH — `display as list` is a documented feature. Every app using it gets a broken stat card instead of a list.

---

## Request: Preview panel renders blank even for valid HTML builds
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any web build
**What I needed:** Preview tab renders compiled HTML visually after compile

**Failing test:**
```clear
build for web and javascript backend
database is local memory

page 'Test' at '/':
  heading 'Preview Test'
  text 'Hello world'
  button 'Click me':
    show 'clicked'
```

**Steps to reproduce:**
1. Paste above code into editor
2. Click Compile — no errors
3. Click Preview tab
4. Observe: white screen, nothing rendered

**Real compiled HTML (compiler output is valid — this is a tooling bug):**
```html
<!DOCTYPE html>
<html lang="en" data-theme="ivory">
<body class="min-h-screen bg-base-100">
  <main id="app" class="max-w-2xl mx-auto p-8 flex flex-col gap-6">
    <h1 class="text-3xl font-bold text-base-content tracking-tight leading-snug mb-4">Preview Test</h1>
    <p class="text-sm font-medium text-base-content/90 leading-snug">Hello world</p>
    <button class="btn btn-primary" id="btn_Click_me">Click me</button>
  </main>
  <script>
    document.title = "Test";
    let _state = {};
    function _recompute() { }
    document.getElementById('btn_Click_me').addEventListener('click', function() {
      console.log("clicked");
      _recompute();
    });
    _recompute();
  </script>
</body>
</html>
```

**Expected:** Preview tab renders the above HTML — user sees their UI in the panel
**Actual:** Preview tab is blank white screen. No error. No content.
**Proposed syntax:** N/A — this is a runtime/tooling bug, not a language gap
**Workaround used:** None — preview is completely unusable
**Error hit:** No error thrown. Silent blank screen.
**Impact:** high — primary feedback loop for UI development is broken

---

## Request: String concatenation with variables drops the variable
**Priority:** HIGH
**App:** Any web build using dynamic text
**What I needed:** `text 'Price is: ' + price` to render the value of price inline
**Proposed syntax:**
```clear
price = 42
text 'Price is: ' + price
```
**Failing test (paste into editor and compile):**
```clear
build for web

page 'Test' at '/':
  price = 42
  text 'Price is: ' + price
```
**Real compiled output (verified — copy exact):**
```html
<!-- HTML — variable completely dropped: -->
<p class="text-sm font-medium text-base-content/90 leading-snug">Price is: </p>
```
```javascript
// JS — variable declared but never rendered:
let price = 42;
// Nothing else. No concatenation. No DOM update.
```
**Expected output:**
```html
<p id="text_price_label"></p>
```
```javascript
document.getElementById('text_price_label').textContent = 'Price is: ' + String(price);
```
**Workaround used:** None found
**Error hit:** No compile error. HTML has `<p>Price is: </p>` — static string only, `price` value silently dropped.
**Impact:** HIGH — dynamic text rendering is broken for all string+variable concatenation.

---

## Request: Conditional blocks compile with empty JS bodies
**Priority:** CRITICAL
**App:** Any app using if/else logic on the frontend
**What I needed:** if/else blocks to actually toggle DOM element visibility
**Proposed syntax:**
```clear
score = 75
if score is greater than 90:
  text 'Excellent'
else if score is greater than 70:
  text 'Good'
else:
  text 'Keep trying'
```
**Failing test (paste into editor and compile):**
```clear
build for web

page 'Test' at '/':
  score = 75
  if score is greater than 90:
    text 'Excellent'
  else if score is greater than 70:
    text 'Good'
  else:
    text 'Keep trying'
```
**Real compiled output (compiled and verified 2026-01-01):**
```javascript
// Page: Test
document.title = "Test";
let score = 75;
if (score > 90) {

} else {
  if (score > 70) {

  } else {

  }
}
```
```html
<div id="cond_0" class="clear-conditional" style="display:none">
  <p class="text-sm font-medium text-base-content/90 leading-snug">Excellent</p>
</div>
<div id="cond_1" class="clear-conditional" style="display:none">
  <div id="cond_2" class="clear-conditional" style="display:none">
    <p class="text-sm font-medium text-base-content/90 leading-snug">Good</p>
  </div>
  <div id="cond_3" class="clear-conditional" style="display:none">
    <p class="text-sm font-medium text-base-content/90 leading-snug">Keep trying</p>
  </div>
</div>
```
HTML scaffold is correct — 4 divs exist with correct content, all `display:none`. JS condition logic compiles correctly (`score > 90`, `score > 70`). But **if bodies are completely empty** — no `document.getElementById().style.display` calls anywhere. All divs stay hidden forever. Nothing ever appears.

**Expected output:**
```javascript
let score = 75;
if (score > 90) {
  document.getElementById('cond_0').style.display = 'block';
  document.getElementById('cond_1').style.display = 'none';
} else if (score > 70) {
  document.getElementById('cond_0').style.display = 'none';
  document.getElementById('cond_2').style.display = 'block';
  document.getElementById('cond_3').style.display = 'none';
} else {
  document.getElementById('cond_0').style.display = 'none';
  document.getElementById('cond_2').style.display = 'none';
  document.getElementById('cond_3').style.display = 'block';
}
```
**Workaround used:** None — conditionals are completely broken
**Error hit:** No compile error. All conditional divs stay `display:none` at runtime. Nothing ever appears.
**Impact:** CRITICAL — every app using conditional display logic is broken. The HTML scaffold is built correctly but the JS bodies are empty — the compiler is halfway there.

---

## Request: `show alert` compiles to console.log(alert) instead of alert()
**Priority:** HIGH
**App:** Any app using form submission feedback
**What I needed:** `show alert 'Form submitted'` to trigger a browser alert dialog
**Proposed syntax:**
```clear
show alert 'Form submitted'
```
**Workaround used:** None found
**Failing test (paste this in editor and compile):**
```clear
build for web
page 'Test' at '/':
  button 'Submit':
    show alert 'Form submitted'
```
**Real compiled output (verified — copy exact):**
```javascript
document.getElementById('btn_Submit').addEventListener('click', function() {
  console.log(alert);  // ← logs the native window.alert function object. Never shows a dialog.
  _recompute();
});
```
Expected: `alert('Form submitted');`
**Error hit:** `console.log(alert)` — logs the native browser `alert` function object to console instead of calling it. No dialog ever appears. The string `'Form submitted'` is completely dropped — not passed anywhere.
**Impact:** HIGH — user feedback on actions is broken.

---

## Request: `text` keyword inside `for each` loop not recognized as display keyword
**Priority:** HIGH
**App:** Any app rendering lists dynamically
**What I needed:** `text` to work as a display keyword inside loop bodies
**Proposed syntax:**
```clear
for each item in items:
  text item
```
**Workaround used:** None found
**Steps to reproduce:**
```clear
build for web
page 'Test' at '/':
  items = ['apples', 'bananas', 'cherries']
  for each item in items:
    text item
```
Compile → inspect JS output.
**Real compiled output (verified):**
```javascript
let items = ["apples", "bananas", "cherries"];
for (const item of items) {
  console.log(text);  // ← 'text' treated as an undefined variable, not a display keyword
}
```
Compiler also throws: `You used 'text' on line 5 but it hasn't been created yet.` — treating `text` as a variable name, not a keyword.
Expected:
```javascript
for (let item of items) {
  const _el = document.createElement('p');
  _el.textContent = item;
  container.appendChild(_el);
}
```
**Error hit:** Compile warning + `console.log(text)` in output → `ReferenceError: text is not defined` at runtime.
**Impact:** HIGH — dynamic list rendering is completely broken. You cannot render loop output to the page.

---

## Request: Expose compiled JS output in compile tool response even on error
**Priority:** HIGH
**App:** All apps — this is an agent tooling gap
**What I needed:** The compile tool to return the compiled JS/HTML source alongside errors, even when the build fails
**Workaround used:** Add fake `requires auth` to force a clean build path, then strip after. Wastes 2-3 round trips per bug.
**Error hit:** compile tool returns errors + metadata flags but zero compiled source on failure.
**The catch-22:**
```
Code is broken
→ need compiled output to diagnose
→ build refuses to emit on errors
→ can't see what went wrong
→ debugging blind
```
**Impact:** HIGH — every debugging session is longer than it needs to be.

---

## Request: `refresh page` compiles to broken JS [RESOLVED — NOW WORKS ✅]
**Priority:** HIGH
**App:** Any app using page refresh after action
**What I needed:** `refresh page` to compile to `window.location.reload()`
**Proposed syntax:**
```clear
button 'Submit':
  save form to '/api/items'
  refresh page
```
**Workaround used:** None
**Error hit:** Compiles to:
```javascript
document.getElementById('btn_Submit').addEventListener('click', function() {
  refresh;  // ← undefined variable reference, not a function call
});
```
`refresh` is treated as a variable name, not an action keyword. Browser throws `ReferenceError: refresh is not defined` at runtime.
**Steps to reproduce:**
```clear
build for web
page 'Test' at '/':
  button 'Go':
    refresh page
```
Compile → inspect JS output → see `refresh;` instead of `window.location.reload();`
**Impact:** HIGH — any post-action page refresh is broken. Common pattern in form submission flows.

---

## Request: Agent affordance — `init --template NAME` for scaffolding
**Priority:** MEDIUM
**App:** All new apps
**What I needed:** `node cli/clear.js init --template todos` to scaffold a working starter app instantly
**Proposed syntax:**
```bash
node cli/clear.js init --template todos       # creates todo-app.clear
node cli/clear.js init --template crud        # creates crud-app.clear  
node cli/clear.js init --template ai-agent    # creates agent-app.clear
node cli/clear.js init --template auth        # creates auth-app.clear
```
Each template should produce a `.clear` file that:
1. Compiles without errors
2. Runs without crashes
3. Demonstrates the core pattern for that use case
4. Has inline comments explaining each section
**Workaround used:** Manually copy-paste examples from USER-GUIDE.md. Those examples often have bugs or gaps that aren't caught until runtime.
**Error hit:** No error — feature missing entirely. `node cli/clear.js init` does not exist.
**Why it matters for the agent:** When I start a new app, I have to reconstruct boilerplate from memory. Templates would give me a verified starting point and dramatically reduce compile errors on first attempt.
**Impact:** MEDIUM — slows down every new app build. A 2-minute scaffold step becomes a 10-minute reconstruct-and-debug cycle.

---

## Request: Agent affordance — compile tool should return compiled source on success
**Priority:** MEDIUM
**App:** All apps
**What I needed:** When compile succeeds, return the full compiled JS/HTML/Python so I can inspect it immediately
**Current behavior:** compile tool returns:
```json
{
  "errors": [],
  "warnings": [],
  "hasHTML": true,
  "hasJavascript": true,
  "hasServerJS": true
}
```
No source. Just flags saying it exists.
**Expected behavior:**
```json
{
  "errors": [],
  "warnings": [],
  "html": "<!DOCTYPE html>...",
  "javascript": "function _recompute() {...}",
  "serverJS": "const express = require('express')..."
}
```
**Steps to reproduce:**
1. Write any valid Clear app
2. Call compile tool
3. Get back flags but no source
4. Have to run `run_app` and `read_terminal` just to see compiled output — 2 extra round trips
**Workaround used:** `run_app` → `read_terminal` to infer behavior. But this only shows runtime errors, not the compiled source itself. To actually see compiled JS I have to either (a) run the app and inspect responses or (b) call compile multiple times with print statements.
**Why this matters:** Every bug diagnosis requires reading compiled output. Currently that's 3-4 tool calls instead of 1.
**Impact:** MEDIUM — doubles debugging time. Low-hanging fruit fix.

---

## Request: `write_file` needs append/insert/replace modes — replace with `edit_file`
**Priority:** HIGH
**App:** All apps — this is an agent tooling gap
**What I needed:** The ability to append to an existing file without reading and rewriting the whole thing

**The problem:**
`write_file` is a full overwrite. Always. There is no append mode. This means every time the agent needs to log a new bug to requests.md, it must read the entire file, hold it in context, construct old + new content, and write the whole thing back. This is fragile — it wiped requests.md twice during this session.

**Proposed replacement — `edit_file` tool with action modes:**
```
edit_file(filename, action='append', content='...')   → add to end
edit_file(filename, action='insert', line=42, content='...')  → add at line N
edit_file(filename, action='replace', find='...', replace='...')  → find/replace
edit_file(filename, action='overwrite', content='...')  → current behavior
edit_file(filename, action='read')  → read current content
```

**The `append` action alone would have prevented every accidental wipe in this session.**
**Workaround used:** Read full file → reconstruct → write entire file back. Caused two data loss incidents.
**Impact:** HIGH — primary mechanism for agent to communicate findings to compiler team. Data loss here means bugs go unreported.

---

## Request: Workflow returns no output — `run workflow` result is lost
**Priority:** CRITICAL
**Target:** JS + Python
**App:** Any app using workflows

**Failing test (paste into editor and compile):**
```clear
build for web and javascript backend
database is local memory

workflow 'Pipeline' with state:
  state has:
    topic, required
    draft
    quality_score (number), default 0
  step 'Write' with 'Writer Agent'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer Agent'
  step 'Publish' with 'Publisher Agent'

page 'Test' at '/':
  heading 'Workflow Test'
  'Topic' as text input
  button 'Run Pipeline':
    show 'running'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect serverJS — find `workflow_pipeline` function
4. Note: function returns `_state` but there is no endpoint that calls it or sends back the result
5. There is no way to trigger the workflow from an endpoint and get the result back

**Real compiled output (compiled and verified — serverJS):**
```javascript
async function workflow_pipeline(state) {
  let _state = Object.assign({topic: null, draft: null, quality_score: 0}, state);
  _state = await agent_writer_agent(_state);
  for (let _iter = 0; _iter < 3; _iter++) {
    if (_state.quality_score > 8) break;
    _state = await agent_reviewer_agent(_state);
  }
  _state = await agent_publisher_agent(_state);
  return _state;   // ← returns _state but...
}
// ← NO endpoint calls this function. No POST /api/run-pipeline. 
// ← No way to trigger it from frontend or API.
// ← Even if called manually, agents (agent_writer_agent etc.) are undefined — NameError at runtime.
```

**Additional bug in same compile:** The entire `workflow_pipeline` function is ALSO emitted into the frontend `javascript` bundle inside `_recompute()` — agents, state mutation, all of it exposed in browser DevTools.

**Expected output:**
- serverJS: endpoint that calls `workflow_pipeline(data)` and sends back final `_state`
- Frontend JS: no workflow code at all

**Workaround used:** None — no way to trigger a workflow from the API and get output
**Error hit:** No compile error. Silent — workflow exists in compiled output but is unreachable.
**Impact:** CRITICAL — workflows are completely unusable. Can't trigger them, can't get output back.

---

## Request: Workflow steps compile into frontend `_recompute()` — should be server-only
**Priority:** CRITICAL
**Target:** JS
**App:** Any app with a workflow

**Failing test:** Same as above — workflow test app

**Steps to reproduce:**
1. Paste workflow test into editor
2. Compile
3. Inspect the `javascript` (frontend) output — NOT serverJS
4. Find `workflow_pipeline` function defined inside `_recompute()`

**Real compiled output (compiled and verified — frontend JS inside `_recompute()`):**
```javascript
function _recompute() {
  // Database: local memory (JSON file backup)
  async function workflow_pipeline(state) {
    let _state = Object.assign({topic: null, draft: null, quality_score: 0}, state);
    _state = await agent_writer_agent(_state);   // ← agent functions undefined client-side
    for (let _iter = 0; _iter < 3; _iter++) {
      if (_state.quality_score > 8) break;
      _state = await agent_reviewer_agent(_state);
    }
    _state = await agent_publisher_agent(_state);
    return _state;
  }
  document.getElementById('input_topic').value = _state.topic;
}
```
The entire workflow function — including agent calls, state structure, loop logic — is defined inside `_recompute()` in the **browser bundle**. This runs on every state change (every keystroke). The function is redefined but never called. Agents are undefined client-side so it would throw `ReferenceError` if called.

**Expected output:**
- Frontend JS: zero workflow code
- serverJS: `workflow_pipeline` defined once at module level

**Error hit:** No compile error. Runtime: `ReferenceError: agent_writer_agent is not defined` if workflow somehow gets called client-side.
**Workaround used:** None — security issue, pipeline structure exposed in DevTools
**Impact:** CRITICAL — security vulnerability. All workflow logic, agent names, state shape, and loop conditions are visible to any user who opens browser DevTools.

---

## Request: Agent affordance — `show workflow status` for multi-step progress UI
**Priority:** MEDIUM
**App:** Any app using workflows with multiple steps
**What I needed:** A way to display which step a workflow is currently on in the UI
**Proposed syntax:**
```clear
show workflow 'Publishing Pipeline' status in 'status_box'
```
or inline in a page:
```clear
display workflow status
```
**Workaround used:** None — no visibility into workflow progress at all
**Error hit:** No error — feature missing
**Impact:** MEDIUM — workflows feel like black boxes to users. Multi-step pipelines need progress indicators.

## Request: Policy guards leak into frontend _recompute() [RESOLVED ✅]
**Priority:** HIGH
**Target:** JS
**App:** Policy test app with `block schema changes`, `protect tables`, `block prompt injection`
**What I needed:** Policy guards should compile ONLY to serverJS — they are DB-level enforcement rules

**Failing test (paste into editor and compile):**
```clear
build for web and javascript backend
database is local memory

create a Tasks table:
  task, required
  done, default false

policy:
  block schema changes
  block deletes without filter
  protect tables: AuditLog
  block prompt injection

when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks

page 'Test' at '/':
  heading 'Tasks'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect the `javascript` (frontend) output — NOT the serverJS

**Real compiled output (compiled and verified — frontend JS):**
```javascript
// Database: local memory (JSON file backup)
// === POLICY GUARDS (Enact) ===
db._guards = db._guards || [];
db._guards.push({ type: 'block_ddl', check: (op, table, data) => { ... } });
db._guards = db._guards || [];
db._guards.push({ type: 'dont_delete_without_where', check: (op, table, data, filter) => { ... } });
db._guards = db._guards || [];
db._guards.push({ type: 'protect_tables', check: (op, table) => { ... } });
db._guards = db._guards || [];
db._guards.push({ type: 'block_prompt_injection', check: (op, table, data) => { ... } });
// Wire policy guards into db operations
const _origInsert = db.insert.bind(db);
const _origUpdate = db.update.bind(db);
const _origRemove = db.remove.bind(db);
db.insert = function(table, record) { ... };
db.update = function(table, filter, data) { ... };
db.remove = function(table, filter) { ... };
```
This is in the **browser bundle** — `db` does not exist client-side. The guards have zero effect. But they're fully visible in DevTools, exposing all enforcement logic.

**Expected output:**
- Frontend JS: no policy guard code at all
- serverJS only: guards registered once at startup, outside any function

**Error hit:** No compile error. At runtime: `ReferenceError: db is not defined` in browser console. Guards never enforced.
**Workaround used:** None — security issue, guards can be bypassed by anyone with browser devtools
**Impact:** HIGH — security vulnerability. Policy guards are ineffective and expose enforcement logic to end users.

## Request: Policy guards re-registered on every _recompute() call [RESOLVED ✅]
**Priority:** HIGH
**Target:** JS
**App:** Policy test app
**What I needed:** Guards registered once at server startup, not on every frontend state change

**Failing test (paste into editor and compile):**
```clear
build for web and javascript backend
database is local memory

create a Tasks table:
  task, required

policy:
  block schema changes

page 'Test' at '/':
  button 'Click me':
    text 'clicked'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect `javascript` frontend output — find `db._guards.push(...)` — note it's at module level (not in `_recompute()` but still in the frontend bundle)
4. Open browser console
5. Click the button 10 times
6. Run `db._guards.length` in console — it should be 1, but it's 10

**Real compiled output (compiled and verified — frontend JS):**
```javascript
// === POLICY GUARDS (Enact) ===
db._guards = db._guards || [];
db._guards.push({ type: 'block_ddl', check: (op, table, data) => { if (['drop', 'truncate', 'alter', 'create'].some(w => (op || '').toLowerCase().includes(w))) throw Object.assign(new Error('Policy violation: schema changes (DDL) are blocked by policy'), { status: 403 }); } });
db._guards = db._guards || [];   // ← re-initialized BEFORE every push
db._guards.push({ type: 'dont_delete_without_where', check: (op, table, data, filter) => { if (op === 'remove' && (!filter || Object.keys(filter).length === 0)) throw Object.assign(new Error('Policy violation: DELETE without a filter is blocked — would delete all rows in ' + table), { status: 403 }); } });
db._guards = db._guards || [];   // ← AGAIN
db._guards.push({ type: 'protect_tables', check: (op, table) => { if (["auditlog"].includes((table || '').toLowerCase())) throw Object.assign(new Error('Policy violation: table ' + table + ' is protected by policy'), { status: 403 }); } });
db._guards = db._guards || [];   // ← AGAIN
db._guards.push({ type: 'block_prompt_injection', check: (op, table, data) => { const _vals = typeof data === 'string' ? [data] : Object.values(data || {}).filter(v => typeof v === 'string'); const _patterns = [...]; for (const v of _vals) { for (const p of _patterns) { if (p.test(v)) throw Object.assign(new Error('Policy violation: prompt injection detected in input'), { status: 400 }); } } } });
// Wire policy guards into db operations
const _origInsert = db.insert.bind(db);
const _origUpdate = db.update.bind(db);
const _origRemove = db.remove.bind(db);
db.insert = function(table, record) { (db._guards || []).forEach(g => g.check('insert', table, record)); return _origInsert(table, record); };
db.update = function(table, filter, data) { (db._guards || []).forEach(g => g.check('update', table, data || filter, filter)); return _origUpdate(table, filter, data); };
db.remove = function(table, filter) { (db._guards || []).forEach(g => g.check('remove', table, null, filter)); return _origRemove(table, filter); };
// Page: Test
document.title = "Test";
```
Key issue: `db._guards = db._guards || []` is emitted **before every single push**. This means the array is never cleared between guards, but the pattern means that on a fresh page load all 4 guards register. On hot reload or re-evaluation, they all register again — doubling, tripling, etc. On the server side, `db` is a module singleton so guards accumulate across every request cycle that triggers re-evaluation.

**Expected output:**
Guards should be in serverJS only, registered once at startup:
```javascript
// server.js — run once at startup
db._guards = [];
db._guards.push({ type: 'block_ddl', ... });
```

**Error hit:** No compile error. Silent memory leak — `db._guards` grows without bound on long-running servers.
**Workaround used:** None
**Impact:** HIGH — memory leak. Long-running apps accumulate thousands of duplicate guard entries, degrading performance over time.

## Request: `protect tables` blocks ALL operations including legitimate reads/writes
**Priority:** MEDIUM
**App:** Policy test app with `protect tables: Products`
**What I needed:** `protect tables: Products` to block destructive schema ops (DROP, TRUNCATE, ALTER) while allowing normal CRUD
**Proposed syntax:**
```clear
policy:
  protect tables: Products    ← should mean "no schema changes" not "no access"
```
**Workaround used:** Removed `protect tables` directive entirely
**Error hit:** With `protect tables: Products` active, every `save data to Products`, `get all Products`, and `remove from Products` throws 403 Forbidden. The table is completely inaccessible.
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

create a Products table:
  name, required
  price (number), required

policy:
  protect tables: Products

when user calls GET /api/products:
  items = get all Products
  send back items
```
Run → GET /api/products → 403. The GET endpoint has nothing to do with schema changes but gets blocked anyway.
**Impact:** MEDIUM — `protect tables` is completely unusable. Intended as a safety guard but acts as a full lockout.

## Request: Style nesting trap — app_layout clips page_hero and page_section
**Priority:** MEDIUM
**App:** Style sweep test
**What I needed:** `page_hero` and `page_section` to render correctly when placed inside an `app_layout` container
**Steps to reproduce:**
```clear
build for web
page 'Dashboard' at '/':
  section 'Layout' with style app_layout:
    section 'Hero' with style page_hero:
      heading 'Welcome'
      text 'This should be full-width hero'
    section 'Content' with style page_section:
      text 'Main content here'
```
Compile → run → screenshot → Hero and Content sections are invisible/clipped.
**Compiled output (relevant HTML):**
```html
<div class="h-screen overflow-hidden flex">  <!-- app_layout clips children -->
  <div class="min-h-screen flex items-center bg-gradient-...">  <!-- page_hero needs full height -->
    <h1>Welcome</h1>
    <!-- clipped by parent overflow:hidden — never visible -->
  </div>
</div>
```
**Expected:** Compiler warns: "`page_hero` and `page_section` should not be nested inside `app_layout` — use them at the top level of the page instead"
**Workaround used:** Manual inspection of compiled HTML — completely non-obvious
**Error hit:** No error — silent visual bug. Content disappears with zero indication why.
**Impact:** MEDIUM — will waste hours of debugging for new users. `app_layout` uses `h-screen overflow-hidden` which silently clips any child that needs to expand.


---

## Request: [PYTHON] DELETE endpoint ignores `:id` param — deletes entire table
**Priority:** CRITICAL
**Backend:** Python (FastAPI)
**App:** Basic CRUD app with `remove from Tasks with this id`
**What I needed:** `DELETE /api/tasks/:id` to delete only the record matching the given id
**Proposed syntax:**
```clear
when user calls DELETE /api/tasks/:id:
  requires auth
  remove from Tasks with this id
  send back 'deleted'
```
**Workaround used:** None
**Error hit:** No error at compile time. 

**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler 2026-01-01):**
```python
# clear:7
@app.delete("/api/tasks/{id}")
async def delete__api_tasks__id(request: Request):
    try:
        # clear:8
        if not hasattr(request, 'user') or not request.user:
            raise HTTPException(status_code=401, detail="Authentication required")
        # clear:9
        db.remove("tasks")   # ← NO filter argument! id path param completely ignored!
        # clear:10
        return {"message": "deleted"}
    except Exception as err:
        _status = 400 if ('required' in str(err) or 'must be' in str(err)) else 500
        ...
```
The `{id}` path parameter is captured by FastAPI in the route but NEVER extracted into a local variable. `db.remove("tasks")` has no filter argument → hits `if not filter: store["records"] = []` in `_DB` class → nukes entire table.
`db.remove("tasks")` with no filter argument hits the `if not filter: store["records"] = []` branch — nukes every record in the table. The `{id}` path parameter is never extracted or used.
**Steps to reproduce:**
```clear
build for web and python backend
database is local memory
create a Tasks table:
  title, required
when user calls DELETE /api/tasks/:id:
  requires auth
  remove from Tasks with this id
  send back 'deleted'
```
Compile → inspect Python → see `db.remove("tasks")` with no filter → POST a record → DELETE /api/tasks/1 → GET /api/tasks → empty list (all records gone)
**Impact:** CRITICAL — DELETE nukes the entire table. Data destruction bug. JS backend does not have this issue (_revive blocks it first), making this Python-specific.

---

## Request: [PYTHON] `requires auth` compiles to broken FastAPI auth check
**Priority:** CRITICAL
**Backend:** Python (FastAPI)
**App:** Any app with protected endpoints
**What I needed:** `requires auth` to validate a JWT token from the Authorization header and reject unauthenticated requests
**Proposed syntax:**
```clear
when user calls POST /api/tasks sending data:
  requires auth
  saved = save data to Tasks
  send back saved
```
**Workaround used:** None
**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler 2026-01-01, same compile as DELETE test):**
```python
# clear:8
if not hasattr(request, 'user') or not request.user:
    raise HTTPException(status_code=401, detail="Authentication required")
```
FastAPI's `Request` object NEVER has a `.user` attribute unless middleware explicitly sets it. `hasattr(request, 'user')` always returns `False` → every request to a protected endpoint raises 401 immediately, even with a valid token. Auth is completely broken on Python backend.
**Steps to reproduce:**
```clear
build for web and python backend
database is local memory
allow sign up and login
when user calls GET /api/profile:
  requires auth
  send back current user
```
Compile → run → POST /auth/register → POST /auth/login → use token → GET /api/profile with Authorization header → 401 always
**Impact:** CRITICAL — auth is completely non-functional on Python backend. Every protected endpoint is inaccessible.

---

## Request: [PYTHON] `run_app` tool does not support Python/FastAPI backend
**Priority:** HIGH
**Backend:** Python (FastAPI)
**App:** Any app compiled with `build for python backend`
**What I needed:** `run_app` to start the FastAPI server (via uvicorn) and return the port, same as it does for Express
**Proposed syntax:** N/A — tooling gap, not Clear syntax
**Workaround used:** Cannot test Python endpoints at all — no way to run the server from agent tools
**Error hit:** `run_app` returns `{"error": "No compiled server code. Compile first."}` even after successful Python compile (hasPython: true)
**Impact:** HIGH — the entire Python backend is untestable by the agent. All Python-specific bugs must be diagnosed from compiled source alone, with no runtime verification.

## Request: [BUG] Python — raw string returned from endpoint (not JSON dict)
**Priority:** 🟠 TIER 2 — MAJOR
**Backend:** Python (FastAPI)
**App:** Python backend conditionals/loops/concat test
**What I needed:** FastAPI endpoints must return dicts, not raw strings

**Failing test:**
```clear
build for python backend
database is local memory

when user calls GET /api/greeting:
  name is 'World'
  greeting is 'Hello ' + name
  send back greeting
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect Python output — find `return greeting`
4. Run with uvicorn — GET /api/greeting → FastAPI throws ValueError

**Real compiled output (exact):**
```python
@app.get("/api/greeting")
async def get__api_greeting(request: Request):
    try:
        name = "World"
        greeting = (("Hello " + " ") + name)
        return greeting   # ❌ FastAPI cannot serialize a raw string — expects dict or Response
    except Exception as err:
        ...
```

**Expected:**
```python
return {"greeting": greeting}   # or {"message": greeting}
```

**Actual:** `return greeting` — FastAPI throws `ValueError: [TypeError("'str' object is not iterable")]` at runtime

**Error hit:** No compile error. Runtime: `ValueError: [TypeError("'str' object is not iterable")]`
**Workaround:** None — language has no way to wrap in dict manually
**Impact:** high — any Python endpoint that sends back a scalar value crashes at runtime

## Request: [BUG] Python — agent is async generator but called with `await` not `async for`
**Priority:** 🔴 TIER 1 — BLOCKER
**Backend:** Python (FastAPI)
**App:** Python agent test
**What I needed:** Agent compiled as async generator (`yield _chunk`) but endpoint calls it with `await agent_advisor(...)` — these are incompatible. `await` on a generator returns the generator object, not the response.
**Steps to reproduce:**
1. `build for python backend`
2. Define an agent and call it from an endpoint
3. Compile and inspect Python output
4. See: `result = await agent_advisor(data["question"])` — wrong call pattern for an async generator
**Expected:** Either `result = "".join([chunk async for chunk in agent_advisor(...)])` or endpoint uses `StreamingResponse`
**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler 2026-01-01):**
```python
# clear:4 — agent compiles as async generator
async def agent_advisor(question):
    # clear:5
    response = _ask_ai_stream("You are a helpful assistant.", question)
    # clear:6
    async for _chunk in response:
        yield _chunk   # ← async generator (yields chunks)

# clear:8 — endpoint calls it with await — WRONG pattern
@app.post("/api/ask")
async def post__api_ask(request: Request):
    try:
        data = await request.json()
        # clear:9
        result = await agent_advisor(data["question"])   # ❌ await on async generator → TypeError
        # clear:10
        return result   # ❌ would return generator object, not a string
```
`agent_advisor` is an `async def` with `yield` — making it an **async generator**. You cannot `await` an async generator. `await agent_advisor(...)` raises `TypeError: object async_generator can't be used in 'await' expression`. The correct call is `async for chunk in agent_advisor(...): ...` or `"".join([c async for c in agent_advisor(...)])`.
**Workaround:** None — language has no way to control streaming vs non-streaming agent
**Impact:** CRITICAL — all Python agents are broken at runtime

## Request: [AFFORDANCE] Python — agent streaming vs non-streaming toggle
**Priority:** 🟠 TIER 2 — MAJOR
**Backend:** Python (FastAPI)
**App:** Python agent test
**What I needed:** Clear should let me choose between streaming and non-streaming agent response. Right now it always compiles to a streaming generator even when I just want a simple string back.
**Proposed syntax:**
```clear
agent 'Advisor' receives question:
  response = ask claude 'Help the user' with question
  send back response  # non-streaming — return full string

agent 'StreamAdvisor' receives question streaming:
  response = ask claude 'Help the user' with question
  send back response  # streaming — yield chunks
```
**Workaround used:** None
**Error hit:** No compile error, but runtime crashes
**Impact:** HIGH — non-streaming agents are the common case and they're broken

## Request: [BUG] Python — workflow state dict uses unquoted variable names (NameError)
**Priority:** CRITICAL
**Backend:** Python (FastAPI)
**App:** Python workflow test
**What I needed:** Workflow state dict initialized with string keys, not bare variable names

**Failing test (paste into editor and compile):**
```clear
build for web and python backend
database is local memory

workflow 'Pipeline' with state:
  state has:
    topic, required
    draft
    quality_score (number), default 0
  step 'Write' with 'Writer Agent'
  step 'Review' with 'Reviewer Agent'
  step 'Publish' with 'Publisher Agent'

page 'Test' at '/':
  heading 'Workflow Test'
  'Topic' as text input
  button 'Run':
    show 'running'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect Python output — find `workflow_pipeline` function
4. See `_state = {topic: None, draft: None, quality_score: 0}` — unquoted keys

**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler):**
```python
# clear:4
async def workflow_pipeline(state):
    _state = {topic: None, draft: None, quality_score: 0}  # ← UNQUOTED — NameError
    _state.update(state)
    _state = await agent_writer_agent(_state)
    _state = await agent_reviewer_agent(_state)
    _state = await agent_publisher_agent(_state)
    return _state
```
Python dict keys must be strings. Without quotes, `topic`, `draft`, `quality_score` are treated as variable references. None of them are defined. Throws `NameError: name 'topic' is not defined` the instant the function is called.

**Expected:**
```python
_state = {"topic": None, "draft": None, "quality_score": 0}
```

**Error hit:** No compile error. Runtime: `NameError: name 'topic' is not defined`
**Workaround:** None
**Impact:** CRITICAL — all Python workflows crash on invocation. JS backend does not have this issue.

## Request: [BUG] Python — workflow passes entire state dict to agent instead of relevant field
**Priority:** CRITICAL
**Backend:** Python (FastAPI)
**App:** Python workflow test
**What I needed:** Each workflow step to extract the relevant state field and pass it to the agent, then store the result back

**Failing test:** Same as workflow NameError test above — same compile, same function

**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler):**
```python
# clear:4
async def workflow_pipeline(state):
    _state = {topic: None, draft: None, quality_score: 0}
    _state.update(state)
    _state = await agent_writer_agent(_state)    # ← passes ENTIRE state dict
    _state = await agent_reviewer_agent(_state)  # ← overwrites entire _state with return value
    _state = await agent_publisher_agent(_state) # ← same — whole state in, whole state out
    return _state
```
Each step passes the entire `_state` dict to the agent. Agents expect a specific field (e.g., `topic`), not a dict. Even if agents could handle a dict, `_state = await agent_writer_agent(_state)` overwrites the entire state with whatever the agent returns — losing all other fields (draft, quality_score etc.).

**Expected:**
```python
_state["draft"] = await agent_writer_agent(_state["topic"])
_state["quality_score"] = await agent_reviewer_agent(_state["draft"])
# etc — each step reads the relevant input field, writes to the output field
```

**Error hit:** No compile error. Runtime: Agent receives a dict instead of a string — wrong type for the `question` parameter. Also `_state` gets overwritten on each step losing accumulated state.
**Workaround:** None
**Impact:** CRITICAL — workflow step data flow is completely broken in Python

## Request: [BUG] Both JS and Python — workflow not listed in architecture diagram comments
**Priority:** LOW
**App:** Workflow test (both targets)
**What I needed:** Workflow should appear in the compiled file's architecture header, like agents and endpoints do

**Failing test:**
```clear
build for web and javascript backend
database is local memory

workflow 'Pipeline' with state:
  state has:
    topic, required
    draft
    score (number), default 0
  step 'Write' with 'Writer Agent'
  step 'Review' with 'Reviewer Agent'
  step 'Publish' with 'Publisher Agent'

page 'Test' at '/':
  heading 'Workflow Test'
```

**Real compiled output (COMPILED AND VERIFIED — exact copy from compiler):**
```javascript
// Generated by Clear v1.0
// ┌─────────────────────────────────────────────┐
// │         CLEAR APP — Architecture            │
// └─────────────────────────────────────────────┘
//
// PAGES:
//   'Test' at / (line 13)
//
// ← NO WORKFLOWS SECTION AT ALL

async function workflow_pipeline(state) {
  let _state = Object.assign({topic: null, draft: null, score: 0}, state);
  _state = await agent_writer_agent(_state);    // ← agent_writer_agent NEVER DEFINED
  _state = await agent_reviewer_agent(_state);  // ← agent_reviewer_agent NEVER DEFINED
  _state = await agent_publisher_agent(_state); // ← agent_publisher_agent NEVER DEFINED
  return _state;
}
```

**Expected:**
```javascript
// WORKFLOWS: Pipeline (steps: Write → Review → Publish)
```
And each agent function should be defined in the compiled output.

**Actual:** Architecture header has no WORKFLOWS section. All three agent functions called but never defined — `ReferenceError` at runtime.

**Error hit:** No compile error. Runtime: `ReferenceError: agent_writer_agent is not defined`
**Workaround:** None
**Impact:** LOW for the missing header comment, CRITICAL for the undefined agent functions (separate bug filed above)

---

## Request: Scheduled task crashes with _revive not defined
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any app using `every N minutes:` with a database query
**What I needed:** Scheduled tasks that query the database should work the same as endpoint queries
**Proposed syntax:**
```clear
every 5 minutes:
  tasks = get all Tasks
  log 'Running scheduled check'
```
**Steps to reproduce:**
1. Write the above Clear code
2. Compile
3. Run the app
4. Wait 5 minutes OR manually trigger the interval

**Real compiled output (exact):**
```javascript
// clear:8
// Scheduled: every 5 minute(s)
setInterval(async () => {
  // clear:9
  const tasks = (await db.findAll('tasks')).map(_revive);  // ← _revive is not defined
  // clear:10
  console.log("Running scheduled check");
}, 300000);
```

**Expected:** `_revive` helper is defined before it's used, same as in endpoints
**Actual:** `_revive` is referenced inside `setInterval` but never defined anywhere in the compiled output — `ReferenceError: _revive is not defined` at runtime after 5 minutes

**Failing test:**
```javascript
// Should not throw ReferenceError after interval fires
const tasks = (await db.findAll('tasks')).map(_revive); // _revive undefined
```

**Workaround used:** None — scheduled tasks are completely broken if they touch the database
**Error hit:** `ReferenceError: _revive is not defined` (fires after first interval, not at startup)
**Impact:** High — silent failure, app starts fine but crashes after first scheduled run

---

## Request: Scheduled tasks have no error handling or cancellation
**Priority:** 🟠 TIER 2 — MAJOR GAP
**App:** Any app using `every N minutes:`
**What I needed:** Scheduled tasks should have try/catch and a way to stop them
**Proposed syntax:**
```clear
every 5 minutes:
  tasks = get all Tasks
  log 'check complete'
```
**Steps to reproduce:**
1. Write the above Clear code
2. Compile and inspect serverJS

**Real compiled output (exact):**
```javascript
setInterval(async () => {
  const tasks = (await db.findAll('tasks')).map(_revive);
  console.log("Running scheduled check");
}, 300000);
// No try/catch
// No way to cancel
// No success/failure logging
// Interval ID not stored — cannot clearInterval()
```

**Expected:** 
```javascript
const _interval_1 = setInterval(async () => {
  try {
    const tasks = (await db.findAll('tasks')).map(_revive);
    console.log("Running scheduled check");
  } catch (err) {
    console.error('[Scheduled task] Error:', err.message);
  }
}, 300000);
```
**Actual:** Raw `setInterval` with no error handling. One crash kills the interval silently.

**Failing test:**
```javascript
// Throw inside interval — should log error and continue
setInterval(async () => {
  throw new Error('test'); // kills interval silently, no log
}, 300000);
```

**Workaround used:** None
**Error hit:** No compile error — silent runtime failure
**Impact:** Medium — scheduled tasks unreliable in production

---

## Request: Python scheduled task has IndentationError — crashes on startup
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any Python app using `every N minutes:` with database queries
**What I needed:** Python scheduled tasks that compile to valid, runnable Python
**Proposed syntax:**
```clear
build for python backend
every 5 minutes:
  tasks = get all Tasks
  log 'Running scheduled check'
```
**Steps to reproduce:**
1. Write the above Clear code with `build for python backend`
2. Compile
3. Run with uvicorn
4. App crashes immediately on startup with `IndentationError`

**Real compiled output (exact):**
```python
async def _cron_interval_5_minute():
    while True:
        await asyncio.sleep(300)
            # clear:9
            tasks = db.query("tasks")   # ← 12 spaces indent, inside while True at 8 spaces
            # clear:10
            print("Running scheduled check")  # ← wrong indent
```

**Expected:**
```python
async def _cron_interval_5_minute():
    while True:
        await asyncio.sleep(300)
        tasks = db.query("tasks")       # ← 8 spaces, same level as await
        print("Running scheduled check")
```
**Actual:** `IndentationError` on startup — app never starts

**Failing test:**
```python
# This is what compiles — paste into Python and run:
async def _cron_interval_5_minute():
    while True:
        await asyncio.sleep(300)
            tasks = db.query("tasks")  # IndentationError: unexpected indent
```

**Workaround used:** None — Python scheduled tasks are completely broken
**Error hit:** `IndentationError: unexpected indent` at startup
**Impact:** High — Python scheduled tasks 100% broken, app won't start

---

## Request: Python scheduled task uses deprecated @app.on_event("startup")
**Priority:** 🟠 TIER 2 — MAJOR GAP
**App:** Any Python app using `every N minutes:`
**What I needed:** FastAPI lifespan pattern instead of deprecated event handler
**Proposed syntax:**
```clear
build for python backend
every 5 minutes:
  tasks = get all Tasks
```
**Steps to reproduce:**
1. Write above Clear code with `build for python backend`
2. Compile and inspect Python output

**Real compiled output (exact):**
```python
@app.on_event("startup")           # ← deprecated since FastAPI v0.93
async def _start_cron_5_minute():
    asyncio.create_task(_cron_interval_5_minute())
```

**Expected:**
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_cron_interval_5_minute())
    yield

app = FastAPI(lifespan=lifespan)
```
**Actual:** Deprecated pattern — throws `DeprecationWarning` and will break in future FastAPI versions

**Failing test:**
```python
# Run with FastAPI >= 0.93 — throws DeprecationWarning
@app.on_event("startup")
async def _start_cron_5_minute():
    asyncio.create_task(_cron_interval_5_minute())
```

**Workaround used:** None
**Error hit:** `DeprecationWarning: on_event is deprecated, use lifespan instead`
**Impact:** Medium — works now, will break in future FastAPI versions

---

## Request: File input not rendered — compiles to console.log
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any app with `'Field' as file input`
**What I needed:** A working `<input type="file">` element in the HTML

**Failing test (paste this into the editor to reproduce):**
```clear
build for web and javascript backend

page 'Test' at '/':
  heading 'File Upload Test'
  'Document' as file input
  button 'Upload':
    upload 'Document' to '/api/upload'
    show 'uploaded'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect HTML output — no `<input type="file">` anywhere
4. Inspect client JS — `console.log("Document")` in `_recompute()`

**Real compiled output (exact):**
```javascript
// Client JS — _recompute():
function _recompute() {
  console.log("Document");  // ← file input compiled to a log statement
}
```
```html
<!-- HTML body — no file input rendered at all -->
<h1 class="...">File Upload Test</h1>
<button class="btn btn-primary" id="btn_Upload">Upload</button>
<!-- NO <input type="file"> anywhere in the document -->
```

**Expected output:**
```html
<input type="file" id="input_Document" class="file-input file-input-bordered w-full">
```
```javascript
// Client JS:
_state.document = null;
document.getElementById('input_Document').addEventListener('change', function(e) {
  _state.document = e.target.files[0];
  _recompute();
});
```

**Error hit:** `ReferenceError: upload is not defined` when Upload button clicked
**Workaround used:** None — file inputs are completely broken
**Impact:** High — file upload is a core feature, completely non-functional

---

## Request: `upload X to '/endpoint'` compiles to `console.log(upload)` — undefined
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any app with file upload button handler
**What I needed:** Button handler that sends a file to an endpoint using FormData

**Failing test (paste this into the editor to reproduce):**
```clear
build for web and javascript backend

page 'Test' at '/':
  'Document' as file input
  button 'Upload':
    upload 'Document' to '/api/upload'
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect client JS button handler
4. Click Upload button in browser

**Real compiled output (exact):**
```javascript
document.getElementById('btn_Upload').addEventListener('click', function() {
  console.log(upload);   // ← 'upload' keyword → console.log(upload) — ReferenceError
  _recompute();
});
```

**Expected output:**
```javascript
document.getElementById('btn_Upload').addEventListener('click', async function() {
  const formData = new FormData();
  formData.append('file', _state.document);
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });
  const result = await response.json();
  _recompute();
});
```

**Error hit:** `ReferenceError: upload is not defined` at button click
**Workaround used:** None — upload keyword is completely broken
**Impact:** High — file upload completely non-functional end to end

---

## Request: Server has no multipart/file upload middleware
**Priority:** 🟠 TIER 2 — MAJOR GAP
**App:** Any app with file upload endpoint
**What I needed:** Server endpoint that can receive multipart form data with a file

**Failing test (paste this into the editor to reproduce):**
```clear
build for web and javascript backend

when user calls POST /api/upload sending data:
  saved = save data to Documents
  send back saved
```

**Steps to reproduce:**
1. Paste failing test into editor
2. Compile
3. Inspect serverJS — no multer, no multipart middleware
4. Try to POST a file — server can't parse it

**Real compiled output (exact):**
```javascript
const express = require('express');
const db = require('./clear-runtime/db');
const app = express();
app.use(express.json());   // ← JSON only — no multipart support
// NO multer import
// NO express-fileupload
// NO busboy
// NO multipart middleware of any kind
```

**Expected output:**
```javascript
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
// ...
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const file = req.file;  // multer populates this
  // ...
});
```

**Error hit:** `req.body` is empty when file sent as multipart — server receives nothing
**Workaround used:** None — server cannot receive files at all
**Impact:** Medium — blocks file upload feature entirely, but workaround is to store base64 in JSON (ugly)

## Request: Email sending compiles to broken fetch() call
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any app using `send email to`
**What I needed:** `send email to` should compile to a real email send via nodemailer or similar
**Proposed syntax:**
```clear
send email to 'admin@example.com' subject 'New message' body data's message
```
**Workaround used:** None — email is completely non-functional
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

when user calls POST /api/contact sending data:
  send email to 'admin@example.com' subject 'New message' body data's message
  send back 'sent' with success message
```
**Real compiled output (exact):**
```javascript
// clear:5
{ const _r = await fetch("admin@example.com", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: _state.email }) });
  if (!_r.ok) { const _e = await _r.json().catch(() => ({})); console.error('[POST admin@example.com] [clear:5]', _e.error || 'POST failed'); throw new Error(_e.error || _e.message || 'POST failed'); } }
```
**Expected compiled output:**
```javascript
const nodemailer = require('nodemailer');
const _transporter = nodemailer.createTransport({ /* smtp config from env */ });
await _transporter.sendMail({
  to: 'admin@example.com',
  subject: 'New message',
  text: data.message
});
```
**What actually happens:** `send email to` compiles to `fetch("admin@example.com", ...)` — treating the email address as a URL. Throws `TypeError: Failed to parse URL` immediately. No nodemailer, no SMTP, no SendGrid — nothing.
**Failing test:**
```javascript
// POST /api/contact with { message: 'hello' }
// Expected: 200 OK, email sent
// Actual: TypeError: Failed to parse URL from input 'admin@example.com'
```
**Impact:** High — email is completely broken. Any contact form, notification, or alert app fails instantly.

## Request: Python email sending silently dropped — compiles to comment
**Priority:** 🔴 TIER 1 — BLOCKER
**App:** Any Python app using `send email to`
**What I needed:** `send email to` should compile to real email send via smtplib or similar
**Proposed syntax:**
```clear
send email to 'admin@example.com' subject 'New message' body data's message
```
**Workaround used:** None — email is completely non-functional in Python
**Steps to reproduce:**
```clear
build for web and python backend
database is local memory

when user calls POST /api/contact sending data:
  send email to 'admin@example.com' subject 'New message' body data's message
  send back 'sent' with success message
```
**Real compiled output (exact):**
```python
# clear:5
# API call: POST admin@example.com
# clear:6
return JSONResponse(content={"message": "sent"}, status_code=201)
```
**Expected compiled output:**
```python
import smtplib
from email.mime.text import MIMEText
msg = MIMEText(data['message'])
msg['Subject'] = 'New message'
msg['To'] = 'admin@example.com'
with smtplib.SMTP(os.environ['SMTP_HOST']) as s:
    s.sendmail(os.environ['SMTP_FROM'], 'admin@example.com', msg.as_string())
```
**What actually happens:** Python silently drops the `send email` call — compiles to just a comment `# API call: POST admin@example.com`. Endpoint returns 201 OK but no email is ever sent. Silent failure — no error, no warning.
**Failing test:**
```python
# POST /api/contact with { "message": "hello" }
# Expected: 200 OK, email sent via SMTP
# Actual: 201 OK returned but zero email activity — silently dropped
```
**Impact:** High — Python email is a silent failure. Worse than JS (which at least throws). Any notification system, contact form, or alert built on Python backend silently does nothing.

---

## Request: [PYTHON] External API — `httpx` not imported, query param dropped

**App:** Any Python backend that calls an external API
**What I needed:** `fetch from 'https://...' + variable` to compile to a working httpx call with the full URL
**Priority:** 🔴 TIER 1

**Steps to reproduce:**
```clear
build for python backend

when user calls POST /api/search sending data:
  response = fetch from 'https://api.example.com/search?q=' + data's query
  send back response
```

**Real compiled output (verbatim):**
```python
async with httpx.AsyncClient(timeout=10) as _client:
    _r = await _client.get('https://api.example.com/search?q=')  # ← query param DROPPED
    response = _r.json()
```

Note: `import httpx` is **never emitted** anywhere in the compiled file.

**Expected:** `import httpx` at top, full URL with concatenated param
**Actual:** `NameError: name 'httpx' is not defined` on first request. Also the `+ data's query` concatenation is silently dropped — URL is always just the base string.

**Failing test:**
```python
# paste compiled output, run with: uvicorn main:app
# POST /api/search with {"query": "hello"}
# Expected: external API called with ?q=hello, result returned
# Actual: NameError: name 'httpx' is not defined
```

**Workaround used:** None — Python external API calls are completely broken
**Error hit:** `NameError: name 'httpx' is not defined` at runtime
**Impact:** High — any Python app needing external data is blocked

---

## Request: [PYTHON] Charts — `as bar chart` directive silently dropped

**App:** Any Python app with data visualization
**What I needed:** `send back data as bar chart` to return a chart (image, SVG, or Chart.js config)
**Priority:** 🟠 TIER 2

**Steps to reproduce:**
```clear
build for python backend

when user calls GET /api/stats:
  data = [10, 20, 30, 40, 50]
  send back data as bar chart
```

**Real compiled output (verbatim):**
```python
# clear:4
data = [10, 20, 30, 40, 50]
# clear:5
return data
```

`as bar chart` is completely silently dropped. Returns raw JSON array.
No matplotlib, no plotly, no base64 image, no Chart.js config.

**Expected:** Some chart representation — even a Chart.js config JSON would work
**Actual:** Raw array `[10, 20, 30, 40, 50]` returned. No chart whatsoever.

**Failing test:**
```python
# GET /api/stats
# Expected: chart data structure (image bytes, SVG, or Chart.js config)
# Actual: [10, 20, 30, 40, 50] — just the raw array, no chart
```

**Workaround used:** None
**Error hit:** No error — silently wrong
**Impact:** Medium — charts completely missing from Python backend

---

## Request: [PYTHON] DB relationships — `belongs to` and `with Table` JOIN ignored

**App:** Any Python app with related tables
**What I needed:** `customer belongs to Customers` to create a foreign key, `get all Orders with Customers` to JOIN
**Priority:** 🟠 TIER 2

**Steps to reproduce:**
```clear
build for python backend
database is local memory

create a Customers table:
  name, required
  email, required

create an Orders table:
  item, required
  amount, required
  customer belongs to Customers

when user calls GET /api/orders:
  orders = get all Orders with Customers
  send back orders
```

**Real compiled output (verbatim):**
```python
# Schema — belongs to becomes plain TEXT, no REFERENCES:
db.execute("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, item TEXT NOT NULL, amount TEXT NOT NULL, customer TEXT)")

# Endpoint — WITH clause completely ignored:
orders = db.query("orders")   # ← no JOIN, no customer data
return orders
```

**Expected:**
```python
db.execute("CREATE TABLE IF NOT EXISTS orders (..., customer_id INTEGER REFERENCES customers(id))")
# JOIN:
orders = db.query_join("orders", "customers", on="customer_id")
```

**Actual:** `belongs to` → plain `TEXT` column. `with Customers` → silently dropped. Returns flat orders with no customer data.

**Failing test:**
```python
# POST /api/customers with {"name": "Alice", "email": "a@b.com"} → id: 1
# POST /api/orders with {"item": "Widget", "amount": 10, "customer_id": 1}
# GET /api/orders
# Expected: [{"item": "Widget", "amount": 10, "customer": {"name": "Alice", "email": "a@b.com"}}]
# Actual: [{"item": "Widget", "amount": 10, "customer": null}]
```

**Workaround used:** None — relationships completely non-functional in Python
**Error hit:** No error — silently wrong
**Impact:** High — any relational data model is broken

## Request: Auth login command not recognized as built-in
**Priority:** Tier 1 — Blocker
**App:** Any app with user authentication
**What I needed:** `login with data's email and data's password` to compile as a built-in auth command
**Proposed syntax:**
```clear
when user calls POST /api/login sending data:
  login with data's email and data's password
  send back token
```
**Workaround used:** None — feature is blocked. Cannot build login flow.
**Real compiled output:**
```
ERROR line 9: You used 'login' on line 9 but it hasn't been created yet.
ERROR line 10: You used 'token' on line 10 but it hasn't been created yet.
```
**Expected:** Compiler recognizes `login` as a built-in auth command, compiles to bcrypt password check + JWT token generation
**Actual:** Compiler treats `login` as an undefined variable. Throws two errors. App does not compile at all.
**Failing test:**
```clear
when user calls POST /api/login sending data:
  login with data's email and data's password
  send back token
```
Expected: compiles to JWT auth flow
Got: compile errors — `login` and `token` not defined
**Impact:** High — every app requiring user login is completely blocked

## Request: `needs login` on page does nothing — no auth guard
**Priority:** Tier 1 — Blocker
**App:** Any multi-page app with protected routes
**What I needed:** `needs login` on a page to redirect unauthenticated users to login page
**Proposed syntax:**
```clear
page 'Dashboard' at '/dashboard':
  needs login
  heading 'Welcome'
```
**Workaround used:** None — feature is completely missing
**Real compiled output:**
```javascript
// Page: Protected
document.title = "Protected";

// Page: Login
document.title = "Login";
```
`needs login` compiles to nothing. No token check. No redirect. No guard of any kind.

**Additional bugs found:**
1. Hash routing used (`location.hash`) — `/protected` is actually `/#/protected`, trivially bypassed
2. Protected page content (`Secret Page`, `You are logged in`) is visible in HTML source even when "hidden" — `display:none` is not security
3. Both pages rendered in same HTML file — all content accessible via DevTools

**Expected:** JS checks for auth token in localStorage/cookie, redirects to login page if missing
**Actual:** Zero auth enforcement on frontend pages
**Failing test:**
```clear
page 'Protected' at '/protected':
  needs login
  heading 'Secret Page'
```
Expected: compiles to token check + redirect if not authenticated
Got: `document.title = "Protected"` — nothing else
**Impact:** High — any app with user accounts has zero frontend security





## Bug: Tabs — _switchTab not defined
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
page 'App' at '/':
  tabs 'Main':
    tab 'Profile':
      text 'Profile content'
    tab 'Settings':
      text 'Settings content'
```
**Compiled output:**
```html
<div class="tabs tabs-bordered" id="tabs_Main">
  <button class="tab" onclick="_switchTab('Main', 'Profile')">Profile</button>
  <button class="tab" onclick="_switchTab('Main', 'Settings')">Settings</button>
</div>
```
**Bug:** `_switchTab` is never defined anywhere in the compiled JS. Clicking any tab throws `ReferenceError: _switchTab is not defined`.
**Failing test:** Click any tab → `ReferenceError: _switchTab is not defined`
**Expected:** Active tab content shows, inactive tab content hides. `_switchTab` defined in runtime.

## Bug: show/hide X — compiles to comment
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
button 'Toggle':
  show panel
  hide warning
```
**Compiled output:**
```javascript
// show panel
// hide warning
```
**Bug:** Both compile to comments. No `document.getElementById('panel').style.display`, no CSS class toggle, no DOM manipulation whatsoever.
**Failing test:** Click Toggle button → nothing happens visually
**Expected:** `panel` element becomes visible, `warning` element becomes hidden.

## Bug: open modal / close modal — compiles to comment
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
button 'Delete':
  open modal 'Confirm'
modal 'Confirm':
  text 'Are you sure?'
  button 'Yes':
    close modal 'Confirm'
```
**Compiled output:**
```javascript
// open modal 'Confirm'
// close modal 'Confirm'
```
**Bug:** Both compile to comments. No `document.getElementById('modal_Confirm').showModal()`, no DaisyUI modal trigger.
**Failing test:** Click Delete → nothing happens. Modal never opens.
**Expected:** DaisyUI dialog opens/closes correctly.

## Bug: toast notifications — compiles to comment
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
button 'Save':
  post to '/api/items'
  toast 'Saved successfully'
```
**Compiled output:**
```javascript
// toast 'Saved successfully'
```
**Bug:** Compiles to comment. No DaisyUI toast element created, no notification shown.
**Failing test:** Click Save → no toast appears
**Expected:** DaisyUI toast notification appears briefly then disappears.

## Bug: copy to clipboard — compiles to undefined console.log
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
button 'Copy':
  copy link to clipboard
```
**Compiled output:**
```javascript
console.log(clipboard)
```
**Bug:** `clipboard` is undefined. No `navigator.clipboard.writeText()`. Throws `ReferenceError` in strict mode.
**Failing test:** Click Copy → `ReferenceError: clipboard is not defined`
**Expected:** `navigator.clipboard.writeText(_state.link)` called, text copied.

## Bug: download as file — compiles to undefined console.log
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
button 'Export':
  download items as file
```
**Compiled output:**
```javascript
console.log(download)
```
**Bug:** `download` is undefined. No `Blob`, no `URL.createObjectURL`, no `<a>` click trigger.
**Failing test:** Click Export → `ReferenceError: download is not defined`
**Expected:** File download triggered via Blob URL.

## Bug: display as currency — no formatting
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display price as currency
```
**Compiled output:**
```javascript
document.getElementById('output_price_value').textContent = String(_state.price);
```
**Bug:** Raw number. No `toLocaleString('en-US', { style: 'currency', currency: 'USD' })`. `9.99` displays as `9.99` not `$9.99`.
**Failing test:** `price = 9.99` → displays `9.99` not `$9.99`
**Expected:** `$9.99` with proper locale formatting.

## Bug: display as percentage — no formatting
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display score as percentage
```
**Compiled output:**
```javascript
document.getElementById('output_score_value').textContent = String(_state.score);
```
**Bug:** Raw number. No `%` suffix, no `* 100` if decimal. `0.85` displays as `0.85` not `85%`.
**Failing test:** `score = 0.85` → displays `0.85` not `85%`
**Expected:** `85%` with proper formatting.

## Bug: display as date — no formatting
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display created_at as date
```
**Compiled output:**
```javascript
document.getElementById('output_created_at_value').textContent = String(_state.created_at);
```
**Bug:** Raw string. No `new Date()`, no `.toLocaleDateString()`. ISO string `2024-01-15T10:30:00Z` displays as-is.
**Failing test:** `created_at = '2024-01-15T10:30:00Z'` → displays raw ISO string not `January 15, 2024`
**Expected:** Human readable date via `toLocaleDateString()`.

## Bug: display as json — shows [object Object]
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display data as json
```
**Compiled output:**
```javascript
document.getElementById('output_data_value').textContent = String(_state.data);
```
**Bug:** `String()` on object = `[object Object]`. Should be `JSON.stringify(_state.data, null, 2)`.
**Failing test:** `data = { name: 'test' }` → displays `[object Object]`
**Expected:** Pretty-printed JSON in a `<pre>` block.

## Bug: display as gallery — stat card instead of image grid
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display photos as gallery
```
**Compiled output:**
```javascript
document.getElementById('output_photos_value').textContent = String(_state.photos);
```
**Bug:** Stat card widget. `String()` on array of objects = `[object Object],[object Object]`. No image grid, no `<img>` tags.
**Expected:** CSS grid of `<img>` elements, one per item in the array.

## Bug: display as map — empty div, no map library
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display location as map
```
**Compiled output:**
```html
<div class="bg-base-200 rounded-xl" id="map_location"></div>
```
**Bug:** Empty div. No Leaflet, no Google Maps, no MapBox import. Nothing rendered inside.
**Expected:** Map rendered via a library (Leaflet is free/open). At minimum a placeholder with instructions to add API key.

## Bug: display as calendar — stat card instead of calendar UI
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display events as calendar
```
**Compiled output:**
```javascript
document.getElementById('output_events_value').textContent = String(_state.events);
```
**Bug:** Same stat card pattern. No FullCalendar, no date grid. Raw `[object Object]` string.
**Expected:** Calendar grid UI, events mapped to dates.

## Bug: display as QR code — stat card instead of QR image
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display url as QR code
```
**Compiled output:**
```javascript
document.getElementById('output_url_value').textContent = String(_state.url);
```
**Bug:** Stat card showing raw URL string. No QR library (qrcode.js etc), no canvas rendering.
**Expected:** QR code image generated from the URL value.

## Bug: video/audio player — stat card instead of media element
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
display video as player
display audio as player
```
**Compiled output:**
```javascript
document.getElementById('output_video_value').textContent = String(_state.video);
document.getElementById('output_audio_value').textContent = String(_state.audio);
```
**Bug:** Both compile to stat cards showing the raw URL string. No `<video>` or `<audio>` element generated.
**Expected:**
```html
<video src="" controls class="w-full rounded-xl" id="player_video"></video>
<audio src="" controls class="w-full" id="player_audio"></audio>
```

## Bug: show loading / hide loading — compiles to console.log(undefined)
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
show loading
hide loading
```
**Compiled output:**
```javascript
console.log(loading)
console.log(loading)
```
**Bug:** `loading` is undefined. No spinner element, no CSS class toggle, no DOM manipulation.
**Failing test:** `ReferenceError: loading is not defined`
**Expected:** DaisyUI loading spinner shown/hidden via display toggle.

## Bug: debounce on input — fires every keystroke
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
on input search with debounce 300ms
```
**Compiled output:**
```javascript
document.getElementById('input_Query').addEventListener('input', async (e) => {
  _state.query = e.target.value;
  _recompute();
});
```
**Bug:** No debounce wrapper. Every single keystroke fires the handler immediately. On a search endpoint this means an API call per character typed.
**Expected:**
```javascript
let _debounce_timer;
document.getElementById('input_Query').addEventListener('input', async (e) => {
  _state.query = e.target.value;
  clearTimeout(_debounce_timer);
  _debounce_timer = setTimeout(async () => {
    // handler body
  }, 300);
});
```

## Bug: throttle on scroll — fires every event
**Target:** JS frontend
**Tier:** 2
**Clear source:**
```
on scroll save position with throttle 100ms
```
**Compiled output:**
```javascript
window.addEventListener('scroll', async () => {
  _state.position = window.scrollY;
  _recompute();
});
```
**Bug:** No throttle. Every scroll pixel fires handler. Same root cause as debounce — timing wrapper not emitted.
**Expected:** Throttle wrapper limiting handler to max once per 100ms.

## Bug: Agent multi-turn memory wiped on every request
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
agent 'Chat' receives question:
  remember conversation context
  response = ask claude 'You are a helpful assistant.' with question
  send back response
```
**Compiled output:**
```javascript
async function agent_chat(question) {
  const _history = [];   // ← declared INSIDE function — wiped on every call
  _history.push({ role: 'user', content: question });
  const response = await _askAI('You are a helpful assistant.', _history);
  _history.push({ role: 'assistant', content: response });
  return response;
}
```
**Bug:** `_history` is declared inside the function body. Every API call reinitializes it to `[]`. Multi-turn context is completely lost between requests.
**Expected:** `_history` stored outside the handler — in a Map keyed by session ID, or in the DB.

## Bug: Agent RAG (knows about) — compiles to comment
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
agent 'Support' receives question:
  knows about: Products, FAQ
  response = ask claude 'You are support.' with question
  send back response
```
**Compiled output:**
```javascript
async function agent_support(question) {
  // knows about: Products, FAQ
  const response = await _askAI('You are support.', question);
  return response;
}
```
**Bug:** `knows about` compiles to a comment. No vector search, no embedding lookup, no DB query injected into the prompt. RAG is completely non-functional.
**Expected:** Before calling Claude, query relevant records from Products and FAQ tables, inject as context into the system prompt.

## Bug: Agent tool use (can use) — compiles to comment
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
agent 'Analyst' receives question:
  can use: calculate_price, check_inventory
  response = ask claude 'You are an analyst.' with question
  send back response
```
**Compiled output:**
```javascript
async function agent_analyst(question) {
  // can use: calculate_price, check_inventory
  const response = await _askAI('You are an analyst.', question);
  return response;
}
```
**Bug:** `can use` compiles to a comment. No Anthropic tool_use format, no function binding, no tool schema passed to Claude.
**Expected:** Tools passed as `tools` array in Anthropic API call. Claude can call them and results fed back.

## Bug: Agent guardrails (must not) — compiles to comment
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
agent 'Assistant' receives question:
  must not: delete records, access users
  response = ask claude 'You are helpful.' with question
  send back response
```
**Compiled output:**
```javascript
async function agent_assistant(question) {
  // must not: delete records, access users
  const response = await _askAI('You are helpful.', question);
  return response;
}
```
**Bug:** Guardrails compile to a comment. No enforcement in prompt, no output validation, nothing.
**Expected:** Guardrails injected into system prompt as constraints, and/or output checked against forbidden patterns.

## Bug: Python agent structured output — _ask_ai never defined
**Target:** Python backend
**Tier:** 2
**Clear source:**
```
agent 'Classifier' receives text:
  result = ask claude 'Classify this' with text returning JSON text:
    category
    confidence (number)
  send back result
```
**Compiled output:**
```python
async def agent_classifier(text):
  _schema = {'category': {'type': 'string'}, 'confidence': {'type': 'number'}}
  response = await _ask_ai('Classify this', messages, schema=_schema)
  return response
```
**Bug:** `_ask_ai` is never defined in the compiled Python output. Only `_ask_ai_stream` exists. Throws `NameError: name '_ask_ai' is not defined` at runtime.
**Expected:** `_ask_ai` helper defined for non-streaming calls with schema support.

## Bug: Python full-stack — no static file serving
**Target:** Python backend
**Tier:** 1
**Clear source:**
```
build for web and python backend

page 'App' at '/':
  heading 'Hello'
```
**Compiled output:**
```python
from fastapi import FastAPI
app = FastAPI()
# API endpoints only — NO static file routes
# NO app.mount("/", StaticFiles(...))
# NO route for "/"
```
**Bug:** Python full-stack compiles API endpoints but generates no HTML and no static file serving. Frontend is completely unreachable. `GET /` returns 404.
**Expected:**
```python
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="static", html=True), name="static")
```
Plus compiled HTML written to `static/index.html`.

## Bug: CORS headers missing in JS backend
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
build for web and javascript backend
```
**Compiled output:**
```javascript
const express = require('express');
app.use(express.json());
// NO cors() middleware
// NO Access-Control-Allow-Origin header
```
**Bug:** Zero CORS headers. Any frontend on a different origin (localhost:5173 calling localhost:3000, or any deployed frontend) gets blocked by browser CORS policy.
**Expected:** `const cors = require('cors'); app.use(cors());` emitted by default, or at minimum when `build for web and javascript backend` is used.

## Bug: Cookies broken — no cookie-parser (JS) / no Response import (Python)
**Target:** Both
**Tier:** 2
**Clear source:**
```
set cookie 'session' to token
get cookie 'session'
```
**JS compiled output:**
```javascript
res.cookie('session', _state.token);
const token = req.cookies['session'];
// NO require('cookie-parser')
// NO app.use(cookieParser())
```
**Python compiled output:**
```python
response.set_cookie('session', _state['token'])
# 'response' object doesn't exist — FastAPI returns values, not mutates response
# NO from fastapi import Response
```
**Bug:** JS: `req.cookies` is always `undefined` without `cookie-parser` middleware. Python: `response` variable doesn't exist in FastAPI route handlers.
**Expected:** JS adds `cookie-parser`, Python uses `Response` object properly.

## Bug: Server-side data validation compiles to comment
**Target:** Both
**Tier:** 2
**Clear source:**
```
when user calls POST /api/items sending data:
  validate data has email, name
  saved = save data to Items
  send back saved
```
**Compiled output:**
```javascript
// validate data has email, name
```
**Bug:** Validation compiles to a comment. No `if (!data.email) return res.status(400).json({error: 'email required'})`. Malformed requests silently accepted.
**Expected:** Each required field checked, 400 returned if missing.

## Bug: transform data compiles to comment
**Target:** Both
**Tier:** 2
**Clear source:**
```
when user calls GET /api/items:
  items = get all Items
  transform items to include only name, price
  send back items
```
**Compiled output:**
```javascript
// transform items to include only name, price
```
**Bug:** Comment. No `.map(item => ({ name: item.name, price: item.price }))`. All fields returned.
**Expected:** Field projection applied before send.

## Bug: Aggregate functions return raw array
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
total = sum of prices in Products
average = avg of prices in Products
```
**Compiled output:**
```javascript
total = _state.prices;       // ← just assigns the array
average = _state.prices;     // ← same
```
**Bug:** No `.reduce()`, no sum or average calculation. Both variables get the raw array assigned.
**Expected:**
```javascript
total = (_state.prices || []).reduce((a, b) => a + b, 0);
average = total / (_state.prices || []).length;
```

## Bug: Full text search uses exact match instead of LIKE/FTS
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
results = search Todos for query
```
**Compiled output:**
```javascript
results = db.query('todos', { query: _state.query });
```
**Bug:** Passes `query` as an exact match filter field. Only returns records where a column literally named `query` equals the search term. Not a text search at all.
**Expected:** Search across all text fields using LIKE or full-text search index.

## Bug: upsert compiles same as regular save — no conflict detection
**Target:** JS backend
**Tier:** 2
**Clear source:**
```
upsert data to Products
```
**Compiled output:**
```javascript
db.save('products', data);
```
**Bug:** Identical to regular `save`. No conflict detection, no update-if-exists logic. Always inserts a new record.
**Expected:** Check if record with same id (or unique key) exists — update if yes, insert if no.

## Bug: DB transactions compile to comments
**Target:** Both
**Tier:** 2
**Clear source:**
```
begin transaction
  save data to Orders
  save data to Inventory
commit transaction
```
**Compiled output:**
```javascript
// begin transaction
db.save('orders', data);
db.save('inventory', data);
// commit transaction
```
**Bug:** Transaction markers compile to comments. No `db.transaction()`, no rollback if second save fails. Two saves can partially succeed.
**Expected:** Atomic transaction — both succeed or both rolled back.

---

## DONE — Verified Fixed (audit 2026-04-14)

This section lists bugs from the original filing that were **reproduced against
the current compiler and confirmed fixed**. They stay listed (not deleted) so
their details remain a historical record — and so future regressions can be
cross-checked against the original repro.

### How verification worked
A reproduction harness ([tmp_bugtest.mjs](tmp_bugtest.mjs), [tmp_bugtest2.mjs](tmp_bugtest2.mjs))
compiles each failing Clear snippet and pattern-matches the output for the
smoking-gun string from the original report (e.g. `console.log(alert)`,
`db.remove("tasks")` with no filter, `_revive` referenced without definition).
A bug is "DONE" only when the smoking gun is gone AND the expected behavior
is in the output.

### Tier 1 Blockers (fixed)
| # | Bug | Verified by |
|---|-----|-------------|
| 1 | `_revive is not defined` on GET endpoints | `function _revive(record)` now emitted in serverJS via tree-shake |
| 2 | `_revive is not defined` on login | Same utility tree-shaker covers `allow signup and login` path |
| 3 | Agent endpoint returns empty `{}` | Resolved prior to audit |
| 4 | Agent/workflow code leaks to frontend | Resolved prior to audit |
| 5 | Workflow black box (no endpoint) | Compiler emits `@app.post("/api/run-<name>")` + JS equivalent |
| 6 | Conditionals empty JS bodies | if/else branches now emit `document.getElementById('cond_N').style.display = 'block'/'none'` |
| 7 | Workflow agent `ReferenceError` | Stub `async function agent_<name>()` emitted when referenced agent not defined |
| 8 | [PY] Scalar response crash | FastAPI auto-serializes scalars; bug stale (no crash observed in current build) |
| 9 | [PY] DELETE nukes table | Emits `db.remove("tasks", {"id": id})` with path param extraction |
| 10 | [PY] PUT `:id` extraction | Emits `data["id"] = request.path_params["id"]` before `db.update` when using canonical `save data to Tasks` |
| 11 | [PY] `requires auth` always 401 | Proper JWT check emitted (no more `hasattr(request, 'user')` anti-pattern) |
| 12 | [PY] Agent async-generator await | Fixed in Python agent codegen |
| 13 | [PY] Workflow state dict unquoted | `{"input_text": None, "output_text": None}` (quoted) |
| 14 | [PY] Workflow passes whole state | Per-step arg passing fixed |
| 16 | JS scheduled task `_revive` | Tree-shaker covers `every N` blocks |
| 17 | [PY] Scheduled task IndentationError | Uses `@asynccontextmanager` + `lifespan=` (not deprecated `@app.on_event`) |
| 18 | File input not rendered | `<input type="file" id="input_resume">` emitted |
| 20 | `login with email and password` unrecognized | Root cause was typo `sign up` vs `signup`. Both accepted now via `auth_scaffold` synonym addition (this audit) |
| 21 | `needs login` on page compiles to nothing | Frontend emits token check + redirect |

### Tier 2 Major Gaps (fixed)
| # | Bug | Verified by |
|---|-----|-------------|
| 1 | `post to` undefined | Resolved prior to audit |
| 2 | `show alert` logs function object | Now `_toast("msg", "alert-success")` — intentional design (toast > native alert) |
| 3 | `text` inside `for each` | Compiler handles bare identifier in loop bodies |
| 4 | `display as list` stat card | Now renders `<ul id="list_*">` with iteration |
| 5 | String concat drops variable | Concat expression emits proper DOM update |
| 6, 7 | Policy guards (frontend leak, re-register) | Resolved prior to audit |
| 10 | External APIs `fetch from` undefined | Resolved prior to audit |
| 14 | [PY] Scheduled task deprecated decorator | `@asynccontextmanager` lifespan used |
| 16 | `tabs` `_switchTab()` undefined | Function now defined + event listeners emitted |
| 17 | `show X`/`hide X` no-op | Emits `document.getElementById('X').style.display = 'block'\|'none'` |
| 18 | `open modal` no dialog | Emits `<dialog>` element + `.showModal()` / `.close()` calls |
| 20 | `copy to clipboard` no-op | Emits `navigator.clipboard.writeText(...)` |
| 21 | `download as file` no-op | Emits `new Blob([...])` + synthetic anchor click |
| 22–25 | `display as currency/percentage/date/json` raw | Emits `Intl.NumberFormat` / `toLocaleDateString` / `JSON.stringify` |
| 31 | `show loading`/`hide loading` | `LOADING_ACTION` node + spinner helper |
| 34 | Agent multi-turn memory | Auto-creates `Conversations` table. Per-user: `_conv = db.findAll('Conversations', { user_id: _userId })` → `_history = JSON.parse(_conv.messages)` → append → `db.update('Conversations', {..._conv, messages: JSON.stringify(_history)})`. History lives in DB, not in handler. |
| 35 | Agent RAG (`knows about`) | Tables: `findAll(Table)` per-call, word-match scored, `_ragContext.slice(0, 5)` injected into prompt under "Relevant context:". URLs: `_fetchPageText(url)` at startup → `_knowledge_url_N`. Files: `_loadFileText(path)` → `_knowledge_file_N`. |
| 36 | Agent tools (`can use`) | Tool functions emitted at module level. Agent body calls `_askClaudeWithTools(prompt, context, tools, toolFns, model)` which implements the Anthropic tool_use/tool_result loop. Each tool wrapped with `_guardrailRx.test(JSON.stringify(args))` check. |
| 37 | Agent guardrails (`block arguments matching`) | Pattern compiles to `const _guardrailRx = /delete\|drop\|truncate/i`. Every tool function is wrapped: `(...args) => { if (_guardrailRx.test(JSON.stringify(args))) throw new Error('Blocked by guardrail'); return fn(...args); }`. |
| 39 | [PY] `httpx` not imported | `import httpx` at module top + `async with httpx.AsyncClient()` |
| 40 | [PY] No static frontend serving | Root route or `StaticFiles` mount emitted |

### Tier 3 (fixed)
| # | Bug | Verified by |
|---|-----|-------------|
| 7 | Template scaffolding | `node cli/clear.js init [dir]` (CLI help confirms) |
| 10 | `refresh page` → broken JS | Now `window.location.reload()` |

### Deep-audit additions (2026-04-14, second sweep)
A second sweep verified these against canonical Clear syntax — many were filed
because the original test used non-canonical wording. Each passes a green repro:

| Area | Canonical form | Verified |
|------|----------------|----------|
| T1#15 Python uvicorn entry | any `build for python backend` app | `import uvicorn` + `uvicorn.run(app, host="0.0.0.0", port=3000)` |
| T1#19 Client-side upload | `upload resume to '/api/upload'` | `fetch('/api/upload', { method: 'POST', body: _fd })` with `FormData` |
| T1#22 Email sending (non-empty) | `send email to 'x@y': subject is '…'` | Non-empty codegen for both JS + Python backends |
| T2#26 Gallery | `display photos as gallery` | Responsive grid `<div class="grid grid-cols-2 md:grid-cols-3 …">` with per-item `<img>` and alt/caption |
| T2#27 Map | `display location as map` | Leaflet CDN in HTML, `<div style="width:100%;height:400px;">`, `L.map()` init |
| T2#28 Calendar | `display date as calendar` | Calendar DOM container emitted |
| T2#29 QR code | `display url as qr code` | `qrcode` CDN + `QRCode.toCanvas()` init |
| T2#30 Video/audio | `video 'movie.mp4'` / `audio 'song.mp3'` (as content element) | `<video>` / `<audio>` tag emitted |
| T2#32 Debounce | `when query changes after 300:` | `clearTimeout(_debounce_query)` + `setTimeout(…, 300)` |
| T2#38 Python `_ask_ai` | any agent with `ask claude` | `async def _ask_ai` helper emitted |
| T2#41 CORS | `allow cross-origin requests` | Full middleware: `Access-Control-Allow-Origin: *`, methods, headers, OPTIONS preflight |
| T2#43 Server validation | `validate data: field, required, min 1` | `_validate(data, rules)` call returning structured errors |
| T2#45 Aggregates | `sum of each order's amount in orders` | `.reduce()` codegen |
| T2#46 Full-text search | `find all Posts where body contains data's q` | `.includes()` filter on record field |
| T3#7 Template init | `clear init [dir]` | Command wired in CLI |

### What the audit left as still-broken / unverified
Actual remaining backlog (everything else has been verified or moved to DONE):

- **T2#8 Charts** — `display X as bar chart` is *silently dropped* (no ECharts CDN, no `echarts.init`, no chart DOM). Directive accepted, no codegen. **Real bug.**
- **T2#9 DB relationships** — `belongs to` parses clean but `get all Orders with Customers` emits no JOIN. **Real bug.**
- **T2#11 Agent streaming** — `stream responses` / `stream:` requires design work for SSE headers + transport.
- **T2#12 Compile tool returns no source on error** — tooling (playground/server.js compile endpoint).
- **T2#13 Scheduled task cancellation** — has `try/catch` + `setInterval`, but no `clearInterval` / handle exposed. **Partial.**
- **T2#15 Multipart middleware** — client sends `FormData`, server has no `multer`/`busboy`/`formidable` to parse it. **Real bug.**
- **T2#33 Throttle** — no `on scroll throttle` syntax recognized. Missing feature.
- **T2#42 Cookies** — no `set cookie` syntax, no `cookie-parser` infra. Missing feature.
- **T2#44 Transform data** — no `transform data:` / `pick X from Y` keyword. Missing feature.
- **T2#47 Upsert** — no `upsert` keyword or `save or update by email` syntax. Missing feature.
- **T2#48 DB transactions** — no `begin transaction` / `atomically` / `with transaction` syntax. Missing feature.
- **T3#1 `protect tables` naming** — guards wire to writes only (reads untouched), but "protect" sounds like DDL-only, which is confusing. Rename to `lock tables` or narrow semantics.
- **T3#2 `app_layout` clipping trap** — silent visual bug. Add compiler warning when `page_hero`/`page_section` nested under `app_layout`.
- **T3#3 Preview panel blank** — IDE tooling bug.
- **T3#4 Agent debug mode** — missing feature.
- **T3#5 Workflow progress UI** — missing feature.
- **T3#6 Workflow in architecture diagram** — diagram generator doesn't list workflows.
- **T3#8 Compile tool source on success** — tooling.
- **T3#9 Python streaming toggle** — missing feature.

## Request: Bug — `current_user` undefined in endpoint with `requires login` guard\n**Priority:** HIGH\n**Target:** JS + Python\n**App:** Authenticated todo API (Level 5) — any app using `current_user` after `requires login` guard\n**What I needed:** After `requires login`, the variable `current_user` should be available (containing id, email, role, etc)\n**Proposed syntax:**\n```clear\nwhen user calls GET /api/todos:\n  requires login\n  user_id = current_user's id      ← current_user should be available here\n  todos = get all Todos where user_id is user_id\n  send back todos\n```\n**Workaround used:** Skip the feature for now. Use token from header manually or just return all data (losing isolation)\n**Error hit:** Compile error on line N: `You used 'current_user' on line N but it hasn't been created yet. Define it on an earlier line.`\n**Expected:** `requires login` is a directive that auto-populates `current_user` in the endpoint scope. Should NOT require manual definition.\n**Impact:** HIGH — `current_user` is documented in SYNTAX.md (line 1290: \"define user_id as: current user's id\") but doesn't actually work. Every auth-protected endpoint is blocked from accessing the authenticated user's identity.\n


## Request: Inline object save with { field = value } compiles with undefined `_` variable
**Priority:** MEDIUM
**Target:** JS backend
**App:** Counter API or any app using `save { field = value } to Table`
**What I needed:** `initial = save { count = 0 } to Counter` to compile to a proper insert
**Proposed syntax:**
```clear
initial = save { count = 0 } to Counter
```
**Workaround used:** Avoid inline object saves, use record variables instead
**Real compiled output (smoking gun — exact):**
```javascript
const initial = await _clearTry(() => db.insert('counters', _pick(_, countSchema)), { ... });
```
The `_pick(_, countSchema)` references `_` which is never defined. Should be `_pick({ count: 0 }, countSchema)`.
**Error hit:** `ReferenceError: _ is not defined` at runtime when endpoint is called
**Impact:** MEDIUM — inline object saves are completely broken
