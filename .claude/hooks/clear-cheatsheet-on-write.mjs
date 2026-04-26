#!/usr/bin/env node
// .claude/hooks/clear-cheatsheet-on-write.mjs
//
// PreToolUse hook on Write/Edit when the target is a `.clear` file. Pulls
// the highest-friction sections from SYNTAX.md and AI-INSTRUCTIONS.md and
// injects them as additionalContext, so canonical forms are FRESH in
// Claude's context at the exact moment of writing — regardless of whether
// the docs were read 5 hours ago or never.
//
// Why this exists: the project rule "Read AI-INSTRUCTIONS.md AND SYNTAX.md
// before writing a .clear file" exists, but discipline drifts after hours
// of plan-reading and intermediate work. Even a "force the read" hook
// only helps until working memory of canonical forms decays. Inject-at-
// the-bite-point makes the canonical forms reappear in front of the model
// every time it's about to type Clear, no memory state required.
//
// Why a curated subset instead of the whole files: SYNTAX.md is ~2000
// lines, AI-INSTRUCTIONS.md is ~1000. Injecting both on every .clear
// edit is wasteful. The sections selected here are the ones whose
// absence shows up in the friction data — Common Mistakes, the
// tokenizer-keyword traps, the receiving-data conventions, and the
// canonical retrieval verbs.
//
// Hook input (stdin JSON):
//   {
//     "tool_name": "Write" | "Edit",
//     "tool_input": { "file_path": "...", ... },
//     ...
//   }
//
// Hook output:
//   - file_path doesn't end in .clear → exit 0 silently
//   - Reference docs missing → exit 0 silently (don't block)
//   - Otherwise → emit additionalContext with the cheat sheet
//
// Note: this hook never BLOCKS. It only adds context. The author can
// still write whatever they want — but the canonical forms will be in
// front of them when they do.

import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// Sections to extract, in inject order. Picked from the friction data —
// each one's absence shows up as repeated Meph errors.
const SECTIONS_TO_EXTRACT = [
  { file: 'AI-INSTRUCTIONS.md', heading: 'Common Mistakes (read this before writing Clear)', maxLines: 100 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'Variable Names the Tokenizer Mistakes for Keywords', maxLines: 30 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'Auth Guards on Mutations (MANDATORY — top source of compile errors)', maxLines: 60 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'URL Path Parameters — `this X`, Not Bare `X`', maxLines: 40 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'Retrieval Verbs — `get all`, `look up`, NOT `find`', maxLines: 30 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'Inline Records for `send back` (Session 38)', maxLines: 50 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'No Self-Assignment — Intermediates Need Different Names', maxLines: 40 },
  { file: 'AI-INSTRUCTIONS.md', heading: 'Assignment Convention', maxLines: 40 },
  { file: 'SYNTAX.md', heading: 'Values & Variables', maxLines: 30 },
  { file: 'SYNTAX.md', heading: 'TBD Placeholders (Lean Lesson 1)', maxLines: 50 },
];

export function isClearFile(filePath) {
  if (typeof filePath !== 'string') return false;
  return filePath.endsWith('.clear');
}

export function extractSection(text, heading, maxLines) {
  if (typeof text !== 'string' || typeof heading !== 'string') return '';
  const lines = text.split('\n');
  const startMarker = '## ' + heading;
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === startMarker || lines[i].startsWith(startMarker)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ') || lines[i].startsWith('# ')) {
      endIdx = i;
      break;
    }
  }
  const sliceEnd = Math.min(endIdx, startIdx + maxLines);
  return lines.slice(startIdx, sliceEnd).join('\n');
}

export function buildCheatsheet() {
  const docCache = new Map();
  const parts = [];
  parts.push('# Clear cheat-sheet (injected at .clear-write time)');
  parts.push('');
  parts.push('You are about to Write or Edit a `.clear` file. Below are the highest-friction canonical forms from `SYNTAX.md` and `AI-INSTRUCTIONS.md`, freshly extracted. These forms account for the most common compile errors in the Factor DB. Cross-check your edit against them before writing.');
  parts.push('');

  for (const spec of SECTIONS_TO_EXTRACT) {
    const fp = join(REPO_ROOT, spec.file);
    if (!docCache.has(fp)) {
      try {
        docCache.set(fp, readFileSync(fp, 'utf8'));
      } catch {
        docCache.set(fp, '');
      }
    }
    const text = docCache.get(fp);
    const section = extractSection(text, spec.heading, spec.maxLines);
    if (section.length > 0) {
      parts.push(`### From ${spec.file}`);
      parts.push('');
      parts.push(section);
      parts.push('');
    }
  }

  parts.push('---');
  parts.push('');
  parts.push('**Self-check before saving:** does this `.clear` line use `=` for numbers and `is` for strings/booleans? Are receiving-data names spelled out (`when user sends post_data to ...`) instead of bare `body` / `data`? Are URL path params dereferenced as `this X` (e.g. `this id`) and not bare `X`? Auth guards on every mutation? No `x is x` self-assignment? If yes to all → write. If unsure → re-read the section above.');

  return parts.join('\n');
}

function main() {
  let raw;
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data;
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const toolName = data?.tool_name;
  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  const filePath = data?.tool_input?.file_path || '';
  if (!isClearFile(filePath)) process.exit(0);

  const cheatsheet = buildCheatsheet();
  if (!cheatsheet) process.exit(0);

  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: cheatsheet,
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
