#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  decisionForToolUse,
  isBroadCodeSearchCommand,
  isDocsFirstCommand,
} from './docs-first-search.mjs';

assert.equal(
  isDocsFirstCommand('Select-String -Path FAQ.md,FEATURES.md -Pattern "Ralph" -Context 2,4'),
  true,
  'docs-first search should be recognized',
);

assert.equal(
  isBroadCodeSearchCommand('Select-String -Path FAQ.md,FEATURES.md -Pattern "Ralph"'),
  false,
  'map-file search is not broad code search',
);

assert.equal(
  isBroadCodeSearchCommand('Get-ChildItem -Recurse -File | Select-String -Pattern "Ralph"'),
  true,
  'recursive repo search should be broad code search',
);

assert.equal(
  isBroadCodeSearchCommand('rg "Ralph"'),
  true,
  'rg without map files should be broad code search',
);

const now = 1_000_000;

assert.deepEqual(
  decisionForToolUse({
    toolName: 'Bash',
    command: 'Select-String -Path FAQ.md,FEATURES.md -Pattern "Ralph"',
    now,
  }),
  { allow: true, markDocsFirst: true },
  'docs-first command is allowed and marks the stamp',
);

const blocked = decisionForToolUse({
  toolName: 'Bash',
  command: 'rg "Ralph"',
  stamp: null,
  now,
});
assert.equal(blocked.allow, false, 'broad search blocks without docs stamp');
assert.match(blocked.reason, /FAQ\.md and FEATURES\.md/, 'block explains the required first search');

assert.equal(
  decisionForToolUse({
    toolName: 'Bash',
    command: 'rg "Ralph"',
    stamp: { checkedAt: now - 1000 },
    now,
  }).allow,
  true,
  'fresh docs-first stamp permits broad search',
);

assert.equal(
  decisionForToolUse({
    toolName: 'Bash',
    command: 'git status --short',
    stamp: null,
    now,
  }).allow,
  true,
  'non-search shell commands are ignored',
);

console.log('docs-first-search hook tests passed');
