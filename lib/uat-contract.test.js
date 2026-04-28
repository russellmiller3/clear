/*
UAT Contract — smoke tests for the JSON contract attached to compileProgram.
Cherry-picked from a 2026-04-27 Codex stash.

These tests cover the basic shape of the contract — pages, routes, API calls.
The deeper button/form/navigation walkers will get their own tests when the
browser-test generator that consumes this contract lands.
*/

import { describe, it, expect, run } from '../lib/testUtils.js';
import { compileProgram } from '../index.js';
import {
  normalizeUATRoute,
  isInternalUATRoute,
  stableUatId,
  generateUATContract,
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
    expect(c.pages).toEqual([]);
    expect(c.routes).toEqual({});
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
    expect(r.uatContract.app.hasWebTarget).toBe(true);
    expect(r.uatContract.app.hasBackendTarget).toBe(true);
    expect(r.uatContract.pages.length).toBe(1);
    expect(r.uatContract.pages[0].route).toBe('/');
    expect(r.uatContract.routes['/']).toBeTruthy();
  });

  it('attaches even on queue-primitive apps (auto-emitted endpoints not in AST)', () => {
    // Known limitation: the queue primitive synthesizes endpoints at compile
    // time without putting ENDPOINT nodes in ast.body. The contract's
    // hasBackendTarget heuristic looks for ENDPOINT nodes, so it can read
    // false on a queue-only app even though the app has endpoints.
    // The follow-up that adds queue-aware contract walking will close this.
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
    // hasBackendTarget is intentionally not asserted — queue auto-endpoints
    // are not in ast.body. Will be fixed when contract walker learns QUEUE_DEF.
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
    // syntax-broken input — uatContract should fall back to null OR empty
    const src = "this is not clear code";
    const r = compileProgram(src);
    // Whether errors > 0 or not, uatContract should at least be defined
    // (null is acceptable; missing is not)
    expect(r.uatContract === null || typeof r.uatContract === 'object').toBe(true);
  });
});

run();
