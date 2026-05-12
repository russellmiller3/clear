---
name: enq
description: Enqueue a new item to the in-session work queue at .claude/state/priority-queue.md. Use when the user types "/enq [text]" — appends the item to the "Up next" section so it lands on the queue without breaking out of current work. Distinct from /rule (which adds permanent rules to CLAUDE.md) and /handoff (which captures session state).
allowed-tools: Read, Edit, Bash
---

# Enqueue Work Item

The user wants to add a new work item to the in-session priority queue. The queue lives at `.claude/state/priority-queue.md` (gitignored — session-local). It's the autonomous-shipping queue Claude works off when Russell types `g`.

## What to do

1. Read `.claude/state/priority-queue.md` so you know its current shape.
2. Take the user's text (everything after `/enq `) and turn it into a single clear queue item:
   - **One-line title** at the top — imperative, plain English, what the item DOES (not what it's CALLED).
   - **Brief body** below — 1-3 sentences explaining what to do, where the surface lives, and why it matters for launch / Marcus / the running phase. Plain English; no jargon.
   - **No estimate column** — Russell's "10x" rule means human-time numbers are misleading.
3. **Append-only — always to the bottom of the "Up next (priority order)" section.** Never insert in the middle, never reorder existing items, never bump anything up. The whole point of `/enq` is to CAPTURE without INTERRUPTING — Russell types `/enq <thing>` mid-flight to drop an item without losing the current thread. Re-prioritization is a separate decision the user makes explicitly later.
4. If the queue file doesn't exist yet, create the standard skeleton (see "Queue file shape" below) and add the item to the empty "Up next" list.
5. Confirm what was added in one short sentence — and CONFIRM you're going back to whatever was in flight, not switching to the new item.
6. Do NOT push to GitHub — the queue file is gitignored and session-local. Just write to disk.
7. **Do NOT switch to the new item.** Stay on whatever was in flight before the `/enq`. The user explicitly chose `/enq` over a direct request because they wanted you to keep going on the current task. Switching contexts would defeat the purpose. Only switch if the user explicitly says "now do that one" or similar.

## Queue file shape (if creating fresh)

```markdown
# Priority Queue — <date> (<short context note>)

Source: HANDOFF.md + ROADMAP.md + RESEARCH.md + recent commits.
North star: first paying Marcus customer.

## Up next (priority order)

1. **<title>** <body>

## Blocked on Russell (skip until unblocked)

_(items needing Russell's hands — API keys, hardware, decisions)_

## Working agreement (per CLAUDE.md)

- Cap in-flight epics at 3.
- Critical-path beat on every substantive reply.
- If item 1 hits a hard blocker, skip and pick next.
- Doc cascade at PHASE-end, not commit-end.
- Verify-real-remote hook fires before every git push/commit/cherry-pick.
- Don't push to GitHub until end of a major phase.
```

## Examples

User types: `/enq fix the dropdown in Studio that doesn't change modes`
You append:
```
N. **Fix Studio's mode-switcher dropdown.** Picking a different mode in the toolbar dropdown doesn't actually switch modes — the change handler isn't firing or the state isn't persisting. Reproducer: open Studio, click the dropdown, pick the other mode, nothing happens. ~30 min debug + fix.
```

User types: `/enq when writing templates always use /* */ for multi-line comments`
You append:
```
N. **Templates use /* */ for multi-line comments — fix all templates + Meph prompt + AI instructions.** Single-comment-style guideline that should propagate everywhere. Sweep apps/, studio/system-prompt.md, AI-INSTRUCTIONS.md, and any cookbook.md examples to replace ### blocks with /* */ format.
```

## Style rules

- **Plain English in the title and body** — same rule as Russell-facing chat. No "endpoint" / "stream" / "async" / function names unless Russell needs them to find a file.
- **One concrete next action.** If the item is vague, sharpen it: "look at X, decide Y, ship Z."
- **Tie to launch when relevant.** "Why for launch / Marcus" is optional but adds context the next iteration needs.
- **Don't truncate Russell's intent.** If he says "fix all templates," don't compress to "fix templates." Keep the scope explicit.
