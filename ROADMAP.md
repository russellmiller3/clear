# Clear Language — Roadmap

## Goals

**1. AI builds things fast.**
Clear is the language AI writes. Short programs, readable output, deterministic compiler.
The faster Meph's write->compile->run->fix loop, the more it ships.

**2. The language is hostile to bugs.**
Catch mistakes at compile time, not runtime. Inferred types, structured errors, source maps,
deterministic output. If the compiler accepts it, it should work. Every bug class the
compiler eliminates is a class no one wastes time debugging again.

**3. Russell builds faster with fewer bugs.**
Clear should let Russell describe what he wants and get working software. Not a toy —
real apps with auth, data, AI agents, dashboards. The bar: faster than writing JS by hand,
with fewer bugs and less cognitive load.

**Future:** Other people might benefit. If Clear is good enough for Russell and Meph, it
might be good enough for others.

---

## Surface Area Rule

Not every browser API needs a Clear keyword. The language covers the primitives that show
up in most apps. The rest — geolocation, camera, microphone, speech-to-text, text-to-speech,
push notifications, service workers, drag-and-drop — are one-line `script:` calls.

Adding a keyword for each one bloats the parser, grows the test surface quadratically
(every new node type x every context it can appear in), and violates the 1:1 mapping rule
(PHILOSOPHY.md rule 11b). The bar for a new keyword: "does Meph need this in >30% of apps?"

Per PHILOSOPHY.md rule 12b: every `script:` block in a Clear app is a signal that the
language has a gap. But not every gap is worth closing with a keyword. Some gaps are narrow
enough that `script:` is the right answer permanently.

---

## What's Next

Ordered by: what unblocks the most apps, fastest.

Scored on **Speed** (how much faster does this make building?) and **Safety** (how many
bugs does this prevent?).

---

### 1 — Auth Scaffolding

`allow signup and login` — one line scaffolds /auth/signup, /auth/login, /auth/me endpoints
with password hashing, JWT tokens, and a `needs login` frontend guard.

Every real app needs auth. Right now Meph manually writes 3+ endpoints, password hashing,
JWT signing, token storage, and a frontend guard. That's the #1 source of boilerplate and
the #1 thing that breaks — too many moving parts for something that should be one line.

```
allow signup and login

page 'Dashboard' at '/':
  needs login
  heading 'Welcome back'
```

This honors the "fixes compound" principle (PHILOSOPHY.md): fix auth once in the compiler,
every app gets correct auth forever. No more Meph reinventing bcrypt + JWT per project.

**Speed:** ★★★★★  **Safety:** ★★★★★  **Effort:** 2 days

---

### 2 — DB Relationships

`belongs to`, `has many` — declare relationships between tables. CRUD operations auto-JOIN.

Every app with 2+ tables needs this. Without it, Meph writes raw queries or makes multiple
API calls and stitches data client-side. Multi-table apps are the norm, not the exception.

```
create a Posts table:
  title
  body
  author belongs to Users

create a Comments table:
  text
  post belongs to Posts
```

Automatic: GET /api/posts returns posts with author name embedded.
Automatic: GET /api/posts/1/comments returns nested comments.
Each relationship is one line in Clear, one JOIN in compiled output. 1:1 mapping preserved.

**Speed:** ★★★★★  **Safety:** ★★★★  **Effort:** 3 days

---

### 3 — Server-side Validation (fix existing)

The VALIDATE node exists but doesn't compile to real 400 responses with field-level errors.
Fix it to emit proper validation middleware that rejects bad data before it hits the DB.

```
when user calls POST /api/users sending data:
  validate data:
    name is text, required, min 1, max 100
    email is text, required
    age is number, min 0, max 150
  save data as User
  send back data status 201
```

Compiles to: check each field, collect errors, return `{ errors: [...] }` with 400 status.
Currently compiles to incomplete checks. Invalid data is the most common runtime bug in
web apps. This is "hostile to bugs" in action — make it impossible to save garbage.

**Speed:** ★★★★  **Safety:** ★★★★★  **Effort:** 1 day

---

### 4 — Aggregate Functions (fix existing)

`sum of`, `average of`, `count of` — should return a number, not the raw array.
Currently returns the unmodified array. Silent wrong values are worse than crashes.

```
total_revenue = sum of amount in Orders
average_price = average of price in Products
user_count = count of Users
```

These are already in PHILOSOPHY.md's canonical vocabulary (rule 14). They parse but
compile wrong. Quick fix, high value — every dashboard needs aggregates.

**Speed:** ★★★  **Safety:** ★★★★★  **Effort:** 0.5 days

---

### 5 — Full Text Search

`search Posts for query` should compile to LIKE '%query%' (in-memory/SQLite) or full-text
search (Supabase). Currently does exact match only — useless for real search.

```
when user calls GET /api/search sending params:
  results = search Posts for params's query
  send back results
```

**Speed:** ★★★  **Safety:** ★★★  **Effort:** 1 day

---

### 6 — WebSocket Events

`when client connects`, `broadcast to all`, `send to client` — full socket.io lifecycle.
`subscribe to` exists but the event model isn't wired up.

```
when client connects:
  send to client 'welcome'

when client sends message:
  broadcast to all message

when client disconnects:
  log 'user left'
```

Unlocks chat apps, live dashboards, multiplayer — a whole app category.

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** 2 days

---

### 7 — Agent Memory + RAG

`remember conversation context` persists chat history per user in the DB.
`knows about: Posts, Users` does keyword search before prompting (poor man's RAG).

```
agent 'Assistant' receives question:
  remember conversation context
  knows about: Products, FAQs
  response = ask claude 'Help the customer' with question
  send back response
```

Without memory, AI agents are novelty demos. With memory + RAG, they become products.

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** 2 days

---

### 8 — Agent Tool Use

`can use: lookup_user, create_ticket` binds Clear functions as Anthropic tool_use API tools.
Currently compiles to a comment. Tool use is what makes agents capable of actions, not just text.

```
define function lookup_user(email):
  set user to get first User where email is email
  return user

agent 'Support' receives question:
  can use: lookup_user
  response = ask claude 'Help the user' with question
  send back response
```

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** 2 days

---

### 9 — String Concat Bug Fix

`message = 'Hello, ' + name + '!'` drops the variable value in some contexts.
Interpolation (`'Hello, {name}!'`) works fine, but `+` concatenation sometimes produces
`undefined`. Basic correctness — silent data loss.

**Speed:** ★★★  **Safety:** ★★★★★  **Effort:** 0.5 days

---

### 10 — Python Frontend Serving

Python backends don't serve static files. The compiled HTML exists but FastAPI has no
route for `/` or static assets. Full-stack Python apps are broken in the browser.

**Speed:** ★★★  **Safety:** ★★★  **Effort:** 0.5 days

---

## Not Now

Real features, but they have workarounds. Per the Surface Area Rule, `script:` is the
right answer for niche browser APIs. Other items have existing patterns that work fine.

| Feature | Why not now |
|---------|-----------|
| **OAuth / social login** | `allow signup and login` covers 80%. OAuth is complex (passport.js, callback URLs, sessions). Do it when someone needs Google login. |
| **Agent guardrails** | System prompts already constrain agents. `must not` is nice-to-have. |
| **Cookies** | Use JWT tokens (already built) or `script:` for cookie-parser. |
| **DB transactions** | In-memory doesn't need them. SQLite has implicit transactions. |
| **Upsert** | `save` + `get first where` is a fine workaround. |
| **Soft delete** | `deleted_at` field + filter is 2 lines. Not worth a keyword. |
| **Transform data** | `filter` + `for each` covers this. |
| **Text in for-each** | Architectural — loop rendering needs a rethink. `script:` works. |
| **Geolocation** | `script: navigator.geolocation.getCurrentPosition(...)` |
| **Camera / microphone** | `script: navigator.mediaDevices.getUserMedia(...)` |
| **Speech to text** | `script: new SpeechRecognition()` — niche browser API. |
| **Text to speech** | `script: speechSynthesis.speak(...)` — niche browser API. |
| **Push notifications** | Requires service worker, VAPID keys, server infra. Too much plumbing for a keyword. |
| **Service worker / PWA** | Deployment concern, not language feature. |
| **Drag and drop** | `script:` with HTML5 drag events. Niche interaction pattern. |
| **Tooltip / popover** | DaisyUI CSS classes. Not a compiler concern. |
| **Infinite / virtual scroll** | `script:` with IntersectionObserver. Performance optimization. |
| **Skeleton loading** | DaisyUI `skeleton` class. CSS, not language. |
| **Lazy load images** | One-line compiler tweak (`loading="lazy"`), not a feature. |

---

## Speculative: RL Training Environment

Clear's deterministic compiler, structured errors, constrained action space, and built-in
test syntax make it a natural RL gym. The infrastructure is built.

**The blocker:** Without access to fine-tune or train a model, RL is academic. You can build
the gym, but if you can't train athletes in it, it's a demo.

**What's built (all serve goal #1 directly — none wasted):**
- Sandbox runner — isolated child process, timeout, memory limit, structured results
- Curriculum tasks — 20 benchmark tasks across 10 difficulty levels (63 tests)
- Structured eval API — `compileProgram()` returns JSON scores, stats, warnings
- Patch API — 11 structured edit operations = constrained action space
- Source maps — runtime errors map to Clear line numbers = rich observations
- HTTP test assertions — `call POST /path`, `expect response status` = reward function

**What would be needed:**
- Fine-tuning access to a capable model (Anthropic partnership, open-weight model, etc.)
- Reward shaping beyond pass/fail (partial credit for correct endpoints, types, etc.)
- Episode parallelism at scale (sandbox supports it, need orchestration layer)

If fine-tuning becomes accessible, Clear is uniquely positioned. Until then: prepared
position, not a product.

---

## Primitive Audit

### Complete (compiles + works)

**CORE LANGUAGE** ✅
Variables, functions (typed params, returns), loops (for-each, while, repeat),
conditionals (if/else, match/when), try/catch, break/continue, comments,
modules/imports, `script:` escape hatch.

**EXPRESSIONS** ✅
Math, comparisons, boolean logic, string interpolation, lists, records,
possessive access (`user's name`), map get/set, higher-order functions
(map/filter/apply), optional chaining (`?.`).

**WEB FRONTEND** ✅
Pages with hash routing, reactive state, text/number/choice/checkbox/textarea
inputs, buttons, sections, tabs, components, conditional UI blocks, on-change
with debounce. Display formats: table, cards, list, count, currency, percentage,
date, JSON, gallery (image grid), map (Leaflet), calendar (month grid), QR code.
Charts: line, bar, pie, area (ECharts). Toasts/alerts/notifications, show/hide
elements, loading overlays, clipboard copy, file download, video/audio players.

**BACKEND (JS + Python)** ✅
REST endpoints (GET/POST/PUT/DELETE), CRUD (in-memory/SQLite/Supabase),
JWT auth middleware, role guards, field validation, rate limiting, CORS,
request logging, webhooks, multer file uploads, external API fetch
(timeout/cache/fallback), email (nodemailer/SMTP), PDF generation, shell
command capture, server-sent events.

**DATA** ✅
Tables with types/constraints/defaults, CSV load/save, filter, group by,
count by, unique values, JSON parse/stringify, regex find/match/replace,
date/time operations.

**AI / AGENTS** ✅
Agent definitions, `ask claude` with streaming, structured JSON output
(schema enforcement), agent pipelines, parallel agents, skills, human
confirmation gates, mock AI for testing, model selection.

**WORKFLOWS** ✅
Multi-step workflows, state management, conditional steps, repeat-until,
parallel steps, auto-generated endpoints, progress tracking.

**FILE I/O** ✅
Read/write/append/exists, JSON parse/stringify, regex find/match/replace,
date/time operations, file upload (multer).

**SCHEDULING** ✅
`every N minutes`, `every day at 9am`, error handling (try/catch wrapping),
Python lifespan context manager.

**TESTING** ✅
Test blocks, HTTP assertions (`call POST /path`, `expect response`),
mock AI, sandbox runner, structured eval API.

### Partial

**REAL-TIME** ⚠️
SSE streaming ✅, background jobs ✅, wait/sleep ✅, subscribe to channel ✅.
Missing: `when client connects/disconnects`, `broadcast to all`, `send to client`.

### Gaps (prioritized — see What's Next above)

| # | Gap | Status |
|---|-----|--------|
| 1 | Auth scaffolding (`allow signup and login`) | **✅ Complete** |
| 2 | DB relationships (`belongs to`, `has many`) | **✅ Complete** (`belongs to` done, `has many` deferred) |
| 3 | Validation → real 400 errors | **✅ Complete** |
| 4 | Aggregates (`sum of` → number) | **✅ Complete** |
| 5 | Full text search | Exact match only |
| 6 | WebSocket lifecycle events | Not parsed |
| 7 | Agent memory / RAG | Parsed, compiles to comment |
| 8 | Agent tool use (`can use:`) | Parsed, compiles to comment |
| 9 | String `+` concat bug | Parsed, drops values |
| 10 | Python frontend serving | No static routes |

---

## Stats

- **146 node types** defined in parser
- **1699 compiler tests**, 0 failures
- **9 sandbox integration tests**
- **~241 playground tests** (server, e2e, IDE, agent)
- **Zero npm dependencies** in the compiler
- **Targets:** JS (Express), Python (FastAPI), HTML (DaisyUI + Tailwind v4)
