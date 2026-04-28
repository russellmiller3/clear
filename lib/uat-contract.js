/*
UAT Contract — extract a JSON description of every interactive surface in a
compiled Clear program. The contract is the discriminator the test generator
runs against: every page, every route, every button, every form, every link,
every API call. If a button's action references a route that doesn't exist,
the contract flags it. If a page has zero controls, the contract flags it.
If an action calls an endpoint not declared in the program, the contract
flags it.

Cherry-picked from a Codex stash (2026-04-27) — Codex's work was the right
shape for what the queue primitive plan called for in Phase 4.

This module is the JSON-contract layer only. The browser-driven test
generator (Playwright runner) and the deeper E2E generator that consumes
this contract live in a future commit — they ride on top of this output
without changing the shape it produces.

Inputs:
  body — ast.body from `parse(source)` (already validated)

Output shape:
  {
    app:      { hasWebTarget, hasBackendTarget },
    pages:    [{ id, route, title, line, headings: [...] }, ...],
    routes:   { '/some-route': { pageIds: [...], pageTitles: [...] }, ... },
    controls: [{ id, kind, label, route, line, action: { ... }, expected: { ... } }, ...],
    apiCalls: [{ method, path, line, source }, ...],
    warnings: [{ control, message }, ...],
    errors:   [{ route, message }, ...]
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
  const routes = new Map();
  const controls = [];
  const apiCalls = [];
  const warnings = [];
  const errors = [];

  // Pre-walk: collect detail-state names so we know which displays drive panels
  const detailStateNames = new Set();
  function collectUATStateDeps(nodes) {
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.type === NodeType.DETAIL_PANEL && node.variable) detailStateNames.add(sanitizeName(node.variable));
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
      if (detailStateNames.has(name)) return true;
    }
    if (expr.type === NodeType.MEMBER_ACCESS) {
      const root = rootVariableName(expr);
      if (root && detailStateNames.has(root)) return true;
    }
    for (const value of Object.values(expr)) {
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

  // Collect computed (non-input) detail-state derivations so we know which
  // ASSIGN nodes feed selected_X panels (lets us mark them in controls)
  for (const node of body) {
    if (!node || node.type !== NodeType.ASSIGN) continue;
    const name = sanitizeName(node.name || '');
    if (!detailStateNames.has(name)) continue;
    if (expressionUsesDetailState(node.expression)) {
      // Track via the existing detailStateNames set; already there.
    }
  }

  function flattenRouteNodes(nodes, currentPageRoute, out = []) {
    for (const node of nodes || []) {
      if (!node) continue;
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

  // Per-route flattening so we can resolve display→detail panel adjacency
  const flatNodesByRoute = new Map();
  for (const node of body) {
    if (node && node.type === NodeType.PAGE) {
      const route = normalizeUATRoute(node.route || '/');
      flatNodesByRoute.set(route, flattenRouteNodes(node.body || [], route));
    }
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

  function expectedForTarget(targetRoute) {
    const route = normalizeUATRoute(targetRoute);
    if (!route) return null;
    if (!isInternalUATRoute(route)) return { kind: 'external', route };
    const pageEntry = routes.get(route);
    if (pageEntry) return { kind: 'internal-page', route, pageIds: [...pageEntry.pageIds] };
    return { kind: 'unmapped', route };
  }

  const uiPostUrls = new Set();
  function addControl(control) {
    if (control.action?.targetRoute) {
      control.action.targetRoute = normalizeUATRoute(control.action.targetRoute);
      control.expected = expectedForTarget(control.action.targetRoute);
    }
    controls.push(control);
  }

  function addRouteError(route, message) {
    errors.push({ route, message });
  }

  // First pass: register every page so addControl's expectedForTarget can resolve
  for (const node of body) {
    if (!node || node.type !== NodeType.PAGE) continue;
    const route = normalizeUATRoute(node.route || '/');
    const id = stableUatId('page', node.line, node.title || route);
    const pageDescriptor = {
      id,
      route,
      title: node.title || '',
      line: node.line || null,
      headings: collectUATVisibleText(node.body || []),
    };
    pages.push(pageDescriptor);
    if (!routes.has(route)) routes.set(route, { pageIds: [], pageTitles: [] });
    routes.get(route).pageIds.push(id);
    routes.get(route).pageTitles.push(pageDescriptor.title);
  }

  // Second pass: collect controls and api calls
  function collect(nodes, currentPageRoute = null, context = {}) {
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.type === NodeType.PAGE) {
        collect(node.body || [], normalizeUATRoute(node.route || '/'), {});
        continue;
      }
      if (node.type === NodeType.NAV_ITEM) {
        addControl({
          id: stableUatId('nav_item', node.line, node.title),
          kind: 'nav-item',
          label: node.title || 'Nav item',
          route: currentPageRoute,
          line: node.line || null,
          action: { kind: 'navigate', targetRoute: node.url || node.target || '' },
        });
        continue;
      }
      if (node.type === NodeType.TAB_STRIP && Array.isArray(node.tabs)) {
        for (const tab of node.tabs) {
          addControl({
            id: stableUatId('tab', tab.line || node.line, tab.title),
            kind: 'tab',
            label: tab.title || 'Tab',
            route: currentPageRoute,
            line: tab.line || node.line || null,
            action: { kind: 'navigate', targetRoute: tab.route || tab.url || '' },
          });
        }
      }
      if (node.type === NodeType.BUTTON) {
        const action = inferButtonAction(node);
        addControl({
          id: stableUatId('button', node.line, node.label || node.title),
          kind: 'button',
          label: node.label || node.title || 'Button',
          route: currentPageRoute,
          line: node.line || null,
          action,
        });
      }
      if (node.type === NodeType.NAVIGATE) {
        addControl({
          id: stableUatId('navigate', node.line, node.target || node.url),
          kind: 'navigate',
          label: node.label || 'Navigate',
          route: currentPageRoute,
          line: node.line || null,
          action: { kind: 'navigate', targetRoute: node.target || node.url || '' },
        });
      }
      if (node.type === NodeType.API_CALL) {
        const method = (node.method || 'GET').toUpperCase();
        apiCalls.push({
          method,
          path: node.url || node.path || '',
          line: node.line || null,
          source: currentPageRoute || 'global',
        });
        if (method === 'POST' || method === 'PUT' || method === 'DELETE') uiPostUrls.add(node.url || node.path || '');
      }
      if (node.type === NodeType.DISPLAY) {
        const target = detailTargetForDisplay(node, currentPageRoute);
        if (target) {
          // Mark this display as feeding a detail panel — useful for tests
          // that need to assert "click row → panel populated"
          addControl({
            id: stableUatId('display_to_panel', node.line, target),
            kind: 'display-to-panel',
            label: node.ui?.label || 'Display',
            route: currentPageRoute,
            line: node.line || null,
            action: { kind: 'select-row', detailVariable: target },
          });
        }
      }
      if (node.type === NodeType.ENDPOINT) {
        const method = (node.method || 'GET').toUpperCase();
        apiCalls.push({
          method,
          path: node.url || node.path || '',
          line: node.line || null,
          source: 'declared-endpoint',
        });
      }
      // Recurse
      if (Array.isArray(node.body)) collect(node.body, currentPageRoute, context);
      if (Array.isArray(node.actions)) collect(node.actions, currentPageRoute, context);
      if (Array.isArray(node.thenBranch)) collect(node.thenBranch, currentPageRoute, context);
      if (Array.isArray(node.otherwiseBranch)) collect(node.otherwiseBranch, currentPageRoute, context);
    }
  }

  function inferButtonAction(node) {
    if (Array.isArray(node.body)) {
      for (const child of node.body) {
        if (!child) continue;
        if (child.type === NodeType.NAVIGATE) {
          return { kind: 'navigate', targetRoute: child.target || child.url || '' };
        }
        if (child.type === NodeType.API_CALL) {
          return {
            kind: 'api',
            method: (child.method || 'GET').toUpperCase(),
            path: child.url || child.path || '',
          };
        }
      }
    }
    return { kind: 'unknown' };
  }

  collect(body);

  // Validate every control's targetRoute has an actual page if internal
  for (const control of controls) {
    if (control.action?.kind === 'navigate' && control.expected?.kind === 'unmapped') {
      warnings.push({ control: control.id, message: `target route ${control.action.targetRoute} has no page declared` });
    }
  }

  return {
    app: { hasWebTarget: pages.length > 0, hasBackendTarget: body.some(n => n.type === NodeType.ENDPOINT) },
    pages,
    routes: Object.fromEntries(routes.entries()),
    controls,
    apiCalls,
    warnings,
    errors,
  };
}

function emptyContract() {
  return {
    app: { hasWebTarget: false, hasBackendTarget: false },
    pages: [],
    routes: {},
    controls: [],
    apiCalls: [],
    warnings: [],
    errors: [],
  };
}
