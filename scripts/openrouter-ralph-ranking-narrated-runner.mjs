#!/usr/bin/env node
// Start a Ralph ranking benchmark in the background with pollable narration files.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DIR = path.join(ROOT, '.tmp');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function splitArgs(argv) {
  const separator = argv.indexOf('--');
  return separator >= 0 ? argv.slice(separator + 1) : argv;
}

export function buildNarratedRunPlan(argv = [], {
  nowStamp = stamp(),
  rootDir = ROOT,
} = {}) {
  const args = splitArgs(argv);
  const tmpDir = path.join(rootDir, '.tmp');
  const base = `openrouter-ralph-ranking-narrated-${nowStamp}`;
  const streamPath = path.join(tmpDir, `${base}.events.jsonl`);
  const outPath = path.join(tmpDir, `${base}.json`);
  const stdoutPath = path.join(tmpDir, `${base}.out.log`);
  const stderrPath = path.join(tmpDir, `${base}.err.log`);
  const exitPath = path.join(tmpDir, `${base}.exit.json`);
  const pidPath = path.join(tmpDir, `${base}.pid`);
  const manifestPath = path.join(tmpDir, `${base}.manifest.json`);

  const finalArgs = ['scripts/openrouter-ralph-ranking-benchmark.mjs', ...args];
  if (!args.includes('--espn')) finalArgs.push('--espn');
  if (!args.some((arg) => arg.startsWith('--stream-jsonl='))) finalArgs.push(`--stream-jsonl=${streamPath}`);
  if (!args.some((arg) => arg.startsWith('--out='))) finalArgs.push(`--out=${outPath}`);

  return {
    command: process.execPath,
    args: finalArgs,
    cwd: rootDir,
    streamPath,
    outPath,
    stdoutPath,
    stderrPath,
    exitPath,
    pidPath,
    manifestPath,
  };
}

function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const plan = buildNarratedRunPlan(process.argv.slice(2));
  const stdout = fs.openSync(plan.stdoutPath, 'a');
  const stderr = fs.openSync(plan.stderrPath, 'a');
  const child = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    detached: true,
    stdio: ['ignore', stdout, stderr],
    windowsHide: true,
  });

  fs.writeFileSync(plan.pidPath, String(child.pid));
  fs.writeFileSync(plan.manifestPath, JSON.stringify({ ...plan, pid: child.pid, startedAt: new Date().toISOString() }, null, 2));
  child.on('exit', (code, signal) => {
    fs.writeFileSync(plan.exitPath, JSON.stringify({ code, signal, endedAt: new Date().toISOString() }, null, 2));
  });
  child.unref();

  process.stdout.write([
    `started ${child.pid}`,
    `manifest ${plan.manifestPath}`,
    `events ${plan.streamPath}`,
    `output ${plan.outPath}`,
    `stdout ${plan.stdoutPath}`,
    `stderr ${plan.stderrPath}`,
    '',
    'Poll the events file and narrate: spend, attempts, best score, remaining gaps, and whether the loop improved.',
  ].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
