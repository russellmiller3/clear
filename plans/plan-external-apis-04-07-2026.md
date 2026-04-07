# Plan: External API Calls + Service Integrations

**Branch:** `feature/external-apis`
**Date:** 2026-04-07

---

## 🎯 THE PROBLEM

Clear can call its own backend endpoints and use `ask ai`, but cannot call arbitrary external REST APIs (Stripe, SendGrid, Twilio, OpenAI, etc). There's no way to set custom HTTP headers, auth tokens, or POST to external URLs. Every real SaaS app needs to charge cards, send emails, and send SMS — this is the single biggest gap preventing templates from becoming real apps.

## 🔧 THE FIX

Two layers:

**Layer 1: Generic `call api` syntax** — arbitrary HTTP to any URL with headers, body, method.
**Layer 2: Service presets** — `send email via sendgrid`, `charge via stripe`, `send sms via twilio`, `ask claude` — zero-config wrappers that compile to the right API call with just an env var.

```
                    ┌─────────────────────────┐
                    │   Clear Source Code      │
                    ├─────────────────────────┤
                    │ call api 'https://...'   │  ← Layer 1: Generic
                    │   method is 'POST'       │
                    │   header 'Auth' is '...' │
                    │   body is data           │
                    │                          │
                    │ send email via sendgrid   │  ← Layer 2: Presets
                    │ charge via stripe         │
                    │ send sms via twilio       │
                    │ ask claude 'prompt'       │
                    └──────────┬──────────────┘
                               │ compiles to
                    ┌──────────▼──────────────┐
                    │   fetch() with headers   │
                    │   + env('SERVICE_KEY')   │
                    └─────────────────────────┘
```

### Design Decisions

1. **`call api` not `fetch` or `request`** — 14-year-old test. "Call the Stripe API" is natural English. "Fetch from Stripe" sounds like scraping.
2. **Block syntax with colons** — matches Clear's existing pattern (validate:, create:, style:).
3. **Service presets are sugar** — they compile to the same `call api` output, just with pre-filled headers/URLs/body formatting.
4. **Env vars only, never inline secrets** — `env('STRIPE_KEY')` mandatory. Compiler refuses to compile if a literal string looks like a key (`sk_`, `SG.`, etc).
5. **`ask claude` replaces `ask ai`** — `ask ai` still works as alias, but `ask claude` is the canonical form. Uses same `CLEAR_AI_KEY` env var (renamed to `ANTHROPIC_API_KEY` with fallback).

---

## Proposed Syntax

### Layer 1: Generic API Call

```clear
# Full form with result
result = call api 'https://api.stripe.com/v1/charges':
  method is 'POST'
  header 'Authorization' is 'Bearer ' + env('STRIPE_KEY')
  header 'Content-Type' is 'application/json'
  body is charge_data
  timeout is 10 seconds

# Simple GET (no block needed)
data = call api 'https://api.github.com/users/octocat'

# POST with just body (method defaults to POST when body present, GET otherwise)
result = call api 'https://httpbin.org/post':
  body is payload
```

Compiles to (JS):
```js
const result = await (async () => {
  const _ctrl = new AbortController();
  const _timer = setTimeout(() => _ctrl.abort(), 10000);
  try {
    const _res = await fetch('https://api.stripe.com/v1/charges', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(charge_data),
      signal: _ctrl.signal
    });
    if (!_res.ok) throw new Error(`API error: ${_res.status} ${_res.statusText}`);
    return _res.json();
  } finally { clearTimeout(_timer); }
})();
```

### Layer 2: Service Presets

#### Stripe
```clear
# Charge a card
charge = charge via stripe:
  amount = 2000
  currency is 'usd'
  description is 'Pro Plan'
  token is payment_token

# Requires: env('STRIPE_KEY')
```

#### SendGrid
```clear
# Send an email
send email via sendgrid:
  to is customer's email
  from is 'team@myapp.com'
  subject is 'Invoice #' + invoice's id
  body is email_body

# Requires: env('SENDGRID_KEY')
```

#### Twilio
```clear
# Send an SMS
send sms via twilio:
  to is customer's phone
  from is env('TWILIO_FROM')
  body is 'Your booking is confirmed for ' + booking's date

# Requires: env('TWILIO_SID'), env('TWILIO_TOKEN'), env('TWILIO_FROM')
```

#### Anthropic (ask claude)
```clear
# Simple prompt
answer = ask claude 'Summarize this article' with article_text

# Structured output (same as ask ai)
result = ask claude 'Analyze this lead' with lead_data returning:
  score (number)
  reasoning
  qualified (boolean)

# With model selection
answer = ask claude 'Write a poem' with topic using 'claude-haiku-4-5-20251001'

# Requires: env('ANTHROPIC_API_KEY') (falls back to CLEAR_AI_KEY)
```

---

## Node Types (4 new)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `API_CALL` | `call api 'url':` + config block | Generic HTTP request |
| `SERVICE_CALL` | `charge via stripe:` / `send email via sendgrid:` / `send sms via twilio:` | Service preset |
| `ASK_CLAUDE` | `ask claude 'prompt' with context` | Anthropic API (replaces ask ai as canonical) |

`ASK_CLAUDE` reuses existing `ASK_AI` node type — just a synonym. No new node type needed.

---

## Security Rules (Validator)

1. **No inline secrets:** Compiler error if a string literal matches `sk_`, `SG.`, `AC`, `pk_test_`, `whsec_`, or is 32+ hex chars. Must use `env()`.
2. **SSRF protection:** Block `localhost`, `127.0.0.1`, `10.x`, `192.168.x`, `169.254.x` in `call api` URLs (same as existing `EXTERNAL_FETCH`).
3. **Timeout required for production:** Warning (not error) if `call api` has no timeout. Default 30s.

---

## 📁 FILES INVOLVED

### Modified Files

| File | Changes |
|------|---------|
| `synonyms.js` | Add `call_api`, `charge_via_stripe`, `send_email_via_sendgrid`, `send_sms_via_twilio`, `ask_claude` |
| `tokenizer.js` | No changes (synonyms handle it) |
| `parser.js` | Parse `API_CALL`, `SERVICE_CALL` nodes; update `ASK_AI` to accept `ask claude` |
| `compiler.js` | Compile `API_CALL` → fetch(), `SERVICE_CALL` → service-specific fetch(), update `_askAI` runtime |
| `validator.js` | Inline secret detection, SSRF check, timeout warning |
| `intent.md` | Add new node types |
| `clear.test.js` | Tests for all new syntax |
| `SYNTAX.md` | Document new syntax with examples |
| `AI-INSTRUCTIONS.md` | Add external API usage guide |

### No New Files

Everything compiles to inline `fetch()` calls. No new runtime modules needed.

---

## 🚨 EDGE CASES

| Scenario | Handling |
|----------|----------|
| Missing env var at runtime | Throw: `"Set STRIPE_KEY environment variable"` |
| Non-JSON response | Return raw text, don't crash on `.json()` |
| Network timeout | AbortController with configurable timeout |
| 4xx/5xx from API | Throw with status + body for user's try/catch |
| `call api` with no method + no body | Default to GET |
| `call api` with body but no method | Default to POST |
| URL is a variable, not literal | Allow: `call api url:` where url is a variable |
| Inline secret `'sk_test_...'` | Compiler error: "API keys must use env()" |
| `ask claude` without ANTHROPIC_API_KEY | Throw: "Set ANTHROPIC_API_KEY environment variable" |
| Both ANTHROPIC_API_KEY and CLEAR_AI_KEY set | ANTHROPIC_API_KEY takes precedence |
| Service preset with missing fields | Compiler error: "send email via sendgrid requires 'to'" |

---

## 🔄 TDD CYCLES

### Always read first (every phase):
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec |
| `learnings.md` | Scan TOC for gotchas |

### Phase 1: Generic `call api` (6 cycles)

**Read these files:**
| File | Why |
|------|-----|
| `synonyms.js` | Add `call_api` synonym |
| `parser.js` | Lines ~2400-2500 (existing EXTERNAL_FETCH parsing for pattern) |
| `compiler.js` | Lines ~2245-2300 (existing EXTERNAL_FETCH compilation for pattern) |
| `validator.js` | Existing SSRF check to extend |

**Cycles:**

1. 🔴 Test: `call api 'https://example.com'` parses to API_CALL node with url
   🟢 Add synonym, parse API_CALL in parser.js
   🔄 Verify tokenization doesn't collide with existing `call` (agent call)

2. 🔴 Test: `call api` with block (method, header, body, timeout) parses config
   🟢 Parse block with config keys
   🔄 Clean up

3. 🔴 Test: `call api` compiles to fetch() in JS backend
   🟢 Add API_CALL case to compileNode in compiler.js
   🔄 Handle GET vs POST default

4. 🔴 Test: `call api` compiles to httpx in Python backend
   🟢 Add Python compilation path
   🔄 Clean up

5. 🔴 Test: `result = call api 'url'` stores result
   🟢 Handle resultVar pattern (same as CRUD save)
   🔄 Verify with and without result var

6. 🔴 Test: validator catches inline secrets and SSRF
   🟢 Add secret pattern check + SSRF block
   🔄 Test edge cases (env() is allowed, short strings are fine)

### Phase 2: Stripe preset (3 cycles)

**Read these files:**
| File | Why |
|------|-----|
| `parser.js` | Re-read after Phase 1 changes |
| `compiler.js` | Re-read after Phase 1 changes |

**Cycles:**

7. 🔴 Test: `charge via stripe:` with amount, currency parses to SERVICE_CALL
   🟢 Add synonym `charge_via_stripe`, parse SERVICE_CALL
   🔄 Verify no synonym collision with existing `charge`

8. 🔴 Test: compiles to Stripe REST API fetch with correct URL/headers/body
   🟢 Compile SERVICE_CALL type='stripe' → fetch to `https://api.stripe.com/v1/charges`
   🔄 Stripe uses form-encoded not JSON — handle content-type

9. 🔴 Test: validator requires env('STRIPE_KEY'), errors on missing fields
   🟢 Add SERVICE_CALL validation for required fields per service
   🔄 Clean up

### Phase 3: SendGrid preset (2 cycles)

10. 🔴 Test: `send email via sendgrid:` parses and compiles
    🟢 Add synonym, parse, compile to SendGrid v3 API
    🔄 Verify no collision with existing `send email:` (SMTP)

11. 🔴 Test: compiled output has correct SendGrid headers/body/URL
    🟢 Compile to `https://api.sendgrid.com/v3/mail/send` with Bearer auth
    🔄 Clean up

### Phase 4: Twilio preset (2 cycles)

12. 🔴 Test: `send sms via twilio:` parses and compiles
    🟢 Add synonym, parse, compile to Twilio REST API
    🔄 Twilio uses Basic auth (SID:TOKEN) — handle correctly

13. 🔴 Test: compiled output has correct Twilio URL/auth/body
    🟢 Compile to `https://api.twilio.com/2010-04-01/Accounts/SID/Messages.json`
    🔄 Clean up

### Phase 5: `ask claude` canonical form (2 cycles)

14. 🔴 Test: `ask claude 'prompt' with context` parses as ASK_AI
    🟢 Add `ask_claude` synonym for `ask_ai`; update _askAI to check ANTHROPIC_API_KEY first
    🔄 Verify `ask ai` still works as alias

15. 🔴 Test: `ask claude ... using 'claude-haiku-4-5-20251001'` selects model
    🟢 Parse optional `using 'model'` clause, pass to _askAI runtime
    🔄 Default model is claude-sonnet-4-6

### Phase 6: Docs + Integration (1 cycle)

16. 🔴 Update intent.md, SYNTAX.md, AI-INSTRUCTIONS.md
    🟢 Add all new syntax with examples
    🔄 Update learnings.md

---

## 🧪 TESTING STRATEGY

**Test command:** `node clear.test.js`

**Tests to write (minimum 20):**
- `call api` parse: URL only, with block, with result var
- `call api` compile: JS GET, JS POST, Python GET, Python POST
- `call api` with headers, body, timeout
- `call api` default method (GET without body, POST with body)
- Inline secret validator (catches `sk_test_`, `SG.`, allows `env()`)
- SSRF validator (blocks localhost, private IPs)
- `charge via stripe` parse + compile
- `send email via sendgrid` parse + compile
- `send sms via twilio` parse + compile
- `ask claude` parse (as alias for ask ai)
- `ask claude` with structured output
- `ask claude` with model selection
- Service preset missing required field → error
- Full app: CRM with Stripe + SendGrid compiles

**Success criteria:**
- [ ] All existing 1265 tests still pass
- [ ] 20+ new tests pass
- [ ] `call api` works in JS and Python backends
- [ ] All 4 service presets compile correctly
- [ ] Inline secret detection catches `sk_`, `SG.`, `AC` patterns
- [ ] `ask claude` is synonym for `ask ai` with ANTHROPIC_API_KEY priority
- [ ] All 33 existing apps still compile

---

## 📎 RESUME PROMPT

> Read `plans/plan-external-apis-04-07-2026.md`. This adds `call api` for arbitrary REST APIs and service presets for Stripe, SendGrid, Twilio, and Anthropic. 6 phases, 16 TDD cycles. Start with Phase 1 (generic `call api`). Branch: `feature/external-apis`. Run `node clear.test.js` after each phase.
