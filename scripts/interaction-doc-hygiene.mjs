#!/usr/bin/env node
// Fails when Meph-facing docs teach interactive controls without visible effects.

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

export const DOC_FILES = [
  'AI-INSTRUCTIONS.md',
  'SYNTAX.md',
  'USER-GUIDE.md',
  'studio/system-prompt.md',
  'intent.md',
  'PHILOSOPHY.md',
  'FEATURES.md',
  'README.md',
];

const BUTTON_LINE_RE = /^(?:add\s+)?button\s+(['"])([^'"]+)\1\s*(:)?\s*$/i;
const INLINE_DOMAIN_TOAST_RE = /button\s+['"](?:Approve|Reject|Assign|Resolve|Save|Delete)['"]\s*:\s*show\s+(?:toast|alert|notification)\b/i;
const INPUT_LIKE_RE = /^['"][^'"]+['"]\s+(?:is\s+(?:a|an|the)\s+|as\s+)(?:text|number|file)\s+input\b|^['"][^'"]+['"]\s+(?:is\s+(?:a|an|the)\s+|as\s+)(?:dropdown|select|checkbox|text\s+area|textarea|rich\s+text|text\s+editor|slider|range\s+slider|menu|dropdown\s+menu|select\s+menu|toggle|switch|segmented\s+control|tabs?)\b/i;
const ROW_ACTION_RE = /^(['"])[^'"]+\1\s+is\s+(primary|secondary|danger|ghost)\s*$/i;

function isIntentionalBadExample(lines, index) {
  const nearby = [
    lines[index - 2] || '',
    lines[index - 1] || '',
    lines[index] || '',
  ].join(' ');
  return /\b(BAD|Wrong|no body|missing action|without data effect)\b/i.test(nearby);
}

function indentation(line) {
  return (String(line || '').match(/^\s*/) || [''])[0].length;
}

function nextMeaningfulLine(lines, index) {
  let j = index + 1;
  while (j < lines.length && lines[j].trim() === '') j += 1;
  return { index: j, line: lines[j] || '', trimmed: (lines[j] || '').trim() };
}

function isFeedbackEffect(text) {
  return /^(?:show|shows|display|displays)\b.*\b(?:toast|alert|notification)\b/i.test(String(text || '').trim());
}

function namesDataEffect(text) {
  const effectText = String(text || '').trim().replace(/^\/\/\s*/, '');
  return /\b(saves?\s+to|saved\s+as|gets?|loads?|refreshes?|sends?|posts?|puts?|patches?|deletes?|removes?|updates?|sets?|creates?|adds?|calls?|records?|queues?|filters?|sorts?|selects?|copies?|downloads?|uploads?|exports?|stores?|toggles?|clears?|resets?|opens?|closes?|hides?|go(?:es)?\s+to|navigates?(?:\s+to)?)\b/i.test(effectText) ||
    isFeedbackEffect(effectText) ||
    /\bto\s+['"][^'"]+['"]/i.test(effectText) ||
    /^script:\s*$/i.test(effectText) ||
    /^[a-zA-Z_]\w*(?:'s\s+\w+)?\s*(?:=|\bis\b)\s+/.test(effectText);
}

function namesNonFeedbackDataEffect(text) {
  return namesDataEffect(text) && !isFeedbackEffect(text);
}

function hasSavedVariable(text) {
  return /\b(save[sd]?\s+(?:as|to)|saves\s+to)\b/i.test(String(text || ''));
}

function scanClearBlock(lines, offset, file) {
  const findings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    const button = trimmed.match(BUTTON_LINE_RE);
    if (button && !isIntentionalBadExample(lines, i)) {
      const hasColon = Boolean(button[3]);
      if (!hasColon) {
        findings.push({
          file,
          line: offset + i + 1,
          message: 'button must name its data effect with an indented body, or use that/for with an inline action',
        });
      } else {
        const next = nextMeaningfulLine(lines, i);
        if (!(indentation(next.line) > indentation(line) && namesDataEffect(next.trimmed))) {
          findings.push({
            file,
            line: offset + i + 1,
            message: 'button body must immediately name the data effect',
          });
        }
      }
    }

    if (INPUT_LIKE_RE.test(trimmed) && !hasSavedVariable(trimmed) && !isIntentionalBadExample(lines, i)) {
      findings.push({
        file,
        line: offset + i + 1,
        message: 'input must name the variable it saves with saved as or saves to',
      });
    }

    const rowAction = trimmed.match(ROW_ACTION_RE);
    if (rowAction && !isIntentionalBadExample(lines, i)) {
      const next = nextMeaningfulLine(lines, i);
      if (!(indentation(next.line) > indentation(line) && next.trimmed.startsWith('//') && namesNonFeedbackDataEffect(next.trimmed))) {
        findings.push({
          file,
          line: offset + i + 1,
          message: 'row action shortcut needs an immediate // note naming the data effect',
        });
      }
    }
  }
  return findings;
}

export function findDocHygieneFindings(source, file = '<memory>') {
  const findings = [];
  const lines = String(source || '').split(/\r?\n/);
  let inClearBlock = false;
  let blockStart = 0;
  let blockLines = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (INLINE_DOMAIN_TOAST_RE.test(line)) {
      findings.push({
        file,
        line: i + 1,
        message: 'domain action cannot use toast as its only documented effect',
      });
    }

    const fence = line.match(/^```(\w+)?/);
    if (!fence) {
      if (inClearBlock) blockLines.push(line);
      continue;
    }

    if (!inClearBlock && String(fence[1] || '').toLowerCase() === 'clear') {
      inClearBlock = true;
      blockStart = i + 1;
      blockLines = [];
      continue;
    }

    if (inClearBlock) {
      findings.push(...scanClearBlock(blockLines, blockStart, file));
      inClearBlock = false;
      blockLines = [];
    }
  }

  if (inClearBlock) {
    findings.push(...scanClearBlock(blockLines, blockStart, file));
  }

  return findings;
}

export function buildReport(findings) {
  if (findings.length === 0) return '';
  const lines = ['interaction-doc-hygiene failed:'];
  for (const finding of findings) {
    lines.push(`  ${finding.file}:${finding.line} - ${finding.message}`);
  }
  return lines.join('\n');
}

function main() {
  const findings = [];
  for (const doc of DOC_FILES) {
    const path = resolve(REPO_ROOT, doc);
    if (!existsSync(path)) continue;
    findings.push(...findDocHygieneFindings(readFileSync(path, 'utf8'), doc));
  }
  const report = buildReport(findings);
  if (report) {
    console.error(report);
    process.exit(1);
  }
  console.log('interaction-doc-hygiene: clean');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
