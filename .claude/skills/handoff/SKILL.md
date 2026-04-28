---
name: handoff
description: Create or update HANDOFF.md to pass context between sessions. Use when ending a session, switching tasks, or when the user says "handoff", "save context", "write a resume prompt", or "I'm done for now".
---

# Handoff — Session Context Transfer

**Purpose:** Write `HANDOFF.md` so the next session continues without re-reading the codebase.

## HARD RULES (Russell has Mito + ADHD — long handoffs are a tax he won't read)

1. **Max 2 printed pages — about 150 lines.** If you're writing more, you're putting reference material in the wrong place. See "Where things go" below.
2. **Lead with priorities, not history.** First thing the reader sees: "Next 3-5 things to do, in order." NOT "what shipped this session."
3. **One-screen scan, then stop.** A 30-second skim of HANDOFF.md should give a fresh session everything it needs. If it scrolls more than once, cut.
4. **Bullets over paragraphs.** Every line stands alone. No multi-paragraph narrative.

## Where things go (HARD RULE — don't bloat HANDOFF with content that lives elsewhere)

| Content | File | Why |
|---|---|---|
| **Priorities for next session** | `HANDOFF.md` | Forward-looking, short |
| **What shipped this session** | `CHANGELOG.md` (newest at top) | Session-by-session history |
| **What Clear can do today** (capability surface) | `FEATURES.md` (add a row when shipping a new capability) | Permanent capability reference |
| **Bug stories / what broke + how we fixed** | `learnings.md` | Narrative gotchas, indexed by topic |
| **Long-running design decisions / project state** | `intent.md`, `PHILOSOPHY.md`, `RESEARCH.md` | Authoritative docs |
| **Where does X live? / How do I Y? / Why did we Z?** | `FAQ.md` | Subsystem navigation |

**Before saving the handoff:** scan the draft. Every "what shipped" line goes to CHANGELOG. Every "Clear now does X" line goes to FEATURES. Every "we hit X bug, root cause Y, fixed Z" goes to learnings. The handoff keeps NONE of that — only the forward-looking priorities + the one-line state.

## What HANDOFF.md must contain (in this order)

```markdown
# Handoff — [Date]

## Where you are
- **Branch:** `main` (or whatever).
- **Last commit:** [hash short message]
- **Tests:** [N of N passing]. **Working tree:** clean / dirty (list dirty files).
- **Critical-path standing:** [one sentence — where we are vs. first paying customer].

## Next session — priority order

1. **[Item]** (~estimated time). One-line scope. **Why for launch:** one line.
2. **[Item]** (~estimated time). One-line scope. **Why for launch:** one line.
3. **[Item]** ...
4-5. ...

## Blocked on Russell (skip these and grab the next item)
- [Item] — needs [API key / hardware / decision]

## Tested vs. assumed (the only context-rich section)
- ✅ **Tested + saw work:** [things I drove + saw evidence]
- ⚠️ **Assumed worked:** [things claimed-green from tests but never driven] ← next session looks here for surprise bugs

## Resume prompt (paste into fresh session)
> Read HANDOFF.md and start on item 1. All in one session. Apply the session rules in `~/.claude/CLAUDE.md` (priority queue from roadmap, big-picture narration, parallel-first, 10x-time, TDD red-first). Current main commit: [hash].
```

That's it. If the file scrolls more than twice, cut.

## What does NOT belong in HANDOFF (trim before saving)

- ❌ "What shipped this session" with commit hashes — that's CHANGELOG's job
- ❌ "What Clear can do" descriptions — that's FEATURES
- ❌ Narrative paragraphs about design decisions — those go in PHILOSOPHY / RESEARCH / FAQ
- ❌ Bug stories — `learnings.md`
- ❌ Re-explaining session rules already in CLAUDE.md (just one-line link)
- ❌ Full feature plans — those live in `plans/plan-*.md`, link to them
- ❌ Mood essays / process retrospectives — keep the calibration to ONE bullet

## Hygiene before saving

Every time I write a handoff, do these THREE moves first:

1. **Add a CHANGELOG entry** for what shipped this session (newest at top, dated). Keep it 1-3 short paragraphs per session.
2. **Add FEATURES rows** for any new shipped capability. The headline counts in FEATURES (`N node types`, `N tests`) update with the new totals.
3. **Trim ROADMAP** — anything I shipped this session that was on ROADMAP gets DELETED from ROADMAP (it's in CHANGELOG/FEATURES now). ROADMAP is forward-looking only; no strikethrough done items.

THEN write HANDOFF.md, lean and short.

## After writing

Tell the user: "Handoff saved (under N lines). Start next session with: `Read HANDOFF.md and continue from where we left off.`"
