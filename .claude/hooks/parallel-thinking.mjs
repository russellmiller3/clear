#!/usr/bin/env node
// .claude/hooks/parallel-thinking.mjs
//
// UserPromptSubmit hook — fires when Russell submits a prompt. Injects
// a "think parallel first" reminder into Claude's context BEFORE Claude
// plans the response.
//
// Why this exists: the existing "Work In Parallel By Default" rule in
// the user CLAUDE.md was insufficient — Claude forgets it mid-session
// and reverts to sequential edits + serialized tool calls. Session 46
// (2026-04-25) is when Russell explicitly noticed and asked for a
// structural backstop. This hook makes parallelism the FIRST thought
// at the moment of planning, not an afterthought after the wall-clock
// has already burned.
//
// The cost of "could have been parallel but wasn't" is wasted
// Russell-wall-clock — a 3x failure compounds across sessions.
// The cost of firing this reminder on every prompt is one tiny
// stdout JSON write. Asymmetric trade in favor of the reminder.
//
// Hook event: UserPromptSubmit
// Hook input (stdin JSON):
//   { user_prompt, prompt_id, session_id, ... }
// Hook output (stdout JSON):
//   {
//     "hookSpecificOutput": {
//       "hookEventName": "UserPromptSubmit",
//       "additionalContext": "<reminder>"
//     }
//   }
//
// Malformed input → silent exit 0 (don't block prompt submission).

import { readFileSync } from 'fs';

const REMINDER =
`Before responding: think parallel FIRST, narrate everything you do, plain English only.

═══ PARALLEL-FIRST DECISION TREE ═══
1. **Is this multi-step?** If yes, list the subtasks before doing anything.
2. **For each subtask: "needs this conversation's context, or runs cold?"**
   - Needs context → goes in-conversation (you do it).
   - Runs cold → background agent (run_in_background:true). Independent reads/research too.
3. **The N-1 pattern.** N tasks → launch (N-1) agents in ONE message → work on the Nth in-conversation. The Nth is the one needing user-visible iteration (UI polish, GAN loops, copy review).
4. **Independent reads/greps/bashes → ONE tool message, multiple tool-use blocks.** Don't serialize what doesn't need ordering.
5. **Sequential is correct ONLY when the next step needs the previous result.** "I might need X later" is NOT a real dependency.

Self-check after every tool message: "could any of these calls have been in the SAME message?" If yes → serialization mistake. Fix the next message.

═══ NARRATE EVERYTHING ═══
Russell's view is just text + tool calls. Silent stretches = he loses the thread + loses energy reading wall-of-tool-calls.

- **Before launching agents:** state by NAME what each will produce ("agent 1 writes the CC-4 plan, agent 2 writes the Postgres plan, ...").
- **After every tool batch (max 3 tool calls):** 1-line status. Format: "X of Y done, moving to Z" or "agents 1+2 fired, working on 3 myself."
- **When background agents complete:** tell Russell what landed and whether quality looks ok.
- **Plain English only** — no code terms, no internal function names, no "applyShip"/"validateX" jargon. Say what the thing DOES, not what it's CALLED.
- **Three beats per narration:** what you're doing, why it matters for the session goal, what it unlocks next. Under 25 words total when possible.

═══ COMBINED COST ═══
"Could have been parallel but wasn't" = wasted Russell-wall-clock (a 3x failure compounds across sessions).
"Silent stretch of work" = Russell loses the thread + loses energy reading raw tool calls.
Both compound. Both have the same fix: explicit, parallel, narrated.`;

function main() {
	let input;
	try {
		input = readFileSync(0, 'utf8');
	} catch {
		process.exit(0);
	}

	try {
		JSON.parse(input || '{}');
	} catch {
		process.exit(0);
	}

	const payload = {
		hookSpecificOutput: {
			hookEventName: 'UserPromptSubmit',
			additionalContext: REMINDER,
		},
	};
	process.stdout.write(JSON.stringify(payload));
}

main();
