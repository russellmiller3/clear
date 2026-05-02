#!/usr/bin/env node
// Resolves merge conflicts in doc files by keeping BOTH sides.
// Use only on files where adjacent additions are the expected pattern
// (CHANGELOG.md, FAQ.md, learnings.md). Pass file paths as args.

import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: merge-keep-both.mjs <file> [<file>...]');
  process.exit(2);
}

let totalResolved = 0;
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`skip (not found): ${file}`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let resolved = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<< ')) {
      const head = [];
      const incoming = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('=======')) {
        head.push(lines[i++]);
      }
      i++;
      while (i < lines.length && !lines[i].startsWith('>>>>>>> ')) {
        incoming.push(lines[i++]);
      }
      i++;
      out.push(...head);
      out.push(...incoming);
      resolved++;
      continue;
    }
    out.push(lines[i++]);
  }
  if (resolved > 0) {
    fs.writeFileSync(file, out.join('\n'));
    console.log(`${file}: ${resolved} conflict(s) resolved (kept both)`);
    totalResolved += resolved;
  } else {
    console.log(`${file}: no conflicts`);
  }
}
console.log(`total: ${totalResolved} conflict(s) resolved across ${files.length} file(s)`);
