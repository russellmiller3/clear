---
name: bigpicture
description: Narrate what was built in this session and why it matters. Step back from the diff, explain significance in plain English, connect to where Clear is going. Trigger when the user says "/bigpicture", "/bp", "narrate", "what did we do", "give me the big picture", "explain why this matters", "what's the story", "summarize the session", or asks to step back and see the forest. Also trigger proactively at the end of long sessions or after a logical chunk of work completes (a feature shipped, a bug class fixed, a refactor finished). NOT a changelog. NOT a handoff. Different from /handoff (which preserves context for the next session) — bp is for the human to understand WHY, not for the next session to know WHERE.
allowed-tools: Bash, Read
---

# Big Picture — Narrate What Was Built and Why

The Science Documentary Rule (CLAUDE.md) says: narrate as you go, explain
*significance* not *changelog*. This skill is the recap version — at the end
of a session or chunk of work, step back and tell the story.

Russell is busy. He needs the why in 60 seconds of reading, not 600.

## When to invoke

- User asks "/bigpicture" or "/bp"
- User says "narrate", "what did we do", "what's the story", "give me the big picture", "explain why this matters", "summarize the session"
- Proactively at the END of a long session — after a feature ships, after a bug class is fixed, after a refactor lands. Don't wait to be asked.
- After every commit chain of 3+ related commits

## When NOT to invoke

- Mid-task. Bigpicture is for inflection points, not running commentary (the Science Documentary Rule already covers running commentary).
- For a single one-line bug fix. Save it for meaningful chunks.
- When the user just asked "what's next?" — that's a different question (use open-claw style suggestions, not retrospective narrative).
- Confused with /handoff: handoff is *for the next session* (preserves context, lists pending tasks, gives a resume prompt). Bigpicture is *for Russell now* (helps him understand what he just shipped and feel forward momentum).

## How to write it

### Voice

- Russell-style: blunt, terse, vivid metaphors, curse for effect when it lands
- No corporate BS, no "we successfully delivered"
- Strong opinions backed by facts
- Short paragraphs, not bullets (bullets feel like a status report)
- Historical or product analogies when they sharpen the point ("this is the same loop Cursor doesn't have")

### Structure

1. **The lede** — one paragraph: what shipped, what it unlocks, in one sentence each. The hook.
2. **The arc** — 2–4 short paragraphs grouped by THEME, not by commit. "We made the AI not-blind." "We turned every test failure into a fix instruction." Not "we changed compiler.js, then ide.html, then server.js."
3. **Why it matters** — connect to the product/business/competitive arc. Where does this fit in the Clear story? What does it enable next? What can you now demo that you couldn't before?
4. **What's next** — open-claw. 3–5 concrete next moves in priority order. Make it easy for Russell to pick the next thing without thinking.

### What to look at

- `git log --oneline origin/main..HEAD` if there's anything unpushed
- `git log --oneline --since="<session start>" main` if everything's pushed
- `git diff main~N --stat` to see scale
- Commit messages tell you what; figure out the WHY by reading the diffs of the most interesting commits

### What NOT to write

- Don't list commits one-by-one. That's a changelog. Group by theme.
- Don't list every file changed. Russell can `git log` himself if he wants that.
- Don't end with "let me know if you want me to do X." End with concrete numbered moves.
- Don't gush ("amazing work today!"). Just the facts and the meaning.
- Don't repeat what was just said in chat. The user remembers the immediate context — bigpicture is the zoomed-out view they DON'T have.

## Format template

```
## What shipped

One paragraph. The lede.

## The arc

**Theme 1 name.** 2–3 sentences explaining what changed and why it matters.

**Theme 2 name.** Same shape.

**Theme 3 name.** Same shape.

## Why this matters

How this fits the bigger picture. What it unlocks. Concrete: what can you
now show a customer / pilot / VC that you couldn't before?

## What's next

1. **Most important next move** — one line, why
2. **Second move** — one line, why
3. **Third move** — one line, why
4. **(Optional) follow-ups** — minor stuff, queued
```

## Example invocation

User: "/bp"

You:
1. `git log --oneline -20` to see recent activity
2. Pick the natural cutoff (start of session, last `/bp`, last ship)
3. Read commit messages, skim diffs of the 3–5 most interesting ones
4. Write per the template above
5. Don't ask "want me to do anything else?" — just stop after What's next

## Why this skill exists

Russell has Mito. Cognitive load is the enemy. After a 3-hour session full of
diffs and tool calls and edge cases, he can't always step back and feel
forward momentum on his own. This skill does it for him — distills the
session into a story he can actually feel good about, then queues the next
thing so he doesn't have to think about what to do next.

It's also the thing he'll send to a pilot / investor / cofounder when they
ask "what'd you ship this week?" Make it copy-pastable.
