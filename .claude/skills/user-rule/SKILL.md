---
name: user-rule
description: Add a rule to the user-level CLAUDE.md (applies across all projects). Use when the user says "/user-rule [text]" or "add a personal rule" or "make this a global rule". Appends to ~/.claude/CLAUDE.md.
allowed-tools: Read, Edit
---

# Add User Rule

The user wants to add a personal rule to their user-level CLAUDE.md at `~/.claude/CLAUDE.md`. These rules apply across ALL projects, not just the current one.

## What to do

1. Read the current CLAUDE.md at `~/.claude/CLAUDE.md` (or the platform equivalent)
2. Generate a short, clear `## Section Title` from the rule text
3. Write the rule matching the existing style — Russell's CLAUDE.md is informal, direct, uses bullet points
4. Append it as a new `##` section
5. Confirm to the user what was added and remind them it applies globally

## Formatting

- Title: `## Rule Name` — short noun phrase, 2-5 words
- Body: Match the style of the existing file. Russell's personal CLAUDE.md uses bullet points and informal language.
- Keep it concise — these are behavioral instructions, not documentation.

## Arguments

Everything after `/user-rule` is the rule text. Don't ask clarifying questions.

## Example

User: `/user-rule never ask me to check something manually, always verify it yourself with tools`

Appends:
```markdown
## Verify, Don't Ask
- Never ask Russell to manually check, test, or verify something. Use tools to verify it yourself.
- If you can't verify programmatically, that's a gap in your tooling — flag it, don't punt to the human.
```
