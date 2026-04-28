#!/usr/bin/env node
/**
 * PostToolUse hook — when Claude edits a UI file (.html, .clear, .css,
 * or compiler-emitted view layer), inject a reminder to screenshot the
 * preview before declaring done.
 *
 * Russell's rule (2026-04-28): "when doing UI, always screenshot to
 * confirm." Reading the diff or trusting compile output is not enough —
 * the user-visible outcome is the spec. This hook nudges every UI edit.
 *
 * Trigger surface (PostToolUse, Write|Edit):
 *   - .html files (landing pages, ide.html, compiled output mocks)
 *   - .clear files (apps that compile to a UI)
 *   - .css files (style work)
 *   - compiler.js, parser.js (when they emit UI)
 *
 * Output: an additionalContext block that lands in Claude's next turn
 * with explicit "screenshot before claiming done" instructions and
 * the right preview-tool invocation.
 *
 * Fail-open on any error (never brick CC).
 */

import { readFileSync } from 'node:fs';

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }

  const tool = event.tool_name || '';
  if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

  const input = event.tool_input || {};
  const path = (input.file_path || '').replace(/\\/g, '/');
  if (!path) process.exit(0);

  // Match UI surfaces. Skip test files (those have their own check loop).
  const isUI =
    /\.(html?|clear|css|svelte|tsx|jsx)$/i.test(path) ||
    /compiler\.js$/i.test(path) ||
    /\/landing\//i.test(path) ||
    /\/playground\/(ide|index)\.html$/i.test(path);
  if (!isUI) process.exit(0);
  if (/\.test\.(js|mjs|ts)$/i.test(path)) process.exit(0);
  if (/\/snap-layer|\/uat-contract/i.test(path)) process.exit(0); // pure logic modules

  // What to screenshot depends on file type
  const fileType = pickType(path);

  const reminder =
    `# UI screenshot reminder (Russell, 2026-04-28) — MANDATORY\n\n` +
    `You just edited \`${path.split('/').pop()}\` — a UI surface (${fileType}). ` +
    `Russell's rule: **when doing UI, you MUST use the preview tools and take a screenshot before claiming done.** ` +
    `Compile passing is not the spec. Reading the compiled HTML is not the spec. The user-visible pixels are the spec.\n\n` +
    `**The exact tool sequence to run BEFORE this turn ends:**\n` +
    `1. **Load the preview tools** if not already loaded:\n` +
    `   ToolSearch with query "preview" (max_results 10) — pulls in preview_start, preview_screenshot, preview_navigate, preview_snapshot, preview_click, preview_inspect, preview_console_logs, preview_logs, preview_resize.\n` +
    `2. **Start a preview server** with \`preview_start\`. Pick the right config from \`.claude/launch.json\` — for Clear apps, use the matching marcus-* entry (e.g. \`marcus-deal-desk\` for the deal desk). The launch.json already has entries for every Marcus app on dedicated ports. If your target isn't listed, ADD it before calling preview_start.\n` +
    `3. **Take a screenshot** with \`preview_screenshot\` for the FIRST page you changed.\n` +
    `4. **Click each affected nav / button** with \`preview_click\` (CSS selector) and screenshot AGAIN after each — this is how you catch sidebar-disappears, dead buttons, empty tables.\n` +
    `5. **Use \`preview_snapshot\` for accessibility-tree verification** of text content (more accurate than reading pixels for "did the heading render", "did the table populate").\n` +
    `6. **Use \`preview_inspect\` for color / spacing / size verification** (more accurate than screenshot for those specific properties).\n` +
    `7. **Tell Russell what you saw.** Quote the screenshot or snapshot finding directly. If anything is broken, fix and re-screenshot before claiming done.\n\n` +
    `**Common UI failures this hook is designed to catch:**\n` +
    `- Sidebar / nav disappears when navigating between pages (each page is self-contained HTML; needs a shell-page router OR a shared component)\n` +
    `- Empty-state text reads "undefined" or "[object Object]" instead of friendly copy\n` +
    `- Action buttons render but click does nothing (dead button — verify with preview_click + console check)\n` +
    `- Tables show "OUTPUT" or column headers but no rows\n` +
    `- Hover/focus states missing (only light mode considered)\n` +
    `- Mobile / narrow-viewport layout broken (use preview_resize with preset 'mobile' to verify)\n\n` +
    `**If a tool actually fails** (preview_start errors, screenshot fails, server won't boot), report the error directly — don't silently skip. Saying "UI changed, screenshot pending — please verify visually" is the LAST RESORT, only when a real tool failure blocks you. Default path is screenshot in-conversation.`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: reminder,
    }
  }));
}

function pickType(path) {
  if (/\.html?$/i.test(path)) return 'HTML';
  if (/\.clear$/i.test(path)) return 'Clear app (compiles to HTML)';
  if (/\.css$/i.test(path)) return 'CSS';
  if (/compiler\.js$/i.test(path)) return 'compiler (emits UI)';
  if (/\/landing\//i.test(path)) return 'landing page';
  return 'UI file';
}

main();
