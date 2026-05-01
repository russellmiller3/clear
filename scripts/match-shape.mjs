#!/usr/bin/env node
// Shape-search retrieval over canonical-examples.md.
//
// Lean's `library_search` for Clear: given a Clear program (file or stdin),
// parse the curated canonical examples, score each by shape similarity, and
// print the top-3.
//
// Usage:
//   node scripts/match-shape.mjs path/to/program.clear
//   node scripts/match-shape.mjs --stdin < program.clear
//   node scripts/match-shape.mjs --top 5 path/to/program.clear   (default 3)
//   node scripts/match-shape.mjs --json path/to/program.clear    (machine-readable)
//
// Exit codes:
//   0 — top matches printed
//   1 — input read failure / parse error / no canonical examples found
//
// Why this script (vs an in-process retrieval call):
//   1. Canonical-examples.md changes hand-curated by Russell, not derived
//      from a DB query. Parsing markdown once at retrieval time is cheap and
//      lets the file stay the source of truth.
//   2. Used by tests, by Russell at the CLI ("which canonical example
//      matches my error?"), and by meph-tools.js's compile pipeline. One
//      parser, three callers.
//
// The exported helpers (loadCanonicalExamples, matchShape) are also imported
// directly by meph-tools.js so the wiring step doesn't pay the subprocess
// cost on every compile.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse } from '../parser.js';
import { computeShape, shapeSimilarity } from '../playground/supervisor/program-shape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DEFAULT_EXAMPLES_PATH = join(REPO_ROOT, 'playground', 'canonical-examples.md');

/**
 * Parse the curated canonical-examples.md file into example records.
 *
 * Each example is a `## Example N — title (archetype, lines)` heading
 * followed by prose, then a fenced ` ```clear ... ``` ` block. We extract:
 *   - title: heading text after the dash
 *   - description: everything between heading and code fence
 *   - source: code-fence body
 *
 * Returns an array. Caller computes shape signatures.
 */
export function loadCanonicalExamples(filePath = DEFAULT_EXAMPLES_PATH) {
  const md = readFileSync(filePath, 'utf8');
  // Each example starts with `## Example` — split on lookahead so we keep
  // the header line in each chunk. Drop the prologue (header + intro before
  // the first example).
  const chunks = md.split(/\n(?=## Example\s+)/);
  const examples = [];
  for (const chunk of chunks) {
    if (!/^## Example\s/.test(chunk)) continue;
    const headingMatch = chunk.match(/^## Example\s+(\d+)\s*[—–-]\s*([^\n]+)/);
    if (!headingMatch) continue;
    const number = Number(headingMatch[1]);
    const title = headingMatch[2].trim();
    // Prose between heading and the first ```clear fence.
    const fenceMatch = chunk.match(/```clear\s*\n([\s\S]*?)\n```/);
    if (!fenceMatch) continue;
    const source = fenceMatch[1];
    // Description = everything between heading and the fence, trimmed.
    const fenceStart = chunk.indexOf('```clear');
    const description = chunk
      .slice(headingMatch[0].length, fenceStart)
      .trim();
    examples.push({ number, title, description, source });
  }
  return examples;
}

/**
 * Match the given source against the canonical-examples library by shape.
 *
 * @param {string} source — raw Clear source
 * @param {Object} opts
 * @param {number} opts.top — how many matches to return (default 3)
 * @param {Array}  opts.examples — pre-loaded examples (skip file read)
 * @returns {Array} up to `top` records: { example, score, signature }
 */
export function matchShape(source, opts = {}) {
  const top = Number.isFinite(opts.top) ? opts.top : 3;
  const examples = opts.examples || loadCanonicalExamples();
  if (examples.length === 0) return [];

  const querySig = computeShape(parse(source));

  // Compute signatures for every example once. (Cached on the example
  // record so a second call with the same examples list reuses them.)
  const scored = examples.map(ex => {
    if (!ex._signature) ex._signature = computeShape(parse(ex.source));
    return {
      example: ex,
      signature: ex._signature,
      score: shapeSimilarity(querySig, ex._signature),
    };
  });

  // Sort: highest score first; tie-break on example number (stable, lowest
  // first — reads better when two examples are nearly identical and the
  // earlier one is the simpler / opener form).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.example.number - b.example.number;
  });

  return scored.slice(0, top);
}

// ─── CLI driver ────────────────────────────────────────────────────────────
// Only run when invoked directly (not when imported by meph-tools.js / tests).
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('match-shape.mjs')) {
  const args = process.argv.slice(2);
  let top = 3;
  let asJson = false;
  let useStdin = false;
  let inputPath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--top' && args[i + 1]) { top = Number(args[++i]); continue; }
    if (a === '--json') { asJson = true; continue; }
    if (a === '--stdin') { useStdin = true; continue; }
    if (a === '--help' || a === '-h') {
      console.log(`Usage:
  node scripts/match-shape.mjs <file.clear>
  node scripts/match-shape.mjs --stdin < file.clear
  node scripts/match-shape.mjs --top 5 <file.clear>
  node scripts/match-shape.mjs --json <file.clear>
`);
      process.exit(0);
    }
    if (!a.startsWith('--')) inputPath = a;
  }

  let source;
  if (useStdin) {
    source = readFileSync(0, 'utf8');
  } else if (inputPath) {
    try { source = readFileSync(inputPath, 'utf8'); }
    catch (err) { console.error(`Could not read ${inputPath}: ${err.message}`); process.exit(1); }
  } else {
    console.error('No input. Pass a path or use --stdin.');
    process.exit(1);
  }

  const matches = matchShape(source, { top });
  if (matches.length === 0) {
    console.error('No canonical examples found.');
    process.exit(1);
  }

  if (asJson) {
    console.log(JSON.stringify(
      matches.map(m => ({
        number: m.example.number,
        title: m.example.title,
        score: Number(m.score.toFixed(4)),
        archetype: m.signature.archetype,
        first_feature: m.signature.first_feature,
      })),
      null, 2
    ));
  } else {
    console.log(`Top ${matches.length} canonical examples by shape:`);
    for (const m of matches) {
      console.log(`  #${m.example.number} ${m.example.title}`);
      console.log(`    score=${m.score.toFixed(4)} archetype=${m.signature.archetype}`);
    }
  }
}
