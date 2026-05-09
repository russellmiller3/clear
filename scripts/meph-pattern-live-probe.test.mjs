import { describe, it, expect, run } from '../lib/testUtils.js';
import { buildApprovedAppChatBody, buildChatBody, buildProbeServerEnv, buildRequirementsRevisionChatBody, buildTrialArtifact, providerBlockMessage, shouldBlockProviderFailure, isExpensiveAnthropicModel, isExpensiveProbeModel, isProviderQuotaError, probeSuites, resolveProbeBackend, resolveProbeMaxIter, resolveProbeModel, resolveProbePort, summarizeRows, scoreAppQualityRubric, scoreGeneratedApp, selectProbes, scoreProbe } from './meph-pattern-live-probe.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('meph pattern live probe harness', () => {
  it('defaults to a cheap OpenRouter model and blocks accidental Sonnet spend', () => {
    expect(resolveProbeBackend({})).toEqual('openrouter');
    expect(resolveProbeModel({})).toEqual('deepseek/deepseek-v4-flash');
    expect(isExpensiveProbeModel('~anthropic/claude-sonnet-latest')).toEqual(true);
    expect(isExpensiveProbeModel('deepseek/deepseek-v4-flash')).toEqual(false);
  });

  it('can run direct Haiku probes without routing through OpenRouter', () => {
    expect(resolveProbeBackend({ MEPH_PATTERN_PROBE_BACKEND: 'anthropic' })).toEqual('anthropic');
    expect(resolveProbeModel({ MEPH_PATTERN_PROBE_BACKEND: 'anthropic' })).toEqual('claude-haiku-4-5-20251001');
    expect(isExpensiveAnthropicModel('claude-sonnet-4-5-20250929')).toEqual(true);
    expect(isExpensiveAnthropicModel('claude-haiku-4-5-20251001')).toEqual(false);

    const env = buildProbeServerEnv({
      processEnv: { OPENROUTER_API_KEY: 'sk-or-test', MEPH_BRAIN: 'openrouter' },
      envFromFile: { ANTHROPIC_API_KEY: 'sk-ant-file-test' },
      backend: 'anthropic',
      anthropicKey: 'sk-ant-run-test',
      openRouterKey: 'sk-or-run-test',
      model: 'claude-haiku-4-5-20251001',
      port: 3998,
    });

    expect(env.MEPH_BRAIN).toEqual(undefined);
    expect(env.ANTHROPIC_API_KEY).toEqual('sk-ant-run-test');
    expect(env.MEPH_MODEL).toEqual('claude-haiku-4-5-20251001');
    expect(env.PORT).toEqual(3998);
  });

  it('defaults live probes away from the studio server-test port', () => {
    expect(resolveProbePort({})).toEqual('3478');
    expect(resolveProbePort({ MEPH_PATTERN_PROBE_PORT: '3499' })).toEqual('3499');
    expect(resolveProbePort({ PORT: '3501' })).toEqual('3501');
  });

  it('caps live probe Meph iterations unless the probe explicitly opts higher', () => {
    expect(resolveProbeMaxIter({})).toEqual('12');
    expect(resolveProbeMaxIter({ MEPH_MAX_ITER: '25' })).toEqual('12');
    expect(resolveProbeMaxIter({ MEPH_PATTERN_PROBE_MAX_ITER: '6' })).toEqual('6');

    const env = buildProbeServerEnv({
      processEnv: { OPENROUTER_API_KEY: 'sk-or-test', MEPH_MAX_ITER: '25' },
      openRouterKey: 'sk-or-run-test',
      model: 'google/gemini-3-flash-preview',
      port: 3999,
    });

    expect(env.MEPH_MAX_ITER).toEqual('12');
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

  it('keeps a broad full-app suite for the hook A/B outcome test', () => {
    const fullApps = probeSuites.broadFunctionalApps;

    expect(fullApps.length).toEqual(7);
    expect(fullApps.map(probe => probe.id)).toEqual([
      'revenue-ops-dashboard-app',
      'realtime-support-room-app',
      'helpdesk-rag-agent-app',
      'booking-workflow-app',
      'expense-analytics-app',
      'ecom-support-agent-app',
      'deal-desk-rules-app',
    ]);
    for (const probe of fullApps) {
      expect(probe.prompt).toContain('Build a complete Clear app');
      expect(probe.minQualityPercent >= 70).toEqual(true);
      expect(probe.qualityCriteria.length).toBeGreaterThan(5);
      expect(probe.prompt).not.toContain('pattern DB');
      expect(probe.requiredSourceTerms.length).toBeGreaterThan(5);
    }
    const approvalish = fullApps.filter(probe => /approval queue/i.test(probe.prompt));
    expect(approvalish.length).toEqual(0);
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
    expect(off.disableFactorHints).toEqual(true);
    expect(on.disableFactorHints).toEqual(false);
    expect(on.requirementsMode).toEqual('auto');
    expect(off.messages[0].content).toContain('Call edit_code with the complete .clear source');
    expect(off.messages[0].content).not.toContain('pattern DB');
  });

  it('builds the second-turn body that approves valid requirements before app scoring', () => {
    const body = buildApprovedAppChatBody('Build a CRM dashboard', {
      patternPreflight: 'full',
      disablePatternSearchPromptGuard: true,
      disablePatternSearchTool: false,
      disableFactorHints: false,
    }, {
      assistantText: 'requirements:\n  logged in users can create deals',
      requirements: ['logged in users can create deals'],
      requirementsId: 'req_123',
    });

    expect(body.messages.length).toEqual(3);
    expect(body.messages[2].content).toContain('Approved');
    expect(body.messages[2].content).toContain('Build the app now');
    expect(body.approvedRequirements).toEqual(['logged in users can create deals']);
    expect(body.approvedRequirementsId).toEqual('req_123');
    expect(body.patternPreflight).toEqual('full');
    expect(body.disablePatternSearchTool).toEqual(false);
  });

  it('builds a requirements revision body with deterministic validation errors', () => {
    const body = buildRequirementsRevisionChatBody('Build a CRM dashboard', {
      patternPreflight: 'full',
      disablePatternSearchPromptGuard: true,
      disablePatternSearchTool: false,
    }, {
      assistantText: 'requirements:\n  users can create deals',
      errors: ['requirements need e2e coverage for update/decision.'],
      attempt: 1,
    });

    expect(body.messages.length).toEqual(3);
    expect(body.messages[1].content).toContain('users can create deals');
    expect(body.messages[2].content).toContain('not approved');
    expect(body.messages[2].content).toContain('update/decision');
    expect(body.messages[2].content).toContain('Return only a corrected requirements block');
    expect(body.requirementsMode).toEqual('auto');
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

  it('requires usable quality for full-app builds, not just keyword presence', () => {
    const probe = {
      requiredSourceTerms: ['approval', '50000', 'manager', 'vp', 'approve', 'reject'],
      minQualityPercent: 70,
    };
    const weakKeywordApp = {
      source: `
build for web and javascript backend
allow signup and login
create a Requests table:
  amount (number), required
  status, default 'pending'
  approval_tier
when user calls GET /api/requests/pending:
  requires login
  pending = get all Requests where status is 'pending'
  send back pending
page "Approval Queue":
  display pending as table showing amount, status, approval_tier
  button "Approve":
    show "approve"
  button "Reject":
    show "reject"
# manager vp 50000 approval
`,
      toolNames: ['edit_code'],
      compile: { errors: [], warnings: [] },
    };
    const score = scoreGeneratedApp(probe, weakKeywordApp);

    expect(score.missingRequired).toEqual([]);
    expect(score.quality.percent).toBeLessThan(70);
    expect(score.pass).toEqual(false);
  });

  it('scores broad full-app builds with per-domain rubrics', () => {
    const probe = {
      requiredSourceTerms: ['companies', 'contacts', 'deals', 'chart'],
      minQualityPercent: 70,
      qualityCriteria: [
        { id: 'crm_tables', label: 'CRM tables exist', points: 25, all: [/create a Companies table/i, /create a Contacts table/i, /create a Deals table/i] },
        { id: 'chart', label: 'Chart exists', points: 25, all: [/chart/i, /stage/i] },
        { id: 'search', label: 'Search exists', points: 25, any: [/search/i, /filter/i] },
      ],
    };
    const score = scoreGeneratedApp(probe, {
      source: `
build for web and javascript backend
create a Companies table:
  name, required
create a Contacts table:
  name, required
create a Deals table:
  stage, required
  amount (number), required
page "Revenue":
  search deals by stage
  chart "Deals by stage" as bar from deals grouped by stage
`,
      toolNames: ['edit_code'],
      compile: { errors: [], warnings: [] },
    });

    expect(score.quality.percent >= 70).toEqual(true);
    expect(score.pass).toEqual(true);
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

  it('does not block source-backed trials just because the provider failed after editing', () => {
    expect(shouldBlockProviderFailure({
      text: '[openrouter network error: fetch failed]',
      source: '',
    })).toEqual(true);
    expect(shouldBlockProviderFailure({
      text: '[openrouter network error: fetch failed]',
      source: 'build for web',
    })).toEqual(false);
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

  it('summarizes OpenRouter cost from model usage events', () => {
    const rows = [
      {
        probe: { id: 'a' },
        variant: 'docs_only',
        score: { pass: true },
        result: {
          modelUsageEvents: [
            { usage: { input_tokens: 100, output_tokens: 20, openrouter_cost: 0.04, openrouter_generation_id: 'gen_a' } },
          ],
        },
      },
      {
        probe: { id: 'a' },
        variant: 'full_hook',
        score: { pass: true },
        result: {
          modelUsageEvents: [
            { usage: { prompt_tokens: 300, completion_tokens: 40, cost: 0.06, generation_id: 'gen_b' } },
          ],
        },
      },
    ];
    const summary = summarizeRows(rows, { abMode: true });

    expect(summary.modelInputTokens).toEqual(400);
    expect(summary.modelOutputTokens).toEqual(60);
    expect(summary.openRouterCostCredits).toEqual(0.1);
    expect(summary.openRouterGenerationIds).toEqual(['gen_a', 'gen_b']);
    expect(summary.costAccountingReady).toEqual(true);
  });

  it('builds a durable per-trial artifact for research analysis', () => {
    const artifact = buildTrialArtifact({
      probe: { id: 'crm', prompt: 'Build a CRM app' },
      variant: 'full_hook',
      result: {
        text: 'done',
        source: `build for web
page 'Deals':
  button 'Approve':
    update selected_deal at /api/deals/:id/approve`,
        toolNames: ['edit_code', 'run_app', 'click_element', 'read_dom', 'screenshot_output'],
        preflight: { mode: 'full', pattern_count: 3 },
        firstTurnPreflight: { mode: 'docs', pattern_count: 0 },
        requirementsReview: {
          valid: true,
          requirements: ['logged in users can approve deals from a visible Deals page'],
          requirementsId: 'req_123',
        },
        compile: { errors: [], warnings: [] },
        modelUsageEvents: [
          { usage: { input_tokens: 100, output_tokens: 20, openrouter_cost: 0.04, openrouter_generation_id: 'gen_a' } },
        ],
      },
      score: { pass: true, quality: { percent: 88 } },
    });

    expect(artifact.probe.id).toEqual('crm');
    expect(artifact.variant).toEqual('full_hook');
    expect(artifact.requirements.count).toEqual(1);
    expect(artifact.preflight.patternCount).toEqual(3);
    expect(artifact.compile.errors).toEqual(0);
    expect(artifact.score.pass).toEqual(true);
    expect(artifact.cost.openRouterCostCredits).toEqual(0.04);
    expect(artifact.cost.openRouterGenerationIds).toEqual(['gen_a']);
    expect(artifact.evidence.requirementFacts.length).toBeGreaterThan(0);
    expect(artifact.evidence.appFacts.length).toBeGreaterThan(0);
    expect(artifact.evidence.browser.hasScreenshot).toEqual(true);
    expect(artifact.source).toContain("page 'Deals'");
  });

  it('keeps Meph instructed to search before answering narrow Clear shape questions', () => {
    const prompt = readFileSync(join(process.cwd(), 'studio', 'system-prompt.md'), 'utf8');

    expect(prompt).toContain('MUST call `browse_templates` with `action: "search"` before answering');
    expect(prompt).toContain('threshold routing');
    expect(prompt).toContain('selected-row detail');
    expect(prompt).toContain('approval manager gate');
  });

  it('teaches Meph to emit checkable requirements before complex app builds', () => {
    const prompt = readFileSync(join(process.cwd(), 'studio', 'system-prompt.md'), 'utf8');
    const sample = readFileSync(join(process.cwd(), 'requirements-sample.md'), 'utf8');

    expect(prompt).toContain('requirements-sample.md');
    expect(prompt).toContain('Checkable requirement types');
    expect(prompt).toContain('Vague user ask -> checkable requirements');
    expect(prompt).toContain('CRUD lifecycle');
    expect(prompt).toContain('domain rule');
    expect(prompt).toContain('runtime evidence');

    expect(sample).toContain('requirements:');
    expect(sample).toContain('CRUD lifecycle');
    expect(sample).toContain('Approval queue');
    expect(sample).toContain('Booking calendar');
    expect(sample).toContain('Bad requirements');
  });
});

run();
