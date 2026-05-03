#!/usr/bin/env node
// .claude/hooks/confirm-before-start.mjs
//
// SessionStart hook — confirm-before-start workflow. Tells Claude to read
// HANDOFF.md, summarize the top next move in 3-5 plain-English bullets, then
// STOP and wait for Russell to type "g" (one-letter green light) before doing
// any work. Replaces the auto-pilot opening with confirm-before-start as the
// default. Russell's full instruction (2026-05-03):
//
//   "actually just amke a hook that on new session you read handoff and hten
//    confirm the work before starting. all i should have to type is 'g'"
//
// Runtime: ~10ms. No gate — fires every session start.

import { existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let payload;
  try { payload = JSON.parse(input); } catch { payload = {}; }

  const cwd = payload.cwd || process.cwd();
  const handoffPath = pathJoin(cwd, 'HANDOFF.md');

  const message = existsSync(handoffPath)
    ? `CONFIRM-BEFORE-START WORKFLOW (Russell's preferred session opener — 2026-05-03)

This is the FIRST thing you do in this session. No exceptions.

  1. Read HANDOFF.md right now.
  2. Tell Russell, in 3-5 PLAIN-ENGLISH bullets, what the top next move is and the in-flight state. No code jargon. Say what the thing DOES, not what it's CALLED.
  3. STOP. Do not do any work yet. Do not start branches. Do not edit files.
  4. Wait for Russell to type "g" (one-letter green light) or another instruction.

When he types "g":
  - Execute the top "Next Moves" item from HANDOFF.md.
  - Ship as you go (commit + merge + push per the roadmap-driven priority queue rule).

When he types something else:
  - Follow that instead. The "g" is just the default green-light shorthand.

The whole point is to confirm priorities BEFORE acting. Russell wants the one-letter "g" to be all he has to type when the top move is right; if it's wrong, he'll redirect with a different instruction.`
    : `CONFIRM-BEFORE-START WORKFLOW: HANDOFF.md not found in this repo. Tell Russell the file is missing and ask whether to create one or proceed without it. Do not start work without confirmation.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: message,
    },
  }));
}

main().catch((err) => {
  process.stderr.write(`[confirm-before-start] ${err.message}\n`);
  process.exit(0);
});
