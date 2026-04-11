# Clear Language — Roadmap

## The Two Goals

**1. AI builds things fast.**
Clear is the language AI writes. Short programs, readable output, deterministic compiler,
rich standard library. The faster the write→compile→run→fix loop, the more AI can do.

**2. Exciting RL environment.**
Clear is a natural code RL gym. The compiler is the simulator — deterministic, fast, zero
noise. The test system is the reward function. The error messages are the observation.
The templates are starting states. The action space is constrained (English keywords, not
arbitrary text), which makes exploration tractable. No other language has all four.

---

## What's Done (Phases 1–100)

Full-stack CRUD, agents, workflows, streaming, SQLite, auth, rate limits, policies,
WebSockets, ECharts charts, DaisyUI landing pages, CodeMirror IDE, playground server,
Claude agent chat, general-purpose language (types, HOFs, maps, interpolation),
npm imports, shell commands. **P1** inferred type system (compile errors on text-in-math).
**P2** structured eval stats (`compileProgram()` returns `stats{}`). **P3** source maps
(`_clearLineMap` + per-statement `// clear:N` markers + stack trace translation in
`_clearError`). **P4** sandbox runner (`sandbox.js` — isolated child process, HTTP test
assertions, parallel RL episodes). **P5** HTTP test assertions in Clear (`call POST /path`,
`expect response status/body`). User-written test blocks compile into E2E test file.
**P6** curriculum task library — 20 benchmark tasks across 10 difficulty levels (63 tests).
**P7** program diff/patch API (`patch.js`) — 11 structured operations for RL action space.
**P10** cron/scheduled tasks (`every N minutes:`, `every day at 9am:`).
**P14** output capture from commands (`result = run command 'cmd'`).
Also: optional chaining (`?.`) for null-safe property access, `_pick` auto-serializes
nested JSON for SQLite, `_revive` auto-parses JSON strings, keyword guard for better
error messages, chain depth + expression complexity warnings, `write_file` supports
non-`.clear` extensions, multiline `run command:` blocks.
Tree-shaker detects callback references (`.map(_revive)`), conditional UI blocks trigger reactive path with DOM visibility toggles, `show alert`/`notification` compile to toast, `text variable` works in loops, string concatenation in `text` renders to DOM, `display as list` renders `<ul>` iteration. Studio SVG diagrams render inline in chat.
1640 compiler tests + 9 sandbox tests.

---

## Priority Queue

Ordered by: (RL value × AI speed value). Things that serve both goals score highest.

---

### P1 — Inferred Type System

**What:** `price = 'hello'` then `price * 1.08` = compile error. 100% inferred, zero annotations.

**Why AI:** AI makes type mistakes constantly. Catching them at compile time instead of
runtime saves a full round-trip. Right now a type bug in Clear silently produces NaN or
crashes at runtime — AI has to re-run to discover it.

**Why RL:** Clean reward shaping. The type checker is a partial evaluator — it tells the
agent "this is wrong" before execution. Tighter feedback loop = faster learning. Also
makes the observation space richer: warnings are structured signals, not just pass/fail.

**Shape:**
```
price = 'ten dollars'
total = price * 1.08      # compile warning: price looks like text, not a number
```

**Effort:** 3 days. Track inferred types per variable, propagate through assignments,
flag arithmetic on strings and string operations on numbers.

---

### P2 — Structured Test Evaluation API

**What:** A machine-readable eval protocol. `compileProgram()` already returns errors/warnings.
Extend it to return: test results, coverage (which endpoints have tests), type warnings
with locations, complexity score (lines, nodes, endpoints).

**Why AI:** AI agents need a fast "did I succeed?" signal without parsing text.
Right now they read stdout. Give them a JSON score instead.

**Why RL:** This IS the reward function. Episode ends → call eval API → get score.
Reward = tests_passed / tests_total + (1 if no errors else 0) + type_coverage_bonus.
No eval API = no RL.

**Shape (return value from compileProgram):**
```js
{
  ok: true,
  errors: [],
  warnings: [{ line: 4, message: 'price looks like text used as number' }],
  stats: {
    endpoints: 3,
    tables: 2,
    tests: { total: 5, defined: 5 },
    lines: 47,
    nodes: 83
  }
}
```

**Effort:** 1 day. Most data already computed — just surface it.

---

### P3 — Source Maps

**What:** Runtime JS errors map back to Clear line numbers. `clear:LINE` comments already
exist in compiled output. Need to catch runtime errors and translate stack traces.

**Why AI:** Right now when a Clear app crashes at runtime, the error says line 142 of
server.js. AI has to mentally map that back to Clear. Source maps make errors actionable
without the mental translation step.

**Why RL:** The observation after a failed episode includes "error at Clear line 7" instead
of "error at compiled JS line 142". That's a dramatically better signal for the agent —
it knows exactly where to focus the next edit.

**Shape:**
```
ClearRuntimeError: Cannot read property 'id' of undefined
  at Clear line 12: result = db's first User where id is user_id
```

**Effort:** 1 day. Parse `// clear:N` comments from stack frames.

---

### P4 — Sandbox Runner

**What:** Isolated execution environment for compiled Clear apps. Runs in a child process
with timeout, memory limit, captures stdout/stderr/exit code, returns structured result.

**Why AI:** Claude agents in the playground already run apps, but it's the main Node
process. For parallel evaluation, you need isolated sandboxes that can't crash each other.

**Why RL:** The core environment primitive. An RL episode is:
1. Agent writes Clear code
2. Sandbox compiles + runs it
3. Sandbox runs tests against it
4. Returns structured reward

Without sandbox isolation you can't run N parallel episodes. With it, you can run 100.

**Shape:**
```js
const result = await sandbox.run(clearSource, {
  timeout: 5000,
  tests: [{ method: 'GET', path: '/api/health', expect: { status: 200 } }]
});
// result: { ok, exitCode, stdout, stderr, testResults: [{passed, actual, expected}] }
```

**Effort:** 2 days. child_process.fork + timeout + structured test runner.

---

### P5 — HTTP Test Assertions in Clear ✅ DONE

**What:** Test blocks that make real HTTP calls against the running app.

**Why AI:** AI can write tests that verify the app actually works, not just that it compiles.
A test that hits `/api/users` and checks the response is 10x more valuable than a test
that checks a pure function.

**Why RL:** Higher-fidelity reward. "Endpoint returns 200 with correct shape" is a much
better reward signal than "program compiled." Agents learn to build working APIs, not
just syntactically valid ones.

**Shape:**
```
test 'create user':
  call POST /api/users with name is 'Alice', email is 'alice@test.com'
  expect response status is 201
  expect response body has 'id'

test 'list users':
  call GET /api/users
  expect response status is 200
  expect response body length is greater than 0
```

**Effort:** 2 days. Parser + compiler for `call METHOD /path with body`, `expect response`.

---

### P6 — Curriculum Task Library ✅ DONE

**What:** A standard set of benchmark tasks with ground-truth acceptance criteria. Each task
is: a description, a starting skeleton, and a set of tests that define "done."

**Why AI:** Gives Claude concrete tasks to work on in the playground without Russell having
to come up with them. "Build a todo API" → agent writes Clear → tests run → score.

**Why RL:** This is the training set. Tasks ordered by difficulty = curriculum learning.
Without a task library, RL is just free exploration — agents don't get better at anything
in particular.

**Sample tasks (ordered by difficulty):**
```
Level 1 — Hello World
  Write a GET /api/hello endpoint that returns { message: 'hello world' }

Level 2 — Echo
  Write a POST /api/echo that returns whatever body was sent

Level 3 — Counter
  GET /api/count returns current count
  POST /api/increment increases it by 1

Level 4 — Todo CRUD
  Full create/read/update/delete for a Todo table

Level 5 — Authenticated Todo
  Same, but requires login. Only your own todos visible.

Level 6 — Blog with search
  Posts table, full-text search endpoint, pagination

Level 7 — Rate-limited API
  Any endpoint, but max 10 requests/minute per IP

Level 8 — Multi-tenant workspace
  Users belong to workspaces. Data scoped to workspace.
```

**Effort:** 2 days. Write 20 tasks + test suites. No new compiler work.

---

### P7 — Program Diff / Patch API ✅ DONE

**What:** Structured edits to a Clear program. Instead of AI rewriting the whole file,
it can say "add endpoint POST /api/users" or "change field 'name' to required."

**Why AI:** Faster iteration. Smaller context window usage. AI doesn't have to regenerate
unchanged code on every turn.

**Why RL:** Defines the action space cleanly. Episode = sequence of patch actions.
`add_endpoint`, `add_field`, `change_response`, `add_test`, `fix_line N`. Much more
tractable than "generate the whole program from scratch."

**Shape:**
```js
patch(source, [
  { op: 'add_endpoint', method: 'POST', path: '/api/users', body: '...' },
  { op: 'add_field', table: 'User', field: 'email', type: 'text', required: true },
  { op: 'fix_line', line: 7, replacement: "  send back user" }
])
```

**Effort:** 3 days. AST-level patch operations on the parsed program.

---

### P8 — WebSocket / Real-Time

**What:** `when client connects:` / `broadcast to all:` / `send to client:` primitives.

**Why AI:** Chat apps, live dashboards, multiplayer — all blocked without this.
Currently AI can only build request/response APIs.

**Why RL:** Adds a new category of tasks (real-time apps) to the curriculum.
Richer task space = more interesting RL problem.

**Shape:**
```
when client connects:
  send to client 'welcome'

when client sends message:
  broadcast to all message

when client disconnects:
  log 'user left'
```

**Effort:** 2 days. socket.io on the backend, event listener syntax in parser.

---

### P9 — File Upload / Download

**What:** `receive file from request`, `save file to 'uploads/'`, `send back file at path`.

**Why AI:** Image uploads, CSV processing, PDF generation — all blocked without this.

**Why RL:** New task category: file processing pipelines.

**Shape:**
```
when user calls POST /api/upload sending file:
  save file to 'uploads/'
  send back file's name
```

**Effort:** 2 days. multer integration, file path handling.

---

### P10 — Cron / Scheduled Tasks ✅ DONE

**What:** `every day at 9am:` / `every 5 minutes:` blocks that run on a schedule.

**Why AI:** Digest emails, cleanup jobs, daily reports — all blocked without this.
Common in every real app.

**Why RL:** Tasks with temporal reasoning ("send a report every morning") become possible.

**Shape:**
```
every day at 9am:
  all_users = look up all Users
  for each user in all_users:
    send email to user's email with subject 'Daily digest'

every 5 minutes:
  clean up Sessions where created_at is less than 24 hours ago
```

**Effort:** 2 days. node-cron integration, cron expression parser.

---

### P11 — Built-in Email ✅ DONE (already implemented)

**What:** `send email to 'x@y.com' with subject 'Hi' and body '...'` — first-class,
not via npm.

**Why AI:** Email is in almost every real app. Requiring `use npm 'nodemailer'` + script:
blocks is too much friction.

**Why RL:** Tasks like "send confirmation on signup" become testable without npm ceremony.

**Shape:**
```
send email to user's email with subject 'Welcome!' and body 'Thanks for signing up.'
```
Compiles to nodemailer with SMTP_URL from env. `clear package` includes nodemailer.

**Effort:** 1 day. New node type + compiler case + env var convention.

---

### P12 — OAuth / Social Login

**What:** `allow login with Google`, `allow login with GitHub` — one line, full OAuth flow.

**Why AI:** Auth is the #1 thing people actually need in real apps.
JWT auth exists, but social login is what users expect.

**Why RL:** Adds an auth-layer task category to the curriculum.

**Shape:**
```
allow login with Google
allow login with GitHub

when user calls GET /api/me:
  require login
  send back current user
```

**Effort:** 3 days. passport.js + callback routes + session management.

---

### P13 — Streaming Responses (AI output)

**What:** `stream back text` for server-sent events. Lets Clear apps stream OpenAI
responses to the browser in real time.

**Why AI:** Every AI integration needs streaming. Without it, users wait for the full
response before seeing anything.

**Why RL:** Enables AI-assistant tasks in the curriculum ("build a streaming chat endpoint").

**Shape:**
```
use npm 'openai' as OpenAI

when user calls POST /api/chat sending params:
  client = OpenAI(env('OPENAI_KEY'))
  script:
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: params.message }],
      stream: true,
    });
    res.setHeader('Content-Type', 'text/event-stream');
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.end();
```
(This works today via `script:`. Native syntax would be `stream back from openai`.)

**Effort:** 1 day for native syntax sugar on top of existing script: support.

---

### P14 — Output Capture from Commands ✅ DONE

**What:** `result = run command 'git log --oneline'` — capture stdout as a string.

**Why AI:** Shell pipelines that feed data into the app. Run a scoring script, capture
the result, make a decision based on it.

**Why RL:** Enables tasks that involve external tools as part of the pipeline.

**Shape:**
```
log = run command 'git log --oneline -10'
send back log
```

**Effort:** Half a day. Two codepaths in the compiler: statement → `stdio: inherit`,
expression → `{ encoding: 'utf-8' }` with variable binding.

---

## The RL Architecture (when ready)

```
┌─────────────────────────────────────────────────────┐
│                   RL Training Loop                   │
│                                                       │
│  Task from curriculum  ──▶  Agent (LLM)              │
│         ▲                        │                   │
│         │                        ▼                   │
│    Reward signal          Clear program              │
│         ▲                        │                   │
│         │                        ▼                   │
│   Eval API score  ◀──  Sandbox runner                │
│  (tests pass/fail,       (compile + run +             │
│   warnings, complexity)   HTTP tests)                │
└─────────────────────────────────────────────────────┘
```

**Episode:**
1. Agent receives task description + optional skeleton
2. Agent writes (or patches) a Clear program
3. Sandbox compiles, runs, fires HTTP tests
4. Eval API returns structured score
5. Reward = tests_passed / total + type_clean_bonus - warning_penalty
6. Agent sees score + error messages → next action

**Why Clear beats Python/JS for RL:**
- Deterministic compiler = no reward noise from different-but-equivalent programs
- Constrained vocabulary = tractable action space
- Built-in test syntax = reward function is IN the language
- Short programs = small state/action space
- Error messages are structured = rich observation

---

## Order Summary

| # | Feature | Effort | RL Value | AI Speed | Status |
|---|---------|--------|----------|----------|--------|
| P1 | Inferred type system | 3d | ★★★★★ | ★★★★★ | ✅ Done |
| P2 | Structured eval API | 1d | ★★★★★ | ★★★★ | ✅ Done |
| P3 | Source maps | 1d | ★★★★ | ★★★★★ | ✅ Done |
| P4 | Sandbox runner | 2d | ★★★★★ | ★★★ | ✅ Done |
| P5 | HTTP test assertions | 2d | ★★★★★ | ★★★★ | ✅ Done |
| P6 | Curriculum task library | 2d | ★★★★★ | ★★★ | ✅ Done |
| P7 | Program diff/patch API | 3d | ★★★★ | ★★★★ | ✅ Done |
| P8 | WebSocket / real-time | 2d | ★★★ | ★★★★ | ✅ Done (pre-existing) |
| P9 | File upload/download | 2d | ★★★ | ★★★★ | ✅ Done (pre-existing) |
| P10 | Cron / scheduled tasks | 2d | ★★★ | ★★★★ | ✅ Done |
| P11 | Built-in email | 1d | ★★★ | ★★★★★ | ✅ Done (pre-existing) |
| P12 | OAuth / social login | 3d | ★★ | ★★★★ | |
| P13 | Streaming responses | 1d | ★★★ | ★★★★ | Partial (STREAM node exists) |
| P14 | Output capture | 0.5d | ★★ | ★★★ | ✅ Done |
