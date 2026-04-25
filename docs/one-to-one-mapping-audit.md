# 1:1 Mapping Audit (RR-2, 2026-04-21)

PHILOSOPHY rule that drives this audit:

> Every line of compiled output must trace back to exactly one line of Clear.
> No "super commands" that silently generate 50 lines of boilerplate. If the
> compiled code does something, there's a Clear line that asked for it.
> — `PHILOSOPHY.md`, Rule 1:1 Mapping

This audit walks the compiler looking for keywords where one Clear line
emits many lines of compiled JS/Python with no source-level visibility into
what got emitted. Ranked by lines-of-output per line-of-source ratio.

**TL;DR for the next session:**
- The handoff named CHECKOUT, OAUTH_CONFIG, USAGE_LIMIT as worst offenders.
  On inspection, all three are already 1:1 — they emit 5–10 lines of `const`
  config with a header comment naming the source. They look like violations
  because they have a domain keyword (`checkout` instead of `define`), but
  the emit volume is honest.
- The **real** worst offenders are `AUTH_SCAFFOLD` (`allow signup and
  login`), `AGENT_DEF` with skills/tools/RAG/memory, and `WEBHOOK`.
- Implemented in this commit: provenance comment on AUTH_SCAFFOLD output.
- Planned for next sessions: explicit forms for AGENT_DEF and WEBHOOK,
  optional removal of OAUTH_CONFIG and USAGE_LIMIT (zero app usage).

---

## Triage of named candidates (handoff list)

### CHECKOUT — `checkout 'Pro Plan': ...` → ~5–10 lines

```js
// Checkout config: Pro Plan
const CHECKOUT_PRO_PLAN = {
  price: 'price_abc123',
  mode: 'subscription',
  success_url: '/success',
  cancel_url: '/pricing',
};
```

**Verdict (2026-04-25 update): soft deprecation.** Emit volume IS 1:1 — one
block in, one const out — but the const name (`CHECKOUT_PRO_PLAN`) lives in
a JS namespace no Clear code can reach. There's no way to write `send back
CHECKOUT_PRO_PLAN`'s `price` from Clear, because that name is invented at
emit time, not bound to a Clear identifier. So while the *line ratio* is 1:1,
the *naming* is one-way.

**Action taken:** validator now emits a deprecation warning steering authors
toward `create pro_plan_checkout: ...` (a real Clear binding that can be
referenced anywhere). The keyword still parses for back-compat. The 3 sample
apps (`full-saas`, `saas-billing`, `ecommerce-api`) have been migrated.

If a future session wants full removal: delete `parseCheckout`, the
`'checkout'` token entry, the compiler `case NodeType.CHECKOUT`, and update
the existing parser/compiler tests that exercise the legacy form.

---

### USAGE_LIMIT — `limit 'ai_generations': ...` → ~6–10 lines

```js
// Usage limits: ai_generations
const LIMITS_AI_GENERATIONS = {
  'free': { max: 5, period: 'month' },
  'pro': { max: Infinity, period: 'month' },
};
```

**Verdict: not a real violator.** Same shape as CHECKOUT — config-only emit.

**Real-world use:** **0 apps.** Zero hits in `apps/*/main.clear`. Used only
in compiler tests.

**Recommended action:** **remove from parser + compiler.** Update tests to
delete the dead cases. The "explicit source form" for the same intent is a
record literal:

```clear
ai_generation_limits = {
  free is { max is 5, period is 'month' }
  pro is { max is 'unlimited', period is 'month' }
}
```

That's already valid Clear syntax (record literals work). Removing the
keyword cuts ~30 lines of parser + compiler + test code with zero user
impact.

---

### OAUTH_CONFIG — `oauth 'github': ...` → ~5 lines

```js
// OAuth config: github
const OAUTH_GITHUB_CLIENT_ID = process.env.GH_ID;
const OAUTH_GITHUB_SCOPES = ["user:email"];
```

**Verdict: not a real violator.** Config-only emit again.

**Real-world use:** **0 apps.**

**Recommended action:** same as USAGE_LIMIT — **remove from parser +
compiler.** The explicit form is environment-variable assignments + a
record:

```clear
github_oauth = {
  client_id is env('GH_ID')
  scopes are ['user:email']
  callback is '/auth/github/callback'
}
```

---

## Real worst offenders (the ones worth fixing)

Ranked by output-lines-per-source-line ratio.

### #1 AUTH_SCAFFOLD — `allow signup and login` → ~70+ lines

**One Clear line emits:**
- JWT secret declaration (uses `crypto.randomBytes` for fallback)
- Owner-email detection logic (if app declared `owner is 'X@Y.com'`)
- `bcrypt` + `jsonwebtoken` requires
- `requireLogin` middleware function
- `requireRole` middleware function
- POST `/auth/signup` endpoint (validates email + password, hashes with
  bcrypt cost 10, inserts into Users, returns JWT)
- POST `/auth/login` endpoint (looks up by email, compares bcrypt hash,
  returns JWT or 401)
- GET `/auth/me` endpoint (verifies JWT, returns current user)
- Auto-creates `Users` table if not declared
- Optional: extra `requires_admin` middleware if any role guard exists

This is the worst real offender. **70+ lines of compiled code from one
3-word Clear line.**

**Why it exists:** auth is what every app needs and nobody wants to write.
Replacing `allow signup and login` with explicit endpoints for signup,
login, and /auth/me would be a 30-line ceremony per app — net negative for
the 14-year-old test.

**Proposed explicit form (for the source-of-truth purist):**

```clear
# What `allow signup and login` actually does:
auth scaffold:
  jwt secret: env('JWT_SECRET') or random
  signup: POST /auth/signup with email, password
    hash password with bcrypt cost 10
    save as new User
    return jwt with id, email, role: 'user'
  login: POST /auth/login with email, password
    look up User by email
    compare bcrypt
    return jwt with id, email, role
  me: GET /auth/me with required login
    return caller
  middleware:
    requireLogin: parse Bearer token, verify, attach req.caller
    requireRole(role): requireLogin + check req.caller's role is role
```

That makes the auth scaffolding visible without forcing the user to write
all the bcrypt/jwt boilerplate themselves. The compiler still emits the
same JS, but the Clear source maps line-for-line.

**Implemented in this commit (smaller intermediate fix):**
Provenance comment on the emitted JS naming the Clear source line and
listing the endpoints/middleware that got generated. Source-level
visibility in the compiled output without requiring an explicit-form
rewrite of every auth-using app.

**Planned next:** proposal RFC for the explicit form above. Phased rollout:
ship explicit form as alternative; mark `allow signup and login` as
sugar; eventually deprecate the sugar form once explicit form is documented
in templates.

---

### #2 AGENT_DEF (with skills/tools/RAG/memory) — varies, often 100+ lines

**One Clear block:**

```clear
agent 'Helpdesk' receives question:
  has tools: lookup_product, create_ticket
  knows about: Products
  remember conversation context
  block arguments matching 'delete|drop|truncate'
  response = ask claude '...' with question
  send back response
```

**Emits roughly:**
- `agent_helpdesk(question, ctx)` async function
- Tool dispatch loop with bounded turn count
- Tool argument validation against the `block arguments matching` regex
- RAG: keyword search over Products table before each turn, injection
  into system prompt
- Conversation memory: SELECT/INSERT against `Conversations` table per
  turn
- Anthropic API call with `tools: [{name, description, input_schema}, ...]`
- Stream-mode handling (default) vs single-response handling
- JSON parsing for `returning JSON text:` if declared
- Error handling for rate limits, tool exceptions, malformed responses

**Lines emitted:** typically 80–150 depending on tool/skill/RAG count.

**Why this is the worst category:** agent semantics are inherently
dispatched (tool-loop, streaming, memory-store reads/writes). Each piece
COULD be expressed explicitly in Clear, but the loop logic is the same
every time. The 1:1 violation is real but the alternative (writing the
tool-loop manually in every Clear app) defeats the purpose of having
agent syntax.

**Recommended action:** keep `agent` keyword but emit a per-block
provenance comment that names: the agent name, line number, list of tools,
list of skills, RAG sources, and whether memory/streaming/structured-output
are wired. Future readers can grep `// agent provenance:` in compiled JS to
map back.

**Planned next:** add the provenance comment in compileNode's AGENT_DEF
case; document the proposed audit-trail format in `intent.md` so other
contributors emit it consistently.

---

### #3 WEBHOOK — `webhook '/stripe' signed with env('SECRET'): ...` → ~25–40 lines

**One Clear line emits:**
- `app.post('/stripe', express.raw({ type: 'application/json' }), ...)`
  (raw body parser, scoped to this route only)
- HMAC-SHA256 signature verification using `crypto.createHmac`
- Signature header detection (Stripe-Signature, X-Hub-Signature, etc.)
- Timing-safe compare via `crypto.timingSafeEqual`
- Body re-parse from raw buffer to JSON
- 401 on signature mismatch with logged failure
- 400 on body-parse failure
- The user-supplied body of the webhook block

**Lines:** 25–40. Smaller than AUTH_SCAFFOLD but ratio is still ~30:1.

**Why:** webhook signature verification is security-critical and
notoriously easy to get wrong. Hiding it in the compiler is the right
trade-off — if an app has to write its own HMAC verification, mistakes are
inevitable.

**Recommended action:** provenance comment naming the source line, the
signature header expected, the verification algorithm. Same pattern as
AUTH_SCAFFOLD.

---

## Other candidates checked, found benign

| Node | Emit volume | Verdict |
|------|-------------|---------|
| RATE_LIMIT | 2–3 lines (`app.use(rateLimit(...))`) | 1:1, fine |
| ALLOW_CORS | 7 lines middleware | 1:1, header comment present |
| LOG_REQUESTS | 8 lines middleware | 1:1, header comment present |
| SERVICE_CALL (Stripe charge etc.) | 10–15 lines fetch wrapper | 1:1, parameters all visible |
| FILE_UPLOAD | 10 lines multer + size check | 1:1, fine |
| CRON / BACKGROUND | 6 lines setInterval wrapper | 1:1, fine |
| WORKFLOW step | 8–12 lines per step | 1:1, each step is its own Clear line |

---

## What this commit ships

1. **This audit doc** — RR-2 deliverable, names the real violators,
   debunks the named-but-benign ones, proposes explicit forms for the
   real cases.
2. **One fix:** AUTH_SCAFFOLD provenance comment improved.
   `compiler.js` line ~10293 used to emit
   `// Auth scaffolding: JWT secret, middleware, signup/login/me endpoints`.
   Now emits a comment that names the Clear source line and lists the
   exact endpoints + middleware functions that were generated, so the
   compiled JS has a one-comment-to-one-Clear-line audit trail for the
   biggest hidden block in the compiler.
3. **Planned:** AGENT_DEF and WEBHOOK provenance comments next session.
   USAGE_LIMIT and OAUTH_CONFIG removal as a separate cleanup PR
   (zero app usage, easy delete, frees ~50 lines of parser + compiler +
   test code).

## Open question for Russell

The handoff names CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT as the worst
offenders, but on inspection they're already 1:1 (config-only emits with
header comments). The real offenders are bigger and harder. Is the
handoff list out of date, or did the philosophy of "1:1 violation" mean
something different (e.g., "domain keyword that hides the underlying
record-literal form" vs "many lines of compiled output")?

If the latter, the 3 of CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT are still
candidates for removal — they don't pull weight given record-literal
syntax already exists. Recommendation: kill USAGE_LIMIT and OAUTH_CONFIG
(zero app usage), leave CHECKOUT (3 apps depend on it, would need
migration).
