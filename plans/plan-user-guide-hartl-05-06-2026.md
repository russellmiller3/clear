# Hartl-Quality User Guide Rewrite

**Status:** drafted 2026-05-06. Multi-session epic. Branch: `plans/user-guide-hartl`.

## Why this exists

USER-GUIDE.md today is 4104 lines, 33 chapters, written across many sessions. Some chapters are Hartl-quality (the recent OWASP / business-rules / audit additions). Others are reference-style — code blocks with thin prose, no "now run this" beats, no exercises. The reader can't tell which chapter is leading them through a build vs. handing them a glossary entry.

Russell's standard, stated 2026-05-04: "Hartl's Rails Tutorial." That means a reader builds **one app, chapter by chapter**, and at the end of every chapter they have a working thing they can run. Each chapter adds one feature to the same app. By the last tutorial chapter the reader has shipped a real working app — not 33 disconnected demos.

## The strategy

**Two tracks, not one.**

- **Tutorial track (Chapters 1–12):** the reader builds **deal-desk** chapter by chapter. Each chapter ends with a working `.clear` file, a "now run this" command, expected output, and 2–3 end-of-chapter exercises. By Chapter 12 the reader has shipped a deployable approval-queue app with auth, audit, business rules, AI drafter, and email — i.e. a real Marcus app.
- **Reference track (Chapters 13–24):** the existing per-feature chapters stay (charts, real-time, scheduled tasks, etc.) but get rewritten to assume the reader has the deal-desk app from Chapters 1–12. They're now consulted, not read in order.

Why deal-desk: it's already in `apps/deal-desk/main.clear`, it's the headline Marcus pitch app, and it naturally exercises tables → CRUD → auth → queue → audit → AI → email → business rules in the right order. Most other Marcus apps are subsets of deal-desk.

## Tutorial track — chapter sequence

Each row says: chapter number, what the reader builds, which Clear primitive shows up first, what the reader can run by the end. Lines marked **NEW** are content the existing USER-GUIDE doesn't have in this shape; **REWRITE** means the existing chapter gets restructured but the topic stays.

| Ch | What reader builds in deal-desk | Primitive introduced | End-of-chapter run + expected output |
|----|---------------------------------|----------------------|--------------------------------------|
| 1  | The deal record on screen | `show`, `=`, strings | `clear run` → "Discount: 18%" |
| 2  | Reject a deal if discount > 30 | `if/then`, comparisons | "Approved" or "Discount needs VP approval" |
| 3  | List of deals from memory | lists, `for each` | Three deal lines printed |
| 4  | Compute discount cap as a function | `define function` | Function returns 30 for enterprise tier |
| 5  | First web URL: GET /api/deals | `when user calls`, `send back` | curl shows `[]` |
| 6  | Save deals to a database | `create a Deals table:`, `save … as new` | curl POST + GET → one deal back |
| 7  | The deal-desk page (HTML) | `page 'X' at '/X':`, `heading`, table syntax | Browser at localhost shows empty queue |
| 8  | Logging in + ownership | `allow signup and login`, `the deal's creator can read…` | Two users see only their own deals |
| 9  | The CRO approval queue | `queue for deal:`, `actions: approve, reject, counter` | Approve a deal, status flips |
| 10 | Email the rep when approved | `email customer when …`, `provider is 'agentmail'` | Approved deal triggers an email row in outbox |
| 11 | The AI drafter | `agent draft_approval:`, `knows about:`, `ask claude` | Drafter writes a one-paragraph summary |
| 12 | Provable business rule + audit + ship | `rule discount-cap-thirty:`, `clear prove`, `clear ship` | `clear prove` shows PROVED, app deploys to <slug>.buildclear.dev |

Twelve chapters. Each one adds ONE primitive to the same growing file. By the end the reader has the actual deal-desk app from `apps/deal-desk/main.clear` — minus a few Marcus-specific decorations.

## Reference track — chapter cleanup

The existing 21 chapters (after Chapter 12) get a lighter treatment: keep what's useful as a reference, drop what's redundant, retitle so the reader knows it's a reference.

- **Keep + lightly rewrite** (assume reader has deal-desk from tutorial): 13 (Working with Data), 13b (Charts), 14 (Error Handling), 15 (Modules), 16 (CLI), 16b (Studio), 17 (Testing), 19 (Workflows), 19c (Triggered Emails — already related to ch 10), 22 (Scheduled Tasks), 23 (Writing Tests), 24 (Business Rules — already deeper version of ch 12), 24b (Audit Reports — already deeper version of ch 12).
- **Merge into tutorial track**: 6.5 (Tables — Every Modifier) folds into Chapter 6 expanded. Chapter 11 (Making It Pretty) folds into Chapter 7 expanded. Chapter 12 (Security) folds into Chapter 8. Chapter 19b (Approval Queues — Deal Desk in 10 Lines) becomes Chapter 9 expanded. Chapter 21 (Policies / Safety Guardrails) folds into Chapter 12.
- **Drop or move to FAQ**: 8 (Multi-Page Apps — covered naturally by ch 7), 10b (Chat Interfaces — covered by ch 11 expansion if needed), 18 (Deploy — replaced by `clear ship` in ch 12), 20 (Designing Beautiful Pages — too long, move design tips to ch 7), 20.5 (Ship It — same as 18), Quick Reference (already in SYNTAX.md), Appendix (already in studio docs).

Net result: 12 tutorial chapters + ~13 reference chapters = ~25 total. Shorter, cleaner, builds toward a real app.

## Per-chapter quality bar (the Hartl checklist)

Every chapter, tutorial or reference, must hit ALL of:

- **Opens with WHY this chapter exists.** Two sentences. "By the end of this chapter, deal-desk will refuse any discount over 30%. That's the kind of rule a CRO actually pays for."
- **Teach the CONCEPT, not just the syntax.** Every new idea — "what is a database?", "what is an URL?", "what is logging in?", "what is a business rule?" — gets a one-paragraph plain-English explanation BEFORE we show the Clear syntax for it. Assume the reader has never written code. Hartl himself does this for Ruby + Rails concepts; we do it for Clear AND for the underlying ideas. Examples:
  - Before showing `create a Deals table:` — explain what a table is. "A table is a list of records that all have the same shape. Like a spreadsheet — every row is a deal, every column is a field. The database keeps your tables safe between page reloads."
  - Before showing `when user calls GET /api/deals:` — explain what an URL handler is. "When someone visits a web address on your site, your app gets a chance to respond. We're going to write a handler that says: 'when anyone asks for /api/deals, send back the list.'"
  - Before showing `allow signup and login` — explain why every real app needs accounts. "Without login, anyone in the world could see anyone else's deals. Login is the wall between users — each person sees only their own data."
- **Explain WHY for every design choice, not just WHAT.** "Why `=` for numbers and `is` for strings? Because 'price is 9.99' sounds like a question. Clear's job is to read aloud the way a human would say it." — that beat is the bar.
- **Each code block has prose AROUND it, not just under it.** Before: "we're about to add a function." After: "Notice we wrote `define function` not `def` — Clear's verbs are spelled-out English on purpose."
- **Every chapter has at least one "Now run this" beat with expected output.** Format: `clear run apps/deal-desk/main.clear` followed by the literal output the reader should see. If the reader doesn't see it, they know something's wrong.
- **End-of-chapter exercises (2–3).** Format: "Try this: change the discount cap to 25%. Run `clear prove` again and watch the verdict flip from PROVED to DISPROVED." Concrete, doable in under 5 min.
- **The 14-year-old test.** Read every paragraph out loud. If a sentence sounds like a manual and not a teacher, rewrite it.
- **No bare code blocks longer than ~20 lines without prose breaking them up.** Long blocks lose ADHD readers (and most readers). Either break them with explanation or move them to an appendix.
- **Cross-link forward AND back.** "We'll add the rule keyword in Chapter 12." / "Remember the queue from Chapter 9? We're going to give it teeth now."

A chapter that fails any of these gets sent back. No exceptions — even for the "easy" early chapters.

## Source of truth — latest syntax only

Clear's syntax has shifted across sessions. The OWASP work, business-rules keyword, audit trail, `live:` block, and several validator messages are all recent. Stale chapters will use stale forms. To prevent that:

- **Before writing any chapter, re-read in this order:**
  1. `CHANGELOG.md` — what shipped recently. New rows at the top.
  2. `SYNTAX.md` — canonical reference for every node type with examples.
  3. `FEATURES.md` — capability table; what Clear can do today.
  4. `FAQ.md` — where things live, why decisions were made.
  5. `intent.md` — authoritative spec if SYNTAX.md and CHANGELOG disagree.
- **Never write a chapter from working memory of "how Clear used to look."** Always ground in the current docs. The compiler may have new shorthand, deprecated synonyms, or a new keyword that didn't exist last month.
- **When in doubt about whether a syntax form is current, grep `parser.js` and `synonyms.js`.** Those are the ground truth. Docs lag the compiler; the compiler is the law.
- **Cross-check the deal-desk `apps/deal-desk/main.clear` file** — that's the canonical Marcus reference app. If the chapter introduces a feature, that feature should appear in deal-desk in the same form. Mismatches mean either the chapter is wrong or the app needs updating.

## Per-session cadence

This is a multi-session epic. Cadence:

- **Session 1 (today):** write THIS plan + Chapter 1 rewrite + Chapter 2 rewrite. Two tutorial chapters in one session. Commit + push at session end. Total: ~300 lines of Hartl-quality prose.
- **Session 2:** Chapters 3–4 (lists, functions). Two more chapters.
- **Session 3:** Chapter 5 (first web URL — the "leveling up" moment). One chapter, larger.
- **Session 4–8:** Chapters 6–12, one per session. These are the meatier chapters where deal-desk takes shape.
- **Session 9–11:** reference-track cleanup. Three sessions to retitle, prune, and rewrite the reference chapters.
- **Session 12:** end-to-end read-through pass. Read the whole guide cover-to-cover, fix tone breaks, fix forward references, ship.

That's ~12 sessions. Russell's pattern is one focused session = ~one logical chunk. This sizes about right.

## Where each session ends

Every session of this epic ends with:

1. The new/rewritten chapter(s) in `USER-GUIDE.md`, in the right TOC position.
2. The TOC at the top updated to match.
3. A line in `CHANGELOG.md` describing what landed (one sentence per chapter).
4. The branch merged to main + pushed (per the "Don't push branches until work is done" rule — each session's chapter set IS a phase).
5. HANDOFF.md updated: which chapters are done, what's next.
6. NO doc cascade across the other 10 files unless this session also changed a primitive (which it shouldn't — this is doc work on existing primitives).

## What this plan does NOT touch

- New compiler features. This is a rewrite of existing docs against existing features.
- Other docs (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, FEATURES.md, etc.). They cover different audiences and stay as they are. This plan is exclusively USER-GUIDE.md.
- The Marcus pitch surfaces (`landing/marcus.html`, `landing/hn-*.html`). Those are sales surfaces, not learning surfaces.

## When to abandon or pivot

If a chapter gets stuck for >30 min on "what should this chapter actually teach", that's a sign the chapter sequence above is wrong for the primitive in question. Stop, edit this plan, change the chapter ordering, then proceed. Don't ship a confused chapter.

If Marcus signs mid-epic and the user-guide rewrite stops moving the needle (e.g. Marcus is fine with the existing guide), pause and pivot. The first 4–5 tutorial chapters give the most leverage; the reference cleanup is lowest priority and can wait indefinitely.

## First-session deliverable (today)

- This plan file (committed).
- Chapter 1 rewrite — Hartl-quality, ~80–100 lines of new prose. Reader sees the deal record on screen, runs it once, gets a "Discount: 18%" output.
- Chapter 2 rewrite — ~100–120 lines. Reader adds an `if/then` so the deal gets approved or rejected based on the discount.
- Updated TOC.
- Commit per chapter (two commits: Chapter 1 rewrite, Chapter 2 rewrite).
- HANDOFF updated to show "Chapters 1–2 done, 3–12 next."

That's the unit of work for today.
