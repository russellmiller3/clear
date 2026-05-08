import { describe, it, expect, run } from '../lib/testUtils.js';
import { buildChatBody, buildProbeServerEnv, providerBlockMessage, isExpensiveProbeModel, isProviderQuotaError, probeSuites, resolveProbeModel, summarizeRows, scoreAppQualityRubric, scoreGeneratedApp, selectProbes, scoreProbe } from './meph-pattern-live-probe.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('meph pattern live probe harness', () => {
  it('defaults to a cheap OpenRouter model and blocks accidental Sonnet spend', () => {
    expect(resolveProbeModel({})).toEqual('deepseek/deepseek-v4-flash');
    expect(isExpensiveProbeModel('~anthropic/claude-sonnet-latest')).toEqual(true);
    expect(isExpensiveProbeModel('deepseek/deepseek-v4-flash')).toEqual(false);
  });

  it('forces the Ghost OpenRouter server to use the requested probe model', () => {
    const env = buildProbeServerEnv({
      processEnv: { ANTHROPIC_API_KEY: 'sk-ant-test' },
      envFromFile: { OPENROUTER_API_KEY: 'sk-or-file-test' },
      openRouterKey: 'sk-or-run-test',
      model: 'deepseek/deepseek-v4-flash',
      port: 3999,
    });

    expect(env.MEPH_BRAIN).toEqual('openrouter');
    expect(env.OPENROUTER_MODEL).toEqual('deepseek/deepseek-v4-flash');
    expect(env.MEPH_MODEL).toEqual('deepseek/deepseek-v4-flash');
    expect(env.OPENROUTER_API_KEY).toEqual('sk-or-run-test');
    expect(env.PORT).toEqual(3999);
  });

  it('keeps a narrow Marcus-style approval suite for realistic pattern retrieval', () => {
    const narrow = probeSuites.narrowApprovalQueue;

    expect(narrow.length).toBeGreaterThan(5);
    expect(narrow.map(probe => probe.id)).toContain('threshold-routing-change');
    expect(narrow.map(probe => probe.id)).toContain('only-my-pending-items');
    expect(narrow.map(probe => probe.id)).toContain('stale-approval-submit');

    for (const probe of narrow) {
      expect(probe.prompt).toContain('approval');
      expect(probe.prompt).not.toContain('smallest relevant snippet shape');
      expect(probe.expectKinds.length).toBeGreaterThan(0);
      expect(probe.expectTerms.length).toBeGreaterThan(0);
    }
  });

  it('keeps a full-app approval suite for the hook A/B outcome test', () => {
    const fullApps = probeSuites.approvalQueueFullApps;

    expect(fullApps.length).toEqual(7);
    for (const probe of fullApps) {
      expect(probe.prompt).toContain('Build a complete Clear app');
      expect(probe.prompt).not.toContain('pattern DB');
      expect(probe.requiredSourceTerms.length).toBeGreaterThan(2);
    }
  });

  it('can select a suite and then narrow it by probe id', () => {
    const selected = selectProbes({
      suiteName: 'narrowApprovalQueue',
      only: 'threshold-routing-change,stale-approval-submit',
    });

    expect(selected.map(probe => probe.id)).toEqual([
      'threshold-routing-change',
      'stale-approval-submit',
    ]);
  });

  it('scores a probe only when Meph searched and answered with expected primitive evidence', () => {
    const probe = {
      expectKinds: ['concurrency'],
      expectTerms: ['optimistic lock'],
    };

    const noSearch = scoreProbe(probe, {
      toolNames: [],
      text: 'Use a concurrency pattern with optimistic lock.',
    });
    const searched = scoreProbe(probe, {
      toolNames: ['browse_templates'],
      text: 'Use a concurrency pattern with optimistic lock.',
    });
    const preflightSearched = scoreProbe(probe, {
      toolNames: [],
      preflight: { required: true, pattern_count: 2 },
      text: 'Use a concurrency pattern with optimistic lock.',
    });

    expect(noSearch.pass).toEqual(false);
    expect(searched.pass).toEqual(true);
    expect(preflightSearched.pass).toEqual(true);
    expect(preflightSearched.usedSearch).toEqual(true);
  });

  it('builds chat bodies that can isolate hook-on/off A/B trials from prompt prose', () => {
    const off = buildChatBody('Build an approval queue', {
      patternPreflight: 'docs',
      disablePatternSearchPromptGuard: true,
      disablePatternSearchTool: true,
    });
    const on = buildChatBody('Build an approval queue', {
      patternPreflight: 'full',
      disablePatternSearchPromptGuard: true,
      disablePatternSearchTool: false,
    });

    expect(off.patternPreflight).toEqual('docs');
    expect(on.patternPreflight).toEqual('full');
    expect(off.disablePatternSearchPromptGuard).toEqual(true);
    expect(on.disablePatternSearchPromptGuard).toEqual(true);
    expect(off.disablePatternSearchTool).toEqual(true);
    expect(on.disablePatternSearchTool).toEqual(false);
    expect(off.messages[0].content).toContain('Call edit_code with the complete .clear source');
    expect(off.messages[0].content).not.toContain('pattern DB');
  });

  it('scores full-app builds with compile success and required source behavior', () => {
    const probe = {
      requiredSourceTerms: ['page "Approval Queue"', 'approve', 'reject'],
      optionalSourceTerms: ['with optimistic lock'],
    };

    const failed = scoreGeneratedApp(probe, {
      source: 'page "Approval Queue"\nbutton "Approve"',
      toolNames: ['edit_code'],
      compile: { errors: [] },
    });
    const passed = scoreGeneratedApp(probe, {
      source: 'page "Approval Queue"\nbutton "Approve"\nbutton "Reject"\nwith optimistic lock',
      toolNames: ['edit_code'],
      compile: { errors: [] },
    });

    expect(failed.pass).toEqual(false);
    expect(passed.pass).toEqual(true);
    expect(passed.compiles).toEqual(true);
    expect(passed.usedEditor).toEqual(true);
    expect(passed.quality.percent).toBeGreaterThan(0);
  });

  it('scores approval-queue quality beyond compile success and catches misrouting', () => {
    const probe = { requiredSourceTerms: ['approval', '50000', 'manager', 'vp', 'approve', 'reject'] };
    const docsOnlyMisroute = `
build for web and javascript backend
allow signup and login
create a Requests table:
  title, required
  amount (number), required
  status, default 'pending'
  routed_to_role, text

when user sends new_request to /api/requests:
  requires login
  validate new_request:
    title is text, required
    amount is number, required
  route new_request by amount:
    'manager' to manager when amount is less than 50000
    'vp' to vp when amount is greater than or equal to 50000
  new_request's routed_to_role is 'pending'
  saved = save new_request as new Request
  send back saved

when user calls GET /api/requests/pending:
  requires login
  pending = get all Requests where status is 'pending'
  send back pending

when user updates request at /api/requests/:id/approve:
  requires login
  request_item = look up Request where id is this id
  change request_item's status from 'pending' to 'approved'
  save request_item to Requests

when user updates request at /api/requests/:id/reject:
  requires login
  request_item = look up Request where id is this id
  change request_item's status from 'pending' to 'rejected'
  save request_item to Requests

page 'Approvals' at '/approvals':
  section 'Requests':
    display pending as table showing title, amount, routed_to_role, status
    detail panel for selected_request:
      button 'Approve':
        update selected_request at /api/requests/:id/approve
      button 'Reject':
        update selected_request at /api/requests/:id/reject
`;
    const hookOnShape = `
build for web and javascript backend
allow signup and login
create a Requests table:
  title, required
  amount (number), required
  status, default 'pending'
  approval_tier, required

when user sends request to /api/requests:
  requires login
  validate request:
    title is text, required
    amount is number, required
  request's approval_tier is 'manager' when request's amount is less than 50000
  request's approval_tier is 'vp' otherwise
  saved = save request as new Request
  send back saved

when user calls GET /api/requests/queue:
  requires login
  pending = get all Requests where status is 'pending'
  send back pending

when user updates request at /api/requests/:id/approve:
  requires login
  with optimistic lock
  req = look up Request where id is this id
  change req's status from 'pending' to 'approved'
  save req to Requests

when user updates request at /api/requests/:id/reject:
  requires login
  with optimistic lock
  req = look up Request where id is this id
  change req's status from 'pending' to 'rejected'
  save req to Requests

page 'Approval Queue' at '/':
  on page load get pending from '/api/requests/queue'
  section 'Requests Table':
    display pending as table showing title, amount, approval_tier, status
    detail panel for selected_request:
      button 'Approve':
        update selected_request at /api/requests/:id/approve
      button 'Reject':
        update selected_request at /api/requests/:id/reject

page 'Create Request' at '/new':
  button 'Submit Request':
    send request to '/api/requests' with title is request_title and amount is request_amount
`;

    const bad = scoreGeneratedApp(probe, {
      source: docsOnlyMisroute,
      toolNames: ['edit_code'],
      compile: { errors: [], warnings: [{ message: 'first' }, { message: 'second' }] },
    });
    const good = scoreGeneratedApp(probe, {
      source: hookOnShape,
      toolNames: ['edit_code'],
      compile: { errors: [], warnings: [] },
    });
    const badRouting = bad.quality.criteria.find(item => item.id === 'threshold_routing');
    const goodRouting = good.quality.criteria.find(item => item.id === 'threshold_routing');

    expect(bad.pass).toEqual(true);
    expect(badRouting.passed).toEqual(false);
    expect(goodRouting.passed).toEqual(true);
    expect(scoreAppQualityRubric(probe, { source: hookOnShape, toolNames: ['edit_code'], compile: { errors: [], warnings: [] } }).percent).toBeGreaterThan(bad.quality.percent);
  });

  it('does not count provider quota or network blocks as failed app trials', () => {
    expect(isProviderQuotaError('openrouter HTTP 403: Key limit exceeded')).toEqual(true);
    expect(isProviderQuotaError('[openrouter network error: fetch failed]')).toEqual(true);
    expect(isProviderQuotaError('The operation was aborted due to timeout')).toEqual(true);
    expect(providerBlockMessage({ text: 'partial answer [openrouter network error: fetch failed]' })).toContain('openrouter network error');
    expect(isProviderQuotaError('syntax compile failed')).toEqual(false);

    const rows = [
      { probe: { id: 'a', requiredSourceTerms: ['approval'] }, variant: 'docs_only', score: { pass: true }, result: {} },
      { probe: { id: 'a', requiredSourceTerms: ['approval'] }, variant: 'full_hook', score: { pass: false }, result: { blocked: true, error: 'fetch failed' } },
    ];
    const summary = summarizeRows(rows, { abMode: true });

    expect(summary.completedRows.length).toEqual(1);
    expect(summary.blockedRows.length).toEqual(1);
    expect(summary.passed).toEqual(1);
    expect(summary.avgQuality).toEqual(null);
    expect(summary.ab.full_hook.total).toEqual(0);
    expect(summary.aborted).toEqual(true);
  });

  it('summarizes quality deltas for completed A/B app rows', () => {
    const rows = [
      { probe: { id: 'a' }, variant: 'docs_only', score: { pass: true, quality: { percent: 60 } }, result: {} },
      { probe: { id: 'a' }, variant: 'full_hook', score: { pass: true, quality: { percent: 82 } }, result: {} },
    ];
    const summary = summarizeRows(rows, { abMode: true });

    expect(summary.avgQuality).toEqual(71);
    expect(summary.ab.docs_only.avgQuality).toEqual(60);
    expect(summary.ab.full_hook.avgQuality).toEqual(82);
    expect(summary.ab.qualityDelta).toEqual(22);
  });

  it('keeps Meph instructed to search before answering narrow Clear shape questions', () => {
    const prompt = readFileSync(join(process.cwd(), 'studio', 'system-prompt.md'), 'utf8');

    expect(prompt).toContain('MUST call `browse_templates` with `action: "search"` before answering');
    expect(prompt).toContain('threshold routing');
    expect(prompt).toContain('selected-row detail');
    expect(prompt).toContain('approval manager gate');
  });
});

run();
