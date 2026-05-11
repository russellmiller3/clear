#!/usr/bin/env node
// PreToolUse hook for parser/tokenizer/validator edits.
//
// Purpose: if an edit appears to add a local English-word check to the
// language front end, force the agent to consider synonyms.js first.
// Clear vocabulary aliases belong in SYNONYM_TABLE / REVERSE_LOOKUP so the
// tokenizer, parser, docs, and future syntax repairs share one source.
//
// Override for true grammar structure:
//   synonym-table: structural exception
//
// Use that marker only when the wording is order-sensitive or contextual
// syntax that cannot be represented as a reusable synonym.

import { readFileSync } from 'fs';
import { basename } from 'path';
import { fileURLToPath } from 'url';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const GUARDED_FILES = new Set(['parser.js', 'tokenizer.js', 'validator.js']);
const STRUCTURAL_EXCEPTION = 'synonym-table: structural exception';

const SYNONYM_TABLE_REFERENCE =
  /\b(?:SYNONYM_TABLE|REVERSE_LOOKUP|MULTI_WORD_SYNONYMS|SYNONYM_VERSION|synonyms\.js)\b/;

const LOCAL_ENGLISH_CHECKS = [
  /\b(?:tok|token|next|current|lookahead)\.value\s*(?:===|!==)\s*['"`][a-z][a-z0-9 _-]{2,}['"`]/i,
  /\b(?:tok|token|next|current|lookahead)\.canonical\s*(?:===|!==)\s*['"`][a-z][a-z0-9 _-]{2,}['"`]/i,
  /\.value\.toLowerCase\(\)\s*(?:===|!==)\s*['"`][a-z][a-z0-9 _-]{2,}['"`]/i,
  /\brawValue\s*(?:===|!==)\s*['"`][a-z][a-z0-9 _-]{2,}['"`]/i,
  /\b(?:reserved|keyword|phrase|alias|synonym)[A-Za-z0-9_]*\s*=\s*['"`][a-z][a-z0-9 _-]{2,}['"`]/i,
];

function targetPathFromInput(toolInput = {}) {
  return toolInput.file_path || toolInput.path || '';
}

function isGuardedPath(filePath = '') {
  if (!filePath) return false;
  return GUARDED_FILES.has(basename(filePath.replace(/\\/g, '/')));
}

function candidateTextFromInput(toolInput = {}) {
  const parts = [];
  if (typeof toolInput.new_string === 'string') parts.push(toolInput.new_string);
  if (typeof toolInput.content === 'string') parts.push(toolInput.content);

  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (typeof edit?.new_string === 'string') parts.push(edit.new_string);
      if (typeof edit?.content === 'string') parts.push(edit.content);
    }
  }

  return parts.join('\n');
}

export function looksLikeParserLocalEnglishCheck(text = '') {
  if (!text) return false;
  return LOCAL_ENGLISH_CHECKS.some((pattern) => pattern.test(text));
}

export function decisionForToolUse({ toolName = '', toolInput = {} } = {}) {
  if (!EDIT_TOOLS.has(toolName)) {
    return { allow: true };
  }

  const filePath = targetPathFromInput(toolInput);
  if (!isGuardedPath(filePath)) {
    return { allow: true };
  }

  const text = candidateTextFromInput(toolInput);
  if (!text || text.includes(STRUCTURAL_EXCEPTION)) {
    return { allow: true };
  }

  if (SYNONYM_TABLE_REFERENCE.test(text)) {
    return { allow: true };
  }

  if (!looksLikeParserLocalEnglishCheck(text)) {
    return { allow: true };
  }

  return {
    allow: false,
    reason: buildBlockMessage(filePath),
  };
}

function buildBlockMessage(filePath) {
  return `Synonym-table guard: this ${filePath} edit looks like a parser-local English-word check.

Use the shared synonym table first:
  - add reusable aliases to synonyms.js SYNONYM_TABLE
  - add multi-word aliases to MULTI_WORD_SYNONYMS when needed
  - derive parser-specific phrase sets from SYNONYM_TABLE or REVERSE_LOOKUP

Do not hide vocabulary in one-off checks like tok.value === 'first' or tok.canonical === 'first'.

If this is real grammar structure, add this exact comment near the edit and explain why:
  synonym-table: structural exception`;
}

function deny(message) {
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

  const decision = decisionForToolUse({
    toolName: data?.tool_name || '',
    toolInput: data?.tool_input || {},
  });

  if (!decision.allow) {
    deny(decision.reason);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
