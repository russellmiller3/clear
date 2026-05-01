#!/usr/bin/env node
// .claude/hooks/require-plan-read.mjs
//
// PreToolUse hook on the Agent tool — blocks any background-worker spawn
// whose brief references a plan file that Claude hasn't Read in this
// session. Forces "you actually read the plan" instead of "you remember
// what it said."
//
// Why this exists: 2026-04-26, the `live:` keyword shipped on Path B of
// the decidable-core plan when the plan literally said "do Path A first,
// measure, only escalate to Path B if data says we need it." Claude's
// brief leaked working-memory bias — it named two Path B options as
// "probably either" without ever reading the plan that session. The
// worker followed the brief, shipped Path B work, and Russell had to
// catch the mistake on review.
//
// The fix: don't trust working memory. Don't rely on regex over plan
// prose ("Path A first") — that's brittle and plan-specific. Just
// require Read was called on every referenced plan path THIS SESSION.
// Universal across plan formats. Hard block.
//
// Hook input (stdin JSON):
//   {
//     "tool_name": "Agent",
//     "tool_input": { "prompt": "...", ... },
//     "transcript_path": "<session JSONL path>",
//     ...
//   }
//
// Hook output:
//   - Plan paths found AND all were read → exit 0 silently (allow)
//   - Plan paths found but some not read → JSON denying the call
//   - No plan paths found → exit 0 silently (allow)
//   - Malformed input / missing transcript → exit 0 silently (don't block)

import { readFileSync, existsSync } from 'fs';

const PLAN_PATH_PATTERN = /plans\/plan-[a-z0-9_-]+\.md/gi;

export function findPlanPaths(prompt) {
  if (typeof prompt !== 'string') return [];
  const matches = prompt.match(PLAN_PATH_PATTERN) || [];
  // Normalize forward slashes; dedupe
  return [...new Set(matches.map(m => m.replace(/\\/g, '/')))];
}

export function getSessionReadTargets(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try {
    const content = readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const reads = [];
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      // Walk into message.content[] for tool_use blocks
      const content = event?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === 'tool_use' && block?.name === 'Read') {
          const fp = block?.input?.file_path;
          if (typeof fp === 'string' && fp.length > 0) {
            reads.push(fp.replace(/\\/g, '/'));
          }
        }
      }
    }
    return reads;
  } catch {
    return [];
  }
}

export function findMissingReads(planPaths, readTargets) {
  return planPaths.filter(p => {
    return !readTargets.some(t => t.endsWith(p) || t.includes(p));
  });
}

export function buildBlockMessage(missing) {
  const list = missing.map(p => '  - ' + p).join('\n');
  return (
`Plan file(s) referenced in this Agent brief but never Read in the current session:
${list}

Read each plan in full BEFORE spawning the worker. A single Read call without offset covers the first 2000 lines, which is enough for almost every plan in this repo. After reading, your brief should also QUOTE the plan's "do this first" / "Path A first" / phase-order sentence verbatim — that proves you read the relevant part and didn't go from memory.

Why this hook exists: on 2026-04-26 the \`live:\` keyword shipped on Path B of plans/plan-decidable-core-04-24-2026.md, even though that plan explicitly said "do Path A first, measure, only escalate to Path B if data says we need it." The brief leaked working-memory bias instead of plan-grounded prescription. This hook makes that class of mistake impossible.

To proceed: invoke the Read tool on each plan above, then re-issue the Agent call.`
  );
}

function main() {
  let raw;
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }

  let data;
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  if (data?.tool_name !== 'Agent') process.exit(0);

  const prompt = data?.tool_input?.prompt || '';
  const planPaths = findPlanPaths(prompt);
  if (planPaths.length === 0) process.exit(0);

  const transcriptPath = data?.transcript_path || '';
  const readTargets = getSessionReadTargets(transcriptPath);
  const missing = findMissingReads(planPaths, readTargets);

  if (missing.length === 0) process.exit(0);

  const message = buildBlockMessage(missing);

  // Hard-block via permissionDecision: "deny" (modern Claude Code).
  // Also include additionalContext as a belt-and-suspenders fallback
  // so the message is loud even if the deny decision isn't honored.
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
      additionalContext: message,
    },
  };
  process.stdout.write(JSON.stringify(payload));
}

const invokedDirectly = (() => {
  try {
    const metaName = import.meta.url.split(/[\\/]/).pop() || '';
    const argvName = (process.argv[1] || '').split(/[\\/]/).pop() || '';
    return metaName === argvName;
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  main();
}
