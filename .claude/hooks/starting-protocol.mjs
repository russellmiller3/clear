#!/usr/bin/env node
// .claude/hooks/starting-protocol.mjs
//
// SessionStart hook — starting protocol. Tells Claude to read HANDOFF.md,
// scan learnings.md for gotchas relevant to the top next move, summarize
// in 3-5 plain-English bullets (top move + flagged gotchas), then STOP
// and wait for Russell to type "g" (one-letter green light) before doing
// any work. Replaces the auto-pilot opening with confirm-before-start as
// the default, with a learnings-gotcha pass baked in.
//
// Russell's instruction (2026-05-03):
//   "make a hook that on new session you read handoff and then confirm
//    the work before starting. all i should have to type is 'g'"
//   "add to that hook to do a brief review of learnings.md to see if
//    there are any relevant gotchas before starting. rename that hook
//    to 'starting-protocol'"
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
  const learningsPath = pathJoin(cwd, 'learnings.md');

  const handoffExists = existsSync(handoffPath);
  const learningsExists = existsSync(learningsPath);

  if (!handoffExists) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          'STARTING PROTOCOL: HANDOFF.md not found in this repo. Tell Russell the file is missing and ask whether to create one or proceed without it. Do not start work without confirmation.',
      },
    }));
    return;
  }

  const message = `STARTING PROTOCOL (Russell's preferred session opener — 2026-05-03)

This is the FIRST thing you do in this session. No exceptions.

  1. Read HANDOFF.md right now.
  2. ${learningsExists
        ? 'Scan learnings.md for any past bug stories or gotchas RELEVANT to the top next move from HANDOFF.md. Use the table of contents — don\'t read the whole file. Match by subsystem (compiler, parser, validator, runtime, audit pipeline, prover, Studio, etc.) or by keyword (the tech the next move touches).'
        : 'No learnings.md in this repo — skip the gotcha-scan step.'}
  3. Tell Russell, in 3-5 PLAIN-ENGLISH bullets:
       • Top next move from HANDOFF (what it does, in plain English — no code jargon).
       • In-flight state (any branches not yet merged).
       • Any RELEVANT learnings.md gotchas you found that bear on the top next move (one bullet per gotcha, plain English). If none, say "no relevant gotchas."
  4. STOP. Do not do any work yet. Do not start branches. Do not edit files.
  5. Wait for Russell to type "g" (one-letter green light) or another instruction.

When he types "g":
  - Execute the top "Next Moves" item from HANDOFF.md.
  - Apply any gotchas you flagged so we don't repeat past mistakes.
  - Ship as you go (commit + merge + push per the roadmap-driven priority queue rule).

When he types something else:
  - Follow that instead. The "g" is just the default green-light shorthand.

The whole point is to confirm priorities BEFORE acting AND to surface relevant past pain so the new work doesn't re-discover it. Russell wants the one-letter "g" to be all he has to type when the top move + gotchas look right; if it's wrong, he'll redirect with a different instruction.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: message,
    },
  }));
}

main().catch((err) => {
  process.stderr.write(`[starting-protocol] ${err.message}\n`);
  process.exit(0);
});
