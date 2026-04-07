# Plan: External API Calls + Service Integrations (Red-Teamed)

**Branch:** `feature/external-apis`
**Date:** 2026-04-07

---

## 🎯 THE PROBLEM

Clear can call its own backend endpoints and use `ask ai`, but cannot call arbitrary external REST APIs. No way to set custom HTTP headers, auth tokens, or POST to external URLs. Every real SaaS app needs Stripe, SendGrid, Twilio — this gap prevents templates from becoming real apps.

## 🔧 THE FIX

**Layer 1: `call api`** — arbitrary HTTP to any URL with headers, body, method.
**Layer 2: Service presets** — `charge via stripe`, `send email via sendgrid`, `send sms via twilio` — zero-config wrappers.
**Layer 3: `ask claude`** — canonical form for AI calls (replaces `ask ai`).
**Layer 4: `when X notifies`** — natural webhook syntax (replaces `webhook '/path' signed with:`).

### Key Design Decisions

1. **`call api` not `fetch`** — "Call the Stripe API" is natural. "Fetch" sounds like scraping.
2. **`when stripe notifies`** — replaces jargon `webhook`. Matches existing `when user calls` pattern.
3. **`ask claude`** — replaces `ask ai`. Brand-specific, immediately clear what service.
4. **Env vars only** — compiler refuses inline secrets (`sk_`, `SG.`).
5. **`needs login`** — alias for `requires auth`. Both work, new one is canonical.

---

## Proposed Syntax

### Layer 1: Generic API Call

```clear
# Full form
result = call api 'https://api.stripe.com/v1/charges':
  method is 'POST'
  header 'Authorization' is 'Bearer ' + env('STRIPE_KEY')
  body is charge_data
  timeout is 10 seconds

# Simple GET
data = call api 'https://api.github.com/users/octocat'

# POST with just body (method defaults to POST when body present)
result = call api 'https://httpbin.org/post':
  body is payload
```

### Layer 2: Service Presets

```clear
# Stripe — charge a card
charge = charge via stripe:
  amount = 2000
  currency is 'usd'
  token is payment_token
# Requires: env('STRIPE_KEY')

# SendGrid — send an email
send email via sendgrid:
  to is customer's email
  from is 'team@myapp.com'
  subject is 'Invoice #' + invoice's id
  body is email_body
# Requires: env('SENDGRID_KEY')

# Twilio — send SMS
send sms via twilio:
  to is customer's phone
  body is 'Your booking is confirmed'
# Requires: env('TWILIO_SID'), env('TWILIO_TOKEN'), env('TWILIO_FROM')
```

### Layer 3: ask claude

```clear
# Simple prompt (ask ai still works as alias)
answer = ask claude 'Summarize this article' with article_text

# Structured output
result = ask claude 'Analyze this lead' with lead_data returning:
  score (number)
  reasoning
  qualified (boolean)

# Model selection
answer = ask claude 'Write a poem' with topic using 'claude-haiku-4-5-20251001'
# Requires: env('ANTHROPIC_API_KEY') (falls back to CLEAR_AI_KEY)
```

### Layer 4: when X notifies (webhooks)

```clear
# Replaces: webhook '/stripe/events' signed with env('STRIPE_SECRET'):
when stripe notifies '/stripe/events':
  if event is 'payment.succeeded':
    update order's status to 'paid'

when twilio notifies '/sms-received':
  save message as new IncomingMessage

# Generic (any service)
when service notifies '/webhooks/github':
  send back 'ok'
```

### Bonus: needs login (alias)

```clear
# Both work, needs login is canonical
when user calls DELETE /api/users/:id:
  needs login
  delete the User with this id
  send back 'deleted'
```

---

## ⚠️ RED TEAM: Critical Collision Fixes

### 1. `call api` vs `call 'AgentName'`
Parser checks `call` + STRING for agent calls (line 4975 of parser.js).
`call api` is `call` + IDENTIFIER(`api`).
**Fix:** Check `tokens[pos+1].value === 'api'` BEFORE the agent call check.

### 2. `send email via sendgrid` vs `send email:`
Parser matches `respond` + `email` for SMTP email (line 797 of parser.js).
**Fix:** Check for `via` token at position 2 BEFORE falling through to SMTP.

### 3. `ask claude` is raw-value, not synonym
`ask ai` is parsed by checking `tokens[pos].value === 'ask'` + `tokens[pos+1].value === 'ai'` (line 4946).
**Fix:** Add `|| tokens[pos+1].value === 'claude'` to the same check.

### 4. No existing SSRF validation
Plan originally said "extend existing" — there is none in validator.js.
**Fix:** Write from scratch in validator.js.

---

## 📁 FILES INVOLVED

| File | Changes |
|------|---------|
| `synonyms.js` | Add `call_api`, `charge_via_stripe`, `send_email_via_sendgrid`, `send_sms_via_twilio`, `needs_login` |
| `parser.js` | Parse API_CALL, SERVICE_CALL, when X notifies; extend ask ai for claude; add needs login alias |
| `compiler.js` | Compile API_CALL → fetch(), SERVICE_CALL → service-specific fetch(), update _askAI for ANTHROPIC_API_KEY |
| `validator.js` | Inline secret detection, SSRF check for API_CALL URLs |
| `intent.md` | Add new node types |
| `clear.test.js` | 25+ new tests |

---

## 🔄 IMPLEMENTATION PHASES

### Phase 1: Generic `call api` (parser + compiler + validator)
### Phase 2: Stripe preset
### Phase 3: SendGrid preset  
### Phase 4: Twilio preset
### Phase 5: `ask claude` + `when X notifies` + `needs login`
### Phase 6: Tests + docs
