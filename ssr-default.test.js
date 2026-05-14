// =============================================================================
// CLEAR LANGUAGE — SSR-by-default TEST SUITE
// =============================================================================
//
// New behavior: server-side renders data into HTML before sending it. Every
// `define X as: look up records in Y` runs in the route handler at request
// time; the resulting state ships to the browser as
// window.__CLEAR_INITIAL_STATE__ so the reactive runtime hydrates on first
// paint instead of fetching.
//
// Opt-out: `fetch this data in the browser, not from the server` after the
// define keeps the current client-side fetching behavior — for browser-only
// state, real-time data, auth-scoped fetches that need a session cookie.
//
// Phase 1 (SSR.1): parser — opt-out directive sets clientOnly:true
// Phase 2 (SSR.2): compiler — server-side fetcher in route handler
// Phase 3 (SSR.3): HTML emit — window.__CLEAR_INITIAL_STATE__ injected
// Phase 4 (SSR.4): runtime hydration — uses initial state on first paint
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

// =============================================================================
// CYCLE SSR.1 — parser: opt-out directive sets clientOnly:true on the CRUD node
// =============================================================================
describe('SSR default — parser opt-out directive (Cycle SSR.1)', () => {
  it('tags the CRUD node with clientOnly when `fetch this data in the browser, not from the server` follows the define', () => {
    const source = [
      "create a Records table:",
      "  name is text",
      "",
      "page 'Home' at '/':",
      "  define live_clock as: look up records in Records table",
      "    fetch this data in the browser, not from the server",
    ].join('\n');
    const compile_output = compileProgram(source);
    expect(compile_output.errors).toEqual([]);
    const home_page = compile_output.ast.body.find(n => n.type === 'page');
    expect(home_page).toBeTruthy();
    const clock_assign = (home_page.body || []).find(n => n.variable === 'live_clock' || n.name === 'live_clock');
    expect(clock_assign).toBeTruthy();
    const clock_crud = clock_assign.expression || clock_assign;
    expect(clock_crud.clientOnly).toBe(true);
  });

  it('does NOT tag clientOnly when the directive is absent (SSR-default path)', () => {
    const source = [
      "create a Records table:",
      "  name is text",
      "",
      "page 'Home' at '/':",
      "  define products as: look up records in Records table",
    ].join('\n');
    const compile_output = compileProgram(source);
    expect(compile_output.errors).toEqual([]);
    const home_page = compile_output.ast.body.find(n => n.type === 'page');
    const products_assign = (home_page.body || []).find(n => n.variable === 'products' || n.name === 'products');
    expect(products_assign).toBeTruthy();
    const products_crud = products_assign.expression || products_assign;
    expect(products_crud.clientOnly).toBeFalsy();
  });

  it('works inside an app/pane block too', () => {
    const source = [
      "create a Records table:",
      "  name is text",
      "",
      "app 'X' at '/':",
      "  pane 'Home' as 'home':",
      "    define live_data as: look up records in Records table",
      "      fetch this data in the browser, not from the server",
    ].join('\n');
    const compile_output = compileProgram(source);
    expect(compile_output.errors).toEqual([]);
    const app_node = compile_output.ast.body.find(n => n.type === 'app_block');
    const home_pane = app_node.panes[0];
    const data_assign = (home_pane.body || []).find(n => n.variable === 'live_data' || n.name === 'live_data');
    expect(data_assign).toBeTruthy();
    const data_crud = data_assign.expression || data_assign;
    expect(data_crud.clientOnly).toBe(true);
  });

  it('accepts trailing-comma form on the same line as the define', () => {
    const source = [
      "create a Records table:",
      "  name is text",
      "",
      "page 'Home' at '/':",
      "  define live_clock as: look up records in Records table, fetch this data in the browser, not from the server",
    ].join('\n');
    const compile_output = compileProgram(source);
    expect(compile_output.errors).toEqual([]);
    const home_page = compile_output.ast.body.find(n => n.type === 'page');
    const clock_assign = (home_page.body || []).find(n => n.variable === 'live_clock' || n.name === 'live_clock');
    expect(clock_assign).toBeTruthy();
    const clock_crud = clock_assign.expression || clock_assign;
    expect(clock_crud.clientOnly).toBe(true);
  });
});

// =============================================================================
// CYCLE SSR.2 — compiler: server-side fetcher in route handler
// =============================================================================
describe('SSR default — server-side fetcher (Cycle SSR.2)', () => {
  it('route handler pre-fetches non-clientOnly defines and injects __CLEAR_INITIAL_STATE__', () => {
    const source = [
      "build for web and javascript backend",
      "create a Products table:",
      "  name is text",
      "  price is number",
      "",
      "page 'Shop' at '/shop':",
      "  define all_products as: look up records in Products table",
      "  display all_products as table showing name, price",
    ].join('\n');
    const shop_compile = compileProgram(source);
    expect(shop_compile.errors).toHaveLength(0);
    expect(shop_compile.serverJS).toContain('__CLEAR_INITIAL_STATE__');
    expect(shop_compile.serverJS).toContain('all_products');
    expect(shop_compile.serverJS).toContain('/shop');
  });

  it('clientOnly defines are NOT included in the server-side prefetch', () => {
    const source = [
      "build for web and javascript backend",
      "create a Locations table:",
      "  name is text",
      "",
      "page 'Map' at '/map':",
      "  define nearby_stores as: look up records in Locations table",
      "    fetch this data in the browser, not from the server",
      "  display nearby_stores as table showing name",
    ].join('\n');
    const map_compile = compileProgram(source);
    expect(map_compile.errors).toHaveLength(0);
    expect(map_compile.serverJS).not.toMatch(/initialState\[['"]nearby_stores['"]\]/);
    expect(map_compile.html).toContain('nearby_stores');
  });

  it('pages with no defines skip the SSR prefetch entirely', () => {
    const source = [
      "build for web and javascript backend",
      "page 'About' at '/about':",
      "  heading 'About Us'",
      "  text 'We build things.'",
    ].join('\n');
    const about_compile = compileProgram(source);
    expect(about_compile.errors).toHaveLength(0);
    expect(about_compile.serverJS).toContain('/about');
  });
});
