#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionForToolUse, looksLikeParserLocalEnglishCheck } from './synonym-table-on-parser-edit.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, 'synonym-table-on-parser-edit.mjs');

let pass = 0;
let fail = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    pass++;
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    fail++;
  }
}

function expectAllowed(name, input) {
  it(name, () => assert.equal(decisionForToolUse(input).allow, true));
}

function expectBlocked(name, input) {
  it(name, () => {
    const decision = decisionForToolUse(input);
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /Synonym-table guard/);
  });
}

expectBlocked('blocks parser-local token value alias checks', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'parser.js',
    new_string: "if (tok.value === 'first') return parseFirstThing();",
  },
});

expectBlocked('blocks parser-local canonical alias checks', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'parser.js',
    new_string: "if (tok.canonical === 'first') return parseFirstThing();",
  },
});

expectAllowed('allows edits derived from the shared synonym table', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'parser.js',
    new_string: "const phrases = Object.entries(SYNONYM_TABLE).filter(([, canonical]) => canonical === 'first');",
  },
});

expectAllowed('allows explicit structural exceptions', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'parser.js',
    new_string: "// synonym-table: structural exception\nif (tok.value === 'where') return parseWhereClause();",
  },
});

expectAllowed('allows non-language files', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'README.md',
    new_string: "if (tok.value === 'first') return parseFirstThing();",
  },
});

expectAllowed('allows parser edits without local English checks', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'parser.js',
    new_string: 'ctx.body.push(node);',
  },
});

it('detects local English checks directly', () => {
  assert.equal(looksLikeParserLocalEnglishCheck("if (next.value === 'linked in')"), true);
  assert.equal(looksLikeParserLocalEnglishCheck('if (next.type === TokenType.STRING)'), false);
});

it('CLI blocks suspicious parser edits', () => {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'parser.js',
        new_string: "if (tok.value === 'first') return parseFirstThing();",
      },
    }),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
});

it('CLI stays silent on synonym-table edits', () => {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'parser.js',
        new_string: "const selectorAliases = Object.keys(SYNONYM_TABLE);",
      },
    }),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
