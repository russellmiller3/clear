# Plan: Agent Harness — Classify, RAG v2, Email, Scheduling

**Branch:** `feature/agent-harness`
**Date:** 2026-04-12
**Status:** Revised after doc audit. SERVICE_CALL already handles Stripe/SendGrid/Twilio — "batteries" phase removed. Extended RAG added (web pages, PDFs, DOCX).
**GAN Target:** `apps/store-ops/main.clear`

---

## Overview

Clear's agent primitives cover 6 of 7 layers in the universal agent architecture (Perceive, Remember, Think, Plan, Act, Guardrails). Two gaps remain:

1. **Perceive** — agents can't classify/route input by intent
2. **Remember** — `knows about:` only searches DB tables, not web pages or documents

This plan closes both gaps plus enhances email and scheduling syntax.

---

## What We're Building

### Phase 1: Classify Intent (Perceive layer)

```clear
intent = classify message as 'order status', 'return or refund', 'general'
match intent:
  when 'order status':
    response = ask claude 'Look up their order' with message
  when 'return or refund':
    response = ask claude 'Process the return' with message
  otherwise:
    response = ask claude 'Help the customer' with message
```

New `CLASSIFY` node type. Compiles to a lightweight Claude Haiku call that picks from a fixed category list. Uses existing `match/when` for routing — no new control flow needed.

**Key design:** `classify` is a visible operation, not hidden routing. The categories are explicit in the source. A 14-year-old reads it: "sort this message into one of these buckets."

**Synonym collision:** `classify with` is already synonymed to `predict_with` (synonyms.js line 374). Our syntax uses `as` not `with`, but the tokenizer rewrites `classify` → `predict_with`. Fix: detect `predict_with` + identifier + `as_format` + strings = CLASSIFY pattern in the assignment parser.

### Phase 2: Extended RAG (Remember layer)

```clear
agent 'Support' receives question:
  knows about: Products, FAQs
  knows about: 'https://docs.myapp.com/support'
  knows about: 'policies/return-policy.pdf'
  knows about: 'handbook/guide.docx'
  response = ask claude 'Help the customer' with question
  send back response
```

Extend `knows about:` to accept three source types:

| Source Type | Detection | Extraction | Runtime Dep |
|-------------|-----------|------------|-------------|
| Table name | Unquoted, capitalized | `db.findAll()` keyword search | None (existing) |
| URL | Quoted string starting with `http` | `fetch()` + HTML text extraction | None (built-in fetch) |
| File path | Quoted string ending in `.pdf`, `.docx`, `.txt`, `.md` | File read + text extraction | `pdf-parse` for PDF, `mammoth` for DOCX |

All three compile to the same RAG pattern: extract text → keyword search against user's query → inject relevant snippets into the system prompt before `_askAI` call.

**File extraction at startup vs per-request:** Files and URLs are loaded once at server start and cached. Table data is queried per-request (since it changes). The compiler emits:
```javascript
// Startup: load static knowledge sources
const _knowledge_url_0 = await _fetchPageText('https://docs.myapp.com/support');
const _knowledge_file_0 = await _extractPdfText('policies/return-policy.pdf');
const _knowledge_file_1 = await _extractDocxText('handbook/guide.docx');

// Per-request in agent: search all sources
const _ragContext = [];
// Tables (existing — keyword search)
const _tableResults = db.findAll('Products').filter(r => _textMatch(r, query));
_ragContext.push(..._tableResults.map(r => JSON.stringify(r)));
// URLs + files (new — keyword search against cached text)
_ragContext.push(..._searchText(_knowledge_url_0, query));
_ragContext.push(..._searchText(_knowledge_file_0, query));
```

### Phase 3: Email + Scheduling Enhancements

**Send email with inline recipient:**
```clear
send email to order's customer_email:
  subject is 'Your order has shipped'
  body is 'Track at {tracking_url}'
```
Extends existing SEND_EMAIL parser. Detect `to <expr>:` after `email`.

**Scheduled agent at time:**
```clear
agent 'Daily Reporter' runs every 1 day at '9:00 AM':
  orders = get all Orders
  report = ask claude 'Summarize today' with orders
```
Extends existing scheduled agent parser. After unit, check for `at <string>`. Time string → cron expression.

### Phase 4: Convenience Syntax + Integration Test

| Feature | Syntax | Implementation |
|---------|--------|---------------|
| `find all` synonym | `find all Orders where ...` | Route to existing `parseLookUpAssignment` |
| `today` literal | `where created_at is today` | New expression keyword → `_startOfToday()` |
| Multi-context `ask ai` | `ask ai 'prompt' with X, Y, Z` | Parse comma-separated exprs after `with` |
| Expect failure | `expect calling fn(x) to fail with 'msg'` | New `TEST_EXPECT_ERROR` node |
| **Integration test** | `apps/store-ops/main.clear` compiles clean | 0 errors, valid serverJS + HTML |

---

## Existing Code (phased reading)

### Always read first:
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec — update with new nodes |
| `synonyms.js` | Collision check before new keywords |

### Phase 1 — Classify:
| File | Section | Why |
|------|---------|-----|
| `parser.js` ~6670-6720 | ASK_AI assignment parsing | Pattern for classify assignment |
| `parser.js` ~4925-4965 | `parseLookUpAssignment` | Alternative insertion point |
| `compiler.js` ~287-326 | `_askAI` utility | Add `_classifyIntent` utility |
| `synonyms.js` line 374 | `predict_with: ['classify with']` | Collision — `classify` rewrites to `predict_with` |

### Phase 2 — Extended RAG:
| File | Section | Why |
|------|---------|-----|
| `parser.js` ~2997-3010 | Agent directive: `knows about:` | Extend to accept strings (URLs/files) |
| `compiler.js` ~2065-2165 | `compileAgent()` RAG section | Add URL/file extraction + caching |

### Phase 3 — Email + Scheduling:
| File | Section | Why |
|------|---------|-----|
| `parser.js` ~1519-1533 | `send email` dispatch | Add `to <expr>:` detection |
| `parser.js` ~2861-2882 | Scheduled agent parsing | Add `at <string>` after unit |
| `compiler.js` ~2079-2081 | Scheduled agent compilation | Time → cron expression |
| `compiler.js` ~3903-3912 | SEND_EMAIL compilation | Use inline `to` if present |

### Phase 4 — Convenience:
| File | Section | Why |
|------|---------|-----|
| `parser.js` assignment handler | Where `look up` is detected | Add `find all` path |
| `parser.js` ~5032-5037 | `parseExpect()` | Add error expectation |
| `parser.js` ~6690-6698 | ASK_AI context parsing | Comma-separated contexts |
| `compiler.js` exprToCode | Expression compilation | `today` keyword |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| `classify` with <2 categories | Parser error with example |
| `classify` with non-string categories | Parser error: categories must be quoted strings |
| `knows about: 'https://...'` URL is down | Runtime: warn + skip, agent still works with other sources |
| `knows about: 'file.pdf'` file missing | Runtime: warn + skip at startup |
| `knows about: 'file.xyz'` unknown format | Validator error: supported formats are .pdf, .docx, .txt, .md |
| Large PDF (100+ pages) | Extract first 50 pages, warn if truncated |
| `send email to` missing subject | Validator warning |
| `at '25:00 PM'` invalid time | Parser error with example |
| `ask ai` with commas in context | Custom comma-splitting, stop at `returning`/`using` |
| `find all` without table name | Parser error with example |
| `today` in non-CRUD context | Works fine — just returns start of today as Date |
| `expect calling` with no function | Parser error with example |

---

## Implementation Phases

### Phase 1: Classify Intent (~15 tests)

| Step | What | Gate |
|------|------|------|
| 🔴 | Tests: `classify X as 'a', 'b'` parses to CLASSIFY node | `node clear.test.js` |
| 🔴 | Tests: CLASSIFY compiles to `await _classifyIntent(X, ['a', 'b'])` | |
| 🔴 | Tests: classify inside agent body works | |
| 🔴 | Tests: fewer than 2 categories → error | |
| 🟢 | Add `CLASSIFY` to NodeType enum | |
| 🟢 | Handle synonym collision: detect `predict_with` + identifier + `as_format` pattern | |
| 🟢 | Parser: `classify <expr> as <string>, <string>, ...` in assignment context | Tests pass |
| 🟢 | Compiler: `_classifyIntent` utility function (Claude Haiku) | Tests pass |
| 🟢 | Compiler: CLASSIFY → `await _classifyIntent(input, categories)` | Tests pass |
| 🟢 | Validator: min 2 categories, all must be strings | Tests pass |
| 💾 | Commit: `feat: classify intent — AI-powered message routing` | All tests green |

### Phase 2: Extended RAG (~12 tests)

| Step | What | Gate |
|------|------|------|
| 🔴 | Tests: `knows about: 'https://example.com'` parses as URL knowledge source | `node clear.test.js` |
| 🔴 | Tests: `knows about: 'policy.pdf'` parses as file knowledge source | |
| 🔴 | Tests: `knows about: 'guide.docx'` parses as file knowledge source | |
| 🔴 | Tests: mixed `knows about: Products, 'https://...'` parses both types | |
| 🔴 | Tests: URL source compiles to fetch + text extraction at startup | |
| 🔴 | Tests: file source compiles to read + extract at startup | |
| 🔴 | Tests: unknown file extension → validator error | |
| 🟢 | Parser: extend `knows about:` directive — detect quoted strings as URL/file sources | Tests pass |
| 🟢 | Parser: store sources as `{ type: 'table'|'url'|'file', value: string }` | |
| 🟢 | Compiler: add `_fetchPageText()` utility (fetch + strip HTML tags) | Tests pass |
| 🟢 | Compiler: add `_extractPdfText()` utility (pdf-parse) | Tests pass |
| 🟢 | Compiler: add `_extractDocxText()` utility (mammoth) | Tests pass |
| 🟢 | Compiler: add `_searchText()` utility (keyword match against text chunks) | Tests pass |
| 🟢 | Compiler: emit startup loading for URL/file sources, per-request for tables | Tests pass |
| 🟢 | Validator: check file extensions, warn on missing URL scheme | Tests pass |
| 💾 | Commit: `feat: extended RAG — knows about URLs, PDFs, DOCX files` | All tests green |

### Phase 3: Email + Scheduling (~10 tests)

| Step | What | Gate |
|------|------|------|
| 🔴 | Tests: `send email to X:` with subject/body parses with inline recipient | `node clear.test.js` |
| 🔴 | Tests: inline recipient compiles to `_emailTransport.sendMail({ to: X, ... })` | |
| 🔴 | Tests: `agent 'X' runs every 1 day at '9:00 AM':` parses with schedule.at | |
| 🔴 | Tests: `at '9:00 AM'` compiles to cron `'0 9 * * *'` | |
| 🔴 | Tests: `at '2:30 PM'` compiles to cron `'30 14 * * *'` | |
| 🟢 | Parser: extend `send email` — detect `to <expr>:` after `email` | Tests pass |
| 🟢 | Compiler: use inline `to` if present on SEND_EMAIL node | Tests pass |
| 🟢 | Parser: extend scheduled agent — after unit, check for `at <string>` | Tests pass |
| 🟢 | Compiler: time string → cron expression converter | Tests pass |
| 🟢 | Compiler: use `node-cron` when `at` is present (vs `setInterval`) | Tests pass |
| 💾 | Commit: `feat: send email to X, scheduled agents with cron times` | All tests green |

### Phase 4: Convenience + Integration (~12 tests)

| Step | What | Gate |
|------|------|------|
| 🔴 | Tests: `find all Orders where status is 'active'` parses same as `look up all` | `node clear.test.js` |
| 🔴 | Tests: `today` in expression compiles to `_startOfToday()` | |
| 🔴 | Tests: `ask ai 'prompt' with X, Y, Z` parses multi-context | |
| 🔴 | Tests: multi-context compiles to merged object `{X, Y, Z}` | |
| 🔴 | Tests: `expect calling fn(x) to fail with 'msg'` parses to TEST_EXPECT_ERROR | |
| 🔴 | Tests: TEST_EXPECT_ERROR compiles to try/catch assertion | |
| 🟢 | Parser: route `find all` to existing `parseLookUpAssignment` | Tests pass |
| 🟢 | Compiler: `today` → `_startOfToday()` utility | Tests pass |
| 🟢 | Parser: extend ASK_AI — comma-separated expressions after `with` | Tests pass |
| 🟢 | Compiler: multi-context → merged object | Tests pass |
| 🟢 | Add `TEST_EXPECT_ERROR` to NodeType | |
| 🟢 | Parser: extend `parseExpect` for error expectations | Tests pass |
| 🟢 | Compiler: emit try/catch assertion | Tests pass |
| 🟢 | Update `apps/store-ops/main.clear` to use correct existing syntax where needed | |
| 🔴 | Integration test: `apps/store-ops/main.clear` compiles with 0 errors | Tests pass |
| 🟢 | Update intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md | |
| 💾 | Commit: `feat: convenience syntax + store-ops GAN target compiles` | All tests green |

---

## Testing Strategy

**Test command:** `node clear.test.js`

**New tests: ~49 total**
- Phase 1 (classify): ~15
- Phase 2 (extended RAG): ~12
- Phase 3 (email + scheduling): ~10
- Phase 4 (convenience + integration): ~12

**Success criteria:**
- [ ] `apps/store-ops/main.clear` compiles with 0 errors
- [ ] All existing 1730 tests still pass
- [ ] ~49 new tests pass
- [ ] All 5 doc surfaces updated (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md)

---

## Copy-Paste Resume Prompt

```
Continue implementing the Agent Harness plan (plans/plan-agent-harness-04-12-2026.md).

GAN target: apps/store-ops/main.clear
Branch: feature/agent-harness

4 phases:
1. Classify intent (CLASSIFY node, _classifyIntent utility)
2. Extended RAG (knows about: URLs, PDFs, DOCX)
3. Email + scheduling (send email to X, agent at time)
4. Convenience syntax + integration test

Check git log for completed phases, then continue from where we left off.
All tests must pass between phases: node clear.test.js
```
