/*
UAT Contract — smoke tests for the JSON contract attached to compileProgram.
Cherry-picked from a 2026-04-27 Codex stash; updated 2026-04-28 for the
richer shape (table-interaction + drilldown controls, source-page tracking,
versioned envelope, routes-as-array).

These tests cover the basic shape of the contract — pages, routes, controls,
API calls — plus a smoke test for the browser test generator.
*/

import { describe, it, expect, run } from '../lib/testUtils.js';
import { compileProgram } from '../index.js';
import {
  normalizeUATRoute,
  isInternalUATRoute,
  stableUatId,
  generateUATContract,
  generateBrowserUAT,
} from './uat-contract.js';

describe('uat-contract.normalizeUATRoute', () => {
  it('strips trailing slashes', () => {
    expect(normalizeUATRoute('/foo/')).toBe('/foo');
    expect(normalizeUATRoute('/foo//')).toBe('/foo');
  });

  it('treats empty path as empty', () => {
    expect(normalizeUATRoute('')).toBe('');
    expect(normalizeUATRoute(null)).toBe('');
    expect(normalizeUATRoute(undefined)).toBe('');
  });

  it('treats hash-only as #', () => {
    expect(normalizeUATRoute('#')).toBe('#');
  });

  it('strips hash routes (SPA hash form) to plain paths', () => {
    expect(normalizeUATRoute('#/foo')).toBe('/foo');
  });

  it('preserves absolute URLs', () => {
    expect(normalizeUATRoute('https://example.com/x')).toBe('https://example.com/x');
  });

  it('adds leading slash if missing', () => {
    expect(normalizeUATRoute('foo')).toBe('/foo');
  });

  it('drops query strings', () => {
    expect(normalizeUATRoute('/foo?bar=1')).toBe('/foo');
  });
});

describe('uat-contract.isInternalUATRoute', () => {
  it('treats / as internal', () => {
    expect(isInternalUATRoute('/')).toBe(true);
  });

  it('treats /api routes as NOT internal (they are backend, not pages)', () => {
    expect(isInternalUATRoute('/api/users')).toBe(false);
  });

  it('treats /auth as NOT internal', () => {
    expect(isInternalUATRoute('/auth/login')).toBe(false);
  });

  it('treats external https URLs as NOT internal', () => {
    expect(isInternalUATRoute('https://example.com')).toBe(false);
  });

  it('treats meph widget routes as NOT internal', () => {
    expect(isInternalUATRoute('/__meph__/api/x')).toBe(false);
  });
});

describe('uat-contract.stableUatId', () => {
  it('produces a stable id from kind + line + label', () => {
    const id = stableUatId('button', 42, 'Approve');
    expect(id).toContain('button');
    expect(id).toContain('42');
    expect(id).toContain('Approve');
  });

  it('handles missing label', () => {
    const id = stableUatId('button', 42, null);
    expect(id).toContain('button');
  });

  it('sanitises non-alphanumeric characters', () => {
    const id = stableUatId('button', 1, 'Save & Continue!');
    expect(id).not.toContain('&');
    expect(id).not.toContain('!');
  });
});

describe('generateUATContract — smoke', () => {
  it('returns the empty shape on null/empty input', () => {
    const c = generateUATContract([]);
    expect(c.version).toBe(1);
    expect(c.pages).toEqual([]);
    expect(c.routes).toEqual([]);
    expect(c.controls).toEqual([]);
    expect(c.apiCalls).toEqual([]);
    expect(c.warnings).toEqual([]);
    expect(c.errors).toEqual([]);
    expect(c.app.hasWebTarget).toBe(false);
    expect(c.app.hasBackendTarget).toBe(false);
  });

  it('attaches to compileProgram result on a real app', () => {
    const src = `build for web and javascript backend
database is local memory

create a Users table:
  name

when user requests data from /api/users:
  send back all Users

page 'Home' at '/':
  on page load:
    get users from '/api/users'
  display users as table showing name`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    expect(r.uatContract).toBeTruthy();
    expect(r.uatContract.version).toBe(1);
    expect(r.uatContract.app.hasWebTarget).toBe(true);
    expect(r.uatContract.app.hasBackendTarget).toBe(true);
    expect(r.uatContract.pages.length).toBe(1);
    expect(r.uatContract.pages[0].route).toBe('/');
    expect(r.uatContract.pages[0].selector).toBe('[data-clear-page-route="/"]');
    const homeRoute = r.uatContract.routes.find(rt => rt.path === '/');
    expect(homeRoute).toBeTruthy();
    expect(homeRoute.directLoad).toBe(true);
  });

  it('attaches even on queue-primitive apps (auto-emitted endpoints not in AST)', () => {
    const src = `build for web and javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
page 'CRO' at '/cro':
  on page load:
    get pending from '/api/deals/queue'
  display pending as table showing customer, status`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    expect(r.uatContract).toBeTruthy();
    expect(r.uatContract.pages.length).toBe(1);
    expect(r.uatContract.pages[0].route).toBe('/cro');
  });

  it('detects api calls (page-load fetch)', () => {
    const src = `build for web and javascript backend
database is local memory
create a Users table:
  name
page 'Home' at '/':
  on page load:
    get users from '/api/users'
  display users as table showing name`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    const apiPaths = r.uatContract.apiCalls.map(a => a.path);
    expect(apiPaths.includes('/api/users')).toBe(true);
  });

  it('records every declared endpoint as an apiCall', () => {
    const src = `build for javascript backend
database is local memory
create a Users table:
  name
when user requests data from /api/users:
  send back all Users`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    const apiPaths = r.uatContract.apiCalls.map(a => a.path);
    expect(apiPaths.includes('/api/users')).toBe(true);
  });

  it('survives compile errors without crashing', () => {
    const src = "this is not clear code";
    const r = compileProgram(src);
    expect(r.uatContract === null || typeof r.uatContract === 'object').toBe(true);
  });

  it('surfaces table-interaction controls for every page-level table', () => {
    const src = `build for web and javascript backend
database is local memory
create a Deals table:
  customer
page 'Home' at '/':
  on page load:
    get all_deals from '/api/deals'
  display all_deals as table showing customer`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    const tables = r.uatContract.controls.filter(c => c.kind === 'table-interaction');
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0].action.type).toBe('table-interaction');
    expect(tables[0].action.filterSelector).toContain('data-clear-table-filter-for');
  });
});

describe('generateBrowserUAT — smoke', () => {
  it('returns null for an empty contract (no pages)', () => {
    const empty = generateUATContract([]);
    expect(generateBrowserUAT(empty)).toBe(null);
  });

  it('returns a runnable Playwright script for a real app', () => {
    const src = `build for web and javascript backend
database is local memory
create a Users table:
  name
page 'Home' at '/':
  on page load:
    get users from '/api/users'
  display users as table showing name`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    const script = generateBrowserUAT(r.uatContract);
    expect(typeof script).toBe('string');
    expect(script).toContain('#!/usr/bin/env node');
    expect(script).toContain('playwright');
    expect(script).toContain('CONTRACT');
    expect(script).toContain('Direct route:');
    expect(script).toContain('captureRouteScreenshot');
    expect(script).toContain('assertNoPageOverflow');
    expect(script).toContain('assertPersistentShell');
    expect(script).toContain("data-clear-page-route");
  });

  it('attaches result.browserUAT on apps with at least one page', () => {
    const src = `build for web
page 'Home' at '/':
  text 'Hello'`;
    const r = compileProgram(src);
    expect(r.errors.length).toBe(0);
    expect(typeof r.browserUAT).toBe('string');
    expect(r.browserUAT).toContain('Browser UAT');
  });
});

run();
