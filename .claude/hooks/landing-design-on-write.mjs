#!/usr/bin/env node
// .claude/hooks/landing-design-on-write.mjs
//
// PreToolUse hook on Write/Edit when the target is a `landing/*.html` file.
// Injects the design system tokens, the 10 hard UI rules, the no-emoji
// rule, and a "compare against landing/marcus-app-target.html" reminder
// as additionalContext.
//
// Why this exists: landing pages drift visually because the rules live
// in design-system.md and the visual target lives in
// landing/marcus-app-target.html, but the author may not have read either
// in this session. Inject-at-the-bite-point ensures the design constraints
// are in front of the model every time it edits a landing page.
//
// Hook input (stdin JSON):
//   {
//     "tool_name": "Write" | "Edit",
//     "tool_input": { "file_path": "...", ... }
//   }
//
// Hook output:
//   - file_path doesn't match landing/*.html → exit 0 silently
//   - Otherwise → emit additionalContext with design constraints

import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

export function isLandingHtmlFile(filePath) {
  if (typeof filePath !== 'string') return false;
  // Match both forward and backward slashes (Windows paths).
  return /(^|[\\/])landing[\\/][^\\/]+\.html$/.test(filePath);
}

export function extractSection(text, heading, maxLines = 80) {
  if (typeof text !== 'string') return '';
  const lines = text.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(heading)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ') || lines[i].startsWith('# ')) {
      endIdx = i;
      break;
    }
  }
  const sliceEnd = Math.min(endIdx, startIdx + maxLines);
  return lines.slice(startIdx, sliceEnd).join('\n');
}

export function buildReminder() {
  const parts = [];
  parts.push('# Landing-page design constraints (injected at landing/*.html write time)');
  parts.push('');
  parts.push('You are about to Write or Edit a landing page. Apply these constraints:');
  parts.push('');
  parts.push('## Hard rules');
  parts.push('');
  parts.push('- **NO EMOJI in landing pages.** Use Lucide SVG icons instead — they\'re sharper, scale properly, and look professional. Emoji render differently across OS/browser and look amateurish on marketing pages. (CLAUDE.md mandatory rule.)');
  parts.push('- **One accent color** per page. Don\'t mix indigo + purple + pink + cyan as section accents.');
  parts.push('- **One `btn-primary` per section.** If you have two, one of them is wrong — secondary actions get `btn-ghost` or `btn-outline`.');
  parts.push('- **Heroes ≤ 10 words.** If your hero headline is longer, you\'re explaining instead of selling. Cut.');
  parts.push('- **8-pt grid for spacing.** All padding/margin/gap values are multiples of 8 (or 4 for tight spacing). Avoid 13px, 17px, 23px.');
  parts.push('- **Cards: bg OR border, not both.** A card with both `bg-base-200` and `border` looks busy.');
  parts.push('- **Consistent type scale.** Don\'t invent new font sizes — use the design-system tokens.');
  parts.push('');
  parts.push('## Visual target');
  parts.push('');
  parts.push('The slate-on-ivory shape from `landing/marcus-app-target.html` is the visual benchmark for any new app-shell-style landing section. If you\'re editing a section that should match that shape (header, sidebar, content area), open the mock and compare class lists, spacing, and color tokens.');
  parts.push('');

  // Try to pull the design tokens block from design-system.md if present.
  const dsPath = join(REPO_ROOT, 'design-system.md');
  if (existsSync(dsPath)) {
    try {
      const dsText = readFileSync(dsPath, 'utf8');
      const tokens = extractSection(dsText, 'Color tokens', 60) || extractSection(dsText, 'Tokens', 60);
      if (tokens) {
        parts.push('## Design tokens (from design-system.md)');
        parts.push('');
        parts.push(tokens);
        parts.push('');
      }
    } catch { /* skip */ }
  }

  parts.push('---');
  parts.push('');
  parts.push('**Self-check before saving:** any emoji? any second `btn-primary` in this section? any non-8-pt spacing? any new font size invented inline? If yes to any → fix before saving.');
  return parts.join('\n');
}

function main() {
  let raw;
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data;
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const toolName = data?.tool_name;
  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  const filePath = data?.tool_input?.file_path || '';
  if (!isLandingHtmlFile(filePath)) process.exit(0);

  const reminder = buildReminder();
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: reminder,
    },
  };
  process.stdout.write(JSON.stringify(payload));
}

const invokedDirectly = (() => {
  try {
    const metaName = import.meta.url.split(/[\\/]/).pop() || '';
    const argvName = (process.argv[1] || '').split(/[\\/]/).pop() || '';
    return metaName === argvName;
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  main();
}
