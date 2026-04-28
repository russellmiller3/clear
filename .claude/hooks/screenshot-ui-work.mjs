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
    `# UI screenshot reminder (Russell, 2026-04-28)\n\n` +
    `You just edited \`${path.split('/').pop()}\` — a UI surface (${fileType}). ` +
    `Russell's rule: **when doing UI, always screenshot to confirm before claiming done.** ` +
    `Compile passing is not the spec — the user-visible outcome is.\n\n` +
    `**What to do BEFORE this turn ends:**\n` +
    `1. Make sure a preview server is running (the deal-desk app on Studio at localhost:3456, OR \`preview_start\` if you've got the Claude Preview tools loaded).\n` +
    `2. Navigate the preview to the route you just changed.\n` +
    `3. Take a screenshot (\`preview_screenshot\` if Claude Preview is loaded; otherwise read the rendered HTML via \`preview_snapshot\` and confirm the structure matches what you expect).\n` +
    `4. Look for: did the SHARED CHROME (sidebar nav, header, status bar) survive the route change? Are tables / charts / forms actually rendering or empty? Is the layout broken on this viewport?\n` +
    `5. If the screenshot shows what you expected, say so explicitly in the reply. If it doesn't, fix and re-screenshot — don't claim done.\n\n` +
    `**Common UI failures this hook is designed to catch:**\n` +
    `- Sidebar / nav disappears when navigating between pages (each page is self-contained HTML; needs a shell-page router OR a shared component)\n` +
    `- Empty-state text reads "undefined" or "[object Object]" instead of friendly copy\n` +
    `- Action buttons render but click does nothing (dead button)\n` +
    `- Tables show "OUTPUT" or column headers but no rows\n` +
    `- Hover/focus states missing (only light mode considered)\n` +
    `- Mobile / narrow-viewport layout broken\n\n` +
    `If you can't take a screenshot in this turn for any reason (no preview tool loaded, no server running and you don't have time to start one), say so EXPLICITLY in your reply: "UI changed, screenshot pending — Russell please verify visually." Don't silently skip.`;

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
