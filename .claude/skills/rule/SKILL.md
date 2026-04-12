---
name: rule
description: Add a rule to the project-level CLAUDE.md. Use when the user says "/rule [text]" or "add a project rule" or "make this a rule". Appends a new mandatory rule section to the project's CLAUDE.md file.
allowed-tools: Read, Edit
---

# Add Project Rule

The user wants to add a rule to the project-level CLAUDE.md.

## What to do

1. Read the current CLAUDE.md at the project root
2. Generate a short, clear `## Section Title (MANDATORY)` from the rule text
3. Write the rule in the same style as existing rules in the file — terse, imperative, no fluff
4. Append it as a new `##` section at the end of the file (before any final sections like "Known Issues" if present)
5. Confirm to the user what was added

## Formatting

- Title: `## Rule Name (MANDATORY)` — short noun phrase, 2-5 words
- Body: 1-3 sentences. Imperative voice. Say what to do, not what not to do (unless the rule IS about what not to do).
- If the rule has a "why", include it in one sentence after the rule.
- Match the tone of existing rules in the file — direct, no corporate speak.

## Arguments

Everything after `/rule` is the rule text. Parse it as-is. Don't ask clarifying questions — just write the best rule you can from what was given.

## Example

User: `/rule always run node --check on compiled output before declaring success`

Appends:
```markdown
## Syntax-Check Compiled Output (MANDATORY)
Always run `node --check <compiled-output>.js` on the compiled JavaScript before declaring an app compiles successfully. Compiler tests passing does not mean the output is valid JS — syntax errors in generated code (unbalanced parens, missing braces) only show up with a direct syntax check.
```
