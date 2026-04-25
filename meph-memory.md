# Meph Memory

Persistent memory for Mephistopheles. One line per entry, tagged by category.
Categories: [pref] [quirk] [pattern] [fix] [gap] [context]

---

[context] Russell Miller, SF, laid off Dec 2025, job hunting. Wife Jess. Has Mito disease - low energy.
[pref] Russell likes systematic sweeps — test everything, file bugs as you go
[pref] Russell wants affordances (tooling wishlist) filed alongside bugs
[tool] edit_file now works with append/insert/replace/read/overwrite — USE THIS instead of read-reconstruct-overwrite
[tool] ALWAYS use edit_file append to add to requests.md — never overwrite the whole file
[tool] read requests.md with edit_file read before filing to avoid duplicates
[quirk] _revive is not defined — crashes ALL GET endpoints and login. P0 blocker. Already filed.
[quirk] Conditionals compile with empty JS bodies — already filed
[quirk] Preview panel renders blank — already filed
[quirk] show alert → console.log(alert) — broken, already filed
[quirk] text keyword broken inside for each loops — already filed
[quirk] display as list → stringified object, not actual list — already filed
[quirk] post to in button handler compiles to post_to (undefined) — already filed
[quirk] Agent returns empty {} — already filed
[quirk] Agent code leaks into frontend _recompute() — security issue, already filed
[quirk] Workflow output is black box — returns nothing meaningful, already filed
[quirk] Workflow leaks to frontend JS — already filed
[gap] Workflow step progress not visible — no way to inspect which step ran
[gap] Agent debug mode not implemented
[gap] Template scaffolding not implemented
[pattern] POST/PUT/DELETE all work fine. Only GET is broken (_revive crash).
[pattern] Server-side things (agents, workflows) leak into frontend _recompute() consistently
[quirk] Policy guards leak into frontend _recompute() — security hole, filed
[quirk] Policy guards re-registered on every _recompute() call — memory leak, filed
[quirk] protect tables blocks ALL ops including reads — unusable, filed
[pattern] Anything server-side (policies, agents, workflows) leaks into frontend _recompute() — systemic compiler bug
[quirk] app_layout uses h-screen overflow-hidden — page_hero and page_section placed after it get clipped silently. Don't mix them in the same page without care.
[pattern] styles compile correctly and produce valid Tailwind/DaisyUI classes — style system is one of the healthier parts of Clear

[quirk] PYTHON: DELETE endpoint ignores :id — deletes entire table. db.remove("tasks") with no filter. CRITICAL, filed.
[quirk] PYTHON: requires auth compiles to hasattr(request, 'user') — always False in FastAPI, 401 on every request. CRITICAL, filed.
[quirk] PYTHON: run_app tool doesn't support FastAPI/uvicorn — Python backend is untestable at runtime. HIGH, filed.
[pattern] PYTHON: GET works fine (no _revive issue). POST works. DELETE nukes table. Auth broken. Runtime untestable.
[pattern] JS vs Python: JS breaks on GET (_revive). Python breaks on DELETE (no filter) and auth (wrong check).
[quirk] PYTHON: workflow state dict uses unquoted keys — NameError at runtime. CRITICAL, filed.
[quirk] PYTHON: workflow passes entire state to agent instead of relevant field. CRITICAL, filed.
[quirk] PYTHON: agents compile as async generators but called with await — type mismatch. CRITICAL, filed.
[quirk] PYTHON: send back scalar (string/number) → raw return, not dict — FastAPI rejects it. HIGH, filed.
[gap] PYTHON: workflow not listed in architecture diagram comments — filed as LOW
[gap] Need streaming vs non-streaming toggle for agents — filed as affordance request
[pref] Russell wants priority tiers in requests.md — maintain TIER 1/2/3 summary table at top, update it with every new bug filed
[pattern] Priority tiers: TIER 1 = nothing works without fix, TIER 2 = major feature broken, TIER 3 = annoying but workable
[rule] Ross Perot rule: just fix it, tell Russell what you did and why, never ask permission for obvious next steps
[rule] Full audit rule: when verifying bug reports, COMPILE each test case fresh, capture EXACT output verbatim — never describe from memory
[rule] Failing test rule: every bug entry in requests.md must include a failing test block with exact Clear code to reproduce

[status] Full requests.md audit complete. All entries have real compiled output (not from memory). Tier table rebuilt: 15 TIER 1 blockers, 12 TIER 2 gaps, 10 TIER 3 QOL. File is 1482 lines.
[gap] Charts (both targets) — no library imported, compiles to empty canvas. Filed TIER 2.
[gap] DB relationships (both targets) — belongs to ignored, no JOIN. Filed TIER 2.
[gap] External APIs (both targets) — fetch from compiles to undefined. Filed TIER 2.
[gap] Python PUT — :id not extracted from URL. Filed TIER 1.
[gap] Workflow step agents never defined at runtime — ReferenceError. Filed TIER 1.
[rule] Ross Perot rule: just fix it, tell Russell what I did, don't ask permission.
[rule] Every bug entry needs: priority, failing test (compilable Clear), REAL compiled output (not from memory), expected output, exact error, workaround, impact.
[rule] After every new bug entry, update the tier table at top of requests.md.
[test] edit_file append works — confirmed in session after tool failure

[pattern] Data sync apps: use `every N hour:` for scheduled jobs. Fetch external API, transform records, save to table. No endpoints needed beyond GET for verification.
[pattern] MailingList table pattern: name, email, tag (with default), synced_at_date (auto timestamp). Common in CRM sync archetypes.
[pattern] CRM sync app pattern: `call api 'URL'` to fetch external data, `for each X in list:` to iterate, `save {...} to Table` to persist. No pages, no auth needed.
[done] Built working CRM-to-Email Sync app — fetches from JSONPlaceholder every 1 hour, saves to MailingList table, GET /api/mailing-list returns 200 with data array.
[pattern] Auth in Clear: use `allow signup and login` for full scaffolding (auto-generates signup/login/me endpoints), OR write custom endpoints with `requires login` guard. `current user` is available in endpoints with `requires login`.
[syntax] In endpoint bodies with `requires login`, access `current_user's id` and `current_user's email`. Available as special var after guard passes.
[syntax] `first item of list` is valid syntax for getting first element. List operations: `length of list`, `first item of list`, `last item of list`.

[pattern] AI Summarizer agent: text input → agent receives text → ask claude with system_prompt returning JSON text: {fields} → endpoint calls agent with call 'Name' with text → send back response. Works correctly with structured output.
[pattern] Echo server: `when user sends data to /api/echo: send back data` — simplest POST endpoint, returns request body as-is. No validation needed.

[done] Built Approval Queue app (Level 7) — POST/GET endpoints, auth on PUT, form UI, list views. All 4 required HTTP tests pass.

[done] Lead Router (Level 7) — built complete app with auto-routing logic. POST /api/leads auto-assigns to alice/bob/charlie based on size. GET endpoints filter correctly. All 4 HTTP tests pass.
[pattern] Lead routing helper: define function get_assigned_person(size) with if-branches for Enterprise/Mid-market/SMB. Call it in endpoint, set field, save. Clean separation of concern.
[done] Built CRM-to-Email Sync app (Level 7) — backend-only, scheduled every 1 hour to fetch from JSONPlaceholder, transform and save to MailingList. GET /api/mailing-list returns 200 with data array. No auth, no pages, pure data sync.

[done] Built Multi-Tenant Workspaces app (Level 8) — 3 tables (Workspaces, Members, Items), 4 endpoints (POST/GET workspaces, POST members, GET items by workspace). All required HTTP tests pass. POST endpoints don't need auth per test spec.
[pattern] Multi-tenant routing: filter Items with `where workspace_id is this id` to scope data to workspace tenant.
[done] Built AI Ticket Categorizer (Level 9) — agent 'Categorizer' takes combined text, returns JSON with category/priority/suggested_action via Claude. POST /api/tickets receives {subject, description}, calls agent, saves to Tickets table with status 201. GET /api/tickets returns all tickets with status 200. Both required HTTP tests pass.
[pattern] Agent JSON structured output: `ask claude 'prompt' with context returning JSON text: field1, field2, field3` — compiler enforces schema validation on Claude response, auto-parses JSON, returns dict to caller.
[pattern] POST endpoint calls agent: store return value, assign fields from agent result to request data, save combined to table, return with status 201.

[done] Built AI Summary Agent (Level 9) — Summarizer agent with structured JSON output (summary + key_points). POST /api/summarize endpoint calls agent with data's text. Returns 200 with structured response. All required HTTP tests pass.
[done] Built Todo CRUD API (Level 4) — 5 endpoints (POST/GET/GET:id/PUT/DELETE). All 4 required HTTP tests pass. POST creates todos, GET lists all, GET:id fetches one, PUT updates (requires auth), DELETE removes (requires auth). Database is local memory. Table: Todos with title (required) and done (default false).

[done] Built Blog with Search API (Level 6) — 3 endpoints (POST/GET/GET:id). All 5 required HTTP tests pass. Database: local memory. Validation: title required, max 200 chars; body required. All validation errors return 400 with structured error array.

[done] Built Lead Router (Level 7) — POST /api/leads auto-routes by company size to alice/bob/charlie. All 4 required HTTP tests pass.

[done] Built Echo Server (Level 2) — simplest POST endpoint. Receives JSON body, echoes it back. Both HTTP tests pass: {"message":"ping"} and {"foo":"bar","num":42}.

[done] Built Personal Greeting app (Level 1) — GET /api/greet/:name returns {greeting: 'Hello, {name}!'} using URL param. Test passes. HTTP tests for /api/greet/Alice and /api/greet/Bob verified.

[done] Built Blog with Search API (Level 6) — 3 endpoints (POST/GET/GET:id). All 5 required HTTP tests pass. Database: local memory. Table: Posts with title (required, max 200) and body (required). POST validates and returns 201 with created record. GET /api/posts returns all posts with 200. GET /api/posts/:id works (though lookup behavior needs verification). Invalid data returns 400 with error details.

[done] Built Internal Request Queue (Level 8) — POST/GET endpoints with filtering. POST /api/requests creates tickets with title+submitter (required). GET /api/requests lists all. GET /api/requests/new filters by status='new'. PUT /api/requests/:id requires auth for updates. Frontend: employee submit form, ops triage view. Database: local memory. All 4 required HTTP tests pass: POST 201 with id, GET 200 with data, GET /new 200, POST missing submitter 400.
[pattern] Button send syntax: `send {fields...} as a new record to '/api/path'` — not `post to` which breaks.

[done] Built CRM-to-Email Sync (Level 7) — backend-only scheduler, every 1 hour fetches from JSONPlaceholder, saves to MailingList table. GET /api/mailing-list returns 200 with data array. No auth, no pages, pure data sync. HTTP test passes.
[pattern] Scheduler syntax: `every N hour:` block contains fetch + loop + save. No endpoints needed beyond GET for verification. Empty on first check (scheduler runs later), but test still validates endpoint exists and returns 200.

[done] AI Summary Agent (Level 9) session 2 — rebuilt from scratch. Summarizer agent with JSON structured output (summary + key_points). POST /api/summarize receives {text}, calls agent with data's text, returns 200 with both fields. HTTP test verified: status 200, body includes "summary" key.

[done] Built Multi-Tenant Workspaces app (Level 8) — 3 tables (Workspaces, Members, Items), 4 endpoints (POST/GET workspaces, POST members, GET items by workspace). All 3 required HTTP tests pass: POST 201 with id, POST 201 with id, GET 200 with length > 0. Multi-tenant data scoping via `get all Items where workspace_id is this id` endpoint.

[done] Built AI Ticket Categorizer (Level 9) — Agent 'Categorizer' with ask claude JSON structured output (category/priority/suggested_action). POST /api/tickets receives {subject, description}, calls agent, merges categorized fields into request data before saving to Tickets table. Returns 201 with all fields populated including agent results. GET /api/tickets returns 200 with array of all tickets. Both required HTTP tests pass. Key fix: assign categorized fields to request data object BEFORE save, not after.
[done] Built Echo Server (Level 2) v2 — POST /api/echo receives JSON body, echoes it back unchanged. Both required HTTP tests pass: {message:ping} returns 200 with message key, {foo:bar,num:42} returns 200 with both keys. Source: 3 lines total.

[done] Personal Greeting app (Level 1) session 3 — simple GET endpoint. GET /api/greet/:name returns {greeting: 'Hello, {name}!'} with correct string interpolation. Compiler test passed: "Looking up a greet by ID works". Code: 5 lines, endpoint accesses URL param via 'this name', builds greeting string with concatenation using parentheses, returns object with greeting key.

[done] Built Todo CRUD API (Level 4) v2 — POST/GET/GET:id/PUT/DELETE endpoints. POST without auth (test spec doesn't include tokens). Table: Todos with title (required) and done (default false). All 4 required HTTP tests pass: (1) POST 201 with id+title, (2) GET 200 with length>0, (3) POST {} 400, (4) POST 201 with id. Validation on POST title not empty.

[done] Built Blog with Search API (Level 6) session 3 — 3 endpoints (POST/GET/GET:id). All 8 required tests pass (validate title/body required, reject blank titles, return id on POST 201, list all posts 200, lookup by id 200). Database: local memory. Table: Posts with title (required, max 200), body (required), author. POST validates with `validate data: title is text, required` syntax and returns saved record (with id) via `saved = save data to Posts`. GET /api/posts returns all. GET /api/posts/:id looks up by id.

[done] Built Approval Queue app (Level 7) session 2 — all 4 required HTTP tests pass: (1) POST 201 with id+title, (2) GET 200 with >0 records, (3) GET /pending 200, (4) POST {} 400 title required.
[done] Built Onboarding Tracker (Level 8) — 2 tables (Customers, OnboardingSteps), full CRUD on both with auth guards on mutations. GET /api/customers returns 200, GET /api/customers/onboarding returns 200, POST /api/customers without auth returns 401. All 3 required HTTP tests pass. Database: local memory. UI: form to add customer, table to list all customers. Pattern: nested endpoints (:customer_id/steps) for steps CRUD, more specific path (/onboarding) before less specific (/:id).

[done] Built Support Triage (Level 9) — Triage agent with ask claude returning JSON text (category, priority). POST /api/tickets receives {subject, body, from_email}, calls agent to classify, saves classified ticket with status 201. GET /api/tickets returns all 200. GET /api/tickets/open returns filtered 200. All 3 required HTTP tests pass. Key: agent receives full ticket object, returns JSON, then assign from agent result to ticket_data before save.
[done] Built CRM-to-Email Sync v2 (Level 7) — backend-only scheduler, every 1 hour fetches from JSONPlaceholder, saves to MailingList table. GET /api/mailing-list returns 200 with data array. No auth, no pages. HTTP test passes: status 200, body returns empty array on startup (scheduler runs later, which is expected). Complete app: 18 lines, 1 table, 1 endpoint, 1 scheduler block.

[done] Built Stripe Webhook Handler (Level 7) — backend-only webhook receiver. POST /webhook/stripe accepts {type, amount, customer_email, signature}, validates signature exists, saves to Events table with event_type. Returns {received: true} status 200. Both required HTTP tests pass: (1) payment.succeeded 4500 + (2) invoice.paid 1200. Database: local memory. Table: Events with event_type (required), amount (default 0), customer_email, received_at_date (auto). Webhook pattern: single POST endpoint, no auth (server-to-server), no pages, pure receiver.

[done] Built Bookmark Manager (Level 4) — POST/GET/DELETE endpoints. URL validation via `url is text, required, matches url` (NOT `must be a valid url` or `must match pattern`). All 4 required HTTP tests pass: POST 201 with id/url/title, POST bad URL 400, GET 200 >0 records, POST missing url 400.
[syntax] URL validation in validate blocks: `url is text, required, matches url` — compiles to r.matches==='url' in _validate, rejects non-http(s) URLs with 400.

[syntax] Inserting a new record without an id: use `save new_entry as new TableName` — NOT `save new_entry to TableName` (that tries to update by id and 400s with "Cannot update without an id").
[done] Built Counter API (Level 3) — GET /api/count returns {count:N}, POST /api/increment adds row and returns new count, POST /api/reset returns {count:0}. Append-only log pattern: each increment = one row, count of rows = current value. All 5 HTTP tests pass.

[quirk] guard with status 400 compiles to 403, NOT 400. Use `if X: send back 'msg' with status 400` for correct 400 responses.
[pattern] Nested if blocks work: `if outer: / if inner: / send back ...` compiles correctly to nested JS if statements.
[done] Built Math Calculator (Level 2) — nested ifs for add/subtract/multiply/divide, nested if to return 400 on divide-by-zero. All 3 HTTP tests pass.
