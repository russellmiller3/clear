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

## Current State (rewritten 2026-05-02 late-evening)

**North star:** first paying Marcus customer. Revenue gates everything else.

**Where the product is:**
- All 5 canonical Marcus apps (Deal Desk, Approval Queue, Lead Router, Onboarding Tracker, Internal Request Queue) compile clean and pass 74 of 74 automated browser checks.
- The proof system shipped AND its verdict surface is now hardened: the business-rules eval (35 cases across 21 groups) passes 35 of 35. Four wrong-verdict gaps closed today — equality-on-constants now folds correctly, empty rule bodies now report UNVERIFIABLE instead of vanishing, and impure expressions hidden inside assignments are now detected. These were exactly the cases where the prover would have lied to a CRO during a demo.
- Studio has a fullscreen toggle for demo recording.

**What's blocking launch (in order):**
1. Russell finishes Cloudflare account setup → hands over token + account ID + namespace name
2. Agent wires Studio's deploy flow to those credentials (~1 hour)
3. One Marcus app deployed to a real `<slug>.buildclear.dev` URL
4. Russell records the 75-second demo voice-over against the deployed app
5. Russell DMs 5 Marcuses on LinkedIn with the recording

**No critical-path code work needed before step 1 — every blocker upstream is on Russell's hands.**

---

## In-Flight Work (branches not yet merged to main)

| Branch | What it ships | Status |
|---|---|---|
| `feature/prover-business-rules-eval` | Test harness exercising the proof system against 16 rule shapes; 14 prove correctly, 2 surface real proof-system gaps. Includes a stub for the runtime-witness harness (Russell's "how do we know the prover tells the truth" question). | 3 commits, pushed, ready to merge. |

When merging this branch, the standard pattern works:
```
git fetch origin
git merge --ff-only origin/feature/prover-business-rules-eval
git push origin main --no-verify
```

---

## Blocked on Russell (skip these — pick the next item if any block)

- **Cloudflare account finishing**: Workers Paid plan ($5/mo) + Workers for Platforms add-on ($25/mo), `buildclear.dev` zone added, dispatch namespace `clear-customer-apps` created, API token generated (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit, Account Settings:Read). When done, hand over token + account ID + namespace name.
- **First Marcus conversation**: Russell's pitch move. Conversation, not a code move.
- **Stripe live keys, Anthropic org key, Fly Trust Verified**: external paperwork, parallel async track.
- **Sandbox-stranded commits recovery**: gated on cloud-Claude reachability. Patch already applied where it matters; fully redundant if cloud-Claude is unreachable.

---

## Next Moves (in order — if you have time, do them top down)

1. **Wire the runtime-witness harness** at `lib/prover/runtime-witness.test.js`. Today it's a stub with 3 cases declared and skipped. To wire it up: take the compiled JavaScript backend output, write it to a tempfile, spawn `node tempfile.js`, wait for the server to listen, send the violating inputs via `fetch()`, assert every one comes back as a rejection (HTTP 400 or 403) with the rule's name in the error message. If even one violating input slips through with success, the proof system is lying — break the test loud. This is the "trust but verify" bridge for the regulated-tier pitch.

2. **Lead-router rules cleanup**: `apps/lead-router/main.clear` still has tautology rules (`enforce that 1 is greater than 0`) at top-level. Same fix pattern as deal-desk: move them into the POST handler, reference real fields. ~15 minutes of work.

3. **Replace `or 'msg'` with `, or fail with error message: 'msg'` in enforce-that syntax (Russell's preferred form, locked 2026-05-03 evening)**: `enforce that X or 'message'` reads weird — `or` is in the wrong position. Final canonical form: `enforce that discount is less than 30, or fail with error message: 'Discounts over 30% need VP approval'`. Reads as "enforce that X is true, OR if not, fail with this error message." Same pattern as today's `guard → enforce that` rename: add `, or fail with error message:` as a multi-word synonym in `synonyms.js`, bump SYNONYM_VERSION, write a one-shot bulk-replace script for all .clear apps + tests + teaching docs, update the parser's enforce-that handler to accept the new separator. ~30-45 min. No back-compat per project rule. Verify the full compiler test suite + 35-case eval still green after the rename.

4. **Pre-existing playground bundle build is broken.** `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js` fails with "Could not resolve fs/path/url" because `lib/packaging-cloudflare.js` imports node-only modules. Either add `--platform=node` (changes the bundle target), or split packaging-cloudflare out of the index.js graph for browser builds, or add `--external:fs --external:path --external:url`. Independent of any prover work — a stale playground bundle ships compiler changes invisibly to Studio users.

---

## Trust Notes (read before claiming something proves anything)

The proof system today proves rules two ways. Know which one is firing before you cite it in a pitch.

- **Math on constants**: `5 < 7` is universally true. Trust basis: arithmetic. Solid.
- **Structural proof**: `deal's discount < 30` cannot be evaluated without a deal, but the compiler emits a runtime check that REJECTS any input where the condition fails. So "no execution past the check satisfies the failing condition" is provable from the program's structure. **Trust basis: the compiler correctly emits the runtime check.**

The structural proof has one weak link: nobody yet measures whether the compiler actually emits the check correctly. The `runtime-witness.test.js` stub (Next Move #2) is the bridge. Until it's wired up, "PROVED" means "the proof system believes the rule is enforced, given the compiler emits correctly." Two-witness verification (math + runtime) is the credibility story for Marcus's CTO. Don't claim more than is measured.
