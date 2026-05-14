// =============================================================================
// CLEAR LANGUAGE — SPA `app X with panes` TEST SUITE
// =============================================================================
//
// New primitive: `app 'Name' at '/': pane 'X' as 'route': ...`
//
// Emits a single HTML shell + client-side router instead of one HTML file
// per page. Pane switches happen via History API + show/hide; no full-page
// reload. The "internal tool that feels like Linear" tier.
//
// Solves the multi-page flicker that bit Lenat-clear: every nav click
// today is a full HTTP round-trip + page replace, losing client state and
// flashing empty content. With this primitive, all panes live in one
// shell and switching is instant.
//
// Three things land in this phase:
//   1. Parser: recognize `app 'X' at '/': pane 'Y' as 'route': ...`
//      → APP_BLOCK node with .panes array of PANE nodes.
//   2. Validator: every pane must declare a route slug; routes must be
//      unique within the app.
//   3. Compile (HTML + reactive JS): when source has an APP_BLOCK, emit
//      a single index.html with all pane templates + a client-side router
//      that swaps pane visibility on nav. Skip the per-pane HTML emit
//      that PAGE blocks normally produce.
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

// =============================================================================
// CYCLE 11.1 — parser: `app 'X' at '/': pane 'Y' as 'route': ...`
// =============================================================================
describe('SPA app primitive — parse baseline (Cycle 11.1)', () => {
  it('parses `app X at \'/\' : pane Y as \'route\' :` to an APP_BLOCK node with .panes', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "  pane 'Chat' as 'chat':",
      "    heading 'Chat'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const app = result.ast.body.find(n => n.type === 'app_block');
    expect(app).toBeTruthy();
    expect(app.name).toBe('Lenat');
    expect(app.route).toBe('/');
    expect(app.panes.length).toBe(2);
    expect(app.panes[0].name).toBe('Today');
    expect(app.panes[0].route).toBe('today');
    expect(app.panes[1].name).toBe('Chat');
    expect(app.panes[1].route).toBe('chat');
  });

  it('panes carry their own body so nav switches show different content', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "    text 'Energy and mood'",
      "  pane 'Map' as 'map':",
      "    heading 'Map'",
    ].join('\n');
    const result = compileProgram(source);
    const app = result.ast.body.find(n => n.type === 'app_block');
    expect(app.panes[0].body.length).toBeGreaterThan(0);
    expect(app.panes[1].body.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// CYCLE 11.2 — validator: panes must have unique routes
// =============================================================================
describe('SPA app primitive — validator (Cycle 11.2)', () => {
  it('errors when two panes share the same route slug', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "  pane 'Today Two' as 'today':",
      "    heading 'Duplicate'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors.length).toBeGreaterThan(0);
    const msg = result.errors.map(e => e.message).join(' | ');
    expect(msg.toLowerCase()).toMatch(/duplicate.*route|already.*route|route.*today/);
  });

  it('does NOT error when routes are distinct', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "  pane 'Chat' as 'chat':",
      "    heading 'Chat'",
    ].join('\n');
    const result = compileProgram(source);
    const dupErr = result.errors.find(e => /duplicate.*route/i.test(e.message || ''));
    expect(dupErr).toBeUndefined();
  });
});

// =============================================================================
// CYCLE 11.3 — HTML emit: single shell + all pane templates + nav
// =============================================================================
describe('SPA app primitive — HTML emit (Cycle 11.3)', () => {
  it('emits a single HTML shell with all pane templates wrapped in [data-pane]', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "  pane 'Chat' as 'chat':",
      "    heading 'Chat'",
    ].join('\n');
    const result = compileProgram(source);
    const html = result.html || '';
    // Each pane lives inside a [data-pane="route"] wrapper so the router
    // can toggle visibility by slug.
    expect(html).toContain('data-pane="today"');
    expect(html).toContain('data-pane="chat"');
  });

  it('emits a client-side router that listens for nav clicks + popstate', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
    ].join('\n');
    const result = compileProgram(source);
    const html = result.html || '';
    // The router uses history.pushState for in-app nav, popstate for back.
    expect(html).toContain('history.pushState');
    expect(html).toContain('popstate');
  });

  it('default-shows the first pane on initial load', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "  pane 'Chat' as 'chat':",
      "    heading 'Chat'",
    ].join('\n');
    const result = compileProgram(source);
    const html = result.html || '';
    // Either an inline init script that activates the first pane by slug,
    // or [data-active] / display:block on the first pane wrapper.
    expect(html).toMatch(/data-active="today"|activatePane\(['"]today['"]\)|setActivePane\(['"]today['"]\)/);
  });
});
