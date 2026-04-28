#!/usr/bin/env node
/**
 * PreToolUse hook — block .clear writes/edits whose nav items point to
 * routes that have no page declaration AND no explicit TBD stub.
 *
 * Russell's rule (2026-04-28): no stub nav. A button or nav item that goes
 * to a URL returning nothing is a silent failure. Every nav item must
 * either resolve to a real page OR be explicitly stubbed via Lean Lesson 1
 * (a `page` block whose body contains `TBD`).
 *
 * Trigger surface (Write / Edit):
 *   - target file path ends in .clear
 *
 * For Write — checks tool_input.content
 * For Edit  — applies the proposed substitution against the existing file
 *             on disk, then checks the resulting content
 * For MultiEdit — fail open (too complex to simulate; trust the next single
 *                 Edit hook fire to catch it)
 *
 * If any nav item route has no matching page declaration AND that route is
 * not external (http://, mailto:, tel:), not anchor (#), and not an API URL
 * (/api/...) — return deny JSON listing offenders + fix instructions.
 *
 * Fail-open on any unexpected error (never brick CC).
 */

import { readFileSync, existsSync } from 'node:fs';

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
  if (!/\.clear$/i.test(path)) process.exit(0);

  // Compute the post-edit content
  let content = '';
  if (tool === 'Write') {
    content = input.content || '';
  } else {
    if (!existsSync(path)) process.exit(0);
    let cur;
    try {
      cur = readFileSync(path, 'utf8');
    } catch {
      process.exit(0);
    }
    const oldStr = input.old_string || '';
    const newStr = input.new_string || '';
    if (input.replace_all) {
      content = cur.split(oldStr).join(newStr);
    } else {
      const idx = cur.indexOf(oldStr);
      if (idx < 0) process.exit(0); // can't apply -> fail open, the Edit itself will fail
      content = cur.slice(0, idx) + newStr + cur.slice(idx + oldStr.length);
    }
  }

  if (!content || content.length < 20) process.exit(0);

  // ── 1. Pull every nav item's target route ─────────────────────────────
  // `nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'`
  // → captures label='Pending', route='/cro'
  const navItems = [];
  const navRe = /^\s*nav\s+item\s+['"]([^'"]+)['"]\s+to\s+['"]([^'"]+)['"]/gim;
  let m;
  while ((m = navRe.exec(content)) !== null) {
    navItems.push({
      label: m[1],
      route: m[2],
      line: lineNumberAt(content, m.index),
    });
  }
  if (navItems.length === 0) process.exit(0); // no nav, nothing to check

  // ── 2. Pull every page declaration's route ────────────────────────────
  // `page 'CRO Review' at '/cro':`
  // → route='/cro'
  const pages = [];
  const pageRe = /^[ \t]*page\s+['"]([^'"]+)['"]\s+at\s+['"]([^'"]+)['"]\s*:/gm;
  while ((m = pageRe.exec(content)) !== null) {
    pages.push({
      title: m[1],
      route: normalizeRoute(m[2]),
      line: lineNumberAt(content, m.index),
      bodyStart: m.index + m[0].length,
    });
  }

  const pageRoutes = new Map();
  for (const p of pages) {
    pageRoutes.set(p.route, p);
  }

  // Mark which page bodies contain a `TBD` marker — those are explicit
  // Lean-Lesson-1 stubs and count as "deliberately unfinished, not silent."
  for (let i = 0; i < pages.length; i++) {
    const start = pages[i].bodyStart;
    const end = i + 1 < pages.length ? pages[i + 1].bodyStart : content.length;
    const body = content.slice(start, end);
    pages[i].isTbdStub = /(^|\s)TBD(\s|$)/.test(body);
  }

  // ── 3. For each nav item, decide stub vs. real ────────────────────────
  const stubs = [];
  for (const nav of navItems) {
    const raw = nav.route;
    if (!raw) continue;
    if (raw === '#') continue; // bare anchor, intentional no-op
    if (/^[a-z]+:/i.test(raw) && !raw.startsWith('/')) continue; // external (http:, mailto:, tel:, javascript:)
    const norm = normalizeRoute(raw);
    if (!norm || norm === '#') continue;
    if (norm.startsWith('/api/') || norm === '/api') continue; // API URLs aren't pages
    if (norm.startsWith('/auth/') || norm === '/auth') continue;
    if (norm.startsWith('/__meph__')) continue;
    if (!pageRoutes.has(norm)) {
      stubs.push({ ...nav, normRoute: norm });
    }
  }

  if (stubs.length === 0) process.exit(0); // every nav item resolves -> allow

  // ── 4. Build the deny message ─────────────────────────────────────────
  const offenderLines = stubs.slice(0, 8).map(s =>
    `  - line ${s.line}: nav item '${s.label}' → '${s.route}' (no \`page ... at '${s.normRoute}':\` declared)`
  );
  const more = stubs.length > 8 ? `\n  (+${stubs.length - 8} more)` : '';

  const example = stubs[0];
  const reason =
    `NO-STUB-NAV rule (Russell, 2026-04-28): this Clear app has ${stubs.length} ` +
    `nav item${stubs.length === 1 ? '' : 's'} that point to ${stubs.length === 1 ? 'a route' : 'routes'} with no page.\n\n` +
    offenderLines.join('\n') + more +
    `\n\nA button that goes to a URL returning nothing is a silent failure. ` +
    `Every nav item must either:\n` +
    `  (a) Reach a real page  →  add\n` +
    `        page '${example.label}' at '${example.normRoute}':\n` +
    `          # ... real content here\n` +
    `  (b) Be an explicit stub  →  add\n` +
    `        page '${example.label}' at '${example.normRoute}':\n` +
    `          TBD\n\n` +
    `TBD is the Lean Lesson 1 placeholder — compiles green, ` +
    `runtime says "placeholder hit at line N — fill it in or remove it" ` +
    `if a user actually navigates to the stub. Tests that exercise the stub ` +
    `report SKIPPED (not FAILED). The point: stubs must be visible, never silent.\n\n` +
    `Either build the missing pages or mark them TBD, then retry the write.`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    }
  }));
}

function normalizeRoute(raw) {
  if (!raw) return '';
  let r = String(raw).trim();
  if (r === '#') return '#';
  if (r.startsWith('#/')) r = r.slice(1);
  if (/^[a-z]+:/i.test(r) && !r.startsWith('/')) return r.toLowerCase();
  r = r.split('?')[0].split('#')[0];
  if (!r.startsWith('/')) r = '/' + r;
  r = r.replace(/\/+$/, '') || '/';
  return r.toLowerCase();
}

function lineNumberAt(content, idx) {
  return content.slice(0, Math.max(0, idx)).split('\n').length;
}

main();
