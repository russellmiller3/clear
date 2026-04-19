// Archetype classifier — maps a parsed Clear program to its shape-of-work.
//
// Returns one of 15 archetypes. Used by the Factor DB to filter retrieval
// by app shape (e.g. "in queue_workflow apps with auth, when validation
// fails, what fixed it?").
//
// Deterministic rules over parser output. No ML. Interpretable — you can
// log exactly why a given app was classified a specific way.

import { NodeType } from '../../parser.js';

export const ARCHETYPES = Object.freeze([
  'queue_workflow',
  'routing_engine',
  'agent_workflow',
  'dashboard',
  'kpi',
  'crud_app',
  'content_app',
  'realtime_app',
  'booking_app',
  'ecommerce',
  'api_service',
  'etl_pipeline',
  'webhook_handler',
  'batch_job',
  'data_sync',
  'general',
]);

// Flatten nested body arrays (pages, endpoints, etc. contain their own bodies)
function walk(nodes, fn) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    fn(n);
    if (Array.isArray(n.body)) walk(n.body, fn);
    if (Array.isArray(n.thenBranch)) walk(n.thenBranch, fn);
    if (Array.isArray(n.otherwiseBranch)) walk(n.otherwiseBranch, fn);
  }
}

function countByType(body, type) {
  let count = 0;
  walk(body, n => { if (n.type === type) count++; });
  return count;
}

function hasType(body, type) {
  return countByType(body, type) > 0;
}

// Detect auth signals: RLS policies, 'requires login' in endpoints,
// 'allow signup and login' directive (produces AUTH_SCAFFOLD).
// Note: the 'requires login' line parses to NodeType.REQUIRES_AUTH, not
// REQUIRES_LOGIN — REQUIRES_LOGIN isn't a real node type. Earlier bug.
function hasAuth(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && Array.isArray(n.policies) && n.policies.length > 0) found = true;
    if (n.type === NodeType.DIRECTIVE && typeof n.value === 'string' && /login|signup|auth/i.test(n.value)) found = true;
    if (n.type === NodeType.REQUIRES_AUTH || n.type === NodeType.REQUIRES_ROLE) found = true;
    if (n.type === NodeType.AUTH_SCAFFOLD) found = true;
  });
  return found;
}

// Detect tables with a `status` or `state` field (queue/workflow signal)
function hasStatusField(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && Array.isArray(n.fields)) {
      for (const f of n.fields) {
        const fname = (f?.name || '').toLowerCase();
        if (fname === 'status' || fname === 'state' || fname === 'stage') found = true;
      }
    }
  });
  return found;
}

// Detect routing signals — conditional assignment across owners (simple heuristic:
// IF_THEN chains on field equality that assign to different owners)
function hasRoutingLogic(body) {
  let ifCount = 0;
  let hasOwnerAssignment = false;
  walk(body, n => {
    if (n.type === NodeType.IF_THEN) ifCount++;
    if (n.type === NodeType.ASSIGN && typeof n.name === 'string' && /owner|assignee|assigned/i.test(n.name)) {
      hasOwnerAssignment = true;
    }
  });
  return ifCount >= 2 && hasOwnerAssignment;
}

// Detect agent presence
function hasAgent(body) {
  return hasType(body, NodeType.AGENT) || hasType(body, NodeType.RUN_AGENT) || hasType(body, NodeType.ASK_AI);
}

// Detect realtime (websocket pub/sub)
function hasRealtime(body) {
  return hasType(body, NodeType.SUBSCRIBE) || hasType(body, NodeType.BROADCAST);
}

// Detect belongs_to (content-app signal: blog posts belong to users)
// Parser represents this as fieldType='fk' with fk='TargetTable'
function hasBelongsTo(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && Array.isArray(n.fields)) {
      for (const f of n.fields) {
        if (f?.fieldType === 'fk' && f?.fk) found = true;
      }
    }
  });
  return found;
}

// Detect booking/scheduling signals (time slot fields, availability logic)
function hasBookingPattern(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && Array.isArray(n.fields)) {
      for (const f of n.fields) {
        const fname = (f?.name || '').toLowerCase();
        if (/slot|appointment|start_time|end_time|booking|reservation|available/.test(fname)) found = true;
      }
    }
  });
  return found;
}

// Detect ecommerce (order/cart/payment patterns)
function hasEcommercePattern(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && typeof n.name === 'string') {
      const tname = n.name.toLowerCase();
      if (/order|cart|payment|checkout|product|invoice/.test(tname)) found = true;
    }
  });
  return found;
}

// Detect external service calls (for ETL / data_sync — needs external adapters)
function hasExternalServices(body) {
  let count = 0;
  walk(body, n => {
    if (n.type === NodeType.SERVICE_CALL) count++;
    if (n.type === NodeType.API_CALL) count++;
  });
  return count;
}

// Count aggregate expressions — the "big headline number" pattern that defines
// a KPI page. Two shapes to catch:
//   1. `sum|average of X from Y` → sql_aggregate node
//   2. `count of Y` → call node with name 'count'
// The default walk() only descends into body/thenBranch/otherwiseBranch — aggregates
// live inside an assign's `expression`, so we need our own traversal.
function countAggregates(body) {
  let count = 0;
  const aggNames = /^(count|sum|average|avg|min|max)$/i;
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'sql_aggregate') count++;
    else if (n.type === 'call' && typeof n.name === 'string' && aggNames.test(n.name)) count++;
    if (Array.isArray(n.body)) n.body.forEach(visit);
    if (Array.isArray(n.thenBranch)) n.thenBranch.forEach(visit);
    if (Array.isArray(n.otherwiseBranch)) n.otherwiseBranch.forEach(visit);
    if (n.expression) visit(n.expression);
    if (Array.isArray(n.args)) n.args.forEach(visit);
  };
  if (Array.isArray(body)) body.forEach(visit);
  return count;
}

// Does ANY endpoint have a webhook-like path? Needed because a webhook app
// often has admin/health endpoints alongside the webhook itself — we can't
// gate on numEndpoints === 1.
function hasWebhookPath(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.ENDPOINT && typeof n.path === 'string' && /webhook|hook|callback/i.test(n.path)) {
      found = true;
    }
  });
  return found;
}

// Detect webhook signature verification pattern
function hasSignatureVerification(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.ASSIGN && typeof n.name === 'string' && /signature|hmac|webhook_secret/i.test(n.name)) {
      found = true;
    }
  });
  return found;
}

/**
 * Classify a parsed Clear program into one of 15 archetypes.
 *
 * @param {Object} program - Result of parse(source). Has { type, target, body, errors }
 * @returns {string} archetype name
 */
export function classifyArchetype(program) {
  if (!program || !Array.isArray(program.body)) return 'general';

  const body = program.body;
  const numPages = countByType(body, NodeType.PAGE);
  const numEndpoints = countByType(body, NodeType.ENDPOINT);
  const numCharts = countByType(body, NodeType.CHART);
  const numCrons = countByType(body, NodeType.CRON);
  const numTables = countByType(body, NodeType.DATA_SHAPE);

  // ─── Backend-only (no pages) ──────────────────────────────────────────────
  if (numPages === 0) {
    // Cron-driven + external services → ETL or data_sync
    if (numCrons > 0) {
      const extCount = hasExternalServices(body);
      if (extCount >= 2) return 'data_sync';
      if (extCount >= 1) return 'etl_pipeline';
      return 'batch_job'; // cron but no external calls → cleanup/aggregation
    }

    // Webhook handler — ANY endpoint with a webhook-like path qualifies.
    // (RL-3: old rule required numEndpoints === 1, misrouting apps that
    // also have /health or /admin alongside the real webhook.)
    if (hasWebhookPath(body) || hasSignatureVerification(body)) return 'webhook_handler';

    // Multiple endpoints, no UI → pure API service
    if (numEndpoints > 0) return 'api_service';

    return 'general';
  }

  // ─── UI-forward archetypes ────────────────────────────────────────────────
  // Realtime wins if websocket nodes exist (distinctive signal)
  if (hasRealtime(body)) return 'realtime_app';

  // Agent-driven workflow (AI classification/generation feeding downstream)
  if (hasAgent(body)) return 'agent_workflow';

  // Dashboard — 2+ charts is the signal. Runs BEFORE queue_workflow because
  // dashboards often have status columns (filtered chart segments) and auth
  // (login-gated reports), which would otherwise misroute them. Charts are
  // a stronger, more distinctive signal than status+auth.
  if (numCharts >= 2) return 'dashboard';

  // Queue workflow — tables with status field + auth (approval/routing/tracking)
  if (hasStatusField(body) && hasAuth(body) && numTables >= 1) {
    if (hasRoutingLogic(body)) return 'routing_engine';
    return 'queue_workflow';
  }

  // Routing engine without status (Lead Router style)
  if (hasRoutingLogic(body)) return 'routing_engine';

  // KPI — single chart + aggregates, OR no charts + 2+ aggregates. This is the
  // "big headline number(s) page" pattern — either one trend chart next to
  // summary numbers, or a pure stat-card view with no chart at all. RL-3:
  // these previously fell through to crud_app/general, so the training DB
  // had no signal for the most common Marcus reporting shape.
  const numAggregates = countAggregates(body);
  if (numCharts === 1 && numAggregates >= 1) return 'kpi';
  if (numCharts === 0 && numAggregates >= 2) return 'kpi';

  // Ecommerce — order/cart/payment pattern
  if (hasEcommercePattern(body)) return 'ecommerce';

  // Booking — time slot fields
  if (hasBookingPattern(body)) return 'booking_app';

  // Content app — belongs_to relationships + multiple pages (public/admin split)
  if (hasBelongsTo(body) && numPages >= 2) return 'content_app';

  // CRUD — has tables + endpoints + pages but no specialized pattern
  if (numTables >= 1 && numEndpoints >= 2 && numPages >= 1) return 'crud_app';

  return 'general';
}
