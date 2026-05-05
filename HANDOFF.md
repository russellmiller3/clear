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

## Current State (rewritten 2026-05-04 evening)

**North star:** first paying Marcus customer. Self-serve product (Vercel model), not consulting.

**What just shipped this session (already on the in-flight branch — see below):**
- **Pearlescent buttons across every Clear app + Studio.** Subtle pearl-light-gray-blue gradient with a right-to-left animated opal sweep on hover. Replaces the bootstrappy DaisyUI default look that Russell hated. Compiled into every app via the compiler, so every future build inherits it.
- **App layout rules.** Content area capped at 1440px, centered. 32px gutters on the sides. 24px between panels. Form fields capped at 640px wide. Stat cards capped. Based on Linear / Stripe / Vercel patterns, documented in `design-system-v2.md`.
- **Marcus apps now have real per-page nav.** Lead-router, approval-queue, onboarding-tracker, internal-request-queue used to send every sidebar click back to "/". Each one now has its own page (Routing rules, Owners, All requests, Customers, Steps, Managers, IT/HR/Facilities/Finance team filters).
- **MARCUS-UAT.md** — per-app feature checklists with explicit "known gaps" sections. Lead-router's UAT goal ("can I edit and save routing rules?") is honestly flagged as not yet supported (rules are hardcoded; no DB-backed CRUD).
- **Audit-PDF stat cards no longer overlap.** Numbers and labels were colliding because each cell held a list of paragraphs; now each cell is one paragraph with a line break.
- **Studio editor highlighting fixes** (multi-line strings, hyphenated rule names like `discount-not-over-cap`, possessive `deal's`, structural-vs-connector keyword tier, italic-gray block comments).
- **Compiler bug at the root**, not worked around: block comments inside indented bodies (endpoints, actions) used to silently empty the body. Fixed in the tokenizer; three regression tests lock it.
- **Desktop shortcut now rebuilds Marcus apps.** `start-clear.bat` adds a step that compiles every Marcus app's `.clear` source before starting Studio, so the latest compiled output reaches the running apps. Also kills ports 4100-4104 so old Marcus servers don't stick around.

**The proof system underneath all of this:** `enforce that` rules prove with two witnesses (math on constants, runtime rejection witness via the compiled app). Tenant separation is defense in depth on Postgres. Multi-user-per-tenant via single-use invites. Audit trail in durable storage. All previously shipped, all still green.

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

---

## In-Flight Work

**`fix/marcus-uat-and-preview-default`** — local branch, **8 commits ahead of `origin/main`**, **NOT pushed**. Russell said "don't push until I tell you we're all done."

Commits on the branch (newest first):
1. `869fced` — fix(layout+studio): real workbench grid + 32px section gap + Stop button works mid-stream + softer chat bubble. Workbench `1fr / 380px` (was 50/50 squish), vertical 32px section gap (was 0px because rule fired at wrong depth), Submit Request panels capped 720px, Studio resizers 22px hit area (was 5px-impossible-to-grab), user chat bubble 9% accent tint with normal text (was bright blue / white), server-side `req.on('close')` aborts in-flight fetch + SIGTERM/SIGKILL spawned subprocess so Stop button works mid-Meph-iteration.
2. `ef4c291` — fix(studio): no opal sweep on grayed-out toolbar buttons (`.toolbar-btn:disabled`, `[aria-disabled]`, `.disabled`, `.is-disabled` plus `.primary` combos all re-assert flat values + `transition: none`)
3. `4fc7942` — fix(layout): cap stat cards + form fields at the BASE rule, not as override. Stat cards 280-320px (was stretched), form fields 480px (was 1223px), stat number 22px (was 28px), disabled-button hover guard for compiled apps. Plus rides-along: audit-log retention helper + `POST /audit/cleanup` endpoint (90-day default, env override).
4. `4d0e40f` — refactor: rename `playground/` → `studio/`, `ide.html` → `studio.html`, update all references (175+ file renames + path updates)
5. `5750a0f` — pearl buttons + opal sweep + layout rules + Marcus per-page nav + audit-PDF + UAT doc + start-clear rebuild
6. `c81d65b` — block comments render as italic gray
7. `ed90df8` — FEATURES + FAQ entries for the syntax-highlight fix (doc cascade)
8. `c756cdc` — editor highlighting (multi-line strings, hyphenated names, possessive, keyword tier)

**Layout sweep verified live (2026-05-04 evening) via preview tools — ALL 5 Marcus apps:**

| App | Workbench | Card vertical gap | Stat card |
|---|---|---|---|
| deal-desk | 899px table + 340px detail (flex) | 32px × 5 | 320px |
| lead-router | 861px table + 380px detail (grid) | 32px × 4 | 320px |
| approval-queue | 861px table + 380px detail (grid) | 32px × 3, Submit 720px | 320px |
| onboarding-tracker | 861px table + 380px detail (grid) | 32px × 5 | 320px |
| internal-request-queue | 861px table + 380px detail (grid) | 32px × 3 | 320px |

Studio: setting `aria-disabled="true"` on a toolbar button immediately yields flat gradient + cursor not-allowed + opacity 0.65 + transition none (verified live).

**When Russell says ship:** local merge into main (`git checkout main && git merge --ff-only fix/marcus-uat-and-preview-default && git push origin main && git branch -d fix/marcus-uat-and-preview-default`). The `ship-docs-cascade-gate` hook will fire on the merge — CHANGELOG / FEATURES / FAQ entries already landed earlier on the branch, so the gate should pass.

---

## Why Russell still sees cramped layout when he reopens Studio (diagnostic)

Russell ran the latest `start-clear.bat`, expecting to see the new pearl buttons + 1440px-capped layout. He still sees the old cramped look. Three suspects, ranked by likelihood:

1. **Browser cache.** Chrome aggressively caches CSS / HTML. The desktop shortcut opens Chrome in app mode pointing at `localhost:3456` — Chrome happily serves yesterday's cached `studio.html`. **Fix:** open DevTools (F12), check "Disable cache" while DevTools open, then Ctrl+Shift+R. Or close every Chrome window and reopen. **This is the most likely cause.**

2. **Marcus app servers running stale compiled output.** The shortcut kills ports 4100–4104 and rebuilds each Marcus app, BUT only if the rebuild step actually fires. If `node cli/clear.js build apps/<app>/main.clear` fails silently (BUILD FAILED line), the old `apps/<app>/index.html` + `style.css` keep serving. **Fix:** open the minimized "Clear Studio Server" terminal window and look for any "BUILD FAILED" lines from step 3 of the shortcut. If any appear, run that exact build command in a terminal to see the real error.

3. **Layout rules not actually applied to the running CSS.** The compiler's `BUTTON_PEARL_CSS` constant only emits the layout rules when the heuristic `hasFullLayout(htmlBody)` returns true. If a Marcus app's HTML doesn't trip that heuristic, the 1440px cap won't fire. **Check:** view-source on the Marcus app preview in Chrome and search for `.clear-shell-outlet` in the inlined `<style>` block. If it's missing, the heuristic is the bug. If it's present, this is suspect 1 or 2.

**Recommended order of operations next session:** ask Russell to hard-refresh (suspect 1) FIRST. If still cramped, peek at the shortcut's terminal output (suspect 2). Only dig into the compiler heuristic (suspect 3) if both above are clean.

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated. When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Push the in-flight branch + rename**: Russell explicitly told me to hold pushes. Wait for green light.

---

## Next Moves (in order — if you have time, do them top down)

1. **Walk Russell through the cramped-layout diagnosis.** The 3 suspects are listed above. The compiler emits `.clear-shell-outlet` correctly (verified: every Marcus app has it in both HTML and CSS). The fix is almost certainly suspect 1 (Chrome cache — DevTools "Disable cache" + hard refresh).

2. **Studio Prove redesign — auto-check inline (4a) + right-click drilldown (4c).** 4(b) shipped previously: clicking Prove downloads the audit PDF. The two remaining modes:
   - **(a) Auto-check on every save.** Run the prover every time the source changes. Show verdicts in the editor — ideally inline in the gutter, fall back to a toolbar badge with click-to-expand popover.
   - **(c) Right-click a rule → debug drilldown.** Side pane showing the prover's reasoning. The "why didn't this prove?" debug surface.
   - **⚠️ Bundle-rebuild gotcha (read FIRST):** the inline-gutter UX needs CodeMirror's `gutter` / `GutterMarker` / `StateField` / `StateEffect`. None are in the vendored `studio/codemirror.bundle.js` — only `EditorView`, `EditorState`, `keymap`, `lineNumbers`, `highlightActiveLineGutter`, `highlightActiveLine`, `drawSelection`, `syntaxHighlighting`, `StreamLanguage`, `HighlightStyle`, `defaultHighlightStyle`, `defaultKeymap`, `history`, `historyKeymap`, `indentWithTab`, `javascript`, `tags`. Adding the missing exports means: install `@codemirror/*` devDependencies, update `scripts/build-codemirror-bundle.mjs` + `scripts/codemirror-entry.mjs`, run esbuild, verify bundle size doesn't balloon. Multi-hour. **Pragmatic pivot:** build v0 as a toolbar auto-prove badge + click-to-expand popover (uses only existing exports — already shipped earlier per CHANGELOG). File the v1 inline gutter as a follow-up that requires the bundle rebuild.

3. **Audit log retention / archive.** As `audit_log` grows, queries slow. Need a retention policy (e.g. 90 days) or an archive table. Compliance buyers often ask "how long do you retain audit data?" Concrete shape: emit a daily cleanup endpoint (`POST /audit/cleanup`) or a one-shot startup task that deletes rows older than `audit_retention_days` (default 90). Document the knob in FAQ + FEATURES.

---

## Trust Notes (read before claiming something proves anything)

The proof system today proves rules two ways. Know which one is firing before you cite it in a pitch.

- **Math on constants**: `5 < 7` is universally true. Trust basis: arithmetic. Solid.
- **Structural proof**: `deal's discount < 30` cannot be evaluated without a deal, but the compiler emits a runtime check that REJECTS any input where the condition fails. So "no execution past the check satisfies the failing condition" is provable from the program's structure. **Trust basis: the compiler correctly emits the runtime check.**

**The runtime-witness bridge is wired.** `node lib/prover/runtime-witness.test.js` compiles each rule shape, spawns the compiled app on a free port, sends 20 inputs that violate the rule, and asserts every one rejects with a 403 carrying the rule's name in the response body. 60 measured rejections across 3 rule shapes, all green. The runtime claim a CRO can hear: "we proved every rule with math, AND we sent twenty bad inputs at every PROVED rule and watched them all bounce with the rule's name on the rejection."
