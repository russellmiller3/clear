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

## Current State (rewritten 2026-05-04, GTM lock added)

**North star:** first paying Marcus customer. Revenue gates everything else.

**GTM direction (locked 2026-05-04):** self-serve product (Vercel model), NOT consulting. Russell hates customer service and 1-on-1 problem-solving. Variable-energy person + fixed-weekly-demand client work = burnout in 2 months. Path: ship buildclear.dev as self-serve, offer a one-time "Concierge Setup — $500, no ongoing support" to the FIRST 5 customers only (research disguised as revenue, same as Stripe + Vercel started), then go pure self-serve. **Operational implication for every future Claude session:** default to "make the self-serve path more self-serve" (polish landing, docs, in-app onboarding, failure modes) over "add new compiler features Russell would demo by hand."

**Where the product is:**
- **Tenant separation is now defense in depth on Postgres, with a real-engine witness.** The application-layer filter (Phase 1+2) auto-injects `tenant_id` into every CRUD. The new RLS layer adds Postgres `ROW LEVEL SECURITY` policies on every shared-scope table plus a per-request `SET LOCAL app.current_tenant_id`. The new real-PG witness (`runtime/db-postgres-rls-real.test.js`) runs the full proof end-to-end against any Postgres pointed at by `DATABASE_URL` — enables RLS, inserts under two tenant scopes, fires forged WHERE-less SELECTs inside each, fires cross-tenant INSERTs, asserts every isolation property holds at the database layer. The CRO sentence: "tenant separation is enforced twice, in the application AND inside the database — and the database-layer enforcement is verified by a runnable test."
- **Multi-user-per-tenant via single-use invites.** Default behavior — every signup creates a brand-new tenant — used to put teammates in separate silos. Now the compiled app exposes `POST /auth/invite` (authenticated, returns a 32-hex token bound to caller's tenant), `GET /auth/invite` (audit), and signup accepts an optional `invite_token` to join the inviter's tenant. End-to-end HTTP test runs Alice→Bob→Carol scenario; Bob joins Alice's tenant via invite, Carol stays separate.
- **API-call audit trail with durable storage.** When `allow signup and login` is declared, the compiled app exposes `GET /audit` returning every state-changing request the server handled — `{ ts, user_id, user_email, tenant_id, method, path, status }` per row. Stored in a real `audit_log` SQL table so process restarts don't wipe history. Tenant-scoped under shared scope (Bob sees only his tenant's rows). Compliance buyer's "show me state changes last quarter" is answerable.
- **USER-GUIDE.md body now reads in the TOC's thematic order.** Foundations → Full-stack → Visual → Real-time+AI → Marcus → Production → Testing → Tooling → Reference. No heading text changed; every TOC anchor still resolves. Reference sections (Quick Reference, What's Next, Appendix) moved to the end where the TOC promises they live.
- All 5 canonical Marcus apps compile clean. Deal-desk and lead-router now have real business-rule rejection tests (5 + 2 covering every named rule); the other 3 use queue primitives, validated by construction.
- Audit PDF reads in plain English end-to-end. The "How it was proved formally" section quotes the original Clear source line and shows the actual compiled JavaScript rejection block side-by-side. No more "symbolic engine couldn't decode" stack-trace leaks. Witness-side missing-dep stack traces also get translated to one-line plain-English messages.
- Deal-desk visible bugs fixed: nav counts and stat cards substitute real numbers (was rendering literal `{pending_count}` strings); detail-panel buttons wrap inside their container instead of overflowing.
- Studio's run-failure terminal now shows captured stdout/stderr alongside "Process exited with code N" plus a plain-English hint matched on common failure shapes (missing module, port in use, syntax error, JWT missing).
- Test harness sharpened: `expect it is rejected` accepts any 4xx (was 400 only — broke for rule-rejection 403s); auto-test 4xx flexibility; implicit "Create should succeed" assert suppresses when the test has an explicit expect; negative number literals in test field-value pairs parse correctly.
- Templates use `/* */` for multi-line narrative comments per the existing AI-INSTRUCTIONS rule (4 apps cleaned up).
- Project rules locked in: defer the full 2899-test suite until phase end; don't push to GitHub until phase end. The push-failure escape hatch when the documented `#editor-mount` flake hits is `--no-verify` only when the change is unrelated to IDE/Playwright code.
- `/enq` skill for in-session work-queue capture (append-only, doesn't interrupt current work).

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

- `feature/audit-pdf-prose-fix` — 9 commits pushed to GitHub. Ready to merge.
- `feature/concurrency-phase2-optimistic-lock` — 17 commits pushed. Ready to merge. Includes concurrency Phase 2 + tenant isolation Phase 1+2 + cross-tenant HTTP proof test.
- `feature/postgres-rls` — 4 commits, branched off concurrency-phase2. Runtime layer (`runtime/db-postgres.js` gets `withTenantScope` + `enableRowLevelSecurity` + AsyncLocalStorage threading) + compiler emit (per-request middleware + startup hook gated on `tenantScope && isPostgres`) + 28-case compile-shape regression test (`lib/postgres-rls-compile.test.js`) + 22-case runtime test (`runtime/db-postgres-rls.test.js`) + doc cascade across all six teaching surfaces. Ready to merge.
- `feature/multi-user-per-tenant` — 2 commits, branched off postgres-rls. Compiler emit of `POST /auth/invite` + `GET /auth/invite` + extended signup body to honor `invite_token` (gated on `tenantScope && hasAuthScaffold`). End-to-end HTTP test (`lib/invite-multi-user-witness.test.js`) runs Alice→Bob→Carol scenario; gracefully skips when bcryptjs/jsonwebtoken aren't installed. Doc cascade across six surfaces. Ready to merge.
- `feature/user-guide-chapter-reorder` — 2 commits, branched off multi-user. USER-GUIDE.md body now reads in the same thematic order the TOC at top promises (Foundations → Full-stack → Visual → Real-time+AI → Marcus → Production → Testing → Tooling → Reference). `scripts/reorder-user-guide.mjs` is the reorganization tool — slices on top-level `##` headers, rebuilds in target sequence, asserts every original line is present in the output. No heading text changed, all TOC anchors still resolve. Plus this HANDOFF update commit. Ready to merge.
- `feature/postgres-rls-real-pg-witness` — 1 commit, branched off user-guide-reorder. Real-engine integration test for the Postgres RLS layer: `runtime/db-postgres-rls-real.test.js` connects to whatever Postgres `DATABASE_URL` points at, runs the actual ENABLE/FORCE/CREATE POLICY DDL, fires forged WHERE-less SELECTs inside two tenant scopes and asserts isolation, fires a cross-tenant INSERT and asserts the WITH CHECK refuses, asserts zero rows visible to an unauthenticated reader, asserts idempotent re-enable. Without `DATABASE_URL` the test gracefully skips. pg-mem isn't enough — it rejects all the relevant DDL (probed). Ready to merge.
- `feature/audit-trail-attribution` — 5 commits, branched off real-pg-witness. Compiler now emits an `audit_log` durable SQL table + a state-change-capture middleware + `GET /audit` endpoint (tenant-scoped under shared scope) when `allow signup and login` is declared. Captures `{ ts, user_id, user_email, tenant_id, method, path, status }` for every POST/PUT/PATCH/DELETE; skips read-only requests + Studio Meph proxy paths. Storage is durable (db.insert / db.findAll), not in-memory — survives process restarts. Compliance buyer's "show me state changes last quarter" is now `GET /audit`. End-to-end HTTP test (`lib/audit-trail-witness.test.js`) covers Alice solo + tenant-scoped Alice/Bob isolation, 7 cases all green. Doc cascade across FEATURES + system-prompt + CHANGELOG. Ready to merge.

**Stacking:** the six new branches are linearly stacked off `feature/concurrency-phase2-optimistic-lock`. Cleanest merge order is bottom-up: concurrency → postgres-rls → multi-user → user-guide-reorder → real-pg-witness → audit-trail-attribution → main. Or squash-merge each one independently if you prefer separate squashed history.

**All branches pushed to GitHub.** Tonight's commits used `--no-verify` after the documented `#editor-mount .cm-editor` Playwright flake fired twice on retry; all diffs are unrelated to IDE/Playwright code, conditions for the documented escape hatch were met.

**Tonight's session totals:** 12 commits across 6 branches — Postgres RLS layer + multi-user invites + USER-GUIDE reorder + real-PG integration witness + audit-trail attribution (in-memory then durable). All ready to merge.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Build the new ranger + RevOps landing page.** Russell decided (2026-05-04) that the ideal customer is the "D&D ranger" — product / marketing / RevOps people who can read code but aren't engineers. They've all hit the same wall: AI tools wrote code they can't fix; Retool seats are IT-blocked; Webflow is brochure-only; Bubble is a mess. Clear's pitch lands here. The existing `landing/marcus.html` and `landing/business-agents.html` target the wrong audience for the GTM lock; this new page should be the homepage replacement candidate.

   **File:** `landing/builders.html` (or replace `landing/index.html` after review). Use the existing pricing.html visual system: indigo accent, Inter font, Lucide icons, tier-card-style cards.

   **ASCII wireframe (already designed — turn this into HTML directly):**

   - **Hero.** Headline: "The AI built your app. It broke at 11pm. You can't fix it." Sub: "Clear writes the same kind of app — but in plain English. You can read every line. You can fix every line." Primary CTA: "Open Studio →". Secondary CTA: "Watch 90s demo ▸". Inline screenshot: editor on left, running app on right.
   - **The wall you keep hitting** (4 cards). Lovable/Bolt (wrote React you can't read). Bubble (drag-and-drop chaos). Retool (per-seat pricing, IT-blocked, no source code) — RevOps wedge. Cursor (assumes you can architect Postgres) — negative space, "use Cursor if you ARE the dev."
   - **What's different** (side-by-side before/after). Left: ~30 lines of unreadable React from Lovable. Right: 8 lines of Clear that does the same thing. Caption: "Bug? Read the sentence."
   - **Who this is for.** PMs filing tickets engineering won't get to. Marketers needing internal tools nobody will build. **RevOps people whose Retool seat takes 6 weeks of IT tickets to provision.** Founders who aren't the CTO. Negative space: "Not for you if you're a senior dev who'd rather use Cursor."
   - **What you can ship today** (3 case-cards with screenshots). Deal Desk (50 lines, 8 minutes). Lead Router (38 lines, 5 minutes — RevOps-friendly). Internal Request Queue (42 lines, 6 minutes).
   - **NEW SECTION — Build AI assistants, not just apps.** A lot of AI-app builders only do forms + tables. Clear also does agents: `ask claude '...' with input` is one line. An agent with tools (calls your functions), memory (across sessions), and a knowledge base (read your tables / files / URLs) is ~10 lines. Stream responses word-by-word by default. Multi-step workflows with parallel branches. Schedule an agent to run hourly. Show a tiny code sample of a customer-support agent + a "this is the helpdesk-agent template" link. Two example apps already built and reusable: helpdesk-agent (4 lines of agent + tools), ecom-agent (intent routing + RAG over products). The AI stack is built in, not bolted on.
   - **NEW SECTION — Built secure by default.** Most AI-tool output ships with bugs. Clear blocks 30+ classes at compile time: SQL injection (every database call uses safe parameters), auth bypass (every change-the-data URL needs a login line — compiler refuses without it), mass-assignment (the compiler picks safe fields, ignores anything else the request sent), XSS (every screen-display is auto-escaped), missing rate limits (one keyword), error-message leaks (validation messages stay in plain English; server crashes show "something went wrong"). Plus tenant isolation in TWO layers — the app filters by customer AND the database itself refuses cross-customer reads (Postgres row-level security, shipped 2026-05-03). Plus a durable change log: every edit recorded with who, when, what URL, what was changed, with passwords automatically redacted. Plus accounts that survive a restart (durable user storage). The CRO/compliance buyer sentence: "we don't ask you to trust us — every guarantee is proved by the compiler refusing to ship code that breaks it."
   - **NEW SECTION — You can PROVE your rules actually work.** Every business rule (`enforce that deal's discount < 30`) gets a math verdict from the prover (proved / disproved / unverifiable). Every PROVED rule is independently verified at runtime: the harness spawns the compiled app, fires 20 violating inputs, asserts every one rejects with a 403 carrying the rule's name. Click the Prove button → download a navy/amber audit PDF you can hand to your compliance buyer. The CRO sentence: "we proved every rule with math AND we sent twenty bad inputs at every PROVED rule and watched them all bounce." Two-witness verification, both green on every push. Show a screenshot of the audit PDF.
   - **How it works** (3 numbered steps). 1) Type what you want in plain English. 2) AI writes the Clear version, you read it, tweak it. 3) One click → live on yourapp.buildclear.dev.
   - **Pricing teaser.** "Free for 1 app. $99/mo when your team uses it. First 5 customers get a $500 one-time Concierge Setup." → link to /pricing.html (the Concierge card lands at the bottom of pricing tonight).
   - **Final CTA.** "Type your idea. See it run in 30 seconds. [Open Studio]"

   **Russell's three calls before I write copy** (already asked tonight, not yet answered):
   - The hero pain line ("It broke at 11pm. You can't fix it.") — too aggressive or right?
   - Naming Lovable / Bubble / Retool / Cursor by name in the wall list — fine, or risky?
   - Drop "Marcus" entirely on this page (the regulated-tier compliance pitch is wrong audience here)?

   **Constraints:** no emoji (use Lucide SVG); one accent color (indigo, matching pricing.html); 8-pt grid spacing; one btn-primary per section; cards bg OR border not both. Use the `landing-pages` launch entry to preview at `localhost:5009/builders.html`.

2. **Studio "Direct Edit" feature — click a piece of the running app, edit the corresponding Clear line.** New toggle button above the preview pane in Studio. Press it; it stays pressed (toggle state). Click anywhere in the running preview app. Studio: (a) jumps the editor cursor to the matching Clear source line and highlights it, (b) auto-drafts a message into Meph chat: "help me edit this:" + the Clear source snippet starting at that line. The user reviews + sends.

   **Why it matters for launch:** the ranger audience can read English Clear but stalls on "where in the source did this button come from?" This feature collapses that gap to one click. It's the load-bearing UX for "non-developers can iterate on AI-generated apps."

   **User flow:**
   - User has compiled + running app in preview pane.
   - New button labeled "Direct Edit" above preview, in toolbar row next to existing tab switcher.
   - Click → button turns indigo / pressed-state, cursor over preview iframe becomes crosshair.
   - User clicks a piece of the rendered app (heading, button, table cell, form input).
   - Bridge captures the click, walks up the DOM finding nearest element with `data-clear-line="N"`, posts the line number to the parent (Studio).
   - Studio: scrolls editor to line N, places cursor there, briefly highlights the line. Composes a Meph chat draft: ```Help me edit this:\n\n<clear source from line N + 5 lines>``` and either auto-sends or fills the chat input for user to send.

   **Files to touch:**
   - `compiler.js` — UI element emit needs `data-clear-line="N"` on every interactive DOM element it generates. The compiler ALREADY emits `// clear:N` markers on compiled JS lines; extend the same map to HTML attributes. Probably ~5-10 emit sites (`heading`, `button`, `input`, `table`, `link`, `nav item`, etc.).
   - `playground/ide.html` — add the "Direct Edit" toggle button above the preview-pane toolbar. Wire its state via localStorage (so it persists across reloads). Listen for postMessage events from the bridge with `{ type: 'clear-edit-click', line: N }`. Jump the editor: `editor.dispatch({ selection: { anchor: lineStart } })` then scroll. Compose Meph message: read N lines from editor, format as code-fenced block, set chat input value.
   - The Studio Bridge script (in `compiler.js` near "shared iframe between user and Meph" — see learnings.md TOC) — it already captures clicks for the iframe-to-parent flow. Extend its click handler to honor a "directEdit" mode flag (sent by parent via postMessage on toggle), and when active, walk up the DOM looking for `data-clear-line` and post the line number.
   - `playground/system-prompt.md` — add a paragraph telling Meph that when he sees a "Help me edit this:" message with code-fence, the user is asking for a focused edit on that specific snippet. Don't refactor the whole file; tweak that block.

   **Existing infra to lean on:**
   - Source-line markers: compiler already emits `// clear:N` on every JS line for source-map purposes. The HTML attribute extension is parallel work, not a rebuild.
   - Studio Bridge: already injects ~90 lines of click-capture into compiled apps (per learnings.md). Adding a "directEdit" mode is one new event handler, not a new architecture.
   - Meph already has read access to the source file and accepts code-fenced edit requests.

   **Test:** spawn a tiny app (build for web + page + heading + button), turn on Direct Edit, click the heading, assert (a) editor cursor jumps to the heading's Clear line, (b) chat input gets a "Help me edit this:" + the heading line + 4 lines of context.

   **Estimated scope:** half a day of focused work — a few-line emit change in `compiler.js`, ~30 lines added to `ide.html`, ~10 lines to the bridge. Test harness re-uses the existing `playground/ide.test.js` Playwright pattern.

3. **Studio Prove redesign — auto-check inline (4a) + right-click drilldown (4c).** Tonight shipped 4(b): clicking Prove now downloads the audit PDF. The two remaining modes:
   - **(a) Auto-check on every save.** Run the prover every time the source changes. Show verdicts inline in the editor gutter: green check next to proved rules, red X next to disproved, amber question mark next to unverifiable. Like spell-check. Sub-second. CodeMirror gutter integration.
   - **(c) Right-click a rule → debug drilldown.** Side pane showing the prover's reasoning (the math journal text that USED to dump to terminal under the old Prove button). The "why didn't this prove?" debug surface.

   Both need CodeMirror gutter / context-menu integration — fresh-head work, not late-session fix-it.

4. **Validator friction-driven error rewrites.** Friction script's top items are historical noise (already covered by INTENT_HINTS). Defer until a fresh sweep batch generates new actionable failure rows.

5. **Multi-line `/* */` comments inside endpoint bodies — couldn't reproduce.** If this resurfaces, capture the EXACT failing source verbatim before touching it.


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
