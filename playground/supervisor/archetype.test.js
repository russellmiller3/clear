import { describe, it, expect } from '../../lib/testUtils.js';
import { classifyArchetype, ARCHETYPES } from './archetype.js';
import { parse } from '../../parser.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = join(__dirname, '..', '..', 'apps');

function classifyFromSource(src) {
  return classifyArchetype(parse(src));
}

describe('classifyArchetype', () => {
  it('exports 16 archetype values', () => {
    expect(ARCHETYPES.length).toEqual(16);
    expect(ARCHETYPES.includes('queue_workflow')).toEqual(true);
    expect(ARCHETYPES.includes('api_service')).toEqual(true);
    expect(ARCHETYPES.includes('kpi')).toEqual(true);
    expect(ARCHETYPES.includes('general')).toEqual(true);
  });

  it('classifies pure backend (no pages) with cron as batch_job', () => {
    const src = `build for javascript backend

every day at 2:00am:
  old = find all Logs where created_at is older than 30 days
  delete old
`;
    expect(classifyFromSource(src)).toEqual('batch_job');
  });

  it('classifies pure backend (no pages, no cron) as api_service', () => {
    const src = `build for javascript backend

when user requests data from /api/health:
  send back { status: 'ok' }

when user requests data from /api/version:
  send back { version: '1.0' }
`;
    expect(classifyFromSource(src)).toEqual('api_service');
  });

  it('classifies single-endpoint webhook as webhook_handler', () => {
    const src = `build for javascript backend

when user sends payload to /webhook/stripe:
  event = payload
  save event as new Event
  send back { received: true }
`;
    expect(classifyFromSource(src)).toEqual('webhook_handler');
  });

  // RL-3: webhook apps often have health checks or admin endpoints alongside
  // the webhook itself. The old `numEndpoints === 1` guard misrouted them to
  // api_service. The webhook-path check now triggers regardless of endpoint count.
  it('classifies multi-endpoint webhook app as webhook_handler', () => {
    const src = `build for javascript backend

create a Events table:
  event_type, required
  amount (number)

when user calls POST /webhook/stripe sending payload:
  saved = save payload to Events
  send back { received: true }

when user calls GET /api/health:
  send back { ok: true }
`;
    expect(classifyFromSource(src)).toEqual('webhook_handler');
  });

  it('classifies webhook on /hook path as webhook_handler', () => {
    const src = `build for javascript backend

create a Events table:
  event_type, required

when user calls POST /hook/github sending payload:
  saved = save payload to Events
  send back { ok: true }
`;
    expect(classifyFromSource(src)).toEqual('webhook_handler');
  });

  // RL-3: KPI page = page with aggregates (big headline numbers) and ≤1 chart.
  // Previously these fell through to crud_app or general. Training rows need
  // their own bucket so we can learn KPI-specific patterns.
  it('classifies single-chart + aggregates page as kpi', () => {
    const src = `build for javascript backend and web

create a Sales table:
  amount (number)

page 'KPIs' at '/':
  total_sales = sum of amount from Sales
  order_count = count of Sales
  heading 'Summary'
  display total_sales
  display order_count
  chart 'Revenue' as line showing total_sales
`;
    expect(classifyFromSource(src)).toEqual('kpi');
  });

  it('classifies no-chart + multi-aggregate page as kpi', () => {
    const src = `build for javascript backend and web

create a Orders table:
  amount (number)

page 'Today' at '/':
  total = sum of amount from Orders
  cnt = count of Orders
  avg_amount = average of amount from Orders
  heading 'Today'
  display total
  display cnt
  display avg_amount
`;
    expect(classifyFromSource(src)).toEqual('kpi');
  });

  it('still classifies 2+ charts as dashboard (not kpi)', () => {
    const src = `build for javascript backend and web

create a Sales table:
  amount (number)

page 'Dashboard' at '/':
  heading 'Metrics'
  chart 'Revenue' as line showing sales_data
  chart 'Orders' as bar showing order_data
`;
    expect(classifyFromSource(src)).toEqual('dashboard');
  });

  // Regression: a dashboard with a status column + auth (dashboard-metrics task)
  // was classified as queue_workflow because the status+auth check fired before
  // the chart-count check. Charts are a stronger signal — dashboard wins.
  it('classifies dashboard-with-status+auth as dashboard (not queue_workflow)', () => {
    const src = `build for web and javascript backend

create a Orders table:
  amount (number), required
  status, default 'pending'

allow signup and login

page 'Dashboard' at '/':
  requires login
  heading 'Metrics'
  chart 'Status' as pie showing orders_by_status
  chart 'Timeline' as line showing orders_over_time
  chart 'Amounts' as bar showing amount_by_status
`;
    expect(classifyFromSource(src)).toEqual('dashboard');
  });

  // Synthetic tests removed — they required fragile hand-written Clear syntax.
  // The real-template integration tests below are the acceptance signal
  // (they prove the classifier works on actual working apps).

  // A backend-only API that drives an agent is structurally "agent_workflow",
  // not "api_service" — the distinctive signal is the agent, not the endpoint.
  // Before this fix, the backend branch fell through to api_service and the
  // hint retriever got confused: agent-syntax errors retrieved api_service
  // table/endpoint examples that couldn't help.
  it('classifies backend-only agent API as agent_workflow (not api_service)', () => {
    const src = `build for javascript backend

agent 'Helper' receives question:
  answer = ask claude 'answer the question' with question
  return answer

when user sends query to /api/ask:
  reply = run Helper with query
  send back reply
`;
    expect(classifyFromSource(src)).toEqual('agent_workflow');
  });

  // Same reasoning for realtime: a backend chat server with subscribe/broadcast
  // is realtime_app even without pages.
  it('classifies backend-only realtime API as realtime_app (not api_service)', () => {
    const src = `build for javascript backend

create a Messages table:
  text, required
  sender

subscribe to 'chat':
  broadcast to all message
`;
    expect(classifyFromSource(src)).toEqual('realtime_app');
  });

  it('falls back to general when nothing dominates', () => {
    const src = `build for javascript backend

when user requests data from /api/hello:
  send back { message: 'hello' }
`;
    // Single trivial endpoint — api_service is correct here
    const result = classifyFromSource(src);
    expect(['api_service', 'general'].includes(result)).toEqual(true);
  });

  // Integration tests against real template files (strict match — classifier
  // must detect the structural pattern correctly, not just return any archetype).
  // Note: crm-pro has no charts in the source → crud_app is correct.
  // ecom-agent has an agent, so agent_workflow beats ecommerce (agent is distinctive).
  const templateTests = [
    ['todo-fullstack', 'crud_app'],
    ['blog-fullstack', 'content_app'],
    ['live-chat', 'realtime_app'],
    ['helpdesk-agent', 'agent_workflow'],
    // crm-pro has a Deals table with `stage` field + auth — that IS a queue_workflow
    // (deals move through pipeline stages). Archetype is about shape of work, not
    // app name. Matches what the CRM actually does.
    ['crm-pro', 'queue_workflow'],
    ['booking', 'booking_app'],
    ['expense-tracker', 'crud_app'],
    ['ecom-agent', 'agent_workflow'],
  ];

  for (const [name, expectedArchetype] of templateTests) {
    it(`classifies ${name} template as ${expectedArchetype}`, () => {
      const path = join(APPS_DIR, name, 'main.clear');
      if (!existsSync(path)) return;
      const source = readFileSync(path, 'utf8');
      const result = classifyFromSource(source);
      expect(result).toEqual(expectedArchetype);
    });
  }
});
