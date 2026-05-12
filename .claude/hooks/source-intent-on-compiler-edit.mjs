#!/usr/bin/env node
// PreToolUse hook for compiler/UI-output edits.
//
// Clear source is the product contract. If the source implies a missing app
// surface, the compiler must emit a helpful error. It must not invent the
// missing page, route, screen, form, or product behavior.
//
// This hook blocks the most common bad repair shape: adding default UI/routes
// in compiler.js for missing source intent. If an emit path is genuinely
// backed by an explicit AST node, include this marker near the edit:
//   source-intent: source-backed emit
//
// If the change is a diagnostic instead of generated behavior, include:
//   source-intent: diagnostic-first

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const GUARDED_FILES = new Set(['compiler.js', 'validator.js']);
const ALLOW_MARKERS = [
  'source-intent: source-backed emit',
  'source-intent: diagnostic-first',
];

const HIDDEN_INTENT_PATTERNS = [
  /auto[- ]?(?:inject|create|generate|supply)[\s\S]{0,100}(?:page|route|form|screen|surface|view|login|signup)/i,
  /(?:default|fallback|synthetic)[\s\S]{0,100}(?:page|route|form|screen|surface|view|login|signup)/i,
  /synthesi[sz]e[\s\S]{0,100}(?:page|route|form|screen|surface|view|login|signup)/i,
  /(?:missing|omitted|absent)[\s\S]{0,100}(?:page|route|form|screen|surface|view)[\s\S]{0,100}(?:create|inject|generate|supply|synthesi[sz]e)/i,
  /(?:pages|pageRoutes)\.add\(\s*['"`]\/(?!['"`])[^'"`]*['"`]\s*\)/,
  /app\.(?:get|post|put|patch|delete)\(\s*['"`]\/(?!['"`])[^'"`]*['"`]/,
  /data-clear-page-route=["']\/(?!["'])[^"']*["']/,
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

export function decisionForToolUse({ toolName = '', toolInput = {} } = {}) {
  if (!EDIT_TOOLS.has(toolName)) return { allow: true };

  const filePath = targetPathFromInput(toolInput);
  if (!isGuardedPath(filePath)) return { allow: true };

  const text = candidateTextFromInput(toolInput);
  if (!text) return { allow: true };
  if (ALLOW_MARKERS.some(marker => text.includes(marker))) return { allow: true };
  if (!HIDDEN_INTENT_PATTERNS.some(pattern => pattern.test(text))) return { allow: true };

  return {
    allow: false,
    reason:
      'Source-intent guard: this compiler/validator edit looks like it creates hidden app behavior ' +
      'for something the Clear source did not declare.\n\n' +
      'Clear source is the product contract. Missing intent should become a helpful compile error, ' +
      'not an invented page, route, form, or screen.\n\n' +
      'For example, if a nav item points to a missing page, emit an error like:\n' +
      "  nav item 'Approvals' points to '/approvals', but this app has no page at '/approvals'. Add:\n" +
      "  page 'Approvals' at '/approvals':\n" +
      "    heading 'Approvals'\n\n" +
      'If this emit is genuinely backed by an explicit source node, add this marker near the edit ' +
      'and explain the source line that owns it:\n' +
      '  source-intent: source-backed emit\n\n' +
      'If this is a diagnostic-first fix, add:\n' +
      '  source-intent: diagnostic-first',
  };
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

  if (!decision.allow) deny(decision.reason);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
