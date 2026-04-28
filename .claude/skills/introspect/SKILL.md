---
name: introspect
description: Step back, re-read the load-bearing docs, and decide if current work is still on the critical path. Trigger when Russell says "/introspect", "step back", "are we on track", or "zoom out". Also fires automatically when the timer hook nudges after a long session. Different from /bigpicture (which narrates what shipped); introspect re-grounds against the goal and decides if the direction is still right.
---

# Introspect — step back, re-ground, decide if we're on track

Long sessions drift. Side quests creep in. The critical path gets blurry. This skill is the antidote: re-read the load-bearing docs, look at what actually shipped, and answer one question — are we still pointed at the first paying customer?

## When to fire

- Russell says `/introspect`, "step back", "are we on track", "zoom out"
- The timer hook injects a "long session detected" reminder
- Proactively after ~30 messages with no phase boundary
- Before opening yet another epic when 3+ are already in-flight

## What to do (in order)

1. **Re-read the load-bearing docs:**
   - `HANDOFF.md` — what was the goal entering the session?
   - `CLAUDE.md` (project) — current rules
   - `~/.claude/CLAUDE.md` (user) — voice, defaults
   - `ROADMAP.md` — what's planned next?
   - `PHILOSOPHY.md` — the 14 design rules

2. **Look at what's actually on disk:**
   - `git log --oneline -20`
   - `git status`

3. **Answer four questions honestly:**
   - **Goal:** what was the session goal? (Pull from HANDOFF.md.)
   - **Direction:** is current work advancing that goal, or side-questing?
   - **Sprawl:** how many epics are in-flight? More than 3-4 = stop, finish one.
   - **Lessons:** anything from the last hour worth recording in `learnings.md`?

4. **Decide:** stay the course, pivot, or pause to ship something before opening more.

## Output format

Short 60-second read. Plain English, no jargon.

```
**Where we started:** [session goal in one sentence].
**What shipped:** [bullets — what's on disk now].
**Where we are vs. where we said we'd be:** [honest read].
**In-flight epic count:** [N] — [list them].
**Critical path now:** [one move that advances launch].
**Recommendation:** [stay / pivot / finish-first]. [One reason.]
```

Three to five short paragraphs total. Bold the load-bearing sentences.

## What this is NOT

- Not a changelog (that's `/bigpicture`)
- Not a handoff (that's `/handoff`)
- Not for tiny chat exchanges
- Cap at 5-10 min — re-read, decide, return

## Why this skill exists

Russell has Mito + ADHD. Long sessions accumulate motion without obvious progress. Without periodic zoom-outs, momentum becomes a wall of tool calls and the critical path gets lost. This is the cheapest way to re-ground.
