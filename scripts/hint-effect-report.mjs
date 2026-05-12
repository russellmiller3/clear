#!/usr/bin/env node
// Read-only A/B artifact analyzer for the Meph hint flywheel.
// It excludes saturated tasks from the headline and reports significance.

import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { analyzeHintArtifacts, formatHintEffectReport } from './hint-effect-report-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_SESSIONS_DIR = join(ROOT, 'studio', 'sessions');

function parseArgs(argv) {
  const out = {
    dir: DEFAULT_SESSIONS_DIR,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
    else if (arg.startsWith('--dir=')) out.dir = arg.slice('--dir='.length);
  }
  return out;
}

function loadArtifacts(dir) {
  const files = readdirSync(dir)
    .filter(name => /^ab-hint-sweep-.*\.json$/.test(name))
    .sort();
  return files.map(name => {
    const path = join(dir, name);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { ...parsed, path };
  });
}

const opts = parseArgs(process.argv.slice(2));
const artifacts = loadArtifacts(opts.dir);
const report = analyzeHintArtifacts(artifacts);

if (opts.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatHintEffectReport(report));
}
