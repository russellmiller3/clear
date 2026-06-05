# Clear — What You Can Build

Clear is a programming language for building real web apps in plain English. One `.clear` file, or a small project of imported `.clear` files, gives you a database, a server, a browser UI, and an AI assistant — no configuration, no boilerplate, no framework to learn.

## Jump to a use case

- [Data Apps (CRMs, Deal Desks, Dashboards)](#data-apps-crms-deal-desks-dashboards)
- [Approval Workflows](#approval-workflows)
- [AI Agents and Assistants](#ai-agents-and-assistants)
- [Real-Time Apps (Chat, Live Updates)](#real-time-apps-chat-live-updates)
- [Edit Your Live App While People Are Using It](#edit-your-live-app-while-people-are-using-it)
- [Safety Built In — Not Bolted On](#safety-built-in--not-bolted-on)
- [Provable Business Rules](#provable-business-rules)
- [Studio — The Browser IDE + AI Builder](#studio--the-browser-ide--ai-builder)

## Jump to the reference tables

**Language**
- [Core Language](#core-language)
- [Expressions](#expressions)

**Apps you can build**
- [Web Frontend](#web-frontend)
- [Backend (JS + Python)](#backend-js--python)
- [Database & CRUD](#database--crud)
- [Service Integrations](#service-integrations-service_call)
- [Data Operations](#data-operations)

**AI**
- [AI Agents](#ai-agents)
- [Workflows](#workflows)
- [Routing](#routing)

**Workflow primitives**
- [Approval Queues](#approval-queues)
- [Scheduling](#scheduling)
- [Testing](#testing)
- [Policies (App-Level Guards)](#policies-app-level-guards)

**Tooling and shipping**
- [Studio IDE](#studio-ide)
- [Live App Editing](#live-app-editing-lae--phase-a--b-shipped)
- [Clear Cloud](#clear-cloud-buildcleardev--login--multi-tenant-runtime)
- [Developer Tooling](#developer-tooling-dave-first-wedge--shipped-2026-04-24)

**Compile targets**
- [Compile Targets](#compile-targets)
- [Compiler Guarantees](#compiler-guarantees--bug-classes-eliminated-at-compile-time)

**What you can build**
- [Apps by Tier](#what-you-can-build)
- [Not Building (and Why)](#not-building-and-why)

---

## Data Apps (CRMs, Deal Desks, Dashboards)

A table of records, a form to add them, filters and charts to understand them. Declare the table, the page, and the display in one block — Clear generates the server, the database, and the browser UI, including a search bar on every table, sortable columns, and a right-side detail panel when you click a row.

```clear
create a Deals table:
  customer
  list_price (number)
  discount_percent (number)
  status is 'pending'

page 'Deals' at '/deals':
  display deals as table showing customer, list_price, status
```

Add `allow signup and login` and each user only sees their own records. Add `database is shared with tenant scope` and each company only sees their own data — auto-enforced at the database layer.

---

## Approval Workflows

A deal needs VP sign-off. An IT request needs manager review. A refund needs a second pair of eyes. Clear has a built-in approval primitive: declare the queue, the approver, and the notification — Clear generates the queue page, the action buttons, the email alerts, and the audit trail.

```clear
queue for deal:
  pending review by 'vp@company.com'
  on approve: send email to deal's rep subject 'Approved — {deal's customer}'
  on reject: send email to deal's rep subject 'Rejected' body 'Reason: {reason}'
```

Every approval action writes to an audit log. The VP gets a login-gated review page. The rep gets an email. The compliance buyer gets a paper trail that answers "who approved deal #47, when, and why."

---

## AI Agents and Assistants

Ask Claude a question in one line. Give an agent tools — the ability to look up records, send emails, or call your own functions — and it becomes an AI assistant that knows your data. Agents can remember conversations across sessions, run on a schedule, and chain into multi-step pipelines.

```clear
agent 'Deal Drafter' receives deal:
  has tool: look up Customer from Customers where id is deal's customer_id
  response = ask claude 'Write a one-paragraph summary for this deal: {deal}'
  send back response
```

Clear handles retries on rate limits, responses that arrive word by word, and routing between tools. You write what the agent should do; Clear handles the plumbing.

---

## Real-Time Apps (Chat, Live Updates)

Subscribe to a data source and every browser updates automatically when the data changes. Build a live chat room in six lines — scrolling history, typing indicator, and message input included.

```clear
when user sends message to /api/chat:
  save message as new Message
  broadcast to all: message

page 'Chat' at '/':
  display messages as chat
  'Message' is a text input saved as message that sends to '/api/chat'
```

---

## Edit Your Live App While People Are Using It

Your app is deployed. Marcus is using it. He needs to add a field. In most tools: database migration, coordinated restart, hope nothing breaks mid-request. In Clear: Marcus types a plain-English request into a widget pinned to his running app, reviews the proposed change, and clicks Ship. The change is live in about three seconds. No terminal. No downtime.

Additive changes (new field, new page, new route) ship with one click — they can't break existing data. Destructive changes (removing a field) require typing a confirmation phrase, writing a reason, and clicking a red button — and an audit row is written before anything ships.

```clear
owner is 'marcus@acme.com'
```

One line enables the editing widget for the owner. Everyone else sees nothing.

---

## Safety Built In — Not Bolted On

The Clear compiler refuses to generate code with the OWASP Top 10 vulnerabilities. Five guarantees apply to every app, automatically:

- **Per-row ownership** — `the deal's creator can read, change, or delete`. No stolen session can access another user's records. Auto-injected on every read, write, update, and delete.
- **Sensitive fields encrypted at rest** — `ssn is text, sensitive`. AES-256 encryption, per-row. The app refuses to start if the encryption key is missing.
- **No SQL injection possible** — every database operation uses parameterized queries by construction. There is no way to write a Clear app that puts user input directly into a SQL query.
- **Login brute-force throttled automatically** — when you add `allow signup and login`, the app rate-limits login attempts to 10 per minute per IP address, with no extra code.
- **Hardcoded secrets fail to compile** — paste an API key directly into your source and you get a compile error suggesting the right environment variable.

For multi-customer SaaS, `database is shared with tenant scope` auto-injects the tenant filter on every database operation — plus generates Postgres row-level security policies so that even a future bug can't leak one customer's data to another.

---

## Provable Business Rules

Write a named rule, prove it holds for every possible input, hand the PDF to your compliance buyer.

```clear
rule discount-cap-thirty:
  enforce that deal's discount_percent is less than 30,
    or fail with error message: 'Discounts of 30%+ require VP approval'
```

`clear prove deal-desk.clear` returns: **"discount-cap-thirty PROVED for every possible deal."** Not "we tested it." Proved, as a mathematical guarantee, for every input that could ever exist. The proof downloads as a PDF ready for an auditor.

Agent rules work the same way: `prove that agent 'Refund Bot' cannot call charge_card` — PROVED if that action is unreachable from the agent's tool list, DISPROVED with the exact call chain if it is.

---

## Studio — The Browser IDE + AI Builder

Open Clear Studio at `http://localhost:3456`. Three panels: a code editor, a live preview of your running app, and a chat with Meph — Clear's built-in AI app builder.

Meph writes Clear code, builds the app, runs tests, and fixes errors. For complex apps, Meph first writes a structured checklist of requirements and waits for your approval before touching any code. After building, a checking system called Ralph audits the result against those approved requirements and blocks Meph from declaring "done" if the evidence doesn't match — no more AI that says it's done but isn't.

Thirteen template apps in the dropdown. One-click deploy to Fly.io. Rollback to any of the last 20 versions from inside the IDE. Multi-file projects load through the same file picker: Studio shows files, imports, and components, lets you switch between them, and compiles the main file with imported modules in memory.

---

## Reference Tables

The tables below cover every feature in the language with exact syntax. Jump to the section you need using the navigation at the top of this file.

---

## Core Language

| Feature | Syntax | Notes |
|---------|--------|-------|
| Variables | `x = 5` / `name is 'Alice'` | `=` for numbers, `is` for strings/booleans |
| Functions | `define function greet(name):` | Typed params (`is number`), typed returns |
| For-each loop | `for each item in items:` | Also `for each key, value in map:` |
| While loop (auto-bounded) | `while count is less than 10:` / `while cond, max N times:` | Default cap 100 iterations (tight — fail fast on hallucinated hangs); overflow throws a legible error (PHILOSOPHY Rule 18) |
| Recursive function (depth-capped) | `define function walk(n): ... walk(n - 1) ...` / `define function walk(n) max depth 50:` | Default depth 1000; override with `max depth N`; exceed → `"X recursed more than N levels"` throw |
| Send email with timeout | `send email to 'x@y.c': subject 'hi' body 'hi' with timeout 60 seconds` | Default 30s; applies on JS (Promise.race) + Python (smtplib timeout) |
| AI calls auto-retry | `reply is ask claude 'hi'` | Retries 429/5xx/network transients with 1s/2s/4s exponential backoff across Node/CF/browser/Python |
| Repeat loop | `repeat 5 times:` | |
| If / else | `if x is 5:` ... `otherwise:` | Also inline: `if x is 5 then show 'yes'` |
| Match / when | `match x:` + `when 'a':` + `otherwise:` | Pattern matching |
| Try / catch | `try:` + `if error:` | Typed handlers: `if error 'not found':` (404) |
| Live block (optional effect fence) | `live:` + indented body | OPTIONAL visual label for code that talks to the world (`ask claude`, `call API`, `subscribe to`, timers). The compiler does NOT require it — the prover infers purity automatically. Use only when a regulated-tier auditor wants to see "where do effects happen?" at a glance. (Earlier "Phase B-2 will require it" plan was dropped 2026-05-06 as ceremony with no real benefit.) |
| Break / continue | `stop` / `skip` | |
| Comments | `# text` | |
| Modules | `import tables.clear` / `import helpers.clear as helpers` / `import double from helpers.clear` / `import npm 'stripe' as stripe` | Canonical: `import` (with `include` as silent alias). Inline-all (default), namespaced (`as <alias>`), selective (`NAME from PATH`), or npm. `use` was retired from the import grammar on 2026-05-13 and is reserved for future config syntax. |
| Script escape | `script:` + raw JS | For anything Clear doesn't cover |
| Transactions | `as one operation:` / `atomically:` / `transaction:` / `begin:` | BEGIN/COMMIT/ROLLBACK |
| Provable correctness — concrete | `clear prove <file>` | Walks the AST directly (no compiler in the path); proves every `test` block's assertions hold for the inputs given. Pure-subset only — anything impure (DB/net/AI/time/UI) returns UNVERIFIABLE instead of false PROVED. **Conditional rules supported (PC-2, 2026-05-04):** a rule whose enforce calls live inside `if/otherwise` branches now proves cleanly; the engine recurses into both branches under the right path-constraint assumption (THEN evaluates under "condition is true," OTHERWISE under "condition is false") and combines the verdicts. Tiered policies — enterprise vs SMB caps, paid vs unpaid invoice rules, expansion vs new-logo discount limits — all read PROVED. |
| Provable correctness — symbolic | Free variables in a `test` block | Triggers symbolic mode automatically: variables become forall-quantified placeholders; simplifier rewrites both sides into canonical form; equality decided structurally. Proves theorems like `add(a, b) === add(b, a)` for ANY input. Honest UNKNOWN when the simplifier can't decide. |
| Provable correctness — Studio button | `Prove` button in the toolbar (next to `Compile`) | Same engine as `clear prove`; posts source to `/api/prove`, renders the formatted bundle into the terminal pane, status bar shows proved/failed/unverifiable counts. Click-to-prove from the IDE without leaving Studio. |
| Provable correctness — `clear test` auto-prove | Default behavior of `clear test <file>` | Every test session also runs the prover. Appends a CRO-readable line at the bottom (e.g. `3 of 4 rules proved, 1 unverifiable`). Opt out with `--no-prove`. Under `--json`, the bundle ships in the same envelope as test results. PC-8 + business-language default, 2026-05-02. |
| Named, provable business rules | `rule <name>:` + indented body | Top-level labeled wrapper around guard/validate/if statements that names a business rule. Body parses with the same statement parser as endpoints. The prover walks every `rule_def` and produces a per-rule verdict — `proved`, `disproved`, `unverifiable` — attributed by name. `clear prove` and `clear test --prove` render a "Business rules in this file:" section so auditors and CROs see verdicts like "discount-cap-thirty PROVED for every possible deal" instead of "line 42: PROVED." Regulated-tier pitch surface. 2026-05-02. |
| Provable correctness — `clear prove` (default = CRO output) | `node cli/clear.js prove <file.clear>` | Walks the prover and prints results in plain English — "We proved 3 of 3 named rules in this app, for every possible deal." Math-journal output behind `--math`. JSON unchanged behind `--json`. The default is the customer-facing surface; `--math` is for prover engineers. 2026-05-02. |
| Provable correctness — business-language translator | `lib/proof-business-language.mjs` (importable) | Translates the prover's verdicts into sentences a CRO or compliance buyer can read. PROVED → "We proved: <test_name>, for every possible <vars>." UNVERIFIABLE → "<test_name> talks to the world (database / email / AI / time)." FAILED → "Counterexample found." Headline summarises the bundle in plain English. `clear prove` and `clear test --prove` both invoke it as the default formatter. 27 tests passing. 2026-05-02. |
| Provable correctness — distributivity (PC-1) | Implicit, in `lib/prover/symbolic.js` | The simplifier expands `k * (a + b)` to `k*a + k*b` for numeric operands (cartesian-product expansion via `expandDistribution()`). FOIL-style for multi-sum products: `(a+b)*(c+d) → a*c + a*d + b*c + b*d`. Soundness gate: untyped `+` (could be string concat) is preserved as-is. Turns linear-formula proofs (commission, tax, discount-stack math) from UNKNOWN into PROVED. The fixed-point `simplify()` loop re-collects like terms after expansion so round-trips stay canonical. 6 new tests, all green. 2026-05-02. |
| Provable correctness — proof bundle artifact (PC-4) | `apps/deal-desk/proof.json` (machine-readable) | Drop-in evidence file the agent regenerates on every rule edit (`clear prove apps/deal-desk/main.clear --json > apps/deal-desk/proof.json`). Lists each named rule with verdict (`proved`, `disproved`, `unverifiable`) and source line. The regulated-tier pitch surface: hand a CFO / compliance buyer a JSON document that says "3 of 3 rules PROVED for every possible deal" — no other internal-tools platform can produce one. Pitch line + when-to-use guidance lives in GTM.md "Asset 4." 2026-05-02. |
| Provable correctness — runtime witness | `node lib/prover/runtime-witness.test.js` | The "trust but verify" bridge for every PROVED rule. For each rule shape, the harness compiles the source, spawns the compiled JavaScript app on a free port, sends 20 inputs that VIOLATE the rule's condition, and asserts every one comes back as a 403 rejection with the rule's name in the JSON body. Converts "PROVED for every possible deal" from a math claim into a measured claim ("we sent 60 violating inputs across 3 rules; every one was rejected with the rule name in the response"). Pairs with a compiler emit change so every rule rejection carries `{ "error": "<msg>", "rule": "<name>" }` — audit trail per rejection. 2026-05-02 evening. |
| Provable correctness — per-rule entity detection | Implicit in `clear prove` output | Each rule's "PROVED for every possible <X>" sentence reads the entity name from the rule's first guard expression — `lead's email` makes the entity `lead`, `deal's discount` makes it `deal`. Rules with no field reference (constant tautologies) fall back to "every possible input" rather than lying. The headline noun comes from PROVED rules only, so misleading local variables (e.g. `found = look up Deal where ...`) don't pollute the consensus. 2026-05-03. |
| Provable correctness — agent-bounded rules | `bounds_agent_output: true` flag on PROVED verdicts | When a `rule:` fires AFTER an agent invocation (`call 'X' with Y` or `ask claude '…'`) in the same body AND every called agent is output-only (no tools), the prover marks the verdict with `bounds_agent_output: true`. Translator output: *"PROVED for every possible deal — the agent's return value cannot bypass this rule (the rule fires after the agent returns; for tool actions, use `must not:` on the agent)."* Tool-using agents (any `has tool: ...` in the agent definition) DROP the bounds claim because tool calls during agent execution can mutate state before the rule fires — the rule guards return value, not side effects. Detection: `collectRuleDefs` (sibling walk) + `containsToolUsingAgent` (AST lookup against agent definitions). 4 tests in `lib/prover/index.test.js`. 2026-05-07 (sharpened same day after Russell flagged the misleading "agent output" framing). |
| Provable correctness — agent tool-bound claims (Direct) | `prove that agent 'X' cannot call <fn>` | Top-level proof obligation. The prover walks the agent's static tool closure (own `has tools:` entries plus the recursive `uses skills:` closure) and emits PROVED iff `<fn>` is not in the closure; DISPROVED with the exact path that brings it in (e.g. `agent 'Refund Bot' → uses skills: 'Billing' → has tool: charge_card`). Soundness: Clear's tool-use loop is closed-world — `_askAIWithTools` (`compiler.js`) only honors functions in the compile-time-built `_toolFns` dict, with an "Unknown tool" fallthrough for anything else. So the static closure IS the runtime dispatch surface. The pitch: a CRO can write *"prove that agent 'Refund Bot' cannot call charge_card"* and run `clear prove` to get a mathematical guarantee in the audit bundle. 2026-05-07. |
| Provable correctness — agent tool-bound claims (Transitive) | `prove that agent 'X' cannot delete from <Entity>` / `prove that agent 'X' cannot modify <Entity>` | Top-level proof obligation. The prover walks the agent body PLUS every reachable tool body (transitively, following function calls) for matching CRUD ops: `delete` matches `remove`; `modify` covers `save` / `remove` / `upsert` / `update`. PROVED iff no reachable code touches `<Entity>` with a matching op; DISPROVED with the call chain (e.g. `agent 'Admin Bot' → has tool: deactivate → function force_remove() → remove User @ line 14`). UNVERIFIABLE if a reachable tool's body is missing (not in this file). Singular/plural entity names are accepted on either side (`Users` ↔ `User`). The Marcus pitch: *"prove that agent 'Refund Bot' cannot delete from Deals"* — directly addresses the Replit-class incident, a CRO-readable claim that survives an audit. 2026-05-07. |
| Provable correctness — agent tool-bound claims (Symbolic argument bound) | `prove that agent 'X' cannot call <fn> with <arg> <comparison> <value>` | The deepest formal-verification flavor. Uses Clear's existing symbolic prover (`lib/prover/symbolic.js`) — the same engine that proves business rules — to bound what arguments could possibly be passed at every call site. For each reachable static call to `<fn>`, looks up which positional argument corresponds to `<arg>` from the function's params, evaluates that arg expression with free symbolic variables for everything Claude could control, and checks satisfiability of the constraint. PROVED iff every reachable call passes a value the symbolic engine can prove cannot satisfy the constraint (e.g. literal `50` against `> 1000`). DISPROVED if any site can satisfy it. **Soundness gate:** if `<fn>` is itself a tool the agent can directly invoke, the verdict is unconditionally DISPROVED — Claude's tool-dispatch is opaque to source-level analysis, so every parameter is effectively a free variable. The verdict text points the developer at the fix: forbid the call entirely OR add an enforce statement inside the function body to bound the argument. The pitch a CISO can read: *"prove that this agent cannot charge a card for more than $10,000 — verified before the build ships, mathematically, not by hoping the prompt holds."* No other agent SDK ships symbolic argument-bound verification today (verified 2026-05-07: OpenAI Agents SDK + Claude Managed Agents + Hermes Agent are all runtime-only). 2026-05-07. |
| Provable correctness — agent × policy bridge (`upholds all policies`) | `prove that agent 'X' upholds all policies` | Composes the agent reachability walker with every `policy:` block in the file. For each policy rule (the existing enact-style catalog: `protect_tables`, `dont_delete_row`, `dont_delete_without_where`, `dont_update_without_where`, `dont_read_sensitive_tables`, `block_ddl`, plus git/filesystem rules), dispatches to the appropriate static checker against the agent's reachable code. Returns one parent verdict plus one subverdict per rule. **Statically provable rules** (CRUD walks, structural domain checks) get PROVED with reason or DISPROVED with the path. **Runtime-only rules** (`block_prompt_injection`, `code_freeze_active`, `maintenance_window`, `require_role`, `require_clearance`, `contractor_cannot_write_pii`) get UNVERIFIABLE with an honest reason — the prover refuses to claim what the runtime check will refuse, instead of lying with a false PROVED. The pitch this answers: *"with the enact policies + the symbolic prover, we prove that an agent cannot take a specific bad action even with tools it has access to."* Yes — for the static-domain policies, exactly. For the runtime-domain policies, honestly UNVERIFIABLE. The hybrid is the regulated-tier audit beat. 2026-05-07. |
| Refusal-message syntax (canonical, 2026-05-03) | `enforce that X, or fail with error message: 'why'` | New canonical form — reads as English: "enforce X, OR if not, fail with this error message." Old form `enforce that X or 'msg'` removed entirely (no back-compat). Bulk rewrite touched 130 occurrences across 19 files. Bare no-message form `enforce that X` still works with default refusal. |
| Audit trail — rule name in every rejection | Implicit in compiled output | When a `guard` sits inside a `rule X:` block, the compiled `res.status(403).json({...})` includes `rule: "<rule-name>"` alongside the error message. Every refusal at runtime is attributable to its named policy — the audit trail Marcus's compliance buyer reads. Raw guards (outside `rule:` blocks) keep the old shape. 2026-05-02 evening. |
| TBD placeholder | `set greeting = TBD` / a line that's just `TBD` | Lean Lesson 1 — leave one piece unfinished, ship the rest. Compiles green, runtime throws "placeholder hit at line N — fill it in or remove it" when reached. Tests that exercise a stub report SKIPPED, not FAILED. `result.placeholders[]` lists every open hole. |

## Expressions

| Feature | Syntax | Notes |
|---------|--------|-------|
| Math | `+` `-` `*` `/` `%` `^` | |
| Comparisons | `is greater than`, `is at least`, etc. | Also `is`, `is not` |
| Boolean logic | `and`, `or`, `not` | |
| String interpolation | `'Hello, {name}!'` | Any expression inside `{}` |
| String concat | `'Hello, ' + name` | |
| Lists | `['a', 'b', 'c']` | Add, remove, sort, length |
| Collection selectors | `first of rows` / `last of rows` / `rest of rows` | Also accepts natural noun phrases like `first item of rows` and `last setting row of settings`; canonical form stays short. |
| Records | `create person:` + indented fields | |
| Possessive access | `user's name` | Also dot: `user.name` |
| Map operations | `get key from scope` / `set key in scope to value` | Also `exists in`, `keys of`, `values of` |
| Higher-order | `apply fn to each in list` / `filter list using fn` | |
| Optional chaining | `user?.name` | Auto-generated for possessive access |
| Field projection | `pick name, email from user` | Returns subset of fields; works on records and lists |

## Web Frontend

| Feature | Syntax | Notes |
|---------|--------|-------|
| Pages | `page 'Dashboard' at '/admin':` | Hash routing, auto-slug from title |
| Reactive state | Variables auto-update UI | |
| Text input | `'Name' is a text input saved as name` | |
| Number input | `'Price' is a number input saved as price` | |
| Dropdown | `'Role' is a dropdown input saved as role` | With options list |
| Checkbox | `'Active' is a checkbox input saved as active` | |
| Textarea | `'Bio' is a textarea input saved as bio` | |
| File input | `'Upload' is a file input saved as doc` | |
| Form block | `form:` / `form 'Signup':` | Shorthand for a form-styled section. Groups inputs and submit buttons. Does not steal `form is {}` payload variables. |
| Buttons | `button 'Save':` + action block, or `button 'Save' that sends form to '/api/save'` | Inline `that` actions use third-person verbs; domain actions must name business data, not only toast feedback. Selected-record updates require a `change ... from ... to ...` line before `update ... at ...`; deletes use `delete selected_record from /api/...` |
| Links | `link 'Docs' to '/docs'` | Also accepts `link to '/docs' with label 'Docs'`; canonical form puts visible text first. |
| Sections | `section 'Results':` | With style presets |
| App shell presets | `section 'X' with style app_layout / app_sidebar / app_main / app_header` | Polished slate-on-ivory shell. `app_header` auto-splits children into brand / breadcrumb / action slots (data-slot attrs). For multi-page apps the shell page persists across routes (shell-page router). |
| SPA app primitive | `app 'Lenat' at '/': sidebar: ... pane 'Today' as 'today': ...` | Single-HTML-shell SPA. Hash-routed panes, inline router, shared sidebar declared once at app level. Alternative syntax to the app_layout shell-page pattern — pick one per file. |
| Tabs | `tab 'Settings':` | Auto-grouped |
| Components | `define component Card receiving content:` | Reusable, parameterized |
| Conditional UI | `if logged_in:` + content block | |
| On change | `when search changes:` | Also debounced: `after 250ms` |
| On scroll (throttled) | `on scroll every 100ms:` / `on scroll every 1 second:` | Leading-edge throttle; load-more-near-bottom pattern |
| On page load | `on page load get todos from '/api/todos'` | Inline or block form |
| Navigate | `go to '/dashboard'` | |
| Sidebar nav section | `nav section 'Approvals':` | Labeled group inside `app_sidebar` |
| Sidebar nav item | `nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'` | Linked sidebar row; optional count + Lucide icon; active state follows the route |
| Page header | `page header 'CRO Review':` + `subtitle '5 deals waiting'` + `actions:` | Main content title row with optional subtitle and right-aligned actions |
| Tab strip | `tab strip:` + `tab 'Pending' to '/cro'` | Routed underline tabs; active state follows the route |
| Stat strip | `stat strip:` + `stat card 'Pending Count':` + `value N`, optional `delta '+5%'`, `sparkline [1,2,3]` or `sparkline VAR taking 'FIELD'`, `icon 'inbox'` | Responsive KPI card row. Literal-list sparkline renders at compile time. Data-driven `sparkline VAR taking 'FIELD'` emits an SVG placeholder filled client-side from `_state[VAR]` on load and on every `_recompute` tick — blank until data arrives from an API call |

| Display Format | Syntax | Output |
|----------------|--------|--------|
| Table | `display X as table showing col1, col2` | Polished HTML table — auto-detects status pills, avatar circles, money columns; sortable headers; selectable rows; **auto-emitted toolbar search input** that filters rows in-place across all visible columns (Codex chunk #5, 2026-04-26 — every `display X as table` gets it for free, no syntax to opt in) |
| Table actions block | `display X as table ... with actions:` + indented `'Label' is style` lines | Hover-revealed action buttons in rightmost column (styles: primary, ghost, danger, secondary) |
| Detail panel | `detail panel for selected_deal:` + body + `actions:` | 340px right rail populated from the selected table row, with sticky bottom action buttons. Comment-only and vague update buttons are compile errors |
| Cards | `display X as cards showing name, description` | Card grid |
| List | `display X as list` | Bullet list |
| Currency | `display X as dollars` | `$1,234.56` |
| Percentage | `display X as percent` | `45%` |
| Date | `display X as date` | Formatted date |
| JSON | `display X as json` | Pretty-printed |
| Gallery | `display X as gallery` | Image grid |
| Map | `display X as map` | Leaflet map |
| Calendar | `display X as calendar` | Month grid |
| QR code | `display X as qr` | QR code image |
| Count | `display X as count` | Number badge |

| Chart Type | Syntax | Engine |
|------------|--------|--------|
| Line | `line chart 'Revenue' showing data` | ECharts |
| Bar | `bar chart 'Sales' showing data` / `display Sales as bar chart` | ECharts |
| Pie | `pie chart 'Breakdown' showing data` | ECharts |
| Area | `area chart 'Trend' showing data` | ECharts |
| Network graph | `display records as network graph showing edges via about` | ECharts force-directed graph (nodes + links via substring match) |

| UI Action | Syntax | Notes |
|-----------|--------|-------|
| Toast | `show toast 'Saved!' as success` | Native DaisyUI-style alert toast; message required and rendered as text; also `show alert`, `show notification` |
| Show/hide | `hide the sidebar` | Toggle element visibility |
| Loading | `show loading` / `hide loading` | Overlay spinner |
| Clipboard | `copy X to clipboard` | |
| Download | `download X as 'report.csv'` | |
| Refresh | `refresh` | Page reload |
| Video | `video from 'url'` | HTML5 player |
| Audio | `audio from 'url'` | HTML5 player |

## Backend (JS + Python)

| Feature | Syntax | Notes |
|---------|--------|-------|
| GET endpoint | `when user calls GET /api/users:` | |
| POST endpoint | `when user sends signup to /api/users:` | Receiving var = singular entity name; `sending`/`receiving` legacy forms still parse |
| PUT endpoint | `when user updates profile at /api/users/:id:` | URL params auto-bound |
| DELETE endpoint | `when user deletes user at /api/users/:id:` | |
| Send response | `send back signup` / `send back signup with success message` | Status 200/201 |
| Auth scaffold | `allow signup and login` | JWT + bcrypt, 3 endpoints |
| Requires login | `requires login` | JWT middleware check |
| Requires role | `requires role 'admin'` | Role-based access |
| Define role | `define role 'editor':` + permissions | Custom RBAC |
| Guard | `enforce that stock > 0, or fail with error message: 'Out of stock'` | Conditional 400 |
| Validate | `validate <entity>:` + field rules | Per-field 400 errors |
| Rate limit | `rate limit 10 per minute` | Request throttling |
| CORS | `allow cross-origin requests` | |
| Log requests | `log every request` | |
| Webhooks | `webhook '/stripe' signed with env('SECRET'):` | HMAC verification |
| File uploads | `accept file:` + max size, allowed types | Multer auto-wired on POST endpoints whose URL matches a client `upload X to '/api/...'` call |
| Cookies (plain) | `set cookie 'name' to value [for N days/hours/minutes]` / `cookie = get cookie 'name'` / `clear cookie 'name'` | Secure-by-default (`sameSite: 'lax'`, `secure` when `NODE_ENV=production`); maxAge from `for N days` |
| Cookies (signed) | `set signed cookie 'name' to value` / `get signed cookie 'name'` | HMAC via `cookie-parser(secret)`; requires `COOKIE_SECRET` env (warns loudly if unset, generates ephemeral fallback) |
| External fetch | `data from 'url':` + timeout, cache, fallback | |
| HTTP requests | `call api 'url' with method 'POST' with bearer token sending { ... }` or `send to 'url':` block form | GET/POST/PUT/DELETE with multi-line JSON bodies |
| Email (SMTP) | `send email:` + to, subject, body | Nodemailer |
| Email config | `configure email:` + service, user, password | |
| PDF generation | `create pdf 'report.pdf':` + content | pdfkit / reportlab |
| Shell commands | `run command 'git pull'` | Also capture: `result = run command '...'` |
| SSE streaming | `stream:` + `send back 'event'` | Server-sent events |
| Deploy | `deploy to vercel` / `deploy to netlify` | Deployment directive |

## Database & CRUD

| Feature | Syntax | Notes |
|---------|--------|-------|
| Database backend | `database is local memory` / `local file` / `supabase` / `postgres` / `SQLite` | Python target: `local file` imports `runtime/db.py` (persistent SQLite); `postgres` imports `runtime/db_postgres.py`; `local memory` keeps the in-memory stub for local dev |
| Create table | `create a Users table:` + fields | Types, constraints, defaults |
| Save (insert) | `save signup as new User` | Var name = incoming entity |
| Look up one | `look up User where id is 5` | |
| Look up all | `look up all Users` / `get all Users` | Optional `where` clause |
| Delete | `delete the User with this id` | |
| Update | `save profile to Users` | Var name = incoming entity |
| Upsert | `upsert user to Users by email` | Match-or-insert on a field; preserves id on hit, returns canonical record either way (JS + Python parity) |
| Tables — three lead forms | `create a Users table:` \| `table Users:` \| `create data shape User:` | All three parse identically. Shorthand `table X:` added in session 45. |
| Empty-table state | `display X as table showing ...` (any) | When the rendered data array is empty, the table shows a single italic "No rows yet." placeholder row instead of a blank zero-height body. Friendlier UX for first-launch users + keeps Playwright walkers and accessibility tools treating the table as visible. The placeholder carries class `clear-table-empty` so callers can opt out of treating it as data. (2026-05-06) |
| Field declarations — two forms | `price, number, required` (comma) \| `name is text, required` (is) | Both compile to the same schema entry. |
| Belongs to | `author belongs to Users` | Foreign key. `get all Posts` auto-stitches the referenced record on read (JS + Python). |
| Background jobs | `background 'name': runs every 1 hour` | Compiles to `setInterval`; cleaned up on SIGTERM + SIGINT via `_scheduledCancellers` registry. |
| Scheduled cron | `every 5 minutes:` / `every day at 9am:` | Interval or HH:MM recurrence; both wired into shutdown-safe cancellation. |
| File upload (client) | `upload doc to '/api/upload'` | FormData + fetch POST. |
| File upload (server) | auto-wired on POST endpoints that match client upload URLs | `_upload.any()` multer middleware with memoryStorage + 10MB default. |
| Auth-capability gate | silence `requires login` on mutation endpoints for auth-less toy apps | Compiler detects whether the app has `allow signup and login` OR a `Users` table with a `password` field. Auth-capable apps still get hard errors; auth-less apps get one advisory warning listing every public mutation. |
| SSR default — server-side pre-fetch | `define X as: look up records in Y` inside a page body; static `on page load get X from '/api/X'` reads | The route handler pre-fetches direct table lookups and safe same-app page-load reads before sending HTML, then injects `window.__CLEAR_INITIAL_STATE__`. Reactive runtime hydrates on first paint — no loading flash. The canonical 13 apps are guarded by `core-13-ssr-first-paint.test.js`. |
| SSR opt-out | `fetch this data in the browser, not from the server` (indented under a define, or inline after a comma) | Sets `clientOnly:true` on the lookup. Compiler skips it in the SSR pre-fetch; browser fetches it reactively. Use for real-time data or auth-scoped queries. |
| Has many | `Users has many Posts` | Auto-generates nested GET endpoint |
| Search | `search Posts for query` | Case-insensitive full-text |
| Aggregates | `sum of amount in Orders` | Also `avg of`, `count of`, `min of`, `max of` |
| Connect to DB | `connect to database:` + config | PostgreSQL pool |
| Raw SQL | `query 'SELECT * FROM users' with params` | |

## Service Integrations (SERVICE_CALL)

| Service | Syntax | Env Vars |
|---------|--------|----------|
| Stripe | `charge via stripe:` + amount, currency, token | `STRIPE_KEY` |
| SendGrid | `send email via sendgrid:` + to, from, subject, body | `SENDGRID_KEY` |
| Twilio | `send sms via twilio:` + to, body | `TWILIO_SID`, `TWILIO_TOKEN` |

All compile to direct REST `fetch()` calls. No SDK required.

## Data Operations

| Feature | Syntax | Notes |
|---------|--------|-------|
| Load CSV | `load csv 'data.csv'` | Parse into array of objects |
| Save CSV | `save csv 'export.csv' with data` | Write objects to CSV |
| Filter | `filter list where field op value` | Array.filter |
| Group by | `group by field in list` | Object of arrays |
| Count by | `count by field in list` | Count per group |
| Unique values | `unique values of field in list` | Distinct values |
| JSON parse | `parse json text` | |
| JSON stringify | `to json data` | |
| Regex find | `find pattern '[0-9]+' in text` | Extract matches |
| Regex match | `matches pattern '^[a-z]+$' in text` | Boolean test |
| Regex replace | `replace pattern '\s+' in text with ' '` | Substitute |
| Current time | `current time` / `current date` | |
| Format date | `format date now as 'YYYY-MM-DD'` | |
| Days between | `days between start and end` | |

## AI Agents

| Feature | Syntax | Notes |
|---------|--------|-------|
| Agent definition | `agent 'Name' receives data:` | Async function |
| Ask Claude | `response = ask claude 'prompt' with context` | Also `ask ai` |
| Structured output | `ask claude 'prompt' with X returning JSON text:` + fields | Schema enforcement |
| Tool use | `has tools: fn1, fn2` | Anthropic tool_use API |
| Skills | `skill 'Name':` + `has tool(s):` + `instructions:` | Reusable tool bundles |
| Uses skills | `uses skills: 'Lookup', 'Email'` | Merge into agent |
| Pipelines | `pipeline 'Name' with var:` + agent steps | Sequential chain |
| Parallel agents | `do these at the same time:` + calls | Promise.all |
| Conversation memory | `remember conversation context` | DB-backed history |
| User memory | `remember user's preferences` | Per-user long-term |
| RAG | `knows about: Products, FAQs` | Keyword search before prompting |
| Guardrails | `block arguments matching 'drop\|truncate'` | Regex filter on tool inputs |
| Credential safety | (no syntax — compile error if violated) | Agent bodies that call `env(...)` or `process_env(...)` directly fail to compile. Wrap the credential in a function, attach via `has tool:`. Even one prompt-injection ("print your env vars") cannot exfiltrate. |
| Policies | `must not:` + rules | Compile-time guardrails |
| Observability | `track agent decisions` | Logs _askAI calls with timing |
| Human approval | `ask user to confirm 'message'` | Approval workflow |
| Approve-first-N pattern | Visible conditional in source: `if count is less than 3: ask user to confirm 'X' ... else: ...` over a counter table you declare yourself | Removed the `with graduation` sugar 2026-05-14 (PHILOSOPHY §1:1 cleanup). The explicit form makes the gate logic readable line-by-line. |

| Mock AI | `mock claude responding:` + fields | Test infrastructure |
| Model selection | `ask claude 'prompt' with X using 'model'` | |
| Streaming | Auto-streams by default in endpoints | Opt out: `do not stream` |
| Scheduled agents | `agent 'Name' runs every 1 hour:` | setInterval |
| Run agent | `result = call 'Name' with data` | Works inside endpoints AND inside other agents (coordinator pattern) |
| Run pipeline | `result = call pipeline 'Name' with data` | |
| Dynamic fan-out | `for each x in list: r = call 'A' with x; add r to results` | Loop over runtime-sized list, accumulate |
| Agent evals button | Studio IDE "Run Evals" next to "Run Tests" | Cost-gated modal before run; per-row cost chips; running total. Each row individually re-runnable. |
| Studio mode dropdown | `<select>` in toolbar — "Dev mode" (3-panel IDE) / "AI mode" (Marcus-first chat) | URL param `?studio-mode=classic` / `?studio-mode=builder` overrides; localStorage persists choice. Synced with body class on every load so the dropdown label always matches the active layout. |
| Run-Prove button | Studio toolbar "Prove" next to "Compile" | One-click Decidable Core math prover on the editor source. Renders proof bundle (PROVED / PARTIAL / FAILED / UNVERIFIABLE per test) into the terminal pane. Same engine as `clear prove` on the CLI. |
| Inline rule-verdict marks | New strip in the Studio editor margin | After every auto-prove, each `rule:` line gets a glyph: ✓ green for proved, ✗ red for disproved, ? amber for unverifiable. Tooltip shows "rule-name — verdict" on hover. Reads from the same verdict bundle that drives the toolbar badge — one fetch, two surfaces. Spell-check feel for business rules. (Studio Prove redesign 4(a) v1, 2026-05-04.) |
| Auto-prove badge | `#prove-stats-badge` in the Studio toolbar | Fires the prover after every compile attempt. Shows per-rule verdict counts (`Prove: 3 ok · 0 bad · 0 ?`) colour-coded by worst verdict (green when every rule PROVED, red when any DISPROVED, amber when any UNVERIFIABLE). Click the badge to expand a popover listing each rule with its verdict mark and source line; click a row to jump the editor cursor to that line. Debounced via AbortController so rapid edits don't pile up requests. Hidden when source has no rules. The full inline-gutter version (verdicts in the editor's left margin) needs a bundle rebuild to expose `gutter` / `GutterMarker` / `StateField` / `StateEffect` from CodeMirror — filed as follow-up. |
| Auto-generated eval suite | Per-agent role + format + per-endpoint E2E | Built from receiving-var name + table schema + prompt noun-hints; no `'hello'` probes on core templates |
| User-defined evals | `eval 'name':` top-level + `evals:` agent subsection | Two syntaxes; both produce specs in `result.evalSuite`; merge with auto-generated rows in the same Tests pane |
| Export eval report | Markdown + CSV download from Tests pane | Grouped by agent, full criteria + input + output + grader feedback; CSV one-row-per-eval for spreadsheets / regression diffing |
| Multi-provider grader | `EVAL_PROVIDER` env var | Anthropic (default), Google Gemini, OpenAI. Breaks Claude-grading-Claude when set to google/openai. Per-provider pricing baked in. |
| Eval child orchestration | Dedicated port 4999, 60s keepalive, mutex serialization, SIGINT cleanup, DB wipe per full run | Run-All + per-row Run never race; Ctrl-C doesn't orphan; deterministic fresh-state runs |
| Synthetic agent endpoints | `compileProgram(source, { evalMode: true })` emits `/_eval/agent_<name>` natively | Internal agents become individually graddable without polluting the production app. Validator rejects user routes that collide with /_eval/* prefix. |
| Coordinator drains streams | `call 'StreamingAgent'` from a non-streaming caller | Compiler wraps with generator-drain IIFE — coordinator sees the final string, not an async iterator |
| Live Tests pane streaming | `/api/run-eval-stream` SSE endpoint + EventSource-style UI rewire | Rows flip pending → running → pass/fail as each spec resolves; no 60-90s blank stare |
| Terminal trace per spec | Every run (Meph, UI, direct POST) logs `[eval] N/T ✓ id pass $0.0008 — feedback` | Failures include the agent's actual output (truncated to 240 chars) so "why" is visible without opening Tests |
| Auth-walled endpoint probes | Eval runner mints signed test-user tokens matching whichever auth scheme the compiled child uses (inline jsonwebtoken JWT or runtime/auth.js 2-part HMAC) | 7 of 8 core templates have `requires login`; all now probe-able |
| Implicit schema tables | Compiler auto-creates `Conversations` / `Memories` tables when any agent declares `remember conversation context` or `remember user's preferences` | Was silently failing with "no such table" before the eval auth fix surfaced it |
| `repeat until` variable scoping | Vars reassigned inside a `repeat until` stay as awaited strings — only single-assignment vars stream | Iterative-refinement agents (draft → improve → grade) now pass real content between calls |

## Workflows

| Feature | Syntax | Notes |
|---------|--------|-------|
| Workflow definition | `workflow 'Name' with state:` | Multi-step process |
| State shape | `state has:` + field definitions | Typed state |
| Step | `step 'Name' with 'Agent'` | Delegates to agent |
| Step with save | `step 'Name' with 'Agent' saves to state's field` | |
| User-input step | `step 'Ask name' awaits user input as state's reply` | Pauses workflow at this step. Compiler emits a session table + `/api/workflow/<name>/start` + `/respond` endpoints; the workflow resumes when the user posts the next message. Added 2026-05-14 as a WORKFLOW extension (replaces the planned-but-unbuilt `dialog with state` primitive — DRY check showed WORKFLOW already had state, steps, conditionals; only the pause-for-user-message capability was missing). |
| Conditional step | `if state's field is value:` + steps | |
| Repeat until | `repeat until condition, max N times:` + steps | |
| Parallel steps | `at the same time:` + steps | |
| Durable execution | `runs durably` (canonical) / `runs on temporal` (legacy) | Temporal SDK on Node, Cloudflare Workflows on `--target cloudflare` |
| Progress tracking | `track workflow progress` | State history |
| Checkpoint | `save progress to Table` | DB persistence |
| Run workflow | `result = run workflow 'Name' with data` | |

## Routing

| Feature | Syntax | Notes |
|---------|--------|-------|
| Routing block | `route lead by size:` + indented body | Statement-level. Compiles to an if/else chain over `<entity>.<field>`, mutating `<entity>.assigned_to`. Replaces 50+ lines of nested if-chains for assignment. |
| Fixed-mapping rule | `'SMB' to alice` | Match value MUST be a quoted string (the tokenizer splits hyphenated identifiers like `Mid-market`). Owner is bare identifier or quoted string. |
| Single-owner default | `default to alice` | Catch-all owner when no fixed rule matches. |
| Round-robin default | `default round-robin across [alice, bob, diana]` | Rotates through the pool. State persists in the `_clear_route_cursors` SQLite table — cursor key is a content hash of (entity + field + rules + pool), stable across line-number edits. Survives restarts. |
| Validator (hard error) | `ROUTE_ENTITY_NOT_IN_SCOPE` | Route block references an undefined variable — catches `route foo by size:` where `foo` was never bound. |
| Validator (hard error) | `ROUTE_AFTER_SAVE` | Route block runs after `save X as new T` — assignment never persists. The most common silent bug. |
| Validator (warning) | `ROUTE_FIELD_NOT_ON_ENTITY`, `ROUTE_NO_DEFAULT`, `ROUTE_UNREACHABLE_RULE` | Likely-typo / likely-mistake patterns. Program still compiles. |

## Text-Routing Dispatcher (Replaces old Runtime Grammar — ripped out 2026-05-14)

The `runtime grammar / frame / on match` block was removed 2026-05-14 (PHILOSOPHY §1:1 cleanup). The same capability is now assembled from six composable primitives:

| Feature | Syntax | Notes |
|---------|--------|-------|
| Seed-table declaration | `create a TABLE: ... with rows: {field: val, ...}` | Declare the table schema and its compile-time seed rows in one block. |
| Function definition | `define function NAME(input):` + body | Per-concept logic block. Call by name at dispatch time. |
| Text-prefix search | `search for X in TABLE by FIELD or FIELD` | Prefix-match against one or more text fields. Binds `match` on success. |
| Match conditional | `if there's a match:` / `if no match:` | Branches on the result of the preceding `search for` call. |
| Dynamic dispatch | `call function match's function with ARG` | Resolve and invoke a function by name at runtime. |
| Convention field types | `phrase`, `price`, `is_*`, `created_at` etc. | Default to `text`, `number`, `boolean`, `timestamp` without explicit `is TYPE` (P6, 2026-05-13). |

## Slot Extractors (NL-Light Parsing — Lenat-in-Clear Phase 2)

Four expression-level primitives for pulling structured values out of free-form text. Every chat-style intake / form auto-fill / NL-light parsing app needs these — Lenat-in-Clear is the headliner but the same primitives drop into any onboarding flow, support bot, or search bar. Ships from `plans/plan-lenat-in-clear-2026-05-13.md` (Phase 2).

| Feature | Syntax | Notes |
|---------|--------|-------|
| Datetime extraction | `dt = extract datetime from text` | Fast-path covers ISO, slash-date, `in N hours`, weekday-at-time, `tomorrow at TIME`, `tonight`, `this evening`. Returns `{value, remainder}` or `nothing` on miss (LLM fallback when an `askAi` provider is configured). |
| Fuzzy match | `pick = fuzzy match 'q' in list [scored at least 0.7]` | Levenshtein + bigram pre-filter + subsequence-coverage boost. Returns `{value, score}` or `nothing`. Threshold defaults to 0.7. Tie-break: longest candidate wins. |
| About-clause split | `parts = extract about-clause from text` | Regex split on `\b(about\|re\|regarding)\b`. Returns `{what, about}`; `about` is `null` if no keyword. |
| Regex with remainder | `out = find pattern 'P' in text returning value and remainder` | First-match-only. Returns `{value, remainder}` — the input minus the match. Distinct from plain `find pattern` (array of matches). |
| Runtime parity | Same algorithm on both targets | `runtime/slot-extractors.js` + `runtime/slot_extractors.py` share Levenshtein, fast-path datetime patterns, and split semantics. Python's LLM fallback takes a sync `ask_ai` callable; JS returns a Promise. |
| Validator (warning) | `SLOT_EXTRACTOR_WRONG_TYPE` | Fires when `extract datetime` / `extract about-clause` / `find pattern ... returning value and remainder` receives a number / list / boolean source. The runtime would silently return `null`; the validator catches it at compile time. |

## Approval Queues

| Feature | Syntax | Notes |
|---------|--------|-------|
| Queue declaration | `queue for deal:` + indented body | Auto-generates audit table, optional notifications queue, filtered GET, per-action login-gated update handlers |
| Reviewer role | `reviewer is 'CRO'` | Stamped on every audit row's `decided_by` |
| Action list | `actions: approve, reject, counter, awaiting customer` | Each action becomes `PUT /api/<entity>s/:id/<action>` — multi-word actions slugify to first word |
| Notify clause | `notify customer on counter, awaiting customer` | Inserts a row in `<entity>_notifications` for matching actions; recipient_email resolves from `<role>_email` field on the entity |
| Email when (canonical, F3) | `email customer when counter, awaiting customer` | Same as above but the verb names HOW (email vs vague notify); `notify on` kept as legacy alias |
| Triggered email block (top-level) | `email customer when deal's status changes to 'awaiting': subject is 'Counter for {customer}' body is 'Hi {customer}, we countered your {amount} request.'` | Auto-emits a shared `workflow_email_queue` table; queue-driven status transitions automatically queue email rows. Subject + body interpolate `{field}` references against the entity record at queue-insert time, so each row carries per-customer text. |
| Email delivery directive | `email delivery using agentmail` | Top-level directive that flips live sending on. When present, the compiler emits a background worker that polls `workflow_email_queue` every 30 seconds and sends pending rows via the provider's HTTP API. Without the directive, no worker emits — queues only. Worker fails loud at runtime if the `AGENTMAIL_API_KEY` (or `SENDGRID_API_KEY`, etc.) env var isn't set. AgentMail has a full adapter today; SendGrid/Resend/Postmark/Mailgun are recognized but mark rows failed with "adapter not implemented yet" until each one is wired. |
| Auto-emitted audit | `<entity>_decisions` table | `deal_id, decision, decided_by, decided_at, decision_note` |
| Auto-emitted queue view | `GET /api/<entity>s/queue` | Filtered by `status = 'pending'` |
| Auto-emitted history view | `GET /api/<entity>-decisions` | Full audit log |
| Auto-emitted CSV export | `GET /api/<entity>/export.csv` | Plain CSV with RFC 4180 escaping (commas, quotes, newlines wrapped + doubled correctly); sensitive fields (password / token / api_key / secret / hash) auto-omitted. Suppress with `no export` clause. |
| Suppress CSV | `no export` (inside queue body) | Removes the auto-emitted `/export.csv` URL when the entity should never expose data via CSV (e.g. compliance-restricted tables) |

Also under "Build full apps by writing English" in the exec summary: **Approval queues with audit + notifications in one block.**

## Scheduling

| Feature | Syntax | Compiles To |
|---------|--------|-------------|
| Interval | `every 5 minutes:` + block | `setInterval` |
| Daily schedule | `every day at 9am:` + block | Cron-style scheduler |
| Scheduled agent | `agent 'Name' runs every 1 hour:` | `setInterval` in agent |
| Background job | `background 'cleanup':` + `runs every 1 hour` | `setInterval` |

## Testing

| Feature | Syntax | Notes |
|---------|--------|-------|
| Test block | `test 'name':` + body | Named test |
| Nameless test | `test:` + body | First body line becomes the test name — zero redundancy |
| Expect | `expect result is 42` | Equality assertion |
| HTTP test call | `call POST /api/users with name is 'Alice'` | |
| Expect response | `expect response status 201` | Also `expect response body has id` |
| Intent-based test | `can user create a todo with title is 'Buy milk'` | English-readable, auto-discovers endpoints |
| Auth intent test | `does deleting a todo require login` | Asserts 401 without auth |
| Agent intent test | `can user ask agent 'Support' with message is 'hello'` | Agent smoke test |
| Semantic expects | `expect it succeeds` / `fails` / `requires login` / `is rejected` | Status code assertions |
| Mock AI | `mock claude responding:` + fields | Override `_askAI` |
| Unit assertions | `expect x is 5`, `expect x is greater than N`, `expect x is empty` | Value-level assertions — 8 check forms, friendly error messages, no HTTP needed |
| **Auto-generated browser walker** | `clear build` → emits `browser-uat.mjs` per app | Real Playwright script the compiler derives from the source. Drives every page, every nav click, every route tab, every table sort+filter, every detail-panel drilldown, screenshots each route. Runs against the live app — `node browser-uat.mjs` (TEST_URL points at the running URL). Requires `playwright` dev dep; logs a clear install hint if missing. **For apps with `allow signup and login`,** the walker now signs up a synthetic test user FIRST and attaches the `Bearer` token via `page.setExtraHTTPHeaders` + `localStorage.token` before walking protected routes — so creator-scoped pages return real rows instead of empty tables (was the most common false-fail before 2026-05-07). **No comparable internal-tool platform does this** — Retool / Bubble / Glide / Tooljet / Budibase all make customers write their own tests. |
| **Marcus-app sweep runner** | `node scripts/run-marcus-uat.mjs` | Builds each of the 5 Marcus apps, spins up its server on a dedicated port, runs the walker, kills the server, reports per-app pass/fail. Single command turns "did all 5 apps work?" into a green-light run. Wipes per-app `clear-data.db` before each run so seeds always re-fire. |
| **Launch browser regression gate** | `npm run test:browser` / `npm run test:all` | The Marcus browser walker is part of the launch test suite and pre-push gate. Use `SKIP_BROWSER_UAT=1` only when intentionally skipping browser checks in a constrained environment. |

## Policies (App-Level Guards)

30+ built-in rules:

| Rule | What it does |
|------|-------------|
| `block schema changes` | Prevents ALTER TABLE |
| `block deletes without filter` | No bulk deletes |
| `protect tables: Users` | Whitelist-only access |
| `block prompt injection` | Input sanitization |
| `require role 'admin'` | Global role gate |
| `no mass emails` | Block multi-recipient sends |
| `block file types: '.env'` | Reject dangerous uploads |
| `code freeze active` | Block all writes |

## Studio IDE

| Feature | Notes |
|---------|-------|
| Editor syntax highlighting (cleaned up 2026-05-04) | Two-tier model — structural words (`rule`, `enforce`, `that`, `when`, `if`, `otherwise`, `requires`, `validate`, `define`, `function`, `agent`, `page`, `section`, etc.) keep the bold blue keyword color; English connector words (`is`, `less`, `than`, `or`, `with`, `error`, `message`, etc.) stay slate gray so the editor doesn't read like a wall of blue ink. Multi-line strings, hyphenated rule names, and `deal's` possessives all tokenize correctly. **Block comments (`/* */` and `### ###`) render as italic gray across all wrapped lines** — every template's preamble architecture diagram now reads as one comment block instead of randomly-coloured words. |
| Three-panel layout | CodeMirror editor + preview/terminal + Claude agent chat |
| CodeMirror bundle (rebuildable) | `studio/codemirror.bundle.js` — vendored ESM bundle that ships with the repo (no `@codemirror/*` in node_modules at runtime). Now rebuildable via `node scripts/build-codemirror-bundle.mjs`. Single source of truth for which CodeMirror symbols are exported is `scripts/codemirror-entry.mjs` — adding a new editor extension means adding the symbol there + running the build script. Bundle is currently 402 KB; build warns if it balloons past 600 KB. Adding `gutter` / `GutterMarker` / `StateField` / `StateEffect` / `RangeSet` to the bundle (2026-05-04) unlocks the inline editor-margin Prove verdicts feature (Studio Prove redesign 4(a) v1) and the right-click drilldown (4(c)). |
| 43 template apps | Dropdown selector |
| Light/dark theme | Toggle |
| Save to Desktop | Download .clear file |
| Compile + run + test | All from browser |
| Copy compiler error | Compile errors show a "Copy compiler error" button with source context, diagnostics, and repair instructions |
| Copy Terminal button | Preview-tabs row in Studio. One click strips HTML markup from the terminal entries, appends the current `.clear` source as a fenced block, and copies the result to the clipboard formatted as markdown so it pastes cleanly into a chat message to Claude or Meph. **Newest entry first** — matches the on-screen render order (the terminal pane shows most recent at top, so the clipboard text reads the same way). Distinct from "Copy compiler error" (compile-time only); this one captures runtime / test / prove output from a running app. Added 2026-05-04. |
| Fresh-from-disk on Studio start | When you pick a template via the Studio dropdown, Studio remembers the template name. On every Studio start, it re-fetches that template from disk and replaces the editor's content if it has changed. A one-line confirmation appears in the terminal: "Refreshed deal-desk/main.clear from disk (was an older version in your editor)." Stops the old failure mode where edits to a template on disk never propagated into Studio because localStorage cached the editor content forever. Crash-recovery scratch (untemplated content) still uses localStorage as before. Added 2026-05-04. |
| File navigator for multi-file Clear projects | The Load picker accepts multiple `.clear` files. Studio keeps them as one in-memory project, shows a navigator with Files, Imports, and Components, opens imported/component files without losing edits, and sends the main source plus an in-memory `modules` map to `/api/compile`. This makes `import components.clear` and `define component Card ...` workable inside Studio, not only in CLI/editor tooling. Added 2026-05-15. |
| Source maps | Click preview element -> jumps to Clear source line (Alt+click in normal mode) |
| Direct Edit toggle | Toolbar button next to Run/Stop. When on, ANY click in the preview (no Alt key) (a) jumps the editor cursor to that element's Clear source line, (b) drafts a `Help me edit this:` message in Meph's chat input with the line + 4 lines of context fenced as `clear`. Works for both srcdoc previews (web-only apps) and full-stack-app iframes (running on a separate port via `?clear-bridge=1`). Compiler-side: `data-clear-line="N"` is on every interactive HTML element via `clAttr(node)` in `buildHTML` — the Direct Edit feature uses that attribute. Click highlights the element with a 2px indigo outline so users see what was picked. |
| AI assistant (Meph) | Builds, compiles, fixes apps via tool use |
| Builder Mode (v0.3) | `?studio-mode=builder` URL param | Marcus-first layout — preview hero (60vh), chat driver (40vh), editor hidden by default with toolbar Source toggle, branded Publish button. v0.2 added a Marcus-first tile gallery on empty preview (5 featured apps + "See more"). v0.3 added a 3-ship counter (source pane defaults visible for first 3 successful Publishes, hidden after) + click-to-edit (clicking an iframe element prefills the chat input with `Change the "<text>" button/link — `). |
| First-visit onboarding | localStorage `clear-onboarding-seen` | Studio shows a one-time welcome card prepended to the chat on first load + auto-focuses chat input. Per-mode copy. Dismissed on first keystroke or × click. |
| Ghost Meph (chat backend dispatch + model picker) | `MEPH_BRAIN` env var or Studio picker | Routes /api/chat to Anthropic Haiku, OpenRouter Claude, GLM, DeepSeek, Kimi, local Ollama, or cc-agent. OpenAI-compatible backends now preserve Meph tool use through the shared format bridge. Changing the selected model sends full chat history on the next turn. See `studio/ghost-meph/`. |
| Legacy shape-search CLI | `scripts/match-shape.mjs` can still compare a file against `studio/canonical-examples.md` from the command line, but Meph no longer receives this as a separate compile-hint layer. Reusable app shapes now come from the curated pattern DB so there is one searchable pattern library instead of two competing systems. |
| Curated pattern DB for Meph | Studio seeds `factor-db.sqlite` with the 13 canonical Clear apps from `CLAUDE.md` (8 core + 5 Marcus), plus primitive rows extracted from their source blocks: tables, queues, rules, endpoints, pages, actions, agents, tests, and related reusable shapes. The rest of `apps/` contributes `reference` primitive rows only, not whole-app trusted rows. Critical language primitives can be seeded as `language` rows; the first one is optimistic locking for approval double-processing. Meph searches it through `browse_templates` with `action: "search"` and receives the matching snippet plus parent/kind metadata, not a whole template by default. Failed compiles get trusted pattern snippets from this same DB; the old markdown shape-search hint layer is retired from Meph. Future learned primitives stage in `clear_programming_pattern_candidates` and promote only after compile/test evidence plus review. Audit with `node scripts/primitive-audit.mjs`. |
| Pattern preflight hook | `/api/chat` | Complex app, feature-shape, syntax-shape, and reusable-pattern questions get a required preflight before Meph answers: relevant `SYNTAX.md` and `AI-INSTRUCTIONS.md` excerpts plus top pattern DB matches are appended to the turn. Disable with `patternPreflight:false` or `MEPH_PATTERN_PREFLIGHT=0` only for A/B trials. |
| Requirements/Ralph loop | Studio `/api/chat` + supervisor | Complex apps draft end-to-end requirements before source mutation. The server rejects vague/compound approved requirements, then Ralph audits implementation evidence after build and blocks false done when requirements are missing. |
| Miller violation vector | `lib/miller/` + `studio/supervisor/miller-ralph.js` | Ralph's findings are scored as a priority-weighted violation vector: failures grouped into constraint families (approval/audit/role hard; notification/ui soft), one hard miss outweighs any pile of soft ones, and the retry message ranks repairs worst-first — a missing approval workflow is fixed before cosmetic spacing. Gate decision unchanged. |
| Miller A/B harness (dev) | `scripts/miller-ab-repair.mjs` + `CLEAR_MILLER_RANK_DISABLE` | Dev/eval tooling: the flag toggles the Ralph retry message between flat (control) and ranked (treatment); the harness measures one-shot repair fix-rate per arm. `--dry-run` is free, defaults to Haiku. First result was a null — ranking didn't change behavior on an easy single-turn task (see RESEARCH.md). |
| Pattern-probe quality rubric | `scripts/meph-pattern-live-probe.mjs` | Full-app A/B probes now report a deterministic 100-point quality score, not just pass/fail/time. The approval-queue rubric scores compiler success, warning budget, request schema, create flow, threshold routing, pending queue read path, approve/reject actions, stale-submit guard, queue UI, and login protection. |
| Hint telemetry boundary checks | `node studio/supervisor/verify-hint-flow.js` + Factor DB summary | Verifies hints reach the tool-result string Meph sees, counts text labels (`yes`, `partial`, `inferred`) correctly, and distinguishes weak shape-match hints from no hint. |
| Hint-effect significance report | `node scripts/hint-effect-report.mjs` | Reads A/B sweep artifacts, excludes saturated tasks from the headline, rejects suspicious-fast runs, and prints lift, p-value, confidence interval, and verdict. Current artifacts are inconclusive, not proof. |

## Live App Editing (LAE — Phase A + B shipped)

Conversational edits to a running, deployed Clear app. Owner authenticates, opens the app, types a change in the floating Meph widget, sees a diff preview, ships. Phases A + B cover additive (add field/page/endpoint) and reversible (hide, rename, relabel, reorder) edits with data + session preservation. Phase C (destructive) and Phase D (audit log + concurrent guard + dry-run) are still on the roadmap.

| Feature | What it does |
|---------|--------------|
| In-browser edit widget | Floating 🔧 badge on the running app — auto-injected on apps with `allow signup and login`. Opens Meph chat at `/__meph__/api/*` (proxied to `STUDIO_PORT`; clean 503 when env var absent in production). |
| Owner-only authorization | `liveEditAuth` middleware checks JWT + owner role before allowing edits. |
| Change classifier | Every diff classified `additive` / `reversible` / `destructive`. Additive ships instantly; reversible needs one-click confirm; destructive requires typed confirmation + reason string + audit entry (Phase C — not yet built). |
| Cloud rollback | `/__meph__/api/cloud-rollback` — point cloud-deployed apps back to a prior version. Studio Ship + Undo route to cloud paths when on a deployed app. |
| Versions table | `versions[]` + `secretKeys` per app (`tenants-db`) — Phase B prereq for incremental updates without losing in-flight work. Capped at 20 entries per app in tenants-db (older versions stay queryable on Cloudflare's side via `listVersions`). |
| Cloudflare incremental update | Deploy mode `update` patches a deployed Worker without rebundling — re-uploads bundle only, skips D1 reprovision + domain reattach + full secrets push. Wall clock ~2s vs ~12s for fresh deploy. |
| Schema-change confirm gate | `migrationsDiffer()` byte-compares both `migrations/*.sql` and `wrangler.toml` between live + new bundles. Differences pause the update and return `409 MIGRATION_REQUIRED` with a per-file diff. Re-POST with `confirmMigration: true` applies the migration before uploading the new code. |
| One-click rollback (Studio) | Version history panel inside the Publish window lists the last 20 versions with timestamps; Rollback button calls `/api/rollback`, records a tombstone version with `note: 'rollback-from-vN'`. Currently-live version shows "Current" label, no button. |

## Clear Cloud (buildclear.dev — login + multi-tenant runtime)

The customer-facing surface for buildclear.dev itself. Customers sign up, log in, and land on a dashboard that lists their deployed apps. Separate from the auth Clear apps generate INSIDE deployed apps (which uses the `allow signup and login` syntax against per-tenant SQLite).

| Component | Where | What it does |
|-----------|-------|--------------|
| **Cloud-auth helpers** | `studio/cloud-auth/index.js` | bcryptjs hashing, 32-byte hex session tokens hashed with SHA-256 before DB storage, signup/login/validateSession/revokeSession/logoutAllSessions, email verify + password reset with 1-hour expiry. 57 unit tests. |
| **Auth URL handlers** | `studio/cloud-auth/routes.js` | POST `/api/auth/signup`, POST `/api/auth/login`, GET `/api/auth/me`, POST `/api/auth/logout`. httpOnly + SameSite=Lax + Secure cookies, 30-day Max-Age, inline cookie parser (no cookie-parser dep). Stub mode when pool is null so Studio dev keeps working without DATABASE_URL. 72 routes integration tests against pg-mem. |
| **Customer apps URL** | `GET /api/apps` in `studio/cloud-auth/routes.js` | Reads the session cookie, looks up the user's tenant, returns that tenant's deployed apps with `appSlug + scriptName + hostname + deployedAt + latestVersionId` per row, newest deploy first. 401 with no session, empty array when no deploys. Cross-tenant isolation locked in by tests (Marcus's list never leaks Dave's apps). |
| **Auto-tenant on signup** | `studio/cloud-auth/routes.js` | At signup time, the route handler creates a `clear-<6hex>` tenant, writes the slug back onto the user. 1:1 mapping for v1 (teams come later via a tenant_users join). Best-effort: if the tenant store isn't wired, signup still succeeds and tenant_slug stays null. |
| **Dashboard with app grid** | `studio/dashboard.html` | Auth-gates on `/api/auth/me`, then fetches `/api/apps` and renders one card per deploy with the live URL. Empty state when zero apps. Sign-out button. Lucide icons (no emoji per the rule). |
| **Login + signup pages** | `studio/{login,signup}.html` | Inter-font, indigo-gradient buttons matching the existing landing system. Lucide icons (no emoji per the rule). Already-signed-in users on /login redirect to /dashboard. |
| **Dashboard** | `studio/dashboard.html` | Auth-gates on `/api/auth/me`, bounces unauth'd users to /login. Shows greeting + Sign-out button + empty-state until `/api/apps` lands. |
| **CC-2 schema migration** | `studio/db/migrations/0002_users_sessions.sql` | Runs alongside CC-1's init migration when DATABASE_URL is set. Users + sessions tables with CHECK constraints for status/role; partial unique indexes for verify/reset tokens; pg-mem-portable (no PL/pgSQL trigger). |
| **Tenant store factory** | `studio/tenant-store-factory.js` | Picks InMemoryTenantStore (DATABASE_URL unset, default), DualWriteTenantStore (cutover wrapper), or PostgresTenantStore (production). Applies all migrations on first boot. 24 tests. |
| **Multi-tenant routing** | `studio/cloud-routing/` | When `CLEAR_CLOUD_MODE=1`, subdomain `<sub>.buildclear.dev` requests get proxied to the deployed app's container before they hit Studio's static + chat routes. Silent no-op when env var unset. |
| **Custom domain attach (CC-5 cycle 1)** | `POST/GET/DELETE /api/apps/:appSlug/domains` + per-app dashboard panel | Customer types `deals.acme.com`, sees a "Verifying DNS" pill, gets a copy-pasteable CNAME hint. Per-domain status: pending / verified / failed / removed. Cross-tenant attach returns 404 (locked in by tests). 23 routes integration tests + new `app_domains` table migration. DNS verification poller (CC-5b) + Fly cert provisioner (CC-5c) are follow-up cycles. |

**To run buildclear.dev in production:** set `DATABASE_URL` (Fly Postgres or Neon), set `CLEAR_CLOUD_MODE=1`, set `NODE_ENV=production`. The migrations apply on first boot, the four auth URLs become reachable, and the three pages serve at the named paths.

## Developer Tooling (Dave-first wedge — shipped 2026-04-24)

The "language your coding agent writes without retries" surface. Editor integration + remote Compiler API. See `ROADMAP.md` → "Strategic pivot under review (2026-04-24) — Dave-first wedge" for status; this section documents what's built.

| Component | Where | What it does |
|-----------|-------|--------------|
| **Compiler API** (`compiler-api/worker.js`) | Cloudflare Worker | POST `/compile` wraps `compileProgram()`. Accepts single source or multi-file via `modules` dict. Structured-JSON telemetry per request. 1MB source cap. Permissive CORS for browser/IDE callers. Deploy with `wrangler deploy` after pasting Cloudflare account into `wrangler.toml`. 12 passing tests. |
| **`clear-lsp`** (`clear-lsp/server.mjs`) | Zero-dep stdio LSP | JSON-RPC framing (single, multi, split-chunk). Diagnostics via the Compiler API (debounced 400ms). Local scan for keyword + component + function + page completions. 13 passing tests. |
| **VSCode + Cursor extension** (`vscode-extension/`) | Thin LSP wrapper | TextMate grammar, language config, `clear.compilerApi` + `clear.debounceMs` user settings. F5-launch in VSCode for development. 16 structural tests against manifest + grammar + config. |
| **Namespaced component calls** | `compiler.js` | `use 'ui'` + `show ui's Card('Revenue')` works end-to-end. Bare (`Card(x)`) and namespaced (`ui's Card(x)`) calls share a single `getComponentCall()` predicate across `compileNode` SHOW-in-page, `needsReactive`, reactive JS emit, and `buildHTML`. Reactive JS emits `namespace.Card(args)` when namespaced. |
| **`landing/for-developers.html`** | Static | Dave-targeted landing page. "The language your coding agent writes without retries", side-by-side TS+Cursor vs Clear, 4-metric comparison row, 3-step install (CLI + extension + scaffold). |
| **`landing/dave.clear`** | Self-hosted | Proof-of-concept one-file landing page written in Clear itself. Compiles to a static HTML/JS/CSS bundle. Shows the language can build its own marketing surface. |

**Verification gates Russell still owes** before D-6 (HN launch): `wrangler deploy` for the Compiler API, F5-test the VSCode extension locally, `npm publish` for clear-lsp + clear-cli + the extension, eyeball `landing/for-developers.html` + Lighthouse pass.

---

## Compile Targets

| Target | How to select | What ships | Notes |
|--------|---------------|------------|-------|
| **JavaScript (Node + Express)** | default | `server.js` + `index.html` + `package.json` | Local memory / SQLite / PostgreSQL / Supabase backends |
| **Python (FastAPI)** | `compile target: python` or CLI flag | `server.py` + `requirements.txt` | Mirrors JS feature surface; TEST_INTENT still stubs as `pytest.skip` |
| **HTML scaffold** | implicit (every app) | `index.html` + DaisyUI v5 + Tailwind v4 + Lucide icons | Auto-generated ASCII architecture diagram at top of compiled file |
| **Cloudflare Workers** | `compile target: cloudflare` | Workers bundle + `wrangler.toml` (pinned compat date + flags) + D1 migrations | All 8 core templates compile clean; auth uses webcrypto; streaming via ReadableStream; tool-use Workers-safe; agents emit to shared `src/agents.js` for cross-module calls |

**Cloudflare-specific capabilities (auto-selected when target is `cloudflare`):**

| Feature | Compiles To | Notes |
|---------|-------------|-------|
| Database (any CRUD) | D1 prepare/bind/run | `runtime/db-d1.mjs` matches `runtime/db.js` interface; UPDATE requires id with instructive error |
| Where clauses | D1 parameterized binds | SQL injection-safe by construction |
| Auth (`allow signup and login`) | webcrypto hashPassword + constant-time verifyPassword | Replaces bcrypt for Workers compatibility |
| AI calls (`ask claude`) | `_askAI_workers` (fetch-only) | Streaming via ReadableStream; tool-use loop unchanged from Node |
| `runs durably` | Cloudflare Workflows | Vendor-neutral canonical; Node target uses Temporal |
| `every X` / `every day at 9am:` | Cloudflare Cron Triggers (cron expressions in `wrangler.toml`) | Duration phrases auto-convert |
| `knows about: <Table>` | Lazy-load from D1 at request time | Compile-time inline for text/PDF/DOCX (size-gated, warns on oversized) |
| `knows about: '<URL>'` | Lazy-fetch on first request | Per-Worker cache |

---

## Compiler Guarantees — Bug Classes Eliminated at Compile Time

Every app compiled from Clear ships with these protections. Fix a pattern once, every app gets the fix on recompile.

### Security (compile errors — can't ship these bugs)

| Bug Class | How It's Prevented | Validator/Compiler |
|-----------|-------------------|-------------------|
| Dead UI routes | Internal `/api/...` app calls must match declared endpoints; nav/link destinations must match declared pages | `validator.js` — hard errors on broken app calls and missing page targets |
| SQL injection | All CRUD uses parameterized queries, always | `compiler.js` — `db.insert()`, `db.query()` with param binding |
| Auth bypass | DELETE/PUT without `requires login` = compile ERROR | `validateSecurity()` |
| Mass assignment | `_pick()` strips unknown fields from request body | `compiler.js` — generated `_pick()` helper |
| CSRF | Data-mutating endpoints without auth = error | `validateOWASP()` |
| Path traversal | File ops with variable paths = warning | `validateOWASP()` |
| PII in errors | Passwords/tokens/keys auto-redacted from error responses | `_clearError()` — `redact()` function |
| Sensitive field exposure | Schema has `password`/`secret`/`api_key` = warning | `validateSecurity()` |
| Brute force | Login/signup without rate limiting = warning | `validateSecurity()` |
| Overly permissive CORS | CORS enabled + no auth on endpoints = warning | `validateSecurity()` |

### Correctness (compile errors or warnings — caught before runtime)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Undefined variables | Forward reference check with typo suggestions | `validateForwardReferences()` |
| Type mismatches in math | String used in arithmetic = error | `validateInferredTypes()` |
| Frontend-backend URL mismatch | Fetching `/api/user` when endpoint is `/api/users` = warning | `validateFetchURLsMatchEndpoints()` |
| Missing responses | Endpoint without `send back` = warning | `validateEndpointResponses()` |
| Schema-frontend field mismatch | Sending `username` to table with `user_name` = warning | `validateFieldMismatch()` |
| Duplicate endpoints | Same method+path declared twice = warning | `validateDuplicateEndpoints()` |
| Undefined function/agent calls | Calling undefined agent or pipeline = error | `validateCallTargets()` |
| Type errors in function calls | Literal arg doesn't match typed param = error | `validateTypedCallArgs()` |
| Member access on primitives | `score's name` where score is a number = warning | `validateMemberAccessTypes()` |
| Agent tool mismatches | Agent references undefined function as tool = error | `validateAgentTools()` |
| Read-modify-write races (Phase 1, 2026-05-02) | Endpoint reads → mutates → saves without `with optimistic lock` or `safe to retry` = warning `[READ_MODIFY_WRITE_NO_LOCK]` | `validateConcurrency()` |

### Business Logic (warnings — common mistakes caught)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Negative balance/stock | Subtracting without guard = warning | `validateArithmetic()` |
| Overbooking | Inserting without capacity check = warning | `validateCapacity()` |
| Deep property chains | 4+ levels of possessive access = warning | `validateChainDepth()` |
| Complex expressions | 3+ operators in one expression = warning | `validateExprComplexity()` |
| Invalid classification | Classify with < 2 categories = error | `validateClassify()` |

### Generated Code Protections (always in compiled output)

| Protection | What It Does |
|-----------|-------------|
| Input validation | `_validate()` checks required fields, types, min/max/pattern on every POST/PUT |
| Mass assignment filter | `_pick()` only allows schema-defined fields through |
| PII redaction | `_clearError()` strips sensitive fields from all error responses |
| Source maps | `_clearLineMap` maps runtime errors back to Clear line numbers |
| XSS escaping | `_esc()` escapes user input in all display/template contexts |

### Not Yet Prevented (known gaps)

| Bug Class | Status | Notes |
|-----------|--------|-------|
| Race conditions | Not prevented | Two users updating same record simultaneously |
| Null reference chains | Partial | Optional chaining exists but not enforced |
| Cross-tenant data leakage | Prevented (2026-05-03) | App-layer filter shipped Phase 1+2; Postgres `ROW LEVEL SECURITY` policies + per-request `SET LOCAL` shipped night of 2026-05-03 — defense in depth on `database is postgres with tenant scope` |
| Type safety on external returns | Not prevented | `ask ai` returns untyped string |
| Sensitive data in logs | Partial | `_clearError()` redacts, but `log every request` logs full bodies |
| Promise rejection handling | Not prevented | Async without error handler swallows errors |

### Type System Assessment

**Current state:** Limited inference (literals + function params). Catches type mismatches in arithmetic and function calls.

**Recommendation:** Not needed yet for enterprise internal tools market. The 27 security/correctness guarantees matter more than type safety for CRUD apps. Revisit when targeting engineering teams who compare to TypeScript.

---

## What You Can Build

### Tier 1 — Ship in an hour, no `script:` needed

| Category | Examples |
|----------|---------|
| Admin dashboards | CRUD, roles, search, charts, aggregate stats |
| AI agents | RAG, tool use, memory, pipelines, guardrails, structured output |
| SaaS MVPs | Auth, validation, email, scheduling, webhooks |
| Data apps | CSV import, filter, chart, export |
| Chat apps | `display as chat` with markdown, typing dots, scroll, input absorption |

### Tier 2 — 90%+ Clear, minor `script:` for edge cases

| App | What needs `script:` |
|-----|---------------------|
| Project management | Drag-and-drop kanban |
| Blog / CMS | Rich text editing |
| E-commerce | Stripe checkout flow |
| Monitoring | Slack/PagerDuty webhook format |

### Tier 3 — Wrong tool for the job

| App | Why |
|-----|-----|
| Collaborative editing | Operational transforms, conflict resolution |
| Video / audio calls | WebRTC, media streams, STUN/TURN |
| Mobile apps | Clear targets web only |
| Games | Canvas/WebGL, physics, sprites |
| Social media feeds | Algorithmic ranking, infinite scroll, image pipelines |

---

## Not Building (and Why)

These are deliberate non-goals. Each has been considered and rejected.

| Feature | Reason |
|---------|--------|
| Generic OAuth / arbitrary social login | Google Workspace is first-class for Gmail + Calendar. Other providers still need a deliberate primitive, not a generic OAuth blob. |
| Soft delete | `deleted_at` field + filter. Not worth a keyword. |
| Geolocation | One-liner `script:` call. Niche browser API. |
| Camera / microphone | One-liner `script:` call. Niche. |
| Speech to text / text to speech | One-liner `script:` call. Niche. |
| Push notifications | Service workers + VAPID keys. Too much plumbing. |
| Drag and drop | HTML5 events via `script:`. Niche. |
| Infinite scroll | IntersectionObserver via `script:`. Performance concern, not language feature. |
| Per-user app forks | Every employee seeing a fundamentally different version of the app destroys the shared ontology. Audit/compliance nightmare. See Live App Editing in ROADMAP for the right answer (owner-initiated changes that ship to everyone). |

- **AI provider routing (Phase 6, 2026-05-13)** — Clear apps can target Anthropic Claude (default), OpenRouter, Google Gemini direct, or OpenAI. Top-level `ai provider is X` sets a default; per-call `via provider 'X'` on `ask ai` / `stream ask ai` / `classify` overrides on a single call. Runtime helper handles the HTTP shape per provider. Env vars: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`.


## Phase 6.5 (2026-05-15) - Google Workspace authorization

| Feature | Canonical syntax | Emits |
|---|---|---|
| Google consent | `use google workspace` | OAuth start/callback/status routes plus an internal token table |
| Google authorize button | `login with google` | Frontend redirect to `/api/google/auth/start` |
| Gmail search | `messages = search gmail for query` | Gmail readonly API search with metadata/snippets, no raw token exposure |
| Calendar search | `events = search google calendar for query` | Calendar readonly API search, including attendee names and emails when available |

Runtime env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GOOGLE_REDIRECT_URI`.

Guardrail: Gmail and Calendar data is external input. Compiled records are marked `trust: 'untrusted_external_content'` and `secret_ref: 'google_oauth_ref'`. Agents should see the data, never the OAuth token.


## Phase 5.5 (2026-05-13) — DaisyUI form widgets + Nixie theme

| Feature | Canonical syntax | Emits |
|---|---|---|
| Date+time picker | `'Due' is a datetime input that saves to var` | `<input type="datetime-local" class="input input-bordered w-full">` with reactive `_state` binding |
| Radio selector | `'Pick' is radio with ['a','b','c'] that saves to var` | DaisyUI radio group, one `<input type="radio" class="radio radio-primary">` per option, shared name attr |
| Slider | `'Value' is a slider from 0 to 100 that saves to var` | `<input type="range" class="range range-primary" min="0" max="100">`, stores Number |
| Accordion section | `section 'X' as accordion:` | DaisyUI `<div class="collapse collapse-arrow">` per child, mutually-exclusive radio buttons |
| Nested nav chevron | nav item followed by indented nav items | Auto-emits Lucide chevron-down + `clear-nav-expandable` class + nested `<ul>` |
| Nixie theme | `theme 'nixie'` | Amber on warm-dark; focal glow via text-shadow/box-shadow; optional scanline overlay |
