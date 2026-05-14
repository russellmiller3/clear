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

  // Regression: 2026-05-14 — an app block + an endpoint inferred target='backend'
  // because target inference only knew about PAGE nodes. Result: no HTML emit, no
  // index.html on disk, and the compiled server.js had no UI to serve. Now an
  // APP_BLOCK + endpoint correctly infers 'both'.
  it('infers target=both for app block + endpoint combo (no PAGE needed)', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "",
      "when user calls DELETE /api/x/:id:",
      "  send back 'ok'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    expect(typeof result.html).toBe('string');
    expect(result.html.length).toBeGreaterThan(0);
    expect(typeof result.serverJS).toBe('string');
    expect(result.serverJS.length).toBeGreaterThan(0);
  });

  // Regression: 2026-05-14 — backend compile path had no APP_BLOCK case in the
  // compileNode dispatch. server.js emit produced a "compiler gap" stub that
  // crashed the server at startup with `console.log((() => throw new Error...
  it('compiles app block to backend without crashing (no compiler-gap stub)', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "",
      "when user calls DELETE /api/x/:id:",
      "  send back 'ok'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    expect(result.serverJS).not.toContain('compiler gap');
    expect(result.serverJS).not.toContain('no exprToCode case for expression type "app_block"');
  });

  // Regression: 2026-05-14 — SPA route registration only looked at PAGE nodes,
  // so the server had no GET / handler when source had only APP_BLOCK. Result:
  // 404 Cannot GET / on every request. Now app + every pane slug registers.
  it('registers GET routes for the app root + every pane slug', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "  pane 'Chat' as 'chat':",
      "    heading 'Chat'",
      "",
      "when user calls DELETE /api/x/:id:",
      "  send back 'ok'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    expect(result.serverJS).toMatch(/app\.get\("\/", \(req, res\) => res\.sendFile/);
    expect(result.serverJS).toMatch(/app\.get\("\/today", \(req, res\) => res\.sendFile/);
    expect(result.serverJS).toMatch(/app\.get\("\/chat", \(req, res\) => res\.sendFile/);
  });

  // Cycle 12 — shared sidebar block at the app level (2026-05-14). Lenat-clear's
  // pre-refactor pages.clear duplicated the sidebar 8 times across page blocks;
  // after SPA refactor it still duplicates 8 times across pane blocks. The
  // `sidebar:` block lets the app declare the sidebar ONCE; the HTML emit
  // wraps it next to the pane container so every pane shares the same chrome.
  describe('SPA app primitive — shared sidebar block (Cycle 12)', () => {
    it('parses `sidebar:` as a sibling of pane declarations inside `app`', () => {
      const source = [
        "app 'Lenat' at '/':",
        "  sidebar:",
        "    heading 'Lenat'",
        "    nav section 'Surface':",
        "      nav item 'Today' to '/today'",
        "  pane 'Today' as 'today':",
        "    heading 'Today'",
        "  pane 'Chat' as 'chat':",
        "    heading 'Chat'",
      ].join('\n');
      const result = compileProgram(source);
      expect(result.errors).toEqual([]);
      const app = result.ast.body.find(n => n.type === 'app_block');
      expect(app).toBeTruthy();
      expect(Array.isArray(app.sidebar)).toBe(true);
      expect(app.sidebar.length).toBeGreaterThan(0);
      expect(app.panes.length).toBe(2);
    });

    it('emits the sidebar once in HTML output (not per pane)', () => {
      const source = [
        "app 'Lenat' at '/':",
        "  sidebar:",
        "    heading 'Lenat sidebar'",
        "  pane 'Today' as 'today':",
        "    heading 'Today'",
        "  pane 'Chat' as 'chat':",
        "    heading 'Chat'",
      ].join('\n');
      const result = compileProgram(source);
      expect(result.errors).toEqual([]);
      // The sidebar heading should appear exactly ONCE in the rendered HTML
      const sidebarHeadingCount = (result.html.match(/Lenat sidebar/g) || []).length;
      expect(sidebarHeadingCount).toBe(1);
    });

    it('does NOT require a sidebar — app without one still works', () => {
      const source = [
        "app 'Lenat' at '/':",
        "  pane 'Today' as 'today':",
        "    heading 'Today'",
      ].join('\n');
      const result = compileProgram(source);
      expect(result.errors).toEqual([]);
      const app = result.ast.body.find(n => n.type === 'app_block');
      expect(app.sidebar).toBeFalsy();
    });
  });

  // Regression: 2026-05-14 — comments between panes inside an app block
  // tokenized as content and tripped the "expected pane" error path. The
  // parser now skips COMMENT-type leading tokens silently.
  it('allows # comments between pane declarations', () => {
    const source = [
      "app 'Lenat' at '/':",
      "  # Comment header above the first pane",
      "  pane 'Today' as 'today':",
      "    heading 'Today'",
      "",
      "  # Comment between panes describing the next surface",
      "  # second comment line — multi-line block-comment style",
      "  pane 'Map' as 'map':",
      "    heading 'Map'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const app = result.ast.body.find(n => n.type === 'app_block');
    expect(app.panes.length).toBe(2);
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

  it('sparkline showing X taking field emits a data-sparkline-source attribute', () => {
    // Data-driven sparkline shape — replaces the hardcoded `[1,2,3]` shape
    // for production use. The compiler emits a placeholder SVG with the
    // source variable name as a data-attribute; a client-side helper
    // walks every such SVG and fills it with a polyline from the runtime value.
    const source = [
      "page 'Today' at '/':",
      "  stat strip:",
      "    stat card 'Energy':",
      "      value 7",
      "      sparkline showing energy_logs taking 'level'",
      "      icon 'battery-medium'",
    ].join('\n');
    const result = compileProgram(source);
    const html = result.html || result.javascript || '';
    expect(html).toContain('data-sparkline-source="energy_logs"');
    expect(html).toContain('data-sparkline-field="level"');
  });

  it('sparkline VAR shorthand (no `showing`) also emits the data-source', () => {
    const source = [
      "page 'Today' at '/':",
      "  stat strip:",
      "    stat card 'Energy':",
      "      value 7",
      "      sparkline energy_logs",
      "      icon 'battery-medium'",
    ].join('\n');
    const result = compileProgram(source);
    const html = result.html || result.javascript || '';
    expect(html).toContain('data-sparkline-source="energy_logs"');
  });

  it('sparkline [1, 2, 3] literal still renders server-side as a polyline', () => {
    // Backward-compat — literal numeric arrays still bake the polyline into
    // the SVG at compile time (no client-side fetch needed).
    const source = [
      "page 'Today' at '/':",
      "  stat strip:",
      "    stat card 'Energy':",
      "      value 7",
      "      sparkline [5, 6, 4, 7, 6, 8, 7]",
      "      icon 'battery-medium'",
    ].join('\n');
    const result = compileProgram(source);
    const html = result.html || result.javascript || '';
    expect(html).toContain('<polyline');
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
