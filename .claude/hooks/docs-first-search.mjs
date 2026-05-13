#!/usr/bin/env node
// PreToolUse hook on Bash.
//
// Broad codebase search must not be the first move for Clear repo navigation.
// FAQ.md and FEATURES.md are the map. If they do not answer the question,
// search code next and then patch the docs so the next agent pays less tax.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const STAMP_PATH = join('.claude', 'state', 'docs-first-search.json');

function normalizeCommand(command = '') {
  return String(command || '').trim().replace(/\s+/g, ' ');
}

function mentionsFaqAndFeatures(command = '') {
  const normalized = command.replace(/\\/g, '/').toLowerCase();
  return /\bfaq\.md\b/.test(normalized) && /\bfeatures\.md\b/.test(normalized);
}

export function isDocsFirstCommand(command = '') {
  const normalized = normalizeCommand(command);
  if (!mentionsFaqAndFeatures(normalized)) return false;
  return /\b(select-string|get-content|type|cat|rg|grep|git grep|findstr)\b/i.test(normalized);
}

export function isBroadCodeSearchCommand(command = '') {
  const normalized = normalizeCommand(command);
  if (!normalized) return false;
  if (isDocsFirstCommand(normalized)) return false;

  const broadSearchPatterns = [
    /\brg(?:\.exe)?\b/i,
    /\bgrep\b/i,
    /\bgit grep\b/i,
    /\bfindstr\b/i,
    /\bselect-string\b/i,
    /\bget-childitem\b[\s\S]*\b-recurse\b/i,
  ];

  if (!broadSearchPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  // A targeted search inside the map files is allowed and counts as the
  // required first move only when both files are present.
  if (/\b(faq\.md|features\.md)\b/i.test(normalized) && !mentionsFaqAndFeatures(normalized)) {
    return false;
  }

  return true;
}

function readStamp(repoRoot) {
  const fullPath = join(repoRoot, STAMP_PATH);
  if (!existsSync(fullPath)) return null;
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeStamp(repoRoot, command, now = Date.now()) {
  const fullPath = join(repoRoot, STAMP_PATH);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, JSON.stringify({ checkedAt: now, command }, null, 2));
}

function hasFreshStamp(stamp, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  if (!stamp || typeof stamp.checkedAt !== 'number') return false;
  return now - stamp.checkedAt >= 0 && now - stamp.checkedAt <= ttlMs;
}

export function decisionForToolUse({
  toolName = '',
  command = '',
  stamp = null,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (toolName !== 'Bash') {
    return { allow: true };
  }

  if (isDocsFirstCommand(command)) {
    return { allow: true, markDocsFirst: true };
  }

  if (!isBroadCodeSearchCommand(command)) {
    return { allow: true };
  }

  if (hasFreshStamp(stamp, now, ttlMs)) {
    return { allow: true };
  }

  return {
    allow: false,
    reason:
      'Docs-first search guard: before broad code search, search FAQ.md and FEATURES.md together. ' +
      'Example: Select-String -Path FAQ.md,FEATURES.md -Pattern "<thing>" -Context 2,4. ' +
      'If the docs miss the answer, update them after you find it.',
  };
}

function block(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
      additionalContext: message,
    },
  }));
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }

  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const repoRoot = process.cwd();
  const toolName = data?.tool_name || '';
  const command = data?.tool_input?.command || '';
  const stamp = readStamp(repoRoot);
  const decision = decisionForToolUse({ toolName, command, stamp });

  if (decision.markDocsFirst) {
    writeStamp(repoRoot, command);
  }

  if (!decision.allow) {
    block(decision.reason);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
