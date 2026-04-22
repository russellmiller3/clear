#!/usr/bin/env node
/*
 * check-doc-drift.cjs
 *
 * Scans the canonical docs for shared metrics that tend to drift apart over
 * sessions ("1850 compiler tests" in one file, "2108" in another). Flags
 * disagreements so they can be fixed in one pass instead of being noticed
 * months later when a contributor reads two docs back-to-back.
 *
 * Run: node scripts/check-doc-drift.cjs
 *      node scripts/check-doc-drift.cjs --json     (machine-readable output)
 *
 * Exits 0 if no drift, 1 if any metric has multiple distinct values across
 * the scanned docs. Pre-commit / CI can wire this in once it's stable.
 *
 * NOT a syntax checker. NOT a content validator. ONLY a "do these files
 * agree on this number?" detector. New metrics get added by editing the
 * METRICS array below — keep patterns narrow so false positives stay rare.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

// Files we care about — the canonical docs that must agree with each other.
// node_modules, plans/, docs/ subdir, and .claude/ are intentionally excluded.
const SCAN_FILES = [
  'README.md',
  'CLAUDE.md',
  'PHILOSOPHY.md',
  'FAQ.md',
  'FEATURES.md',
  'CHANGELOG.md',
  'ROADMAP.md',
  'HANDOFF.md',
  'AI-INSTRUCTIONS.md',
  'SYNTAX.md',
  'USER-GUIDE.md',
  'intent.md',
  'learnings.md',
  'RESEARCH.md',
  'ai-build-instructions.md',
  'design-system.md',
];

// Each metric defines:
//   name      — short label for the report
//   pattern   — regex with one capture group for the number
//   normalize — optional function to coerce captures (e.g. strip commas)
// Patterns are intentionally narrow. False positives waste reader attention,
// so prefer "tighter pattern that misses some" over "loose pattern that flags
// unrelated numbers."
const METRICS = [
  {
    name: 'Compiler test count',
    // Matches: "1850 compiler tests", "2108 tests", "1850 tests passing"
    pattern: /\b(\d{3,5})\s+(?:compiler\s+)?tests?\b(?!\s*(?:pass\s*=|=))/gi,
    // Skip if the surrounding line names a different kind of test (eval, e2e, etc.)
    contextSkip: /(?:eval|e2e|playwright|sandbox|server|integration|ide|builder-mode)\s+tests?/i,
  },
  {
    name: 'Node type count',
    // Matches: "119+ node types", "126 node types", "120 NodeType"
    pattern: /\b(\d{2,4})\+?\s+node\s+types?\b/gi,
  },
  {
    name: 'Template count',
    // Matches: "43 templates", "45 template apps"
    pattern: /\b(\d{1,3})\s+(?:template\s+apps?|templates?)\b/gi,
    contextSkip: /core\s+templates?|core-\d+|landing\s+templates?/i,
  },
  {
    name: 'Core template count',
    // Matches: "8 core templates", "Core 8", "Core 7"
    pattern: /\b(?:Core\s+)?(\d{1,2})\s+core\s+templates?\b|\bCore\s+(\d{1,2})(?:\s+templates?)?\b/gi,
  },
  {
    name: 'Curriculum task count',
    // Matches: "20 benchmark tasks", "25 curriculum tasks", "38 curriculum skeletons"
    pattern: /\b(\d{1,3})\s+(?:benchmark\s+tasks?|curriculum\s+(?:tasks?|skeletons?))\b/gi,
  },
  {
    name: 'Marcus apps count',
    // Matches: "5 Marcus apps", "five Marcus apps"
    pattern: /\b(\d{1,2})\s+Marcus\s+apps?\b/gi,
  },
  {
    name: 'Doc-rule surface count',
    // Matches: "9 surfaces", "11 surfaces" (Documentation Rule talks about how
    // many docs need updating per feature)
    pattern: /\b(\d{1,2})\s+surfaces?\b/gi,
    contextSkip: /endpoint\s+surfaces?|api\s+surfaces?/i,
  },
];

// ---------------------------------------------------------------------------

function readMaybe(rel) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function findOccurrences(text, metric) {
  const re = new RegExp(metric.pattern.source, metric.pattern.flags);
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      // Skip when surrounding context narrows this to a different metric
      if (metric.contextSkip && metric.contextSkip.test(line)) continue;
      const value = (m[1] || m[2] || '').replace(/,/g, '');
      if (!value) continue;
      hits.push({
        line: i + 1,
        value: Number(value),
        text: line.trim().slice(0, 180),
      });
      // Avoid infinite loop on zero-width matches (paranoia)
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return hits;
}

function colorize(s, code) {
  if (!process.stdout.isTTY) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}
const RED = (s) => colorize(s, 31);
const GREEN = (s) => colorize(s, 32);
const YELLOW = (s) => colorize(s, 33);
const DIM = (s) => colorize(s, 90);
const BOLD = (s) => colorize(s, 1);

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const wantJson = args.includes('--json');

const findings = [];

for (const metric of METRICS) {
  const occurrences = []; // [{file, line, value, text}]
  for (const rel of SCAN_FILES) {
    const text = readMaybe(rel);
    if (text == null) continue;
    const hits = findOccurrences(text, metric);
    for (const h of hits) occurrences.push({ file: rel, ...h });
  }
  // Bucket by value
  const byValue = new Map();
  for (const o of occurrences) {
    if (!byValue.has(o.value)) byValue.set(o.value, []);
    byValue.get(o.value).push(o);
  }
  const distinctValues = [...byValue.keys()].sort((a, b) => a - b);
  findings.push({
    name: metric.name,
    distinctValues,
    byValue,
    totalHits: occurrences.length,
    drift: distinctValues.length > 1,
  });
}

// ---------------------------------------------------------------------------

if (wantJson) {
  const out = findings.map((f) => ({
    metric: f.name,
    distinctValues: f.distinctValues,
    drift: f.drift,
    occurrences: [...f.byValue.entries()].flatMap(([v, list]) =>
      list.map((o) => ({ value: v, file: o.file, line: o.line, text: o.text }))
    ),
  }));
  console.log(JSON.stringify(out, null, 2));
  process.exit(findings.some((f) => f.drift) ? 1 : 0);
}

console.log(BOLD('\nDoc-drift check\n'));
console.log(DIM(`Scanned ${SCAN_FILES.length} files for ${METRICS.length} shared metrics.\n`));

let driftCount = 0;
for (const f of findings) {
  if (f.totalHits === 0) {
    console.log(`${DIM('   ·')} ${f.name} ${DIM('— no occurrences')}`);
    continue;
  }
  if (!f.drift) {
    console.log(`${GREEN('   ✓')} ${f.name} ${DIM('—')} ${BOLD(f.distinctValues[0])} ${DIM(`(${f.totalHits} mention${f.totalHits === 1 ? '' : 's'}, all agree)`)}`);
    continue;
  }
  driftCount++;
  console.log(`${RED('   ✗')} ${BOLD(f.name)} ${DIM('—')} ${YELLOW(`${f.distinctValues.length} different values:`)} ${f.distinctValues.join(', ')}`);
  for (const v of f.distinctValues) {
    const list = f.byValue.get(v);
    console.log(`     ${BOLD(v)} ${DIM(`(${list.length} mention${list.length === 1 ? '' : 's'})`)}`);
    for (const o of list.slice(0, 5)) {
      console.log(`       ${DIM(`${o.file}:${o.line}`)}  ${o.text}`);
    }
    if (list.length > 5) console.log(`       ${DIM(`… and ${list.length - 5} more`)}`);
  }
  console.log('');
}

if (driftCount === 0) {
  console.log(`\n${GREEN(BOLD('✓ No drift detected.'))} ${DIM('All scanned metrics agree across docs.')}\n`);
  process.exit(0);
}

console.log(`\n${RED(BOLD(`✗ ${driftCount} metric${driftCount === 1 ? '' : 's'} disagree across docs.`))}`);
console.log(DIM('   Fix in the one source-of-truth doc, then propagate. Easy ones can be batched into a single "doc-sync" commit.'));
console.log(DIM('   Hard ones (e.g. genuine ambiguity over what counts) → list in docs/doc-drift-findings.md for design discussion.\n'));
process.exit(1);
