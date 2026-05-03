#!/usr/bin/env node
// One-shot script to rename `guard` keyword → `enforce that` in test files
// and any other Clear source embedded in JS strings. Conservative regex —
// only matches `guard` when it follows a newline + whitespace (the shape
// of a Clear keyword line).
const fs = require('fs');
const path = require('path');

const TARGETS = [
  'clear.test.js',
  'lib/prover/index.test.js',
  'lib/prover/symbolic.test.js',
];

let totalReplacements = 0;
for (const f of TARGETS) {
  if (!fs.existsSync(f)) continue;
  const before = fs.readFileSync(f, 'utf8');
  let after = before;
  // Pattern 1: literal newline + indent + guard + space + (alpha or quote)
  after = after.replace(/(\n\s*)guard (?=['"a-zA-Z_0-9(])/g, '$1enforce that ');
  // Pattern 2: backslash-n escape + indent + guard + space (string literals)
  after = after.replace(/(\\n\s*)guard (?=['"a-zA-Z_0-9(])/g, '$1enforce that ');
  // Pattern 3: Right after a backtick (start of template literal)
  after = after.replace(/(`)guard (?=['"a-zA-Z_0-9(])/g, '$1enforce that ');
  if (after !== before) {
    fs.writeFileSync(f, after);
    const diffs = (before.match(/guard /g) || []).length - (after.match(/guard /g) || []).length;
    console.log(`  ${f}: ${diffs} replacements`);
    totalReplacements += diffs;
  }
}
console.log(`Total replacements: ${totalReplacements}`);
