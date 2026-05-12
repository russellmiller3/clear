#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createUsageLedgerRecorder, formatCostReport, summarizeModelUsage } from './meph-requirements-live-smoke.mjs';
import {
  extractAppFacts,
  normalizeRequirementFacts,
} from '../studio/supervisor/requirements-facts.js';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nodeBin = process.execPath;
export const DEFAULT_PATTERN_PROBE_PORT = '3478';
export const DEFAULT_PATTERN_PROBE_MAX_ITER = '12';
export function resolveProbePort(env = process.env) {
  return String(env.MEPH_PATTERN_PROBE_PORT || env.PORT || DEFAULT_PATTERN_PROBE_PORT);
}
export function resolveProbeMaxIter(env = process.env) {
  return String(env.MEPH_PATTERN_PROBE_MAX_ITER || DEFAULT_PATTERN_PROBE_MAX_ITER);
}
const port = resolveProbePort();
const base = `http://127.0.0.1:${port}`;
const CHEAP_DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
export function resolveProbeBackend(env = process.env) {
  const backend = String(env.MEPH_PATTERN_PROBE_BACKEND || 'openrouter').toLowerCase();
  if (!['openrouter', 'anthropic'].includes(backend)) {
    throw new Error(`Unknown probe backend "${backend}". Use openrouter or anthropic.`);
  }
  return backend;
}
export function resolveProbeModel(env = process.env) {
  if (resolveProbeBackend(env) === 'anthropic') {
    return env.MEPH_PATTERN_PROBE_MODEL || env.MEPH_MODEL || DEFAULT_ANTHROPIC_MODEL;
  }
  return env.MEPH_PATTERN_PROBE_MODEL || env.OPENROUTER_MODEL || CHEAP_DEFAULT_OPENROUTER_MODEL;
}
export function isExpensiveProbeModel(modelName) {
  return /\banthropic\/claude-(?:sonnet|opus)\b|claude-sonnet|claude-opus/i.test(String(modelName || ''));
}
export function isExpensiveAnthropicModel(modelName) {
  return /claude-(?:sonnet|opus)/i.test(String(modelName || ''));
}
const backend = resolveProbeBackend();
const model = resolveProbeModel();
const chatTimeoutMs = Number(process.env.MEPH_PATTERN_PROBE_TIMEOUT_MS || 600_000);
const requirementsRevisionLimit = Number(process.env.MEPH_PATTERN_PROBE_REQUIREMENTS_RETRIES || 2);
const DEFAULT_ARTIFACT_DIR = join(repoRoot, 'studio', 'sessions', 'pattern-probes', new Date().toISOString().replace(/[:.]/g, '-'));
const TRIAL_BUILD_INSTRUCTION = [
  'Trial instruction: build the app in the Clear editor.',
  'Call edit_code with the complete .clear source before your final answer.',
  'Use the provided context in this request before reaching for more files.',
  'Do not answer with only an explanation.',
].join('\n');

const baselineApprovalQueueProbes = [
  {
    id: 'approval-routing-shape',
    prompt: 'What is the Clear shape for modifying an approval queue so requests route to different approvers by deal size? Answer with the smallest relevant snippet shape.',
    expectKinds: ['queue', 'routing', 'policy', 'rule'],
    expectTerms: ['route', 'approval'],
  },
  {
    id: 'approval-row-actions',
    prompt: 'What is the Clear shape for adding approve and reject actions to each row in an approval queue?',
    expectKinds: ['row_action', 'button_action', 'endpoint'],
    expectTerms: ['approve', 'reject'],
  },
  {
    id: 'queue-auth-guard',
    prompt: 'What is the Clear shape for requiring login before someone can see approval queue items?',
    expectKinds: ['auth_guard', 'endpoint', 'page'],
    expectTerms: ['requires login'],
  },
  {
    id: 'approval-double-processing',
    prompt: 'What is the Clear shape for avoiding double-processing when two people approve the same request at the same time?',
    expectKinds: ['concurrency', 'validation', 'rule', 'endpoint', 'policy'],
    expectTerms: ['optimistic', 'safe to retry', 'status'],
  },
  {
    id: 'selected-row-detail',
    prompt: 'What is the Clear shape for showing the details of the selected row in an approval queue?',
    expectKinds: ['detail_panel', 'display_table', 'page'],
    expectTerms: ['detail', 'selected'],
  },
];

const narrowApprovalQueueProbes = [
  {
    id: 'threshold-routing-change',
    prompt: 'In an approval queue, requests under 50000 should go to a manager and requests 50000 or above should go to a VP. What Clear feature shape changes that routing?',
    expectKinds: ['routing', 'queue', 'policy', 'rule'],
    expectTerms: ['route', 'manager', 'vp'],
  },
  {
    id: 'only-my-pending-items',
    prompt: 'In an approval queue, the current approver should only see pending requests assigned to them. What Clear shape filters those rows?',
    expectKinds: ['queue', 'display_table', 'page', 'auth_guard'],
    expectTerms: ['current user', 'pending', 'approver'],
  },
  {
    id: 'row-approve-reject-endpoints',
    prompt: 'In an approval queue table, each row needs approve and reject buttons that call the backend for that request. What feature shape should I copy?',
    expectKinds: ['row_action', 'button_action', 'endpoint'],
    expectTerms: ['approve', 'reject'],
  },
  {
    id: 'stale-approval-submit',
    prompt: 'In an approval queue, if two approvers open the same pending request and both click approve, what Clear shape stops the second submit from changing it twice?',
    expectKinds: ['concurrency', 'validation', 'rule', 'endpoint'],
    expectTerms: ['optimistic', 'pending', 'status'],
  },
  {
    id: 'legal-review-escalation',
    prompt: 'Some approval requests need legal review before final approval when the contract flag is true. What Clear shape adds that branch?',
    expectKinds: ['routing', 'rule', 'policy', 'queue'],
    expectTerms: ['legal', 'review', 'contract'],
  },
  {
    id: 'selected-request-detail-panel',
    prompt: 'In an approval queue, clicking a row should show that request amount, owner, and notes beside the table. What Clear shape handles that selected-row detail?',
    expectKinds: ['detail_panel', 'display_table', 'page'],
    expectTerms: ['selected', 'detail'],
  },
  {
    id: 'approval-manager-gate',
    prompt: 'Only approval managers should load the approval queue screen. What Clear shape guards that page?',
    expectKinds: ['auth_guard', 'page', 'endpoint', 'rule'],
    expectTerms: ['requires login', 'manager', 'approval'],
  },
];

const broadFunctionalAppProbes = [
  {
    id: 'revenue-ops-dashboard-app',
    prompt: 'Build a complete Clear app for a revenue operations dashboard. It needs companies, contacts, and deals with relationships; logged-in users can add deals and contacts; the dashboard must show a searchable/filterable sales pipeline, aggregate pipeline value, stage counts, a chart by stage, and a selected company detail panel with that company\'s contacts and deals.',
    requiredSourceTerms: ['companies', 'contacts', 'deals', 'requires login', 'search', 'filter', 'chart', 'selected'],
    optionalSourceTerms: ['has many', 'belongs to', 'sum', 'count', 'display'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'crm_tables', label: 'Companies, contacts, and deals are real tables', points: 12, all: [/create\s+a\s+companies\s+table/i, /create\s+a\s+contacts\s+table/i, /create\s+a\s+deals\s+table/i] },
      { id: 'relationships', label: 'Records model company/contact/deal relationships', points: 10, any: [/has many/i, /belongs to/i, /\bcompany_id\b/i, /\bcontact_id\b/i] },
      { id: 'write_flows', label: 'Users can create deals and contacts through endpoints or buttons', points: 10, all: [/deals/i, /contacts/i, /(?:save|send|post)/i] },
      { id: 'search_filter', label: 'Pipeline is searchable or filterable', points: 10, any: [/\bsearch\b/i, /\bfilter\b/i, /where\s+\w+.*stage/i] },
      { id: 'aggregates', label: 'Dashboard computes pipeline value and stage counts', points: 12, all: [/\b(?:sum|total|pipeline_value)\b/i, /\b(?:count|stage_count|by stage)\b/i] },
      { id: 'chart', label: 'Dashboard includes a chart by stage', points: 10, all: [/\bchart\b/i, /\bstage\b/i] },
      { id: 'selected_detail', label: 'Selected company detail shows related rows', points: 10, all: [/\bselected/i, /display\s+\w+[\s\S]{0,100}as table/i] },
    ],
  },
  {
    id: 'realtime-support-room-app',
    prompt: 'Build a complete Clear app for a logged-in support chat room. It needs conversations and messages, a chat UI, a backend endpoint for posting messages, real-time updates using subscribe/broadcast, an agent handoff flag, open/closed status, and a sidebar/table where support staff can select a conversation and see its message history.',
    requiredSourceTerms: ['conversations', 'messages', 'requires login', 'subscribe', 'broadcast', 'chat', 'selected'],
    optionalSourceTerms: ['display as chat', 'status', 'handoff', 'table', 'endpoint'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'chat_tables', label: 'Conversations and messages are persisted', points: 12, all: [/create\s+a\s+conversations\s+table/i, /create\s+a\s+messages\s+table/i] },
      { id: 'auth', label: 'Chat is login-protected', points: 8, all: [/allow signup and login/i, /requires login/i] },
      { id: 'post_message', label: 'Posting a message goes through a backend path', points: 10, all: [/when user (?:sends|calls)/i, /\/api\/messages|\/api\/chat|\/api\/conversations/i, /save\s+\w+\s+as\s+new\s+messages?/i] },
      { id: 'realtime', label: 'Realtime update primitive is used', points: 16, all: [/subscribe to/i, /broadcast to all/i] },
      { id: 'chat_ui', label: 'Messages render as chat or message history', points: 12, any: [/display\s+\w+\s+as chat/i, /message history/i, /display\s+\w+[\s\S]{0,100}as table/i] },
      { id: 'triage_state', label: 'Conversation tracks open/closed and handoff state', points: 10, all: [/\bstatus\b/i, /\b(?:handoff|agent)\b/i] },
      { id: 'selected_thread', label: 'Staff can select a conversation and inspect it', points: 8, all: [/\bselected/i, /\bconversation/i] },
    ],
  },
  {
    id: 'helpdesk-rag-agent-app',
    prompt: 'Build a complete Clear app for an AI helpdesk assistant. It needs products, knowledge articles, and support tickets; a user can ask a question in chat; the Helpdesk agent must know about the products and articles, use tools to look things up and create tickets, remember the conversation, block unsafe argument patterns, and show a ticket queue for unresolved issues.',
    requiredSourceTerms: ['agent', 'ask claude', 'has tools', 'knows about', 'remember conversation', 'block arguments matching', 'tickets'],
    optionalSourceTerms: ['products', 'articles', 'display as chat', 'queue', 'requires login'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'knowledge_tables', label: 'Products/articles/tickets are modeled as data', points: 12, all: [/create\s+a\s+products\s+table/i, /create\s+a\s+(?:knowledge\s+)?articles\s+table/i, /create\s+a\s+tickets\s+table/i] },
      { id: 'agent_defined', label: 'Helpdesk agent is explicitly defined', points: 12, all: [/\bagent\s+['"]?helpdesk/i, /ask claude/i] },
      { id: 'agent_tools', label: 'Agent has lookup and ticket tools', points: 12, all: [/has tools/i, /lookup/i, /(?:create|open).*ticket|ticket/i] },
      { id: 'rag_context', label: 'Agent knows about knowledge data', points: 10, all: [/knows about/i, /products/i, /articles/i] },
      { id: 'memory', label: 'Agent remembers conversation context', points: 8, all: [/remember conversation/i] },
      { id: 'guardrail', label: 'Unsafe tool arguments are blocked', points: 10, all: [/block arguments matching/i] },
      { id: 'ticket_queue', label: 'Unresolved tickets are visible in the app', points: 10, all: [/display\s+\w+[\s\S]{0,100}as table/i, /unresolved|open|pending/i] },
    ],
  },
  {
    id: 'booking-workflow-app',
    prompt: 'Build a complete Clear app for a room booking workflow. It needs rooms, customers, and bookings with relationships; logged-in users can search available rooms, create a booking for a time range, prevent double booking, show upcoming bookings in a table, show room utilization as a chart, and allow canceling a booking through a backend action.',
    requiredSourceTerms: ['rooms', 'customers', 'bookings', 'requires login', 'available', 'cancel', 'chart'],
    optionalSourceTerms: ['belongs to', 'has many', 'time', 'date', 'with optimistic lock'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'booking_tables', label: 'Rooms, customers, and bookings are modeled', points: 12, all: [/create\s+a\s+rooms\s+table/i, /create\s+a\s+customers\s+table/i, /create\s+a\s+bookings\s+table/i] },
      { id: 'relationships', label: 'Bookings connect to rooms and customers', points: 10, any: [/belongs to/i, /\broom_id\b/i, /\bcustomer_id\b/i] },
      { id: 'availability_search', label: 'Users can search/filter available rooms', points: 10, all: [/available/i, /(?:search|filter|where)/i] },
      { id: 'create_booking', label: 'Booking creation validates and saves a booking', points: 12, all: [/when user (?:sends|calls)/i, /\/api\/bookings/i, /save\s+\w+\s+as\s+new\s+bookings?/i] },
      { id: 'double_booking_guard', label: 'Double-booking is explicitly guarded', points: 12, any: [/double/i, /overlap/i, /already booked/i, /with optimistic lock/i] },
      { id: 'cancel_action', label: 'Cancel action updates booking state through backend', points: 8, all: [/cancel/i, /\/api\/bookings\/:id/i] },
      { id: 'utilization_chart', label: 'Utilization appears as a chart', points: 10, all: [/chart/i, /utilization|bookings by room|room/i] },
    ],
  },
  {
    id: 'expense-analytics-app',
    prompt: 'Build a complete Clear app for expense analytics. It needs categories and expenses; logged-in users can add expenses, filter by category and date, see total monthly spend, see spending by category as a chart, export expenses to CSV, and inspect a selected expense with merchant, amount, category, and notes.',
    requiredSourceTerms: ['categories', 'expenses', 'requires login', 'filter', 'chart', 'CSV', 'selected'],
    optionalSourceTerms: ['sum', 'total', 'month', 'display as table', 'export'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'expense_tables', label: 'Categories and expenses are modeled', points: 12, all: [/create\s+a\s+categories\s+table/i, /create\s+a\s+expenses\s+table/i] },
      { id: 'create_expense', label: 'Users can add expenses through UI/backend', points: 10, all: [/amount/i, /merchant/i, /save\s+\w+\s+as\s+new\s+expenses?/i] },
      { id: 'filters', label: 'Expense list filters by category and date/month', points: 12, all: [/filter|where/i, /category/i, /date|month/i] },
      { id: 'aggregates', label: 'Monthly total spend is computed', points: 10, all: [/total|sum/i, /month|monthly/i] },
      { id: 'chart', label: 'Spending by category chart exists', points: 12, all: [/chart/i, /category/i] },
      { id: 'csv_export', label: 'CSV export path exists', points: 10, all: [/csv/i, /export|download/i] },
      { id: 'selected_detail', label: 'Selected expense detail includes notes', points: 8, all: [/selected/i, /notes/i] },
    ],
  },
  {
    id: 'ecom-support-agent-app',
    prompt: 'Build a complete Clear app for an e-commerce support assistant. It needs products, orders, returns, and inventory; a customer can chat with an agent; the agent routes intents for order lookup, return creation, stock checking, and product recommendations; it remembers conversation context; and an admin dashboard shows open returns, low-stock products, and a chart of support intents.',
    requiredSourceTerms: ['products', 'orders', 'returns', 'inventory', 'agent', 'ask claude', 'has tools', 'remember conversation', 'chart'],
    optionalSourceTerms: ['intent', 'lookup', 'stock', 'display as chat', 'dashboard'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'commerce_tables', label: 'Commerce data covers products, orders, returns, and inventory', points: 12, all: [/products/i, /orders/i, /returns/i, /inventory|stock/i] },
      { id: 'agent_defined', label: 'Customer support agent is defined', points: 10, all: [/agent\s+['"]?(?:customer support|support)/i, /ask claude/i] },
      { id: 'agent_tools', label: 'Agent has tools for order, return, stock, and recommendation flows', points: 14, all: [/has tools/i, /order/i, /return/i, /stock|inventory/i, /recommend/i] },
      { id: 'intent_routing', label: 'Intent routing branches by support task', points: 10, all: [/intent|route/i, /order/i, /return/i] },
      { id: 'memory', label: 'Conversation memory is enabled', points: 8, all: [/remember conversation/i] },
      { id: 'chat_ui', label: 'Customer chat UI is present', points: 8, any: [/display\s+\w+\s+as chat/i, /chat/i] },
      { id: 'admin_dashboard', label: 'Admin dashboard shows returns, low stock, and intent chart', points: 12, all: [/dashboard|page/i, /low.?stock|inventory/i, /chart/i] },
    ],
  },
  {
    id: 'deal-desk-rules-app',
    prompt: 'Build a complete Clear app for a regulated deal desk. It needs deals with discount, amount, segment, and status; logged-in sellers can submit deals; business rules enforce a discount cap and positive price floor; deals route by size or discount to RevOps, finance, or CRO; approvers get a pending queue with selected deal detail; approve/reject/counter actions update status with optimistic lock protection; and reports show approval mix charts.',
    requiredSourceTerms: ['deals', 'discount', 'rule', 'route', 'RevOps', 'finance', 'CRO', 'approve', 'reject', 'counter', 'with optimistic lock', 'chart'],
    optionalSourceTerms: ['queue', 'selected', 'requires login', 'status', 'report'],
    minQualityPercent: 70,
    qualityCriteria: [
      { id: 'deal_table', label: 'Deals table has discount, amount, segment, and status', points: 10, all: [/create\s+a\s+deals\s+table/i, /discount/i, /amount/i, /segment/i, /status/i] },
      { id: 'rules', label: 'Named business rules enforce discount and price constraints', points: 14, all: [/\brule\b/i, /discount/i, /price|amount/i, /enforce/i] },
      { id: 'routing', label: 'Routing sends deals to RevOps, finance, or CRO', points: 14, all: [/\broute\b/i, /revops/i, /finance/i, /cro/i] },
      { id: 'submit_flow', label: 'Sellers can submit deals through backend/UI', points: 8, all: [/when user (?:sends|calls)/i, /\/api\/deals/i, /save\s+\w+\s+as\s+new\s+deals?/i] },
      { id: 'decision_actions', label: 'Approve, reject, and counter actions update deal status', points: 12, all: [/approve/i, /reject/i, /counter/i, /status/i] },
      { id: 'optimistic_lock', label: 'Decision actions use optimistic locking', points: 8, all: [/with optimistic lock/i] },
      { id: 'reports', label: 'Reports include approval mix chart', points: 8, all: [/chart/i, /approval mix|status mix|report/i] },
    ],
  },
];

export const probeSuites = {
  baselineApprovalQueue: baselineApprovalQueueProbes,
  narrowApprovalQueue: narrowApprovalQueueProbes,
  approvalQueueFullApps: broadFunctionalAppProbes,
  broadFunctionalApps: broadFunctionalAppProbes,
};

export function selectProbes({ suiteName = 'broadFunctionalApps', only = '' } = {}) {
  const suite = probeSuites[suiteName];
  if (!suite) {
    throw new Error(`Unknown probe suite "${suiteName}". Choose one of: ${Object.keys(probeSuites).join(', ')}`);
  }
  const onlyIds = new Set(
    String(only || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
  );
  return onlyIds.size
    ? suite.filter(probe => onlyIds.has(probe.id))
    : suite;
}

function loadEnvFile() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function buildProbeServerEnv({
  processEnv = process.env,
  envFromFile = {},
  backend = resolveProbeBackend(processEnv),
  anthropicKey,
  openRouterKey,
  model,
  port,
} = {}) {
  const baseEnv = {
    ...processEnv,
    ...envFromFile,
    MEPH_MODEL: model,
    MEPH_MAX_ITER: resolveProbeMaxIter(processEnv),
    PORT: port,
    CLEAR_ALLOW_SEED: '1',
    CLEAR_CLOUD_ROOT_DOMAIN: 'buildclear.dev',
  };
  if (backend === 'anthropic') {
    delete baseEnv.MEPH_BRAIN;
    return {
      ...baseEnv,
      ANTHROPIC_API_KEY: anthropicKey,
    };
  }
  return {
    ...baseEnv,
    OPENROUTER_API_KEY: openRouterKey,
    OPENROUTER_MODEL: model,
    MEPH_BRAIN: 'openrouter',
  };
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    try {
      const res = await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Studio did not start at ${base}`);
}

export function buildChatBody(prompt, {
  patternPreflight = true,
  disablePatternSearchPromptGuard = false,
  disablePatternSearchTool = false,
  disableFactorHints = disablePatternSearchTool === true && patternPreflight === 'docs',
} = {}) {
  const content = `${prompt}\n\n${TRIAL_BUILD_INSTRUCTION}`;
  return {
    messages: [{ role: 'user', content }],
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
    requirementsMode: 'auto',
    patternPreflight,
    disablePatternSearchPromptGuard,
    disablePatternSearchTool,
    disableFactorHints,
  };
}

export function buildApprovedAppChatBody(prompt, options = {}, {
  assistantText = '',
  requirements = [],
  requirementsId,
} = {}) {
  const body = buildChatBody(prompt, options);
  return {
    ...body,
    messages: [
      { role: 'user', content: `${prompt}\n\n${TRIAL_BUILD_INSTRUCTION}` },
      { role: 'assistant', content: assistantText || `requirements:\n${requirements.map(item => `  ${item}`).join('\n')}` },
      { role: 'user', content: 'Approved. Build the app now from the approved requirements.' },
    ],
    approvedRequirements: requirements,
    approvedRequirementsId: requirementsId,
  };
}

export function buildRequirementsRevisionChatBody(prompt, options = {}, {
  assistantText = '',
  errors = [],
  attempt = 1,
} = {}) {
  const body = buildChatBody(prompt, options);
  const errorLines = (errors || []).map(error => `- ${error}`).join('\n') || '- requirements were invalid';
  return {
    ...body,
    messages: [
      { role: 'user', content: `${prompt}\n\n${TRIAL_BUILD_INSTRUCTION}` },
      { role: 'assistant', content: assistantText || 'requirements:' },
      {
        role: 'user',
        content: [
          `The requirements were not approved by the deterministic validator on attempt ${attempt}.`,
          'Do not build yet.',
          'Fix the requirements so they are specific, observable, and cover the missing app lifecycle evidence.',
          'Validator errors:',
          errorLines,
          '',
          'Return only a corrected requirements block.',
          '',
          `Original user request: ${prompt}`,
        ].join('\n'),
      },
    ],
  };
}

async function runChatBody(body, { onModelUsage } = {}) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(chatTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`/api/chat ${res.status}: ${text.slice(0, 500)}`);
  }

  const events = [];
  const toolNames = [];
  let preflight = null;
  let source = '';
  let text = '';
  const modelUsageEvents = [];
  let requirementsReview = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let event;
      try { event = JSON.parse(raw); } catch { continue; }
      events.push(event);
      if (event.type === 'text') text += event.delta || '';
      if (event.type === 'tool_start' && event.name) toolNames.push(event.name);
      if (event.type === 'pattern_preflight') preflight = event;
      if (event.type === 'requirements_review') requirementsReview = event;
      if ((event.type === 'message_delta' || event.type === 'model_usage') && event.usage) {
        modelUsageEvents.push(event);
        if (typeof onModelUsage === 'function') onModelUsage(event);
      }
      if (event.type === 'code_update' && typeof event.code === 'string') source = event.code;
      if (event.type === 'done' && typeof event.source === 'string') source = event.source;
      if (event.type === 'error') throw new Error(event.message || 'Studio emitted an error');
    }
  }
  return { text, toolNames, preflight, source, events, modelUsageEvents, requirementsReview };
}

async function runChat(prompt, options = {}, { onModelUsage, approvedRequirementsRun } = {}) {
  const body = approvedRequirementsRun
    ? buildApprovedAppChatBody(prompt, options, {
      assistantText: approvedRequirementsRun.text,
      requirements: approvedRequirementsRun.requirementsReview?.requirements || [],
      requirementsId: approvedRequirementsRun.requirementsReview?.requirementsId,
    })
    : buildChatBody(prompt, options);
  return runChatBody(body, { onModelUsage });
}

async function runRequirementsRevision(prompt, options, previousRun, { onModelUsage, attempt } = {}) {
  const body = buildRequirementsRevisionChatBody(prompt, options, {
    assistantText: previousRun?.text || '',
    errors: previousRun?.requirementsReview?.errors || [],
    attempt,
  });
  return runChatBody(body, { onModelUsage });
}

export function scoreProbe(probe, result) {
  const lower = result.text.toLowerCase();
  const usedToolSearch = result.toolNames.includes('browse_templates');
  const usedPreflightSearch = !!result.preflight?.required && Number(result.preflight?.pattern_count || 0) > 0;
  const usedSearch = usedToolSearch || usedPreflightSearch;
  const mentionedPrimitive =
    /primitive|snippet|pattern db|browse_templates|canonical_primitive/i.test(result.text);
  const foundExpectedKind = probe.expectKinds.some(kind =>
    lower.includes(kind.replace(/_/g, ' ')) || lower.includes(kind)
  );
  const foundExpectedTerm = probe.expectTerms.some(term => lower.includes(term.toLowerCase()));
  return {
    usedSearch,
    usedToolSearch,
    usedPreflightSearch,
    mentionedPrimitive,
    foundExpectedKind,
    foundExpectedTerm,
    pass: usedSearch && foundExpectedKind && foundExpectedTerm,
  };
}

function regexAny(source, patterns) {
  return patterns.some(pattern => pattern.test(source));
}

function criterion(id, label, points, passed, evidence) {
  return { id, label, points, earned: passed ? points : 0, passed: !!passed, evidence };
}

function qualityPatternMatches(source, pattern) {
  if (pattern instanceof RegExp) return pattern.test(source);
  return source.toLowerCase().includes(String(pattern).toLowerCase());
}

function qualityCheckMatches(source, check) {
  const all = check.all || [];
  const any = check.any || [];
  const none = check.none || [];
  return all.every(pattern => qualityPatternMatches(source, pattern))
    && (any.length === 0 || any.some(pattern => qualityPatternMatches(source, pattern)))
    && none.every(pattern => !qualityPatternMatches(source, pattern));
}

function scoreCustomQualityRubric(probe, result) {
  const source = String(result.source || '');
  const compileErrors = Array.isArray(result.compile?.errors) ? result.compile.errors : [];
  const compileWarnings = Array.isArray(result.compile?.warnings) ? result.compile.warnings : [];
  const usedEditor = (result.toolNames || []).includes('edit_code') || source.trim().length > 0;
  const criteria = [
    criterion('source_written', 'Model wrote complete Clear source', 5, usedEditor, usedEditor ? 'edit_code/source present' : 'no source'),
    criterion('compiles', 'Compiler accepts the app', 15, compileErrors.length === 0, `${compileErrors.length} compiler error(s)`),
    criterion('warning_budget', 'Compiler warnings stay reviewable', 5, compileWarnings.length <= 1, `${compileWarnings.length} warning(s)`),
    ...(probe.qualityCriteria || []).map(check => criterion(
      check.id,
      check.label,
      check.points,
      qualityCheckMatches(source, check),
      `all=${(check.all || []).length} any=${(check.any || []).length} none=${(check.none || []).length}`
    )),
  ];
  const earned = criteria.reduce((sum, item) => sum + item.earned, 0);
  const total = criteria.reduce((sum, item) => sum + item.points, 0);
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return {
    earned,
    total,
    percent,
    band: percent >= 85 ? 'strong' : percent >= 70 ? 'usable' : percent >= 50 ? 'partial' : 'weak',
    criteria,
  };
}

export function scoreAppQualityRubric(probe, result) {
  if (Array.isArray(probe.qualityCriteria) && probe.qualityCriteria.length > 0) {
    return scoreCustomQualityRubric(probe, result);
  }
  const source = String(result.source || '');
  const compileErrors = Array.isArray(result.compile?.errors) ? result.compile.errors : [];
  const compileWarnings = Array.isArray(result.compile?.warnings) ? result.compile.warnings : [];
  const usedEditor = (result.toolNames || []).includes('edit_code') || source.trim().length > 0;

  const hasRequestTable =
    /create\s+a\s+requests?\s+table/i.test(source)
    && /\bamount\b/i.test(source)
    && /\bstatus\b/i.test(source)
    && /\bpending\b/i.test(source);
  const hasRoutingField = /\b(?:approval_tier|routed_to_role|approver_role|assigned_to)\b/i.test(source);
  const hasCreateEndpoint = /when user sends\b[\s\S]{0,120}\/api\/requests/i.test(source);
  const hasCreateSave = /save\s+\w+\s+as\s+new\s+requests?/i.test(source);
  const hasCreateUi = /button\b[\s\S]{0,180}(?:send|post)\s+(?:request|new_request|new_req)[\s\S]{0,120}\/api\/requests/i.test(source);
  const badPendingRoute = /\b(?:approval_tier|routed_to_role|approver_role|assigned_to)\b[^\n]{0,40}\bis\s+['"](?:pending|tbd)['"]/i.test(source);
  const managerThreshold = regexAny(source, [
    /\b(?:approval_tier|routed_to_role|approver_role|assigned_to)\b[^\n]{0,80}\bis\s+['"]manager['"][^\n]{0,160}\bamount\b[^\n]{0,80}\b(?:less than|under|<)\s*50000/i,
    /\b(?:amount|deal_size)\b[^\n]{0,80}\b(?:less than|under|<)\s*50000[\s\S]{0,180}\bmanager\b/i,
  ]);
  const vpThreshold = regexAny(source, [
    /\b(?:approval_tier|routed_to_role|approver_role|assigned_to)\b[^\n]{0,80}\bis\s+['"]vp['"][^\n]{0,120}\b(?:otherwise|else)\b/i,
    /\b(?:approval_tier|routed_to_role|approver_role|assigned_to)\b[^\n]{0,80}\bis\s+['"]vp['"][^\n]{0,160}\bamount\b[^\n]{0,80}\b(?:greater than or equal to|at least|>=)\s*50000/i,
    /\b(?:amount|deal_size)\b[^\n]{0,80}\b(?:greater than or equal to|at least|>=)\s*50000[\s\S]{0,180}\bvp\b/i,
  ]);
  const hasQueueRead = /when user calls\s+GET\s+\/api\/requests\/(?:queue|pending)/i.test(source)
    && /get all Requests where status is ['"]pending['"]/i.test(source);
  const hasApproveEndpoint = /\/api\/requests\/:id\/approve/i.test(source)
    && /status from ['"]pending['"] to ['"]approved['"]/i.test(source);
  const hasRejectEndpoint = /\/api\/requests\/:id\/reject/i.test(source)
    && /status from ['"]pending['"] to ['"]rejected['"]/i.test(source);
  const hasOptimisticLock = /\bwith optimistic lock\b/i.test(source);
  const hasQueueUi = /\bpage\b/i.test(source)
    && /display\s+\w+[\s\S]{0,80}as table/i.test(source)
    && /\bdetail panel\b/i.test(source)
    && /\bbutton\s+['"]Approve['"]/i.test(source)
    && /\bbutton\s+['"]Reject['"]/i.test(source);
  const hasAuthGuard = /allow signup and login/i.test(source)
    && /requires login/i.test(source);

  const criteria = [
    criterion('source_written', 'Model wrote complete Clear source', 5, usedEditor, usedEditor ? 'edit_code/source present' : 'no source'),
    criterion('compiles', 'Compiler accepts the app', 20, compileErrors.length === 0, `${compileErrors.length} compiler error(s)`),
    criterion('warning_budget', 'Compiler warnings stay reviewable', 5, compileWarnings.length <= 1, `${compileWarnings.length} warning(s)`),
    criterion('request_data_model', 'Request data model carries amount, status, pending state, and routing field', 10, hasRequestTable && hasRoutingField, hasRequestTable && hasRoutingField ? 'Requests table + routing field' : 'missing request table or routing field'),
    criterion('create_request_flow', 'User can create a request through endpoint and UI', 10, hasCreateEndpoint && hasCreateSave && hasCreateUi, `endpoint=${hasCreateEndpoint} save=${hasCreateSave} ui=${hasCreateUi}`),
    criterion('threshold_routing', 'Under-50000 routes manager and 50000-plus routes VP', 15, managerThreshold && vpThreshold && !badPendingRoute, `manager=${managerThreshold} vp=${vpThreshold} bad_pending_route=${badPendingRoute}`),
    criterion('pending_queue_read', 'Queue reads pending request rows', 8, hasQueueRead, hasQueueRead ? 'pending queue endpoint' : 'missing pending queue endpoint/filter'),
    criterion('decision_actions', 'Approve and reject update pending request status', 10, hasApproveEndpoint && hasRejectEndpoint, `approve=${hasApproveEndpoint} reject=${hasRejectEndpoint}`),
    criterion('stale_submit_guard', 'Decision path has concurrency protection', 5, hasOptimisticLock, hasOptimisticLock ? 'with optimistic lock' : 'no optimistic lock'),
    criterion('queue_ui_workflow', 'Queue UI has table, selected detail, and approve/reject controls', 8, hasQueueUi, hasQueueUi ? 'table + detail + actions' : 'missing table/detail/actions'),
    criterion('auth_guard', 'Approval app has login protection', 4, hasAuthGuard, hasAuthGuard ? 'login scaffold + protected endpoints' : 'missing login scaffold or guards'),
  ];

  const earned = criteria.reduce((sum, item) => sum + item.earned, 0);
  const total = criteria.reduce((sum, item) => sum + item.points, 0);
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return {
    earned,
    total,
    percent,
    band: percent >= 85 ? 'strong' : percent >= 70 ? 'usable' : percent >= 50 ? 'partial' : 'weak',
    criteria,
  };
}

async function compileSource(source) {
  if (!String(source || '').trim()) {
    return { errors: [{ message: 'No source produced' }], warnings: [] };
  }
  const res = await fetch(`${base}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { errors: [{ message: `/api/compile ${res.status}: ${text.slice(0, 300)}` }], warnings: [] };
  }
  return res.json();
}

export function scoreGeneratedApp(probe, result) {
  const source = String(result.source || '');
  const lower = source.toLowerCase();
  const compileErrors = Array.isArray(result.compile?.errors) ? result.compile.errors : [];
  const requiredTerms = probe.requiredSourceTerms || [];
  const optionalTerms = probe.optionalSourceTerms || [];
  const missingRequired = requiredTerms.filter(term => !lower.includes(String(term).toLowerCase()));
  const optionalHits = optionalTerms.filter(term => lower.includes(String(term).toLowerCase()));
  const usedEditor = result.toolNames.includes('edit_code') || source.trim().length > 0;
  const compiles = compileErrors.length === 0;
  const quality = scoreAppQualityRubric(probe, result);
  const minQualityPercent = Number.isFinite(Number(probe.minQualityPercent))
    ? Number(probe.minQualityPercent)
    : 0;
  return {
    usedEditor,
    compiles,
    missingRequired,
    optionalHits,
    quality,
    minQualityPercent,
    pass: usedEditor && compiles && missingRequired.length === 0 && quality.percent >= minQualityPercent,
  };
}

export function isProviderQuotaError(message) {
  return /key limit exceeded|insufficient credits|quota exceeded|credit limit|billing limit|openrouter network error|fetch failed|request timed out|aborted due to timeout|econnreset|etimedout|enotfound|eai_again/i.test(String(message || ''));
}

export function providerBlockMessage(resultOrMessage) {
  const text = typeof resultOrMessage === 'string'
    ? resultOrMessage
    : [resultOrMessage?.error, resultOrMessage?.text].filter(Boolean).join('\n');
  if (!isProviderQuotaError(text)) return '';
  const match = String(text).match(/\[?openrouter network error:[^\]\n]+]?|key limit exceeded|insufficient credits|quota exceeded|credit limit|billing limit|request timed out|aborted due to timeout|fetch failed|econnreset|etimedout|enotfound|eai_again/i);
  return match ? match[0] : String(text).slice(0, 300);
}

export function shouldBlockProviderFailure(result = {}) {
  const providerBlocked = providerBlockMessage(result);
  if (!providerBlocked) return false;
  return String(result.source || '').trim().length === 0;
}

export function summarizeRows(rows, { abMode = false } = {}) {
  const blockedRows = rows.filter(row => row.result?.blocked);
  const completedRows = rows.filter(row => !row.result?.blocked);
  const usage = summarizeModelUsage(rows.flatMap(row => row.result?.modelUsageEvents || []));
  const passed = completedRows.filter(row => row.score.pass).length;
  const averageQuality = (items) => {
    const scored = items
      .map(row => row.score?.quality?.percent)
      .filter(value => typeof value === 'number');
    if (scored.length === 0) return null;
    return scored.reduce((sum, value) => sum + value, 0) / scored.length;
  };
  const summary = {
    rows,
    completedRows,
    blockedRows,
    passed,
    total: completedRows.length,
    avgQuality: averageQuality(completedRows),
    aborted: blockedRows.length > 0,
    modelInputTokens: usage.inputTokens,
    modelOutputTokens: usage.outputTokens,
    openRouterCostCredits: usage.openRouterCostCredits,
    openRouterGenerationIds: usage.openRouterGenerationIds,
    costAccountingReady: usage.eventCount > 0,
    ab: null,
  };
  if (abMode) {
    const byVariant = {};
    for (const label of ['docs_only', 'full_hook']) {
      const variantRows = completedRows.filter(row => row.variant === label);
      byVariant[label] = {
        passed: variantRows.filter(row => row.score.pass).length,
        total: variantRows.length,
        avgQuality: averageQuality(variantRows),
      };
    }
    byVariant.delta = byVariant.full_hook.passed - byVariant.docs_only.passed;
    byVariant.qualityDelta = byVariant.full_hook.avgQuality === null || byVariant.docs_only.avgQuality === null
      ? null
      : byVariant.full_hook.avgQuality - byVariant.docs_only.avgQuality;
    summary.ab = byVariant;
  }
  return summary;
}

const PATTERN_EXCERPT_MAX_CHARS = 1500;

function compactPatternRow(row = {}) {
  const rawExcerpt = String(row.source_excerpt ?? row.source ?? '');
  const trimmed = rawExcerpt.trim();
  const excerpt = trimmed.length > PATTERN_EXCERPT_MAX_CHARS
    ? trimmed.slice(0, PATTERN_EXCERPT_MAX_CHARS)
    : trimmed;
  return {
    template_name: row.template_name || '',
    parent_template_name: row.parent_template_name || null,
    pattern_kind: row.pattern_kind || null,
    pattern_set: row.pattern_set || null,
    source_excerpt: excerpt,
  };
}

function compactPatternRows(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns.map(compactPatternRow);
}

export function buildTrialArtifact(row = {}) {
  const result = row.result || {};
  const usage = summarizeModelUsage(result.modelUsageEvents || []);
  const review = result.requirementsReview || {};
  const compile = result.compile || {};
  const preflight = result.preflight || null;
  const firstTurnPreflight = result.firstTurnPreflight || null;
  const evidenceSummary = buildEvidenceSummary(result, review);
  return {
    probe: {
      id: row.probe?.id || '',
      prompt: row.probe?.prompt || '',
      minQualityPercent: row.probe?.minQualityPercent || null,
    },
    variant: row.variant || '',
    requirements: {
      valid: review.valid ?? null,
      id: review.requirementsId || null,
      count: Array.isArray(review.requirements) ? review.requirements.length : 0,
      items: Array.isArray(review.requirements) ? review.requirements : [],
      errors: Array.isArray(review.errors) ? review.errors : [],
      attempts: result.requirementsAttempts || 1,
    },
    preflight: {
      mode: preflight?.mode || null,
      required: preflight?.required ?? null,
      patternCount: Number(preflight?.pattern_count || 0),
      factorHintsDisabled: preflight?.factor_hints_disabled ?? null,
      patterns: compactPatternRows(preflight?.patterns),
    },
    firstTurnPreflight: firstTurnPreflight ? {
      mode: firstTurnPreflight.mode || null,
      required: firstTurnPreflight.required ?? null,
      patternCount: Number(firstTurnPreflight.pattern_count || 0),
      factorHintsDisabled: firstTurnPreflight.factor_hints_disabled ?? null,
      patterns: compactPatternRows(firstTurnPreflight.patterns),
    } : null,
    evidence: evidenceSummary,
    tools: result.toolNames || [],
    compile: {
      errors: Array.isArray(compile.errors) ? compile.errors.length : null,
      warnings: Array.isArray(compile.warnings) ? compile.warnings.length : null,
      errorMessages: (compile.errors || []).map(err => err?.message || String(err)).slice(0, 10),
      warningMessages: (compile.warnings || []).map(warn => warn?.message || String(warn)).slice(0, 10),
    },
    score: row.score || null,
    cost: usage,
    blocked: !!result.blocked,
    providerWarning: result.providerWarning || null,
    error: result.error || null,
    text: result.text || '',
    source: result.source || '',
  };
}

function buildEvidenceSummary(result = {}, review = {}) {
  const requirementFacts = normalizeRequirementFacts(
    Array.isArray(review.requirements) ? review.requirements : []
  );
  const appFacts = extractAppFacts({
    source: result.source || '',
    runtimeEvidence: { tools: result.toolNames || [] },
  });
  const browserFacts = appFacts.filter(fact => fact.kind === 'browser_evidence');
  const stateFacts = appFacts.filter(fact => fact.kind === 'state_evidence');

  return {
    requirementFacts,
    appFacts,
    browser: {
      tools: browserFacts.map(fact => fact.evidence?.[0]?.text).filter(Boolean),
      hasRun: browserFacts.some(fact => fact.action === 'running_app'),
      hasClick: browserFacts.some(fact => fact.action === 'click'),
      hasDom: browserFacts.some(fact => fact.action === 'dom'),
      hasScreenshot: browserFacts.some(fact => fact.action === 'screenshot'),
    },
    state: {
      tools: stateFacts.map(fact => fact.evidence?.[0]?.text).filter(Boolean),
      hasApiRequest: stateFacts.some(fact => fact.action === 'api_request'),
      hasDatabaseRead: stateFacts.some(fact => fact.action === 'state_read'),
    },
  };
}

function safeArtifactName(value = '') {
  return String(value || 'trial').replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'trial';
}

function writeTrialArtifact(row, { dir, index }) {
  if (!dir) return null;
  mkdirSync(dir, { recursive: true });
  const probeId = safeArtifactName(row.probe?.id || 'probe');
  const variant = safeArtifactName(row.variant || 'variant');
  const ordinal = String(index + 1).padStart(2, '0');
  const path = join(dir, `${ordinal}-${probeId}-${variant}.json`);
  writeFileSync(path, JSON.stringify(buildTrialArtifact(row), null, 2));
  return path;
}

async function main() {
  const selectedProbes = selectProbes({
    suiteName: process.env.MEPH_PATTERN_PROBE_SUITE || 'broadFunctionalApps',
    only: process.env.MEPH_PATTERN_PROBE_ONLY || '',
  });
  const envFromFile = loadEnvFile();
  const openRouterKey = process.env.OPENROUTER_API_KEY || envFromFile.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || envFromFile.ANTHROPIC_API_KEY;
  if (backend === 'openrouter' && !openRouterKey) {
    throw new Error('OPENROUTER_API_KEY missing from environment and .env');
  }
  if (backend === 'anthropic' && !anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY missing from environment and .env');
  }
  if (backend === 'openrouter' && isExpensiveProbeModel(model) && process.env.MEPH_PATTERN_PROBE_ALLOW_EXPENSIVE !== '1') {
    throw new Error(`Refusing expensive probe model "${model}". Set MEPH_PATTERN_PROBE_MODEL=${CHEAP_DEFAULT_OPENROUTER_MODEL} or MEPH_PATTERN_PROBE_ALLOW_EXPENSIVE=1.`);
  }
  if (backend === 'anthropic' && isExpensiveAnthropicModel(model) && process.env.MEPH_PATTERN_PROBE_ALLOW_EXPENSIVE !== '1') {
    throw new Error(`Refusing expensive Anthropic probe model "${model}". Set MEPH_PATTERN_PROBE_MODEL=${DEFAULT_ANTHROPIC_MODEL} or MEPH_PATTERN_PROBE_ALLOW_EXPENSIVE=1.`);
  }

  const child = spawn(nodeBin, ['studio/server.js'], {
    cwd: repoRoot,
    env: buildProbeServerEnv({ processEnv: process.env, envFromFile, backend, anthropicKey, openRouterKey, model, port }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLog = [];
  child.stdout.on('data', chunk => serverLog.push(chunk.toString()));
  child.stderr.on('data', chunk => serverLog.push(chunk.toString()));

  try {
    await waitForServer();
    console.log(`meph-pattern-live-probe: server=${base} backend=${backend} model=${model} max_iter=${resolveProbeMaxIter(process.env)}`);
    const artifactDir = process.env.MEPH_PATTERN_PROBE_ARTIFACT_DIR === '0'
      ? ''
      : (process.env.MEPH_PATTERN_PROBE_ARTIFACT_DIR || DEFAULT_ARTIFACT_DIR);
    if (artifactDir) console.log(`artifacts=${artifactDir}`);
    const usageLedger = createUsageLedgerRecorder({ model });
    const rows = [];
    const abMode = process.env.MEPH_PATTERN_PROBE_AB === '1';
    const variants = abMode
      ? [
        { label: 'docs_only', options: { patternPreflight: 'docs', disablePatternSearchPromptGuard: true, disablePatternSearchTool: true, disableFactorHints: true } },
        { label: 'full_hook', options: { patternPreflight: 'full', disablePatternSearchPromptGuard: true, disablePatternSearchTool: false, disableFactorHints: false } },
      ]
      : [{ label: 'default', options: { patternPreflight: 'full', disablePatternSearchPromptGuard: false, disablePatternSearchTool: false, disableFactorHints: false } }];

    for (const probe of selectedProbes) {
      let abortProbe = false;
      for (const variant of variants) {
        if (abortProbe) break;
        console.log(`\n=== ${probe.id} :: ${variant.label} ===`);
        let result;
        let score;
        try {
          result = await runChat(probe.prompt, variant.options, { onModelUsage: usageLedger.record });
          let review = result.requirementsReview;
          const requirementsAttempts = [result];
          for (let revision = 1; review && review.valid !== true && revision <= requirementsRevisionLimit; revision++) {
            console.log(`requirements: invalid; revision ${revision}/${requirementsRevisionLimit}: ${(review.errors || []).join(' | ') || 'no errors provided'}`);
            result = await runRequirementsRevision(probe.prompt, variant.options, result, {
              onModelUsage: usageLedger.record,
              attempt: revision,
            });
            requirementsAttempts.push(result);
            review = result.requirementsReview;
          }
          if (!result.source && review?.valid === true && Array.isArray(review.requirements) && review.requirements.length > 0) {
            console.log(`requirements: valid ${review.requirements.length}; auto-approving for build turn`);
            const requirementsRun = result;
            const buildResult = await runChat(probe.prompt, variant.options, {
              onModelUsage: usageLedger.record,
              approvedRequirementsRun: requirementsRun,
            });
            result = {
              ...buildResult,
              requirementsReview: review,
              requirementsAttempts: requirementsAttempts.length,
              firstTurnPreflight: requirementsRun.preflight,
              preflight: buildResult.preflight || requirementsRun.preflight,
              text: [...requirementsAttempts.map(run => run.text), buildResult.text].filter(Boolean).join('\n\n'),
              toolNames: [...requirementsAttempts.flatMap(run => run.toolNames), ...buildResult.toolNames],
              modelUsageEvents: [
                ...requirementsAttempts.flatMap(run => run.modelUsageEvents || []),
                ...(buildResult.modelUsageEvents || []),
              ],
              events: [
                ...requirementsAttempts.flatMap(run => run.events || []),
                ...(buildResult.events || []),
              ],
            };
          } else if (requirementsAttempts.length > 1) {
            result = {
              ...result,
              requirementsAttempts: requirementsAttempts.length,
              toolNames: requirementsAttempts.flatMap(run => run.toolNames),
              modelUsageEvents: requirementsAttempts.flatMap(run => run.modelUsageEvents || []),
              events: requirementsAttempts.flatMap(run => run.events || []),
              text: requirementsAttempts.map(run => run.text).filter(Boolean).join('\n\n'),
            };
          }
          const providerBlocked = providerBlockMessage(result);
          if (providerBlocked && shouldBlockProviderFailure(result)) {
            result.error = providerBlocked;
            result.blocked = true;
            result.compile = { errors: [{ message: providerBlocked }] };
            score = probe.requiredSourceTerms
              ? scoreGeneratedApp(probe, result)
              : { pass: false, usedSearch: false, usedToolSearch: false, usedPreflightSearch: false, foundExpectedKind: false, foundExpectedTerm: false };
            abortProbe = true;
          } else if (providerBlocked) {
            result.providerWarning = providerBlocked;
            if (probe.requiredSourceTerms) {
              result.compile = await compileSource(result.source);
              score = scoreGeneratedApp(probe, result);
            } else {
              score = scoreProbe(probe, result);
            }
          } else if (probe.requiredSourceTerms) {
            result.compile = await compileSource(result.source);
            score = scoreGeneratedApp(probe, result);
          } else {
            score = scoreProbe(probe, result);
          }
        } catch (err) {
          const message = err?.message || String(err);
          const blocked = isProviderQuotaError(message);
          result = {
            text: '',
            toolNames: [],
            preflight: null,
            source: '',
            error: message,
            blocked,
            compile: { errors: [{ message }] },
          };
          score = probe.requiredSourceTerms
            ? scoreGeneratedApp(probe, result)
            : { pass: false, usedSearch: false, usedToolSearch: false, usedPreflightSearch: false, foundExpectedKind: false, foundExpectedTerm: false };
          if (blocked) abortProbe = true;
        }
        rows.push({ probe, variant: variant.label, result, score });
        const artifactPath = writeTrialArtifact(rows[rows.length - 1], { dir: artifactDir, index: rows.length - 1 });
        if (artifactPath) console.log(`artifact: ${artifactPath}`);
        console.log(`tools: ${result.toolNames.join(', ') || '(none)'}`);
        if (result.error) console.log(`error: ${result.error}`);
        console.log(`preflight: mode=${result.preflight?.mode || 'unknown'} required=${result.preflight?.required ? 'yes' : 'no'} patterns=${result.preflight?.pattern_count ?? 0} factor_hints=${result.preflight?.factor_hints_disabled ? 'off' : 'on'}`);
        if (probe.requiredSourceTerms) {
          const quality = score.quality ? `${score.quality.earned}/${score.quality.total} (${score.quality.band})` : 'n/a';
          console.log(`pass: ${score.pass ? 'yes' : 'no'} quality=${quality} edited=${score.usedEditor ? 'yes' : 'no'} compiles=${score.compiles ? 'yes' : 'no'} missing=${score.missingRequired.join('|') || 'none'} optional=${score.optionalHits.join('|') || 'none'}`);
        } else {
          console.log(`pass: ${score.pass ? 'yes' : 'no'} search=${score.usedSearch ? 'yes' : 'no'} tool=${score.usedToolSearch ? 'yes' : 'no'} preflight=${score.usedPreflightSearch ? 'yes' : 'no'} kind=${score.foundExpectedKind ? 'yes' : 'no'} term=${score.foundExpectedTerm ? 'yes' : 'no'}`);
        }
        console.log(result.text.replace(/\s+/g, ' ').slice(0, 700));
        if (result.source) console.log(result.source.replace(/\s+/g, ' ').slice(0, 700));
      }
      if (abortProbe) break;
    }

    const summary = summarizeRows(rows, { abMode });
    const costTotals = usageLedger.totals();
    summary.openRouterSessionTotalCredits = costTotals.totalCostCredits;
    summary.costReport = formatCostReport(costTotals);
    if (artifactDir) {
      writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2));
    }
    const avgQuality = summary.avgQuality === null ? 'n/a' : `${summary.avgQuality.toFixed(1)}/100`;
    console.log(`\nSUMMARY ${summary.passed}/${summary.total} completed trials passed; avg_quality=${avgQuality}`);
    console.log(summary.costReport);
    console.log(`TOKENS input=${summary.modelInputTokens} output=${summary.modelOutputTokens} generations=${summary.openRouterGenerationIds.join(',') || 'none'}`);
    if (backend === 'openrouter' && !summary.costAccountingReady) {
      console.log('COST ACCOUNTING FAILED: no OpenRouter usage events were observed.');
    }
    if (summary.blockedRows.length) {
      console.log(`ABORTED provider blocked ${summary.blockedRows.length} trial(s): ${summary.blockedRows[0].result.error}`);
    }
    for (const row of rows) {
      const detail = row.probe.requiredSourceTerms
        ? `quality=${row.score.quality ? row.score.quality.percent + '/100' : 'n/a'} min_quality=${row.score.minQualityPercent || 0} compiles=${row.score.compiles ? 'yes' : 'no'} missing=${row.score.missingRequired.join('|') || 'none'}`
        : `tools=${row.result.toolNames.join('|') || 'none'} preflight=${row.score.usedPreflightSearch ? 'yes' : 'no'}`;
      const label = row.result.blocked ? 'BLOCKED' : (row.score.pass ? 'PASS' : 'FAIL');
      console.log(`- ${row.probe.id} ${row.variant}: ${label} ${detail}`);
    }
    if (summary.ab) {
      const docsQuality = summary.ab.docs_only.avgQuality === null ? 'n/a' : summary.ab.docs_only.avgQuality.toFixed(1);
      const hookQuality = summary.ab.full_hook.avgQuality === null ? 'n/a' : summary.ab.full_hook.avgQuality.toFixed(1);
      const qualityDelta = summary.ab.qualityDelta === null ? 'n/a' : `${summary.ab.qualityDelta >= 0 ? '+' : ''}${summary.ab.qualityDelta.toFixed(1)}`;
      console.log(`\nAB SUMMARY docs_only=${summary.ab.docs_only.passed}/${summary.ab.docs_only.total} quality=${docsQuality} full_hook=${summary.ab.full_hook.passed}/${summary.ab.full_hook.total} quality=${hookQuality} delta=${summary.ab.delta} quality_delta=${qualityDelta}`);
    }
    if (backend === 'openrouter' && !summary.costAccountingReady) process.exitCode = 1;
    else if (summary.aborted) process.exitCode = 2;
    else if (summary.passed !== summary.total) process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    const interestingLog = serverLog.join('').split(/\r?\n/)
      .filter(line => /\[FACTOR_DB\]|\[chat\]|\[meph\]|\[hints\]|Clear Studio/.test(line))
      .slice(-80);
    if (interestingLog.length > 0) {
      console.log('\nSERVER SIGNAL');
      for (const line of interestingLog) console.log(line);
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().catch(err => {
    console.error(`meph-pattern-live-probe failed: ${err.message}`);
    process.exit(1);
  });
}
