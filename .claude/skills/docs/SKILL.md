---
name: docs
description: Update all documentation files to match current compiler state. Ensures intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, and ROADMAP.md all reflect what's actually implemented.
user_invocable: true
---

# Update Documentation

**Announce:** "Updating all docs to match current compiler state."

## What This Skill Does

Ensures every feature in the compiler is documented across ALL required files. The documentation rule is: **if a feature exists in the compiler but not in the docs, it doesn't exist.**

## Step 1: Scan for undocumented features

Read these files to understand what's implemented:
- `parser.js` — scan the NodeType enum and CANONICAL_DISPATCH for all node types
- `compiler.js` — scan `compileNode()` cases and `generateE2ETests()` for all compilation targets
- `synonyms.js` — scan for all synonym entries

Then read each doc file and identify gaps:

### Files to check (in order):

1. **`intent.md`** — authoritative spec. Every node type needs a row. Every syntax form needs an example.
2. **`SYNTAX.md`** — complete syntax reference. Every feature needs syntax + example.
3. **`AI-INSTRUCTIONS.md`** — conventions for AI writing Clear. When to use each feature, gotchas.
4. **`USER-GUIDE.md`** — tutorial-style coverage. Worked examples for every major feature.
5. **`ROADMAP.md`** — completion status. New features marked as done.
6. **`PHILOSOPHY.md`** — design rules. Update if a new principle is established (e.g., compiler-generated tests, security by default).

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
