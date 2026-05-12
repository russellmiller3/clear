#!/usr/bin/env node
import assert from 'node:assert/strict';
import { decisionForToolUse } from './source-intent-on-compiler-edit.mjs';

function allowed(name, input) {
  const decision = decisionForToolUse(input);
  assert.equal(decision.allow, true, name);
}

function blocked(name, input) {
  const decision = decisionForToolUse(input);
  assert.equal(decision.allow, false, name);
  assert.match(decision.reason, /Source-intent guard/, name);
}

blocked('blocks synthetic login routes in compiler output', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'compiler.js',
    new_string: "pageRoutes.add('/login');\nlines.push(\"app.get('/login', authHandler)\");",
  },
});

blocked('blocks auto-created default login UI language', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'compiler.js',
    new_string: '// auto-create a default login page when source omitted it\nconst fallback = true;',
  },
});

blocked('blocks synthetic non-auth page routes in compiler output', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'compiler.js',
    new_string: "pageRoutes.add('/approvals');\nlines.push(\"app.get('/approvals', fallbackHandler)\");",
  },
});

blocked('blocks fallback app surface language beyond login', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'validator.js',
    new_string: '// synthesize fallback settings screen when nav target is missing\nreturn;',
  },
});

allowed('allows diagnostic-first validator fixes', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'validator.js',
    new_string:
      "// source-intent: diagnostic-first\n" +
      "errors.push({ message: \"page needs login but no page at '/login'\" });",
  },
});

allowed('allows source-backed compiler emission', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'compiler.js',
    new_string: "// source-intent: source-backed emit\npageRoutes.add('/approvals');",
  },
});

allowed('ignores unrelated files', {
  toolName: 'Edit',
  toolInput: {
    file_path: 'README.md',
    new_string: 'auto-create a default login page',
  },
});
