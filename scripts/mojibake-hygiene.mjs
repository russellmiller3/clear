#!/usr/bin/env node
// Catches real mojibake and provides ASCII-safe log tails for Windows shells.

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

export const MOJIBAKE_SIGNATURES = [
  { label: 'em dash decoded as Windows-1252', value: '\u00e2\u20ac\u201d' },
  { label: 'en dash decoded as Windows-1252', value: '\u00e2\u20ac\u201c' },
  { label: 'left quote decoded as Windows-1252', value: '\u00e2\u20ac\u0153' },
  { label: 'right quote decoded as Windows-1252', value: '\u00e2\u20ac\u009d' },
  { label: 'apostrophe decoded as Windows-1252', value: '\u00e2\u20ac\u2122' },
  { label: 'arrow decoded as Windows-1252', value: '\u00e2\u2020\u2019' },
  { label: 'multiply sign decoded as Windows-1252', value: '\u00c3\u2014' },
  { label: 'non-breaking space marker decoded as Windows-1252', value: '\u00c2\u00a0' },
];

const TEXT_FILE_RE = /\.(?:md|mjs|js|json|sh|txt|clear|html|css|toml|yml|yaml)$/i;
const TEXT_BASENAMES = new Set([
  '.gitignore',
  '.gitattributes',
  'AGENTS.md',
  'CLAUDE.md',
  'FAQ.md',
  'HANDOFF.md',
  'PHILOSOPHY.md',
  'README.md',
  'learnings.md',
  'intent.md',
]);

export function findMojibake(source, file = '<memory>') {
  const findings = [];
  const lines = String(source || '').split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const signature of MOJIBAKE_SIGNATURES) {
      let column = line.indexOf(signature.value);
      while (column !== -1) {
        findings.push({
          file,
          line: lineIndex + 1,
          column: column + 1,
          message: signature.label,
          text: signature.value,
        });
        column = line.indexOf(signature.value, column + signature.value.length);
      }
    }
  }
  return findings;
}

export function buildMojibakeReport(findings) {
  if (findings.length === 0) return '';
  const lines = ['mojibake-hygiene failed:'];
  for (const finding of findings) {
    lines.push(`  ${finding.file}:${finding.line}:${finding.column} - ${finding.message}`);
  }
  return lines.join('\n');
}

export function normalizeForAsciiDisplay(source) {
  return String(source || '')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2192/g, '->')
    .replace(/\u00d7/g, 'x')
    .replace(/\u2022/g, '*')
    .replace(/[\u2500-\u257f]/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?');
}

export function tailLines(source, count = 120) {
  const lines = String(source || '').split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - count)).join('\n');
}

export function listTrackedTextFiles(cwd = process.cwd()) {
  const out = execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' });
  return out.split(/\r?\n/).filter(file => file && isTrackedTextFile(file));
}

export function isTrackedTextFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  const basename = normalized.split('/').pop();
  return TEXT_FILE_RE.test(normalized) ||
    TEXT_BASENAMES.has(basename) ||
    normalized.startsWith('.husky/');
}

export function scanFiles(files, cwd = process.cwd()) {
  const findings = [];
  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    findings.push(...findMojibake(readFileSync(path, 'utf8'), file));
  }
  return findings;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { lines: 120, tail: null };
  for (const arg of argv) {
    if (arg.startsWith('--tail=')) out.tail = arg.slice('--tail='.length);
    else if (arg.startsWith('--lines=')) out.lines = Number(arg.slice('--lines='.length));
    else if (arg === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/mojibake-hygiene.mjs',
    '  node scripts/mojibake-hygiene.mjs --tail=/path/to/log --lines=120',
  ].join('\n'));
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  if (args.tail) {
    const text = readFileSync(args.tail, 'utf8');
    process.stdout.write(normalizeForAsciiDisplay(tailLines(text, args.lines)));
    if (!text.endsWith('\n')) process.stdout.write('\n');
    return;
  }
  const findings = scanFiles(listTrackedTextFiles());
  const report = buildMojibakeReport(findings);
  if (report) {
    console.error(report);
    process.exit(1);
  }
  console.log('mojibake-hygiene: clean');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
