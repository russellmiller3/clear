---
name: docs
description: Update all documentation files to match current compiler state. Narrates what was built and why it matters, then ensures intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md, and PHILOSOPHY.md all reflect what's actually implemented.
user_invocable: true
---

# Update Documentation

**Announce:** "Updating all docs to match current compiler state."

## What This Skill Does

Two things:
1. **Narrate** — explain what was built this session and why it matters (Science Documentary Rule)
2. **Sync** — ensure every feature in the compiler is documented across ALL doc files

The documentation rule is: **if a feature exists in the compiler but not in the docs, it doesn't exist.**

## Step 0: Narrate what was built

Before touching any files, write a brief narrative (in chat, not in files) of:
- What was built this session (check `git log --oneline -15`)
- Why each piece matters for the product and the user
- What design decisions were made and why
- What's different now vs before this session

This is the Science Documentary Rule — explain significance, not just changelog. "The compiler now generates English-readable tests for every surface of every app" not "updated generateE2ETests function."

## Step 1: Scan for undocumented features

Read these files to understand what's implemented:
- `parser.js` — scan the NodeType enum and CANONICAL_DISPATCH for all node types
- `compiler.js` — scan `compileNode()` cases and `generateE2ETests()` for all compilation targets
- `synonyms.js` — scan for all synonym entries

Then read each doc file and identify gaps:

### Files to check (in order):

0. **`FAQ.md`** — system internals, architecture decisions, how-to answers. Update when new subsystems are added, ports change, or architectural decisions are made. This is the first place future sessions will look.
1. **`intent.md`** — authoritative spec. Every node type needs a row. Every syntax form needs an example.
2. **`SYNTAX.md`** — complete syntax reference. Every feature needs syntax + example.
3. **`AI-INSTRUCTIONS.md`** — conventions for AI writing Clear. When to use each feature, gotchas.
4. **`USER-GUIDE.md`** — tutorial-style coverage. Worked examples for every major feature.
5. **`ROADMAP.md`** — completion status. New features marked as done. Stats current.
6. **`PHILOSOPHY.md`** — design rules. Update if a new principle is established.
7. **`learnings.md`** — engineering lessons. Add if new gotchas or patterns discovered.
8. **`playground/system-prompt.md`** — **Meph's live system prompt in Studio.** This is what actually ships to end users — if a new feature or syntax isn't here, Meph won't know about it and users will get stale guidance. Every new syntax, every behavior change, every new input type, every new directive needs a mention here with a canonical example.

> Note: `.claude/skills/write-clear/SKILL.md` used to be in this list but was removed (Session 38). `AI-INSTRUCTIONS.md` already covers conventions for Claude; `playground/system-prompt.md` is what actually ships to Meph. The write-clear skill is redundant surface to maintain.

## Step 2: Update each file

For each gap found:
- Add the missing feature to the appropriate section
- Include syntax example
- Include what it compiles to (for intent.md)
- Match the existing style/format of each doc file

## Step 3: Verify

After updating, verify:
- [ ] No feature in the compiler lacks a doc entry
- [ ] No doc entry references a feature that doesn't exist
- [ ] Examples in docs actually compile (spot-check 2-3)
- [ ] ROADMAP stats are current (test count, node type count)

## Step 4: Commit

Commit all doc changes with message: `docs: sync all documentation with current compiler state`

## Rules

- Do NOT change any code files — docs only
- Do NOT add features that don't exist yet
- Do NOT remove documentation for existing features
- Match the existing formatting style of each doc file
- When in doubt, read the parser/compiler to verify what actually exists
