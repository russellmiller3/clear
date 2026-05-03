#!/usr/bin/env node
// scripts/reorder-user-guide.mjs
// Reorders USER-GUIDE.md so the chapter sequence in the body matches
// the thematic groupings the TOC at the top promises.
//
// CONTRACT
//   - Header text is unchanged. Every TOC anchor still resolves.
//   - Prefix (intro + TOC up to first ##) is unchanged.
//   - Reference sections (Quick Reference, What's Next, Appendix) move
//     to the end if they aren't already.
//   - All chapters present in the original file are present in the
//     output. No content lost. Verified by line count and assertion.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SRC = path.join(REPO_ROOT, 'USER-GUIDE.md');

const text = fs.readFileSync(SRC, 'utf8');
const lines = text.split('\n');

// Find every top-level ## header in the body. We don't care about ###.
// We split into BLOCKS at those header positions.
const blockStarts = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) blockStarts.push(i);
}

// First ## is "## Table of Contents" at top — we want EVERYTHING before
// the FIRST chapter heading to stay in the prefix. Find the first
// "## Chapter" line.
const firstChapterLine = blockStarts.find(i => lines[i].startsWith('## Chapter'));
const prefix = lines.slice(0, firstChapterLine).join('\n');

// Build blocks indexed by their leading ## header. A block runs from
// its header line up to the line before the next ##.
const blocks = {};
for (let i = 0; i < blockStarts.length; i++) {
  const start = blockStarts[i];
  if (start < firstChapterLine) continue; // skip the TOC at top
  const end = i + 1 < blockStarts.length ? blockStarts[i + 1] : lines.length;
  const headerLine = lines[start];
  // Use the header line itself as the dictionary key.
  blocks[headerLine] = lines.slice(start, end).join('\n');
}

// Helper: find the block whose header starts with a given chapter prefix.
function findChapter(prefix) {
  const key = Object.keys(blocks).find(k => k.startsWith('## ' + prefix + ':') || k === '## ' + prefix);
  if (!key) throw new Error('Chapter not found: ' + prefix);
  return blocks[key];
}

// Helper: find a non-chapter section (Quick Reference, What's Next, Appendix).
function findSection(headingPrefix) {
  const key = Object.keys(blocks).find(k => k.startsWith('## ' + headingPrefix));
  if (!key) throw new Error('Section not found: ' + headingPrefix);
  return blocks[key];
}

// Target order — matches the TOC at the top of USER-GUIDE.md exactly.
const orderedChapters = [
  // Foundations
  'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5',
  // Full-stack basics
  'Chapter 6', 'Chapter 7', 'Chapter 8', 'Chapter 13', 'Chapter 15',
  // Making it pretty
  'Chapter 11', 'Chapter 13b', 'Chapter 20',
  // Real-time and AI
  'Chapter 9', 'Chapter 10', 'Chapter 10b', 'Chapter 19',
  // Marcus apps
  'Chapter 19b', 'Chapter 19c', 'Chapter 22',
  // Production concerns
  'Chapter 12', 'Chapter 14', 'Chapter 21',
  // Testing and provable correctness
  'Chapter 17', 'Chapter 23', 'Chapter 24', 'Chapter 24b',
  // Tooling and shipping
  'Chapter 16', 'Chapter 16b', 'Chapter 18', 'Chapter 20.5',
];

const orderedSections = [
  'Quick Reference',
  "What's Next",   // matches "What's Next? (You Did It!)"
  'Appendix',
];

// Sanity check — every block we have is reached by either chapter or
// section. Catches typos in the order list.
const usedKeys = new Set();
const out = [prefix];
for (const c of orderedChapters) {
  const blockText = findChapter(c);
  out.push(blockText);
  // Mark which key we consumed.
  for (const k of Object.keys(blocks)) {
    if (blocks[k] === blockText) usedKeys.add(k);
  }
}
for (const s of orderedSections) {
  const blockText = findSection(s);
  out.push(blockText);
  for (const k of Object.keys(blocks)) {
    if (blocks[k] === blockText) usedKeys.add(k);
  }
}

const unused = Object.keys(blocks).filter(k => !usedKeys.has(k));
if (unused.length > 0) {
  console.error('ERROR: blocks present in source but not in reorder spec:');
  for (const u of unused) console.error('  ' + u);
  process.exit(1);
}

// Write back.
const reassembled = out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
const originalNorm = text.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

// Sanity: reassembled MUST contain every original line (no content lost).
const origSet = new Set(text.split('\n'));
const newSet = new Set(reassembled.split('\n'));
const missing = [...origSet].filter(l => !newSet.has(l));
if (missing.length > 0) {
  console.error('ERROR: lines from original missing in reordered output (sample):');
  for (const m of missing.slice(0, 10)) console.error('  ' + JSON.stringify(m));
  console.error(`Total missing: ${missing.length}`);
  process.exit(1);
}

fs.writeFileSync(SRC, reassembled, 'utf8');

const beforeChapters = lines.filter(l => l.startsWith('## Chapter')).map(l => l.slice(3, 30));
const afterLines = reassembled.split('\n');
const afterChapters = afterLines.filter(l => l.startsWith('## Chapter')).map(l => l.slice(3, 30));

console.log('USER-GUIDE.md reorder complete.');
console.log(`Original chapters in body order: ${beforeChapters.length}`);
console.log(`Reordered chapters in body order: ${afterChapters.length}`);
console.log('\nNew chapter sequence:');
for (let i = 0; i < afterChapters.length; i++) {
  console.log(`  ${String(i + 1).padStart(2)}. ${afterChapters[i]}`);
}
