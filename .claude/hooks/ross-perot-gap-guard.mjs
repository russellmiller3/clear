#!/usr/bin/env node
// Stop hook: block "I found the gap, next step is..." endings when the gap
// sounds fixable in the current repo. Russell's Ross Perot rule says the
// next obvious safe step should be executed, not left as a chat suggestion.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GAP_PATTERNS = [
  /\bthe gap\b/i,
  /\bmissing\b/i,
  /\bnot yet\b/i,
  /\bdoes not yet\b/i,
  /\bdoesn't yet\b/i,
  /\bnot 100% universal\b/i,
  /\bfollow[- ]?up\b/i,
  /\bnext real upgrade\b/i,
  /\bnext move\b/i,
];

const PUNT_PATTERNS = [
  /\bI would\b/i,
  /\bI'?d\b/i,
  /\bshould\b/i,
  /\bneed(s)? to\b/i,
  /\bnext (real )?(upgrade|move|step)\b/i,
  /\bcan wait\b/i,
  /\bnot claim\b/i,
];

const ACTIONABLE_REPO_PATTERNS = [
  /\bapi\b/i,
  /\bbutton(s)?\b/i,
  /\bcompiler\b/i,
  /\bconfig\b/i,
  /\bcoverage\b/i,
  /\bdata\b/i,
  /\bdocs?\b/i,
  /\benforcement\b/i,
  /\bguard\b/i,
  /\bhook\b/i,
  /\bimplementation\b/i,
  /\bparser\b/i,
  /\bplaywright\b/i,
  /\brule\b/i,
  /\bscript\b/i,
  /\bstate\b/i,
  /\bsyntax\b/i,
  /\btemplate(s)?\b/i,
  /\btest(s|ing)?\b/i,
  /\bui\b/i,
  /\bvalidator\b/i,
  /\bwire\b/i,
];

const READ_ONLY_PATTERNS = [
  /\bread[- ]only\b/i,
  /\bnot making changes\b/i,
  /\byou asked me not to (make changes|edit|write)\b/i,
  /\byou asked for analysis\b/i,
];

const SHIPPED_PATTERNS = [
  /\bI (added|built|fixed|implemented|wired|changed|updated|committed|pushed|merged|tested|verified)\b/i,
  /\b(shipped|landed|green|passed|passing)\b/i,
  /\btests?\b.*\b(passed|green)\b/i,
  /\bworktree\b.*\bclean\b/i,
];

export function findRossPerotViolations(message = '') {
  const text = String(message || '');
  if (!text.trim()) return [];

  const isExplicitlyReadOnly = READ_ONLY_PATTERNS.some((pattern) => pattern.test(text));
  if (isExplicitlyReadOnly) return [];

  const hasGap = GAP_PATTERNS.some((pattern) => pattern.test(text));
  const hasPunt = PUNT_PATTERNS.some((pattern) => pattern.test(text));
  const hasActionableRepoSignal = ACTIONABLE_REPO_PATTERNS.some((pattern) => pattern.test(text));
  const hasShippedEvidence = SHIPPED_PATTERNS.some((pattern) => pattern.test(text));

  if (!hasGap || !hasPunt || !hasActionableRepoSignal || hasShippedEvidence) return [];

  return [{
    code: 'FIXABLE_GAP_PUNT',
    message: 'Answer identifies a likely-fixable gap and stops with a suggestion instead of executing the obvious next step.',
  }];
}

export function buildBlockReason(violations) {
  const list = violations.map((v) => `- ${v.code}: ${v.message}`).join('\n');
  return `Ross Perot gap guard blocked this stop.

${list}

Do not end the turn by saying "the gap is X" and "the next move is Y" when Y is a safe repo change.

Continue now:
1. Create or stay on a feature/fix branch.
2. Implement the obvious missing enforcement or test.
3. Run the focused tests.
4. Commit/push if the work is complete.
5. Only then summarize.

If the user explicitly asked for read-only analysis, say that clearly in the next answer and do not claim the work is complete.`;
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }

  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  if (input.stop_hook_active) process.exit(0);

  const violations = findRossPerotViolations(input.last_assistant_message || '');
  if (violations.length === 0) process.exit(0);

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: buildBlockReason(violations),
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
