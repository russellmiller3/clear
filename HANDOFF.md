# Handoff

This file is how the next Claude session picks up where this one left off.
Everything below is current state. Past sessions live in `CHANGELOG.md` (what
shipped, dated) and `FEATURES.md` (what Clear can do today). If you're tempted
to scroll through "what we did last month" you're in the wrong file — go to
CHANGELOG.

---

## ⚠️ HOW TO MAINTAIN THIS FILE — READ FIRST, NEVER REMOVE THIS SECTION

These rules survive every session. Every Claude that touches this file follows
them. If you find yourself violating them, stop and re-read.

**1. Five sections only. Never add more.** Current State, In-Flight Work, Blocked on Russell, Next Moves, Trust Notes. If something doesn't fit one of those, it doesn't belong here. Move it to CHANGELOG.md or FEATURES.md.

**2. NO session-by-session history in this file.** The temptation is to append "Session 2026-05-03 we did X." Resist. The git log is the session history. The commit messages are the per-feature narrative. CHANGELOG.md is the dated story. HANDOFF.md is for "what's the state RIGHT NOW that I need to act on."

**3. Trim aggressively at session end.** If a Next Move from yesterday landed today, delete it. If an In-Flight branch merged, delete its row. If a Blocker resolved, delete it. The file should NEVER grow past ~150 lines. Hard cap: 200.

**4. Keep it skimmable in 60 seconds.** Bullets, short sentences, bolded load-bearing words. No prose paragraphs longer than 3 lines. No code blocks unless they're commands the next Claude should literally run.

**5. Rewrite the Current State section every session.** Don't append; replace. The "Current State" row from yesterday is wrong by definition today.

**6. NO code jargon in any line of this file.** Same rule as Russell-facing chat. Say what the thing DOES, not what it's CALLED. The next Claude should understand what to do without grepping the codebase.

**7. End-of-session checklist (run this before stopping):**
   - Update Current State to reflect right-now reality
   - Delete completed Next Moves
   - Delete merged In-Flight branches
   - Delete resolved Blockers
   - Add new In-Flight / Blocked / Next entries that came up this session
   - Verify file is under 200 lines

---

## Current State (rewritten 2026-05-06 PM — OWASP closed + pushed + walker green + gitignore)

**North star:** first paying Marcus customer. Revenue gates everything else.

**Headline ship (today):** the OWASP Top 10 epic is closed by construction AND pushed to GitHub (66 commits landed). Five primitives in the compiler + runtime, three follow-ups (cycle-2b strict mode, Postgres user_id parity, encrypt-at-rest). Marcus walker regression that surfaced after the OWASP work is fixed (was 21 failures, now 145/145 green across all 5 Marcus apps). Build artifacts in `apps/` no longer get tracked by git — 234 files untracked + gitignore patterns + a CLAUDE.md rule as backup documentation.

**GTM direction (locked 2026-05-04):** self-serve product (Vercel model), NOT consulting. Path: ship buildclear.dev self-serve, offer "Concierge Setup — $500, no ongoing support" to first 5 customers only, then pure self-serve. Default to "make the self-serve path more self-serve" over new compiler features Russell would demo by hand.

**Where the product is (today):**
- **OWASP Top 10 — closed by construction.** Five primitives:
  - Per-row access rules (Piece 1) — the table declares `the X's creator can read, change, or delete`, compiler auto-injects ownership checks on every CRUD, both SQLite and Postgres runtimes auto-add `user_id`.
  - Outgoing requests allowlist (Piece 2) — top-of-file `allow outgoing requests to: 'host'` makes variable URLs and non-allowlisted hosts a hard compile error.
  - Sensitive field tag (Piece 3) — `, sensitive` on a field encrypts AES-256-GCM on disk via `runtime/sensitive-crypto.js`, fails closed if `SENSITIVE_KEY` env var is unset, strips fields from API responses unless the endpoint declares `can return sensitive data`.
  - Auto login rate-limit (Piece 4) — `allow signup and login` auto-wires rate-limit middleware (10/min/IP) on `/auth/login`.
  - Hardcoded-secrets linter (Piece 5) — Stripe / AWS / GitHub / Anthropic / OpenAI key shapes refuse to compile with env-var suggestion.
- **Cycle 2b strict mode** — missing access rules are a hard error in any file with security context (auth, tenant scope, rules keyword, or another policied table). Toy single-table fixtures still get a warning.
- **`live:` keyword softened (today).** Was planned to become mandatory in "Phase B-2"; that plan is dropped. The compiler never requires the fence — the prover infers purity automatically. `live:` stays as opt-in for regulated apps that want a visual marker.
- **Tenant separation: defense in depth.** App-layer filter + Postgres ROW LEVEL SECURITY + per-request `SET LOCAL` tenant.
- **Audit trail.** `GET /audit` + `GET /audit.csv` + `POST /audit/cleanup` auto-emitted with `allow signup and login`. Body summary auto-redacts password/token/secret/api_key/jwt/auth.
- **All 13 canonical apps compile clean.** 8 core + 5 Marcus templates. Studio dropdown locked to exactly these 13 (server.js + studio.html + supervisor cold-start).
- **Two-witness rule verification (math + runtime).** Prover gives PROVED for math claims; runtime witness fires 20 violating inputs at compiled apps and confirms the rule's name appears in every 403 rejection.
- **Marketing surfaces shipped.** `landing/marcus.html` has a 5-card OWASP section. `landing/hn-owasp.html` is a fake Show HN parody about the OWASP work. `landing/hn-prove.html` is a second fake Show HN about the rule keyword + provability story. Both use HN visual fidelity (orange / Verdana / threaded comments).
- **Worktree consolidation.** All work now lives in single `clear/` folder. The `clear-owasp1/` worktree was unregistered (empty husk dir on disk, manual delete by Russell when Windows releases the lock).

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name.
2. Agent wires Studio's deploy flow to those credentials (~1 hour).
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL.
4. Russell records the 75-second demo voice-over against the deployed app.
5. Russell DMs 5 Marcuses on LinkedIn with the recording.

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

**Empty.** All session work is on local `main`, 60 commits ahead of `origin/main`, NOT yet pushed. The single open branch `docs/handoff-2026-05-06` exists only to land this HANDOFF rewrite.

WIP count: **0**.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Hartl-quality user-guide rewrite.** Russell named "our standard is Hartl's Rails Tutorial" for USER-GUIDE / Meph prompt / AI-INSTRUCTIONS / SYNTAX. Today's NEW additions are at that quality; the existing 7000+ lines are mixed-era. A focused multi-session pass: (a) anchor a sample app readers build chapter-by-chapter (deal-desk is the obvious candidate), (b) add prose around every code block, (c) "now run this" beats with expected output, (d) end-of-chapter exercises. Treat as a multi-session epic, not a one-shot. Best to start by writing a chapter-by-chapter plan first.

2. **Marcus walker auth-flow follow-up.** The 21 walker failures earlier today were fixed at the empty-table layer, but the deeper gap remains: walker hits creator-scoped data pages WITHOUT signing in first, so cycle 5 user_id filter (correctly) returns 0 rows. The walker tests "page loads cleanly" but can't test real interactions on data pages. Real fix: walker signs up + signs in BEFORE testing data pages, then seeds + drives the full flow. ~1 focused session. Pattern: line 739 of each `apps/<app>/browser-uat.mjs` skips auth pages; replace with "hit signup, capture token, set Authorization header on subsequent requests."

3. **Plans waiting for execution** in `plans/`:
   - `plan-meph-optimization.md` — 3-config A/B/C eval (current vs everything-in-prompt vs lean-prompt-with-aggressive-retrieval). ~$30, ~5 hours. Not critical path; do when there's spare API budget.
   - `plan-python-parity.md` — JS-vs-Python cross-target audit + closure pass. Known HIGH-severity gaps: `runtime/sensitive-crypto.py` doesn't exist (OWASP Piece 3 broken on Python), Python auto-login-rate-limit emit (Piece 4), audit-log emit on Python target. Audit script is 1-2 hours; closure pass is multi-session.

4. **Doc gardening:** USER-GUIDE has the OWASP work in two places (Chapter 6.5 + 24.1). Before next chapter additions, decide whether to consolidate or keep both as different lenses. Current state is correct but redundant.

5. **Cloud blockers (gated on Russell's hands)** — Cloudflare account setup, Stripe live keys, Anthropic org key, Fly Trust Verified, first Marcus conversation. None are code work; all are external paperwork or sales motion.


---

## Audit results (so future cron iterations skip what's already verified)

- **Tautology-rule audit (2026-05-03):** zero unintentional tautology rules remain in any `.clear` app. Every `enforce that` line in `apps/` references a real entity field (`deal's discount_percent`, `invoice's status`, `lead's email`, etc.). The two intentional tautologies in `examples/rule-keyword-tour.clear` are demo content showing PROVED / DISPROVED / UNVERIFIABLE verdicts side-by-side and should NOT be changed. The lead-router fix earlier on 2026-05-02 was the last placeholder rule that needed real fields. Don't re-run this audit unless someone introduces new placeholder rules.

- **Silent-async-test audit (2026-05-03):** the silent-async-test bug is much smaller in practice than the original HANDOFF item suggested. `clear.test.js` has only 4 `async () =>` tests, and ALL are dynamic-import tests with sync follow-up — they technically have `await import(...)` but the imports are reliable and the assertions are sync afterwards. Other test files with real I/O (`lib/packaging-cloudflare.test.js`, `playground/agent.test.js`, `playground/ai-proxy/server.test.js`, `playground/billing.test.js`, `clear-lsp/test/server.test.mjs`) all use top-level await (fine) or sync `it()` with sync bodies (fine). Only `lib/prover/runtime-witness.test.js` had real spawn-and-fetch in async bodies, and it's already migrated to the new `describeAsync` + `itAsync` helpers. Migration of the 4 remaining low-risk dynamic-import tests would mean wrapping their enclosing `describe` blocks in `describeAsync` — that's churn out of proportion to the actual risk. The new helpers stay available for future spawn/fetch tests; existing tests stay as-is.

---

## Trust Notes (read before claiming something proves anything)

The proof system today proves rules two ways. Know which one is firing before you cite it in a pitch.

- **Math on constants**: `5 < 7` is universally true. Trust basis: arithmetic. Solid.
- **Structural proof**: `deal's discount < 30` cannot be evaluated without a deal, but the compiler emits a runtime check that REJECTS any input where the condition fails. So "no execution past the check satisfies the failing condition" is provable from the program's structure. **Trust basis: the compiler correctly emits the runtime check.**

**The runtime-witness bridge is now wired.** `node lib/prover/runtime-witness.test.js` compiles each rule shape, spawns the compiled app on a free port, sends 20 inputs that violate the rule, and asserts every one rejects with a 403 carrying the rule's name in the response body. 60 measured rejections across 3 rule shapes today, all green. Two-witness verification (math + runtime) is now real, not aspirational. The runtime claim a CRO can hear: "we proved every rule with math, AND we sent twenty bad inputs at every PROVED rule and watched them all bounce with the rule's name on the rejection." Both witnesses pass, simultaneously, on every push.
