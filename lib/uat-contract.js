/*
UAT Contract — extract a JSON description of every interactive surface in a
compiled Clear program. The contract is the discriminator the test generator
runs against: every page, every route, every button, every form, every link,
every API call, every table sort/filter, every detail-panel drilldown.

Cherry-picked from a Codex stash (2026-04-27) — the richer walker that pairs
with the browser-driven test generator. Adds table-interaction + drilldown
controls, page selectors, source-page tracking, and a versioned envelope.

The browser test generator (generateBrowserUAT) consumes this contract to
emit a runnable Playwright script. See AI-INSTRUCTIONS.md for the lifecycle.

Inputs:
  body — ast.body from `parse(source)` (already validated)

Output shape:
  {
    version: 1,
    generatedAt: 'compile-time-static',
    app:      { hasWebTarget, hasBackendTarget },
    pages:    [{ id, title, route, line, expectedText, routeSpecificText, selector }],
    routes:   [{ path, pageId, directLoad }],
    controls: [{ id, kind, label, line, sourcePageRoute, selector, action, expected }],
    apiCalls: [{ method, path, line, usedByControlIds }],
    warnings: [],
    errors:   [{ line, code, message }]
  }

Use `result.uatContract` from `compileProgram(source).uatContract`.
*/

import { NodeType } from '../parser.js';

function sanitizeName(name) {
  if (name == null) return '_unnamed';
  if (name.includes('.')) {
    return name.split('.').map(part => part.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1')).join('.');
  }
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

export function normalizeUATRoute(path) {
  const raw = String(path == null ? '' : path).trim();
  if (!raw) return '';
  if (raw === '#') return '#';
  if (raw.startsWith('#/')) return normalizeUATRoute(raw.slice(1));
  if (raw.startsWith('#')) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  const noQuery = raw.split('?')[0].split('#')[0];
  const withSlash = noQuery.startsWith('/') ? noQuery : '/' + noQuery;
  return withSlash.replace(/\/+$/, '') || '/';
}

export function isInternalUATRoute(path) {
  const route = normalizeUATRoute(path);
  if (!route || route === '#') return false;
  if (!route.startsWith('/')) return false;
  return !route.startsWith('/api/') && route !== '/api' &&
    !route.startsWith('/auth/') && route !== '/auth' &&
    !route.startsWith('/__meph__/') && route !== '/__meph__';
}

export function stableUatId(kind, line, label) {
  const rawKind = String(kind || 'control').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
  const rawLabel = String(label || rawKind).replace(/\s+/g, '_');
  return `${rawKind}_${line || 0}_${sanitizeName(rawLabel)}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function collectUATVisibleText(nodes, out = []) {
  for (const node of nodes || []) {
    if (!node) continue;
    if (node.type === NodeType.CONTENT) {
      const text = node.ui?.text ?? node.text;
      if (text) out.push(String(text));
    }
    if (node.type === NodeType.PAGE_HEADER) {
      if (node.title) out.push(String(node.title));
      if (node.subtitle) out.push(String(node.subtitle));
    }
    if (node.type === NodeType.STAT_CARD && node.title) out.push(String(node.title));
    if (node.type === NodeType.CHART && node.title) out.push(String(node.title));
    if (node.type === NodeType.DISPLAY && node.ui?.label && node.ui.label !== 'Output') out.push(String(node.ui.label));
    if (Array.isArray(node.body)) collectUATVisibleText(node.body, out);
    if (Array.isArray(node.actions)) collectUATVisibleText(node.actions, out);
    if (Array.isArray(node.thenBranch)) collectUATVisibleText(node.thenBranch, out);
    if (Array.isArray(node.otherwiseBranch)) collectUATVisibleText(node.otherwiseBranch, out);
  }
  return out;
}

export function generateUATContract(body) {
  if (!Array.isArray(body)) return emptyContract();

  const pages = [];
  const routes = [];
  const controls = [];
  const apiCalls = [];
  const apiCallByPath = new Map();
  const errors = [];
  const warnings = [];
  const routeToPage = new Map();
  const flatNodesByRoute = new Map();
  const detailStateNames = new Set();
  const assignNodes = [];
  const detailDependentVars = new Set();

  function collectUATStateDeps(nodes) {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue;
      if (node.type === NodeType.DETAIL_PANEL && node.variable) detailStateNames.add(sanitizeName(node.variable));
      if (node.type === NodeType.ASSIGN && node.name && node.expression) assignNodes.push(node);
      if (Array.isArray(node.body)) collectUATStateDeps(node.body);
      if (Array.isArray(node.actions)) collectUATStateDeps(node.actions);
      if (Array.isArray(node.thenBranch)) collectUATStateDeps(node.thenBranch);
      if (Array.isArray(node.otherwiseBranch)) collectUATStateDeps(node.otherwiseBranch);
    }
  }

  function expressionUsesDetailState(expr, seen = new WeakSet()) {
    if (!expr || typeof expr !== 'object') return false;
    if (seen.has(expr)) return false;
    seen.add(expr);
    if (expr.type === NodeType.VARIABLE_REF) {
      const name = sanitizeName(expr.name || '');
      return detailStateNames.has(name) || detailDependentVars.has(name);
    }
    for (const [key, value] of Object.entries(expr)) {
      if (key === 'line' || key === 'column') continue;
      if (Array.isArray(value)) {
        if (value.some(item => expressionUsesDetailState(item, seen))) return true;
      } else if (value && typeof value === 'object' && expressionUsesDetailState(value, seen)) {
        return true;
      }
    }
    return false;
  }

  function rootVariableName(expr) {
    if (!expr) return null;
    if (expr.type === NodeType.VARIABLE_REF) return sanitizeName(expr.name || '');
    if (expr.type === NodeType.MEMBER_ACCESS) return rootVariableName(expr.object);
    return null;
  }

  collectUATStateDeps(body);
  let changedDep = true;
  while (changedDep) {
    changedDep = false;
    for (const assign of assignNodes) {
      const name = sanitizeName(assign.name || '');
      if (!name || detailDependentVars.has(name)) continue;
      if (expressionUsesDetailState(assign.expression)) {
        detailDependentVars.add(name);
        changedDep = true;
      }
    }
  }

  function flattenRouteNodes(nodes, currentPageRoute, out = []) {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue;
      if (node.type === NodeType.PAGE) {
        flattenRouteNodes(node.body || [], normalizeUATRoute(node.route || '/'), out);
        continue;
      }
      out.push(node);
      if (Array.isArray(node.body)) flattenRouteNodes(node.body, currentPageRoute, out);
      if (Array.isArray(node.actions)) flattenRouteNodes(node.actions, currentPageRoute, out);
      if (Array.isArray(node.thenBranch)) flattenRouteNodes(node.thenBranch, currentPageRoute, out);
      if (Array.isArray(node.otherwiseBranch)) flattenRouteNodes(node.otherwiseBranch, currentPageRoute, out);
    }
    return out;
  }

  // First pass — register every page (so addControl's expectedForTarget can resolve)
  for (const node of body) {
    if (!node || node.type !== NodeType.PAGE) continue;
    const route = normalizeUATRoute(node.route || '/');
    const pageId = sanitizeName(node.title || 'page');
    const visibleText = collectUATVisibleText(node.body || []);
    const expectedText = Array.from(new Set([node.title, ...visibleText].filter(Boolean).map(String)));
    if (routeToPage.has(route)) {
      errors.push({
        line: node.line || 0,
        code: 'UAT_DUPLICATE_ROUTE',
        message: `Two pages use ${route}. Each page route must be unique.`,
      });
    }
    const page = {
      id: pageId,
      title: node.title || 'Page',
      route,
      line: node.line || 0,
      expectedText,
      routeSpecificText: expectedText[0] || node.title || route,
      selector: `[data-clear-page-route="${route}"]`,
    };
    pages.push(page);
    routes.push({ path: route, pageId, directLoad: true });
    routeToPage.set(route, page);
    flatNodesByRoute.set(route, flattenRouteNodes(node.body || [], route, []));
  }

  function expectedForTarget(targetRoute) {
    const page = routeToPage.get(normalizeUATRoute(targetRoute));
    if (!page) return null;
    return {
      route: page.route,
      visiblePageId: page.id,
      visibleText: page.routeSpecificText || page.title,
    };
  }

  function addRouteError(code, control, suggestionKind) {
    const target = control.action?.targetRoute || '';
    errors.push({
      line: control.line || 0,
      code,
      message: `${suggestionKind} "${control.label}" points to ${target}, but no page exists at ${target}. Add page "${control.label}" at "${target}".`,
    });
  }

  function addControl(control) {
    if (control.action?.targetRoute) {
      control.action.targetRoute = normalizeUATRoute(control.action.targetRoute);
      control.expected = expectedForTarget(control.action.targetRoute);
    }
    controls.push(control);
  }

  function trackApiCall(method, path, line, controlId) {
    if (!path) return;
    const key = `${method}:${path}`;
    let entry = apiCallByPath.get(key);
    if (!entry) {
      entry = { method: String(method || 'GET').toUpperCase(), path, line: line || 0, usedByControlIds: [] };
      apiCallByPath.set(key, entry);
      apiCalls.push(entry);
    }
    if (controlId && !entry.usedByControlIds.includes(controlId)) entry.usedByControlIds.push(controlId);
  }

  function detailTargetForDisplay(displayNode, currentPageRoute) {
    const flat = flatNodesByRoute.get(normalizeUATRoute(currentPageRoute || '/')) || [];
    const start = flat.indexOf(displayNode);
    if (start < 0) return null;
    for (let idx = start + 1; idx < flat.length; idx++) {
      const next = flat[idx];
      if (next.type === NodeType.DISPLAY && next.format === 'table') return null;
      if (next.type === NodeType.DETAIL_PANEL) return sanitizeName(next.variable);
    }
    return null;
  }

  function collect(nodes, currentPageRoute = null, context = {}) {
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.type === NodeType.PAGE) {
        collect(node.body || [], normalizeUATRoute(node.route || '/'), {});
        continue;
      }

      // Top-level declared endpoints
      if (node.type === NodeType.ENDPOINT) {
        const method = String(node.method || 'GET').toUpperCase();
        trackApiCall(method, node.url || node.path || '', node.line || 0, null);
      }

      // Page-load and inline API calls
      if (node.type === NodeType.API_CALL) {
        const method = String(node.method || 'GET').toUpperCase();
        trackApiCall(method, node.url || node.path || '', node.line || 0, null);
      }

      if (node.type === NodeType.NAV_ITEM) {
        const id = stableUatId('nav_item', node.line, node.title);
        addControl({
          id,
          kind: 'nav-item',
          label: node.title || 'Nav item',
          line: node.line || 0,
          sourcePageRoute: currentPageRoute,
          selector: `[data-clear-uat-id="${id}"]`,
          action: { type: 'navigate', targetRoute: normalizeUATRoute(node.url || node.target || node.path || '') },
        });
      }

      if (node.type === NodeType.TAB_STRIP && Array.isArray(node.tabs)) {
        for (const tab of node.tabs) {
          const id = stableUatId('route_tab', tab.line || node.line, tab.title);
          addControl({
            id,
            kind: 'route-tab',
            label: tab.title || 'Tab',
            line: tab.line || node.line || 0,
            sourcePageRoute: currentPageRoute,
            selector: `[data-clear-uat-id="${id}"]`,
            action: { type: 'navigate', targetRoute: normalizeUATRoute(tab.route || tab.url || tab.path || '') },
          });
        }
      }

      if (node.type === NodeType.BUTTON && !node._chatAbsorbed) {
        const nav = (node.body || []).find(n => n && n.type === NodeType.NAVIGATE);
        const api = (node.body || []).find(n => n && n.type === NodeType.API_CALL);
        const id = stableUatId('button', node.line, node.label || node.ui?.label);
        if (nav) {
          addControl({
            id,
            kind: 'button',
            label: node.label || node.ui?.label || 'Button',
            line: node.line || 0,
            sourcePageRoute: currentPageRoute,
            selector: `[data-clear-uat-id="${id}"]`,
            action: { type: 'navigate', targetRoute: normalizeUATRoute(nav.target || nav.url || '') },
          });
        } else if (api) {
          const method = String(api.method || 'GET').toUpperCase();
          const path = api.url || api.path || '';
          addControl({
            id,
            kind: 'button',
            label: node.label || node.ui?.label || 'Button',
            line: node.line || 0,
            sourcePageRoute: currentPageRoute,
            selector: `[data-clear-uat-id="${id}"]`,
            action: { type: 'api-call', method, path },
          });
          trackApiCall(method, path, api.line || node.line || 0, id);
        } else if ((node.body || []).length > 0) {
          addControl({
            id,
            kind: 'button',
            label: node.label || node.ui?.label || 'Button',
            line: node.line || 0,
            sourcePageRoute: currentPageRoute,
            selector: `[data-clear-uat-id="${id}"]`,
            action: { type: 'state-change' },
          });
        }
      }

      if (node.type === NodeType.DISPLAY && node.format === 'table') {
        const outputId = node.ui?._resolvedId || node.ui?.id || `output_${sanitizeName(node.ui?.label || node.expression?.name || 'Table')}`;
        const label = node.ui?.label || node.expression?.name || 'Table';
        const tableRoot = rootVariableName(node.expression);
        const tableDependsOnDetail = expressionUsesDetailState(node.expression) || (tableRoot && detailDependentVars.has(tableRoot));
        if (!context.inDetailPanel && !tableDependsOnDetail) {
          addControl({
            id: stableUatId('table_interaction', node.line, label),
            kind: 'table-interaction',
            label,
            line: node.line || 0,
            sourcePageRoute: currentPageRoute,
            selector: `#${outputId}_table`,
            action: {
              type: 'table-interaction',
              filterSelector: `[data-clear-table-filter-for="${outputId}_table"]`,
              sortSelector: `#${outputId}_table th[data-sortable]`,
            },
          });
        }
        const detailTarget = detailTargetForDisplay(node, currentPageRoute);
        if (detailTarget) {
          addControl({
            id: stableUatId('table_drilldown', node.line, label),
            kind: 'table-drilldown',
            label,
            line: node.line || 0,
            sourcePageRoute: currentPageRoute,
            selector: `#${outputId}_table button[data-row-select="true"]`,
            action: { type: 'drilldown' },
            expected: { detailFor: detailTarget, detailSelector: `[data-detail-for="${detailTarget}"]` },
          });
        }
      }

      const childContext = node.type === NodeType.DETAIL_PANEL ? { ...context, inDetailPanel: true } : context;
      if (Array.isArray(node.body)) collect(node.body, currentPageRoute, childContext);
      if (Array.isArray(node.actions)) collect(node.actions, currentPageRoute, childContext);
      if (Array.isArray(node.thenBranch)) collect(node.thenBranch, currentPageRoute, childContext);
      if (Array.isArray(node.otherwiseBranch)) collect(node.otherwiseBranch, currentPageRoute, childContext);
    }
  }
  collect(body);

  // Error pass — every internal control target must resolve to a registered page
  for (const control of controls) {
    const target = control.action?.targetRoute;
    if (!target) continue;
    if (!isInternalUATRoute(target)) continue;
    if (routeToPage.has(target)) continue;
    if (control.kind === 'nav-item') addRouteError('UAT_NAV_TARGET_MISSING', control, 'Nav item');
    else if (control.kind === 'route-tab') addRouteError('UAT_TAB_TARGET_MISSING', control, 'Tab');
    else if (control.kind === 'button') addRouteError('UAT_BUTTON_TARGET_MISSING', control, 'Button');
  }

  return {
    version: 1,
    generatedAt: 'compile-time-static',
    app: { hasWebTarget: pages.length > 0, hasBackendTarget: body.some(n => n && n.type === NodeType.ENDPOINT) },
    pages,
    routes,
    controls,
    apiCalls,
    warnings,
    errors,
  };
}

function emptyContract() {
  return {
    version: 1,
    generatedAt: 'compile-time-static',
    app: { hasWebTarget: false, hasBackendTarget: false },
    pages: [],
    routes: [],
    controls: [],
    apiCalls: [],
    warnings: [],
    errors: [],
  };
}

/*
generateBrowserUAT — turn a UAT contract into a runnable Playwright script.

The script visits every page directly via its route, asserts the page is
visible + the persistent shell stays mounted + there's no horizontal page
overflow, screenshots each route, then clicks every nav / route-tab / button
that navigates to another page and asserts the right page comes up. It
exercises every table's sort + quick-filter and every row-click drilldown
into a detail panel.

Requires the `playwright` dev dep. If it's missing, the script logs a clear
"run npm install" message and exits non-zero.
*/
export function generateBrowserUAT(contract) {
  if (!contract || !Array.isArray(contract.pages) || contract.pages.length === 0) return null;
  const json = JSON.stringify(contract, null, 2);
  return `#!/usr/bin/env node
// Browser UAT — auto-generated by Clear compiler. Do not hand-edit.
// Contract version: ${contract.version || 1}
// Pages: ${contract.pages.length}, controls: ${contract.controls.length}, apiCalls: ${contract.apiCalls.length}

const BASE = process.env.TEST_URL || 'http://localhost:3000';
const CONTRACT = ${json};
const SCREENSHOT_DIR = process.env.CLEAR_UAT_SCREENSHOT_DIR || '.clear-uat-screenshots';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('PASS:', name);
  } catch (err) {
    failed += 1;
    const msg = err && err.message ? err.message : String(err);
    failures.push({ name, error: msg });
    console.log('FAIL:', name, '-', msg);
  }
}

function routeUrl(route) {
  return BASE + (route || '/');
}

function pageByRoute(route) {
  return CONTRACT.pages.find(p => p.route === route);
}

function screenshotName(spec) {
  const name = (spec.route || spec.title || 'route')
    .replace(/^\\/+/, 'root-')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return (name || 'root') + '.png';
}

async function captureRouteScreenshot(page, spec) {
  if (process.env.CLEAR_UAT_SCREENSHOTS === '0') return;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, screenshotName(spec));
  await page.screenshot({ path: file, fullPage: false });
  console.log('SHOT:', file);
}

async function assertVisiblePage(page, spec, label) {
  if (!spec) return;
  const selector = '[data-clear-page-route="' + spec.route + '"]';
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 3000 });
  if (spec.routeSpecificText) {
    const text = await el.innerText().catch(() => '');
    assert(text.includes(spec.routeSpecificText), label + ' expected page "' + spec.route + '" to show "' + spec.routeSpecificText + '".');
  }
}

async function assertNoPageOverflow(page, spec, label) {
  const layout = await page.evaluate(() => {
    const body = document.body;
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, body ? body.scrollWidth : 0);
    return { viewportWidth, scrollWidth, overflowX: scrollWidth - viewportWidth };
  });
  assert(layout.overflowX <= 2, label + ' has page-level horizontal overflow on ' + spec.route + ': viewport=' + layout.viewportWidth + ', scrollWidth=' + layout.scrollWidth);
}

async function assertPersistentShell(page, spec, label) {
  if (/^\\/(login|signup|auth)(\\/|$)/.test(spec.route || '')) return;
  const root = page.locator('[data-clear-shell-root="true"]');
  if (await root.count() === 0) return;
  await root.first().waitFor({ state: 'visible', timeout: 3000 });
  const outlet = page.locator('[data-clear-shell-outlet="true"]').first();
  if (await outlet.count() > 0) await outlet.waitFor({ state: 'visible', timeout: 3000 });
  const shellText = await root.first().innerText().catch(() => '');
  assert(shellText.length > 0, label + ' expected the app shell to stay visible.');
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  console.log('FAIL: Browser UAT setup — generated browser UAT requires the dev dependency "playwright". Run: npm install --save-dev playwright');
  process.exitCode = 1;
}

if (chromium) {
  const browser = await chromium.launch({ headless: process.env.CLEAR_UAT_HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !String(msg.text()).includes('favicon')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    for (const spec of CONTRACT.pages) {
      await test('Direct route: ' + spec.title, async () => {
        consoleErrors.length = 0;
        await page.goto(routeUrl(spec.route), { waitUntil: 'networkidle' });
        await assertVisiblePage(page, spec, 'Direct route ' + spec.title);
        await assertPersistentShell(page, spec, 'Direct route ' + spec.title);
        await assertNoPageOverflow(page, spec, 'Direct route ' + spec.title);
        await captureRouteScreenshot(page, spec);
        assert(consoleErrors.length === 0, 'Browser errors on ' + spec.route + ': ' + consoleErrors.join('; '));
      });
    }

    for (const control of CONTRACT.controls.filter(c => c.action && c.action.type === 'navigate' && c.expected)) {
      await test('Click ' + control.kind + ': ' + control.label, async () => {
        consoleErrors.length = 0;
        await page.goto(routeUrl(control.sourcePageRoute || CONTRACT.pages[0].route), { waitUntil: 'networkidle' });
        await page.locator('[data-clear-uat-id="' + control.id + '"]').first().click();
        await page.waitForTimeout(75);
        const expectedPage = pageByRoute(control.expected.route);
        await assertVisiblePage(page, expectedPage, 'Click ' + control.kind + ' "' + control.label + '" [clear:' + control.line + ']');
        await assertPersistentShell(page, expectedPage, 'Click ' + control.kind + ' "' + control.label + '" [clear:' + control.line + ']');
        assert(consoleErrors.length === 0, 'Browser errors after clicking ' + control.label + ': ' + consoleErrors.join('; '));
      });
    }

    for (const control of CONTRACT.controls.filter(c => c.action && c.action.type === 'table-interaction')) {
      await test('Use table controls: ' + control.label, async () => {
        consoleErrors.length = 0;
        await page.goto(routeUrl(control.sourcePageRoute || CONTRACT.pages[0].route), { waitUntil: 'networkidle' });
        const table = page.locator(control.selector).first();
        await table.waitFor({ state: 'visible', timeout: 3000 });
        const filter = page.locator(control.action.filterSelector).first();
        if (await filter.count() === 0) return;
        await filter.waitFor({ state: 'visible', timeout: 3000 });
        const rows = table.locator('tbody tr');
        const sortHeaders = page.locator(control.action.sortSelector);
        if (await sortHeaders.count() > 0) {
          const header = sortHeaders.first();
          await header.click();
          await page.waitForTimeout(75);
          const sortedClass = await header.getAttribute('class') || '';
          const sortedDir = await header.getAttribute('data-sort-dir') || '';
          assert(sortedClass.split(/\\s+/).includes('is-sorted') || sortedDir.length > 0, 'Table "' + control.label + '" sortable header should show sorted state.');
        }
        if (await rows.count() > 0) {
          const rowText = (await rows.first().innerText().catch(() => '')).trim();
          const token = (rowText.match(/[A-Za-z][A-Za-z0-9_-]{2,}/) || [])[0] || '';
          if (token) {
            await filter.fill(token);
            await page.waitForTimeout(75);
            const filteredText = (await table.innerText().catch(() => '')).toLowerCase();
            assert(filteredText.includes(token.toLowerCase()), 'Table "' + control.label + '" quick filter should show matching text.');
          }
        }
        assert(consoleErrors.length === 0, 'Browser errors after using table controls ' + control.label + ': ' + consoleErrors.join('; '));
      });
    }

    for (const control of CONTRACT.controls.filter(c => c.action && c.action.type === 'drilldown')) {
      await test('Click ' + control.kind + ': ' + control.label, async () => {
        consoleErrors.length = 0;
        await page.goto(routeUrl(control.sourcePageRoute || CONTRACT.pages[0].route), { waitUntil: 'networkidle' });
        const clickTarget = page.locator(control.selector).first();
        if (await clickTarget.count() === 0) return;
        await clickTarget.waitFor({ state: 'visible', timeout: 3000 });
        await clickTarget.click();
        await page.waitForTimeout(100);
        const detailSelector = control.expected && control.expected.detailSelector
          ? control.expected.detailSelector
          : '[data-detail-for="' + (control.expected?.detailFor || '') + '"]';
        const detail = page.locator(detailSelector).first();
        await detail.waitFor({ state: 'visible', timeout: 3000 });
        const text = (await detail.innerText().catch(() => '')).trim();
        assert(text.length > 0, 'Click table drilldown "' + control.label + '" should show detail text.');
        assert(consoleErrors.length === 0, 'Browser errors after clicking table drilldown ' + control.label + ': ' + consoleErrors.join('; '));
      });
    }
  } finally {
    await browser.close();
  }
}

console.log('Browser UAT:', passed, 'passed,', failed, 'failed');
process.exitCode = failed > 0 ? 1 : 0;
`;
}
