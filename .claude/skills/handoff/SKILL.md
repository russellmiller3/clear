---
name: handoff
description: Create or update HANDOFF.md to pass context between sessions. Use when ending a session, switching tasks, or when the user says "handoff", "save context", "write a resume prompt", or "I'm done for now".
---

# Handoff — Session Context Transfer

**Purpose:** Write a `HANDOFF.md` file that gives the next session everything it needs to continue work without re-reading the entire codebase.

## When to trigger
- User says "handoff", "save context", "write resume prompt", "I'm done for now"
- End of a long session with uncommitted design decisions or in-progress work
- Switching between features mid-stream

## What to write

Create or overwrite `HANDOFF.md` in the project root with this structure:

```markdown
# Handoff — [Date]

## 🎯 Next Session: [top-line goal in 10 words] (READ THIS FIRST)

[1-paragraph narrative: what journey the next session continues, why it matters,
what done looks like. NOT a changelog. Write it so someone skimming this single
block knows the mission.]

**[How many tracks tonight].** [State single-session-default explicitly if
applicable. The user's 10x-off time rule says "a week of work" = "one long
session." If I'm about to say "next session" or "this will take several days,"
stop — re-slice to fit one session.]

### Track 1 — [goal]
[Steps in order. File paths. Success criteria.]

### Track 2 — [goal]
[Steps in order. File paths. Success criteria.]

---

## Session rules in effect (summarized from ~/.claude/CLAUDE.md)

The next session MUST apply these — skim if not already internalized:

- **Big-picture framing on every narration.** Every chunk says what + why-for-session-goal + what-it-unlocks. Under 25 words. Reads like a nature doc, not a diff.
- **Phase-boundary big picture.** At the end of every phase/feature/logical chunk, fire `/bigpicture` or emit a 60-second narrative. Don't wait for Russell to ask.
- **Work in parallel by default.** Batch independent tool calls in one message. Never serialize reads/greps/tests that don't depend on each other.
- **Time calibration: 10x off.** If gut says "a week," that's one long session. Never scope in human-days.
- **Budget-first on API spend.** State hypothesis + cost cap before any API call. $0 is cheap; the Claude subscription via cc-agent is $0.
- **TDD red-first.** Test must fail before code is written.

---

## Current State
- **Branch:** [current branch name]
- **Last commit:** [hash + message]
- **Working tree:** [clean / dirty — list uncommitted files if dirty]

## What Was Done This Session
[2-4 bullet points summarizing completed work]

## What's In Progress
[Anything started but not finished — be specific about what's left]

## Key Decisions Made
[Design decisions, architecture choices, or user preferences that aren't in code yet]
[Include WHY, not just WHAT — the next session needs the reasoning]

## Known Issues / Bugs
[Anything broken, flaky, or needing investigation]

## Files to Read First
| File | Why |
|------|-----|
| [path] | [what context it provides] |

## Resume Prompt
> [Copy-paste-ready prompt. MUST include: (1) read HANDOFF.md, (2) track list
> with "all in one session" framing if applicable, (3) one-line reminder of
> the session rules above (big-picture narration + parallel + 10x-time +
> budget-first + TDD red-first), (4) current main commit hash.]
```

## Rules

1. **Be specific, not vague.** "Fix the bug" is useless. "Fix confusion matrix grid — `$derived.by` issue in ConfusionMatrix.svelte line 17" is useful.
2. **Include file paths.** The next session shouldn't have to search for things.
3. **Include the branch name.** Always.
4. **Capture user preferences.** If the user expressed opinions about design, naming, or approach during this session, note them.
5. **Note any env/config changes.** New env vars, new dependencies, new migrations that haven't been applied.
6. **The resume prompt should be self-contained.** Someone should be able to paste it into a fresh Claude session and get productive in under 30 seconds.

## MANDATORY context-capture sections (added after the 2026-04-25 visual-audit miss)

The handoff that misses one of these is the handoff that costs the next session a debugging hour. Every handoff MUST include all of these, even if some are short:

### 7. Tested-vs-Assumed
Two columns. Left: things I literally drove and saw work (with evidence — test output line counts, screenshot paths, curl responses). Right: things I claimed worked but only inferred from green tests / type-checks / "should work" reasoning. **The right column is where the next session looks for surprise bugs.**

### 8. Visual state (when ANY UI was touched)
For every UI surface modified or claimed-to-work this session, one line: "Looked at it: yes/no. Polish grade vs target: A/B/C/D/F. What looks broken." Take screenshots if the UI was touched and stash paths in this section. **No "demo ready" claim is valid without an A or B grade here.**

### 9. Gotchas found too late
Every gotcha that surfaced AFTER I claimed something worked. The point is the meta-pattern — what should I have tested earlier? Don't bury this in narrative; bullet-list it so the next session can scan and avoid the same misses.

### 10. User mood + decision tone
Quick read of the user's energy + how directive they were today. Examples:
- "Direct, calling-out tone — caught a quality miss. Wants tighter visual standard going forward."
- "Tired (typos, short messages by end). Take more initiative; ask less."
- "Excited about a specific direction — locked X over Y. Don't re-litigate."

This isn't gossip — it's calibration so the next session matches the right register.

### 11. What I'd do differently (one-liner self-critique)
The single biggest process miss this session, in plain English. Write it so future-me reads it and changes behavior. Not "I should improve" — concrete: "should have screenshotted before claiming demo-ready."

## After writing

Tell the user: "Handoff saved to `HANDOFF.md`. Start next session with: `Read HANDOFF.md and continue from where we left off.`"
