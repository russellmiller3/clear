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

// Detect auth signals (RLS policies, requires login, login/signup setup)
function hasAuth(body) {
  let found = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && Array.isArray(n.policies) && n.policies.length > 0) found = true;
    if (n.type === NodeType.DIRECTIVE && typeof n.value === 'string' && /login|signup|auth/i.test(n.value)) found = true;
    if (n.type === NodeType.REQUIRES_LOGIN) found = true;
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

    // Single endpoint + signature verification → webhook_handler
    if (numEndpoints === 1 && hasSignatureVerification(body)) return 'webhook_handler';

    // Single endpoint with webhook-y path pattern (heuristic)
    if (numEndpoints === 1) {
      let isWebhookPath = false;
      walk(body, n => {
        if (n.type === NodeType.ENDPOINT && typeof n.path === 'string' && /webhook|hook|callback/i.test(n.path)) {
          isWebhookPath = true;
        }
      });
      if (isWebhookPath) return 'webhook_handler';
    }

    // Multiple endpoints, no UI → pure API service
    if (numEndpoints > 0) return 'api_service';

    return 'general';
  }

  // ─── UI-forward archetypes ────────────────────────────────────────────────
  // Realtime wins if websocket nodes exist (distinctive signal)
  if (hasRealtime(body)) return 'realtime_app';

  // Agent-driven workflow (AI classification/generation feeding downstream)
  if (hasAgent(body)) return 'agent_workflow';

  // Queue workflow — tables with status field + auth (approval/routing/tracking)
  if (hasStatusField(body) && hasAuth(body) && numTables >= 1) {
    if (hasRoutingLogic(body)) return 'routing_engine';
    return 'queue_workflow';
  }

  // Routing engine without status (Lead Router style)
  if (hasRoutingLogic(body)) return 'routing_engine';

  // Dashboard — 2+ charts is the signal
  if (numCharts >= 2) return 'dashboard';

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
