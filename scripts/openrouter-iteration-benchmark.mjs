#!/usr/bin/env node
// Repeatable OpenRouter iteration benchmark harness.
//
// Future-agent operating notes live in:
//   docs/openrouter-iteration-benchmark-harness.md
//
// Main HTML result files:
//   docs/openrouter-model-benchmark-2026-05-12.html
//   docs/openrouter-iteration-benchmark-2026-05-12.html
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileProgram } from '../index.js';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_SPEND_CAP_USD = 3.00;
export const DEFAULT_DB_PATH = path.join(process.cwd(), 'studio', 'factor-db.sqlite');
export const DEFAULT_DOC_NAMES = Object.freeze(['SYNTAX.md', 'AI-INSTRUCTIONS.md']);
export const DEFAULT_DOC_TOOL_MODE = 'required';
export const DEFAULT_MAX_TOOL_ROUNDS = 4;
export const DEFAULT_DOC_MAX_CHARS = 40000;
export const DEFAULT_PATTERN_RESULT_LIMIT = 8;

export const DEFAULT_MODELS = Object.freeze([
  { key: 'gemini-flash', label: 'Gemini 3 Flash Preview', id: 'google/gemini-3-flash-preview', tier: 'cheap', inPerM: 0.50, outPerM: 3.00 },
  { key: 'gemini-pro', label: 'Gemini 3.1 Pro Preview', id: 'google/gemini-3.1-pro-preview', tier: 'premium', inPerM: 2.00, outPerM: 12.00 },
  { key: 'opus', label: 'Claude Opus 4.7', id: 'anthropic/claude-opus-4.7', tier: 'premium', inPerM: 5.00, outPerM: 25.00 },
  { key: 'sonnet', label: 'Claude Sonnet 4.6', id: 'anthropic/claude-sonnet-4.6', tier: 'premium', inPerM: 3.00, outPerM: 15.00 },
  { key: 'gpt-5.5', label: 'GPT-5.5', id: 'openai/gpt-5.5', tier: 'premium', inPerM: 5.00, outPerM: 30.00 },
  { key: 'grok-3', label: 'Grok 3', id: 'x-ai/grok-3', tier: 'premium', inPerM: 3.00, outPerM: 15.00 },
  { key: 'deepseek', label: 'DeepSeek V4 Flash', id: 'deepseek/deepseek-v4-flash', tier: 'cheap', inPerM: 0.14, outPerM: 0.28 },
  { key: 'hy3', label: 'Tencent Hy3 Preview', id: 'tencent/hy3-preview', tier: 'cheap', inPerM: 0.066, outPerM: 0.26 },
  { key: 'qwen3.5', label: 'Qwen3.5 Plus', id: 'qwen/qwen3.5-plus-20260420', tier: 'cheap', inPerM: 0.40, outPerM: 2.40 },
  { key: 'ring-free', label: 'Ring 2.6 1T Free', id: 'inclusionai/ring-2.6-1t:free', tier: 'cheap', inPerM: 0, outPerM: 0 },
  { key: 'ling', label: 'Ling 2.6 1T', id: 'inclusionai/ling-2.6-1t', tier: 'cheap', inPerM: 0.30, outPerM: 2.50 },
  { key: 'laguna-free', label: 'Laguna M.1 Free', id: 'poolside/laguna-m.1:free', tier: 'cheap', inPerM: 0, outPerM: 0 },
]);

export const DEFAULT_MODES = Object.freeze([
  { id: 'minimal', label: 'Minimal feedback', description: 'Only tells the model that the app failed.' },
  { id: 'error_hints', label: 'Error hints', description: 'Gives compiler errors and unmet requirement checks.' },
  { id: 'pattern_hints', label: 'Error + pattern hints', description: 'Gives errors plus task-specific Clear snippets.' },
]);

function re(pattern, flags = 'i') {
  return new RegExp(pattern, flags);
}

export const BENCHMARK_TASKS = Object.freeze([
  {
    id: 'deal_desk_approval',
    family: 'workflow_crud',
    title: 'Deal desk approval workflow',
    userAsk: [
      'Build a Deal Desk app in Clear for sales managers and finance approvers.',
      'Target: web and javascript backend.',
      'Database: local memory.',
      'DealRequests table: customer_name required, owner_email required, annual_contract_value number required, discount_percent number, stage default draft, margin_percent number, approval_status default pending, created_at_date date.',
      'DealLineItems table: deal_id required, product_name required, quantity number required, list_price number required, net_price number required.',
      'ApprovalComments table: deal_id required, author_email required, body required, decision text, created_at_date date.',
      'POST /api/deals creates a deal request.',
      'POST /api/deals/:id/line-items adds a line item.',
      'POST /api/deals/:id/submit calculates discount and margin, then marks the deal submitted.',
      'POST /api/deals/:id/approve records an approval comment and marks the deal approved.',
      'POST /api/deals/:id/reject records a rejection comment and marks the deal rejected.',
      'GET /api/deals lists deals and supports filtering by stage and approval_status.',
      "Page '/' has a deal form, line-item editor, filtered queue, approval actions, comment history, and a margin/discount summary.",
    ].join('\n'),
    requiredChecks: [
      { id: 'target_db', label: 'Targets web + JS backend and local memory', all: [re('build for web and javascript backend'), re('database is local memory')] },
      { id: 'deal_tables', label: 'Deal, line item, and comment tables exist', all: [re('create a dealrequests? table\\s*:'), re('customer_name'), re('annual_contract_value'), re('discount_percent'), re('margin_percent'), re('approval_status'), re('create a deallineitems? table\\s*:'), re('product_name'), re('net_price'), re('create a approvalcomments? table\\s*:')] },
      { id: 'deal_create_submit', label: 'Create and submit endpoints exist with calculation intent', all: [re('/api/deals'), re('/api/deals/:id/submit'), re('discount'), re('margin'), re('submitted')] },
      { id: 'approval_decisions', label: 'Approve/reject endpoints record comments and status', all: [re('/api/deals/:id/approve'), re('/api/deals/:id/reject'), re('approvalcomments?'), re('approved'), re('rejected')] },
      { id: 'filters', label: 'Deal listing supports stage/status filters', all: [re('get all dealrequests?|get deals'), re('filter|where'), re('stage'), re('approval_status')] },
      { id: 'page_flow', label: 'Page covers queue, line items, approval actions, comments, and summary', all: [re("page ['\"]deal desk['\"] at ['\"]/['\"]"), re('line-item|line item|lineitems?'), re('display .* as table'), re('approve'), re('reject'), re('comment'), re('margin|discount')] },
    ],
    patternHints: [
      'create a DealRequests table:',
      '  customer_name, required',
      '  owner_email, required',
      '  annual_contract_value is number, required',
      '  discount_percent is number',
      "  stage, default 'draft'",
      '  margin_percent is number',
      "  approval_status, default 'pending'",
      '  created_at_date is date',
      '',
      'create a DealLineItems table:',
      '  deal_id, required',
      '  product_name, required',
      '  quantity is number, required',
      '  list_price is number, required',
      '  net_price is number, required',
      '',
      'when user sends changes to /api/deals/:id/approve:',
      '  deal = look up DealRequests with this id',
      '  if deal is not empty:',
      "    change deal's approval_status from 'pending' to 'approved'",
      '    update deal to DealRequests',
      '    save changes as new ApprovalComments',
      '  send back deal',
    ].join('\n'),
  },
  {
    id: 'twitter_scheduler',
    family: 'external_api_scheduler',
    title: 'Scheduled Twitter post publisher',
    userAsk: [
      'Build a Twitter Scheduler app in Clear.',
      'Target: web and javascript backend.',
      'Database: local memory.',
      "Allow outgoing requests to: 'https://api.twitter.com/2/tweets'.",
      'ScheduledPosts table: content required, scheduled_at text required, status default pending, retry_count number, error_message text, posted_at text, created_at_date date.',
      'POST /api/schedule creates a scheduled tweet.',
      'GET /api/scheduled lists every scheduled tweet.',
      'DELETE /api/schedule/:id cancels a pending tweet.',
      'Every 1 minute, find due pending tweets, post them to X/Twitter API v2 with bearer env TWITTER_BEARER_TOKEN, mark success as posted, and record failures with retry_count and error_message.',
      "Page '/' has a compose form, scheduled queue, status table, cancel action, and failure messages.",
    ].join('\n'),
    requiredChecks: [
      { id: 'target_db_allowlist', label: 'Target, DB, and outgoing allowlist are declared', all: [re('build for web and javascript backend'), re('database is local memory'), re('allow outgoing requests to'), re('https://api\\.twitter\\.com/2/tweets')] },
      { id: 'scheduled_table', label: 'ScheduledPosts tracks content, schedule, status, retry, errors, and post time', all: [re('create a scheduledposts? table\\s*:'), re('content.*required|content, required'), re('scheduled_at'), re('status.*pending'), re('retry_count'), re('error_message'), re('posted_at')] },
      { id: 'schedule_endpoints', label: 'Create, list, and cancel endpoints exist', all: [re('when user sends (tweet|scheduled|post|changes) to /api/schedule'), re('when user calls get /api/scheduled'), re('delete.*\\/api\\/schedule\\/:id|when user calls delete /api/schedule/:id'), re('cancelled')] },
      { id: 'cron_api_call', label: 'Scheduler posts due pending tweets to Twitter API', all: [re('every 1 minute'), re('pending'), re('scheduled_at'), re('call api [\'"]https://api\\.twitter\\.com/2/tweets'), re('env\\([\'"]TWITTER_BEARER_TOKEN[\'"]\\)'), re('posted')] },
      { id: 'failure_handling', label: 'Failures update retry count and error message', all: [re('failed|error_message'), re('retry_count'), re('update .* to scheduledposts?')] },
      { id: 'page_table', label: 'Page has compose, queue, cancel, statuses, and errors', all: [re("page .* at ['\"]/['\"]"), re('text area'), re('display .* as table'), re('[\'"]Cancel[\'"]\\s*:'), re('error_message|failure')] },
    ],
    patternHints: [
      "allow outgoing requests to: 'https://api.twitter.com/2/tweets'",
      '',
      'every 1 minute:',
      '  now = current time',
      "  now_str = format date now as 'YYYY-MM-DD HH:MM'",
      "  due_posts = get all ScheduledPosts where status is 'pending'",
      '  for each item in due_posts:',
      "    result = call api 'https://api.twitter.com/2/tweets' with method 'POST' with bearer env('TWITTER_BEARER_TOKEN') sending { text: item.content }",
      "    change item's status from 'pending' to 'posted'",
      "    item's posted_at is now_str",
      '    update item to ScheduledPosts',
    ].join('\n'),
  },
  {
    id: 'stripe_reconciliation_etl',
    family: 'etl',
    title: 'Stripe payout reconciliation ETL',
    userAsk: [
      'Build a Stripe reconciliation dashboard in Clear for finance ops.',
      'Target: web and javascript backend.',
      'Database: local memory.',
      "Allow outgoing requests to: 'https://api.stripe.com'.",
      'StripeAccounts table: account_name required, stripe_account_id required, last_synced_at text.',
      'Payouts table: stripe_payout_id required, amount number required, currency text, arrival_date text, status text, created_at_date date.',
      'BalanceTransactions table: stripe_transaction_id required, payout_id text, source_type text, gross number, fee number, net number, occurred_at text.',
      'ReconciliationFindings table: payout_id required, finding_type text, severity text, message text, created_at_date date.',
      'POST /api/accounts creates a Stripe account to monitor.',
      'POST /api/sync/stripe fetches payouts and balance transactions from Stripe, transforms them into local rows, deduplicates by Stripe IDs, and writes reconciliation findings for missing or mismatched totals.',
      'GET /api/reconciliation lists payouts, transactions, and findings.',
      'Every 1 hour, sync all monitored Stripe accounts using bearer env STRIPE_SECRET_KEY.',
      "Page '/' shows sync status, payout table, mismatch findings, fee totals, and a chart of net payout by date.",
    ].join('\n'),
    requiredChecks: [
      { id: 'target_db_allowlist', label: 'Target, DB, and Stripe allowlist are declared', all: [re('build for web and javascript backend'), re('database is local memory'), re('allow outgoing requests to'), re('api\\.stripe\\.com')] },
      { id: 'etl_tables', label: 'Account, payout, transaction, and finding tables exist', all: [re('create a stripeaccounts? table\\s*:'), re('create a payouts table\\s*:'), re('create a balancetransactions? table\\s*:'), re('create a reconciliationfindings? table\\s*:'), re('stripe_payout_id'), re('stripe_transaction_id')] },
      { id: 'sync_endpoint', label: 'Manual sync fetches and transforms Stripe data', all: [re('/api/sync/stripe'), re('call api .*api\\.stripe\\.com'), re('payout'), re('balance'), re('save .* as new payouts?|save .* as new balancetransactions?')] },
      { id: 'dedupe_and_findings', label: 'Dedupe and reconciliation findings are represented', all: [re('dedupe|duplicate|stripe_payout_id|stripe_transaction_id'), re('mismatch|missing|reconciliationfindings?'), re('gross|fee|net')] },
      { id: 'scheduled_sync', label: 'Hourly sync uses Stripe secret bearer token', all: [re('every 1 hour'), re('env\\([\'"]STRIPE_SECRET_KEY[\'"]\\)'), re('stripeaccounts?')] },
      { id: 'dashboard', label: 'Dashboard shows sync, payouts, findings, totals, and chart', all: [re("page .* at ['\"]/['\"]"), re('sync'), re('display .* as table'), re('finding|mismatch'), re('fee|net'), re('chart')] },
    ],
    patternHints: [
      "allow outgoing requests to: 'https://api.stripe.com'",
      '',
      'when user sends changes to /api/sync/stripe:',
      '  accounts = get all StripeAccounts',
      '  for each account in accounts:',
      "    payouts = call api 'https://api.stripe.com/v1/payouts' with method 'GET' with bearer env('STRIPE_SECRET_KEY') sending { account: account.stripe_account_id }",
      '    for each payout in payouts list:',
      '      save payout as new Payouts',
      '',
      'every 1 hour:',
      '  send changes to /api/sync/stripe',
    ].join('\n'),
  },
  {
    id: 'customer_health_ops',
    family: 'analytics_workflow',
    title: 'Customer health operations cockpit',
    userAsk: [
      'Build a customer health operations app in Clear for a B2B SaaS team.',
      'Target: web and javascript backend.',
      'Database: local memory.',
      'Accounts table: company_name required, owner_email required, plan text, health_score number, renewal_date text, risk_level default green, created_at_date date.',
      'UsageEvents table: account_id required, event_name required, active_users number, seats number, occurred_at text.',
      'Interventions table: account_id required, owner_email required, action_required required, due_at text, status default open, created_at_date date.',
      'POST /api/accounts creates an account.',
      'POST /api/usage imports usage events for an account.',
      'POST /api/accounts/:id/score recalculates health_score and risk_level from usage, renewal date, and open interventions.',
      'GET /api/accounts lists accounts filtered by owner_email, risk_level, and renewal window.',
      'POST /api/interventions creates a follow-up action.',
      "Page '/' shows an account table, risk filters, selected account detail, open interventions, renewal-risk chart, and a button to recalculate scores.",
    ].join('\n'),
    requiredChecks: [
      { id: 'target_db', label: 'Targets web + JS backend and local memory', all: [re('build for web and javascript backend'), re('database is local memory')] },
      { id: 'ops_tables', label: 'Accounts, UsageEvents, and Interventions tables exist', all: [re('create a accounts table\\s*:'), re('health_score'), re('renewal_date'), re('risk_level'), re('create a usageevents? table\\s*:'), re('active_users'), re('seats'), re('create a interventions? table\\s*:')] },
      { id: 'ingest_and_score', label: 'Usage import and score recalculation endpoints exist', all: [re('/api/usage'), re('/api/accounts/:id/score'), re('health_score'), re('risk_level'), re('interventions?')] },
      { id: 'filters', label: 'Account list supports owner, risk, and renewal filters', all: [re('get all accounts|get accounts'), re('filter|where'), re('owner_email'), re('risk_level'), re('renewal')] },
      { id: 'intervention_flow', label: 'Intervention endpoint creates follow-up actions', all: [re('/api/interventions'), re('action_required'), re('status.*open'), re('save .* as new interventions?')] },
      { id: 'dashboard', label: 'Page shows table, filters, detail, interventions, chart, and recalc button', all: [re("page .* at ['\"]/['\"]"), re('display .* as table'), re('filter'), re('selected|detail'), re('intervention'), re('chart'), re('recalculate|score')] },
    ],
    patternHints: [
      'create a Accounts table:',
      '  company_name, required',
      '  owner_email, required',
      '  health_score is number',
      "  risk_level, default 'green'",
      '  renewal_date is text',
      '',
      'when user sends changes to /api/accounts/:id/score:',
      '  account = look up Accounts with this id',
      '  usage = get all UsageEvents where account_id is id',
      '  actions = get all Interventions where account_id is id',
      '  if account is not empty:',
      "    change account's risk_level from account's risk_level to 'yellow'",
      '    update account to Accounts',
      '  send back account',
    ].join('\n'),
  },
]);

export function initialPrompt(task) {
  return [
    'Build the app from this user request:',
    task.userAsk,
    '',
    'Output exactly these two sections:',
    'REQUIREMENTS:',
    '- requirement line',
    '- requirement line',
    '',
    'CLEAR_SOURCE:',
    '```clear',
    'build for web and javascript backend',
    '...',
    '```',
    '',
    'Rules:',
    '- The Clear source itself must include a requirements: block near the top.',
    '- The requirements must be observable, not vague.',
    '- The Clear source must compile.',
    '- Output no prose outside REQUIREMENTS and CLEAR_SOURCE.',
  ].join('\n');
}

export function stripFence(text) {
  const trimmed = String(text || '').trim();
  const fence = trimmed.match(/^```(?:clear)?\s*([\s\S]*?)```$/i);
  return fence ? fence[1].trim() : trimmed;
}

export function extractSource(content) {
  const text = String(content || '');
  const labeled = text.match(/CLEAR_SOURCE\s*:\s*([\s\S]*)$/i);
  const body = labeled ? labeled[1] : text;
  const fenced = body.match(/```(?:clear)?\s*([\s\S]*?)```/i);
  return stripFence(fenced ? fenced[1] : body);
}

export function extractRequirementLinesFromResponse(content) {
  const text = String(content || '');
  const match = text.match(/REQUIREMENTS\s*:\s*([\s\S]*?)(?:CLEAR_SOURCE\s*:|```clear|$)/i);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function checkPattern(source, check) {
  const all = check.all || [];
  const any = check.any || [];
  const missingAll = all.filter((pattern) => !pattern.test(source));
  const anyPassed = any.length === 0 || any.some((pattern) => pattern.test(source));
  return {
    id: check.id,
    label: check.label,
    pass: missingAll.length === 0 && anyPassed,
    details: [
      ...missingAll.map((pattern) => `missing ${pattern}`),
      ...(anyPassed ? [] : [`none matched: ${any.map(String).join(', ')}`]),
    ],
  };
}

export function evaluateCandidate(content, { task = BENCHMARK_TASKS[0], compiler = compileProgram } = {}) {
  const source = extractSource(content);
  let compileResult;
  let compileErrors = [];
  let compileWarnings = [];

  try {
    compileResult = compiler(source);
    compileErrors = (compileResult.errors || []).map((error) => String(error.message || error));
    compileWarnings = (compileResult.warnings || []).map((warning) => String(warning.message || warning));
  } catch (error) {
    compileErrors = [String(error.message || error)];
  }

  const requirements = compileResult?.requirements || [];
  const responseRequirements = extractRequirementLinesFromResponse(content);
  const commonChecks = [
    {
      id: 'output_contract',
      label: 'Response has REQUIREMENTS and CLEAR_SOURCE sections',
      pass: /REQUIREMENTS\s*:/i.test(content) && /CLEAR_SOURCE\s*:/i.test(content),
      details: [],
    },
    {
      id: 'compile',
      label: 'Clear source compiles with zero errors',
      pass: compileErrors.length === 0,
      details: compileErrors,
    },
    {
      id: 'requirements_block',
      label: 'Clear source includes at least five requirements',
      pass: requirements.length >= 5,
      details: [`source requirements=${requirements.length}`, `response requirements=${responseRequirements.length}`],
    },
  ];
  const taskChecks = (task.requiredChecks || []).map((check) => checkPattern(source, check));
  const checks = [...commonChecks, ...taskChecks];
  const failed = checks.filter((check) => !check.pass);

  return {
    ok: failed.length === 0,
    taskId: task.id,
    taskFamily: task.family,
    source,
    sourceChars: source.length,
    requirements: requirements.map((req) => req.text),
    responseRequirements,
    compileErrors,
    compileWarnings,
    checks,
    failed: failed.map(({ id, label, details }) => ({ id, label, details: details || [] })),
  };
}

export function feedbackFor(mode, evalResult, attemptNumber, task) {
  const header = [
    `Attempt ${attemptNumber} failed for task ${task.id}.`,
    'Return the full corrected output again using exactly REQUIREMENTS and CLEAR_SOURCE.',
    'Do not explain. Do not omit the requirements block inside the Clear source.',
  ];

  if (mode.id === 'minimal') {
    return [
      ...header,
      '',
      'The app did not compile or satisfy the approved requirements. Fix it.',
    ].join('\n');
  }

  const failures = evalResult.failed.map((item) => {
    const detail = item.details?.length ? ` (${item.details.slice(0, 3).join('; ')})` : '';
    return `- ${item.id}: ${item.label}${detail}`;
  }).join('\n');

  const compiler = evalResult.compileErrors.length
    ? ['Compiler errors:', ...evalResult.compileErrors.slice(0, 6).map((error) => `- ${error}`)].join('\n')
    : 'Compiler errors: none';

  const base = [
    ...header,
    '',
    compiler,
    '',
    'Requirement/test failures:',
    failures || '- none',
  ];

  if (mode.id === 'pattern_hints') {
    base.push('', 'Task-specific Clear patterns:', task.patternHints || '(none)');
  }

  return base.join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    out: path.join(process.cwd(), '.tmp', 'openrouter-iteration-benchmark-2026-05-12.json'),
    db: DEFAULT_DB_PATH,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    spendCap: DEFAULT_SPEND_CAP_USD,
    models: DEFAULT_MODELS.map((model) => model.key),
    modes: DEFAULT_MODES.map((mode) => mode.id),
    tasks: BENCHMARK_TASKS.map((task) => task.id),
    resume: true,
    logDb: true,
    parallelModels: true,
    docToolMode: DEFAULT_DOC_TOOL_MODE,
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
    docNames: [...DEFAULT_DOC_NAMES],
    docMaxChars: DEFAULT_DOC_MAX_CHARS,
    listModels: false,
    listTasks: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--list-models') args.listModels = true;
    else if (arg === '--list-tasks') args.listTasks = true;
    else if (arg === '--no-resume') args.resume = false;
    else if (arg === '--no-db') args.logDb = false;
    else if (arg === '--parallel-models') args.parallelModels = true;
    else if (arg === '--serial-models') args.parallelModels = false;
    else if (arg.startsWith('--doc-tool-mode=')) args.docToolMode = arg.slice('--doc-tool-mode='.length);
    else if (arg.startsWith('--max-tool-rounds=')) args.maxToolRounds = Number(arg.slice('--max-tool-rounds='.length));
    else if (arg.startsWith('--docs=')) args.docNames = splitCsv(arg.slice('--docs='.length));
    else if (arg.startsWith('--doc-max-chars=')) args.docMaxChars = Number(arg.slice('--doc-max-chars='.length));
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--db=')) args.db = path.resolve(arg.slice('--db='.length));
    else if (arg.startsWith('--max-attempts=')) args.maxAttempts = Number(arg.slice('--max-attempts='.length));
    else if (arg.startsWith('--spend-cap=')) args.spendCap = Number(arg.slice('--spend-cap='.length));
    else if (arg.startsWith('--models=')) args.models = splitCsv(arg.slice('--models='.length));
    else if (arg.startsWith('--modes=')) args.modes = splitCsv(arg.slice('--modes='.length));
    else if (arg.startsWith('--tasks=')) args.tasks = splitCsv(arg.slice('--tasks='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.maxAttempts) || args.maxAttempts < 1) throw new Error('--max-attempts must be a positive number');
  if (!Number.isFinite(args.spendCap) || args.spendCap < 0) throw new Error('--spend-cap must be zero or positive');
  if (!['required', 'auto', 'none'].includes(args.docToolMode)) throw new Error('--doc-tool-mode must be required, auto, or none');
  if (!Number.isFinite(args.maxToolRounds) || args.maxToolRounds < 0) throw new Error('--max-tool-rounds must be zero or positive');
  if (!Number.isFinite(args.docMaxChars) || args.docMaxChars < 1000) throw new Error('--doc-max-chars must be at least 1000');
  return args;
}

function splitCsv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function selectModels(keys, available = DEFAULT_MODELS) {
  return selectByKeyOrId(keys, available, 'model');
}

export function selectModes(ids, available = DEFAULT_MODES) {
  return selectByKeyOrId(ids, available.map((mode) => ({ ...mode, key: mode.id })), 'mode');
}

export function selectTasks(ids, available = BENCHMARK_TASKS) {
  return selectByKeyOrId(ids, available.map((task) => ({ ...task, key: task.id })), 'task');
}

function selectByKeyOrId(keys, available, label) {
  const byKey = new Map(available.map((item) => [item.key, item]));
  const byId = new Map(available.map((item) => [item.id, item]));
  return keys.map((key) => {
    const found = byKey.get(key) || byId.get(key);
    if (!found) throw new Error(`Unknown ${label} "${key}".`);
    return found;
  });
}

export function usage() {
  return [
    'Usage:',
    '  node scripts/openrouter-iteration-benchmark.mjs [options]',
    '',
    'Options:',
    '  --models=gemini-flash,opus,gpt-5.5',
    '  --tasks=deal_desk_approval,twitter_scheduler,stripe_reconciliation_etl,customer_health_ops',
    '  --modes=minimal,error_hints,pattern_hints',
    '  --max-attempts=3',
    '  --spend-cap=3',
    '  --out=.tmp/openrouter-iteration-benchmark.json',
    '  --db=studio/factor-db.sqlite',
    '  --no-db',
    '  --no-resume',
    '  --parallel-models',
    '  --serial-models',
    '  --doc-tool-mode=required|auto|none',
    '  --max-tool-rounds=4',
    '  --docs=SYNTAX.md,AI-INSTRUCTIONS.md',
    '  --doc-max-chars=40000',
    '  --list-models',
    '  --list-tasks',
  ].join('\n');
}

function ensureColumn(db, tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

function normalizeToolCall(toolCall) {
  const fn = toolCall?.function || {};
  const name = fn.name || toolCall?.name || toolCall?.tool_name || null;
  const args = fn.arguments ?? toolCall?.arguments ?? toolCall?.input ?? null;
  return {
    id: toolCall?.id || toolCall?.tool_call_id || null,
    name,
    argumentsJson: typeof args === 'string' ? args : (args == null ? null : JSON.stringify(args)),
    rawJson: JSON.stringify(toolCall || {}),
  };
}

export function createBenchmarkLogger(dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_benchmark_runs (
      run_id TEXT PRIMARY KEY,
      benchmark TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_family TEXT,
      task_title TEXT,
      model_label TEXT NOT NULL,
      model_id TEXT NOT NULL,
      feedback_mode TEXT NOT NULL,
      max_attempts INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      success INTEGER,
      success_attempt INTEGER,
      total_cost REAL DEFAULT 0,
      total_latency_ms INTEGER DEFAULT 0,
      final_failed_checks_json TEXT,
      output_path TEXT
    );

    CREATE TABLE IF NOT EXISTS model_benchmark_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      api_ok INTEGER NOT NULL,
      eval_ok INTEGER,
      latency_ms INTEGER,
      cost REAL DEFAULT 0,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      finish_reason TEXT,
      compile_error_count INTEGER,
      failed_check_count INTEGER,
      requirements_count INTEGER,
      response_requirements_count INTEGER,
      error TEXT,
      request_messages_json TEXT,
      next_feedback_text TEXT,
      raw_response_json TEXT,
      tool_calls_json TEXT,
      content TEXT,
      source TEXT,
      evaluation_json TEXT,
      FOREIGN KEY(run_id) REFERENCES model_benchmark_runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS model_benchmark_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL,
      phase TEXT NOT NULL,
      created_at TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES model_benchmark_runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS model_benchmark_tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      tool_call_id TEXT,
      tool_name TEXT,
      arguments_json TEXT,
      result_json TEXT,
      result_chars INTEGER DEFAULT 0,
      raw_tool_call_json TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES model_benchmark_runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS model_benchmark_cost_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      attempt INTEGER,
      event_kind TEXT NOT NULL,
      provider TEXT DEFAULT 'openrouter',
      generation_id TEXT,
      created_at TEXT NOT NULL,
      cost REAL,
      credits_total REAL,
      credits_usage REAL,
      payload_json TEXT,
      output_path TEXT
    );
  `);
  ensureColumn(db, 'model_benchmark_attempts', 'request_messages_json', 'TEXT');
  ensureColumn(db, 'model_benchmark_attempts', 'next_feedback_text', 'TEXT');
  ensureColumn(db, 'model_benchmark_attempts', 'raw_response_json', 'TEXT');
  ensureColumn(db, 'model_benchmark_attempts', 'tool_calls_json', 'TEXT');
  ensureColumn(db, 'model_benchmark_tool_calls', 'result_json', 'TEXT');
  ensureColumn(db, 'model_benchmark_tool_calls', 'result_chars', 'INTEGER DEFAULT 0');

  const startRunStmt = db.prepare(`
    INSERT OR REPLACE INTO model_benchmark_runs
      (run_id, benchmark, task_id, task_family, task_title, model_label, model_id, feedback_mode, max_attempts, started_at, output_path)
    VALUES
      (@run_id, @benchmark, @task_id, @task_family, @task_title, @model_label, @model_id, @feedback_mode, @max_attempts, @started_at, @output_path)
  `);
  const attemptStmt = db.prepare(`
    INSERT INTO model_benchmark_attempts
      (run_id, attempt, created_at, api_ok, eval_ok, latency_ms, cost, prompt_tokens, completion_tokens, total_tokens, finish_reason,
       compile_error_count, failed_check_count, requirements_count, response_requirements_count, error, request_messages_json, next_feedback_text,
       raw_response_json, tool_calls_json, content, source, evaluation_json)
    VALUES
      (@run_id, @attempt, @created_at, @api_ok, @eval_ok, @latency_ms, @cost, @prompt_tokens, @completion_tokens, @total_tokens, @finish_reason,
       @compile_error_count, @failed_check_count, @requirements_count, @response_requirements_count, @error, @request_messages_json, @next_feedback_text,
       @raw_response_json, @tool_calls_json, @content, @source, @evaluation_json)
  `);
  const messageStmt = db.prepare(`
    INSERT INTO model_benchmark_messages
      (run_id, attempt, sequence, role, phase, created_at, content)
    VALUES
      (@run_id, @attempt, @sequence, @role, @phase, @created_at, @content)
  `);
  const toolCallStmt = db.prepare(`
    INSERT INTO model_benchmark_tool_calls
      (run_id, attempt, sequence, created_at, tool_call_id, tool_name, arguments_json, result_json, result_chars, raw_tool_call_json)
    VALUES
      (@run_id, @attempt, @sequence, @created_at, @tool_call_id, @tool_name, @arguments_json, @result_json, @result_chars, @raw_tool_call_json)
  `);
  const costEventStmt = db.prepare(`
    INSERT INTO model_benchmark_cost_events
      (run_id, attempt, event_kind, provider, generation_id, created_at, cost, credits_total, credits_usage, payload_json, output_path)
    VALUES
      (@run_id, @attempt, @event_kind, @provider, @generation_id, @created_at, @cost, @credits_total, @credits_usage, @payload_json, @output_path)
  `);
  const finishRunStmt = db.prepare(`
    UPDATE model_benchmark_runs
    SET ended_at = @ended_at,
        success = @success,
        success_attempt = @success_attempt,
        total_cost = @total_cost,
        total_latency_ms = @total_latency_ms,
        final_failed_checks_json = @final_failed_checks_json
    WHERE run_id = @run_id
  `);

  return {
    startRun(run) {
      startRunStmt.run(run);
    },
    logAttempt(runId, attempt) {
      const toolCalls = attempt.toolCalls || [];
      attemptStmt.run({
        run_id: runId,
        attempt: attempt.attempt,
        created_at: new Date().toISOString(),
        api_ok: attempt.ok ? 1 : 0,
        eval_ok: attempt.evaluation ? (attempt.evaluation.ok ? 1 : 0) : null,
        latency_ms: attempt.latencyMs || 0,
        cost: attempt.cost || 0,
        prompt_tokens: attempt.promptTokens || 0,
        completion_tokens: attempt.completionTokens || 0,
        total_tokens: attempt.totalTokens || 0,
        finish_reason: attempt.finishReason || null,
        compile_error_count: attempt.evaluation?.compileErrorCount ?? null,
        failed_check_count: attempt.evaluation?.failedCount ?? null,
        requirements_count: attempt.evaluation?.requirementsCount ?? null,
        response_requirements_count: attempt.evaluation?.responseRequirementsCount ?? null,
        error: attempt.error || null,
        request_messages_json: attempt.requestMessages ? JSON.stringify(attempt.requestMessages) : null,
        next_feedback_text: attempt.nextFeedbackText || null,
        raw_response_json: attempt.rawResponse ? JSON.stringify(attempt.rawResponse) : null,
        tool_calls_json: toolCalls.length ? JSON.stringify(toolCalls) : null,
        content: attempt.content || null,
        source: attempt.source || null,
        evaluation_json: attempt.evaluation ? JSON.stringify(attempt.evaluation) : null,
      });
      const createdAt = new Date().toISOString();
      let sequence = 0;
      for (const message of attempt.requestMessages || []) {
        messageStmt.run({
          run_id: runId,
          attempt: attempt.attempt,
          sequence,
          role: message.role,
          phase: 'request',
          created_at: createdAt,
          content: message.content,
        });
        sequence += 1;
      }
      if (attempt.content) {
        messageStmt.run({
          run_id: runId,
          attempt: attempt.attempt,
          sequence,
          role: 'assistant',
          phase: 'response',
          created_at: createdAt,
          content: attempt.content,
        });
        sequence += 1;
      }
      if (attempt.nextFeedbackText) {
        messageStmt.run({
          run_id: runId,
          attempt: attempt.attempt,
          sequence,
          role: 'user',
          phase: 'feedback',
          created_at: createdAt,
          content: attempt.nextFeedbackText,
        });
      }
      toolCalls.forEach((toolCall, index) => {
        const normalized = normalizeToolCall(toolCall);
        toolCallStmt.run({
          run_id: runId,
          attempt: attempt.attempt,
          sequence: index,
          created_at: createdAt,
          tool_call_id: normalized.id,
          tool_name: normalized.name,
          arguments_json: normalized.argumentsJson,
          result_json: toolCall.result ? JSON.stringify(toolCall.result) : null,
          result_chars: toolCall.result ? JSON.stringify(toolCall.result).length : 0,
          raw_tool_call_json: normalized.rawJson,
        });
      });
      if (attempt.costDetails) {
        costEventStmt.run({
          run_id: runId,
          attempt: attempt.attempt,
          event_kind: 'generation',
          provider: 'openrouter',
          generation_id: attempt.costDetails.generationId || null,
          created_at: createdAt,
          cost: attempt.cost || null,
          credits_total: null,
          credits_usage: null,
          payload_json: JSON.stringify(attempt.costDetails),
          output_path: null,
        });
      }
    },
    logCostEvent(event = {}) {
      costEventStmt.run({
        run_id: event.runId || null,
        attempt: event.attempt || null,
        event_kind: event.eventKind || 'credits',
        provider: event.provider || 'openrouter',
        generation_id: event.generationId || null,
        created_at: event.createdAt || new Date().toISOString(),
        cost: event.cost ?? null,
        credits_total: event.creditsTotal ?? null,
        credits_usage: event.creditsUsage ?? null,
        payload_json: event.payload ? JSON.stringify(event.payload) : null,
        output_path: event.outputPath || null,
      });
    },
    finishRun(run) {
      finishRunStmt.run({
        run_id: run.runId,
        ended_at: run.endedAt,
        success: run.success ? 1 : 0,
        success_attempt: run.successAttempt,
        total_cost: run.totalCost || 0,
        total_latency_ms: run.totalLatencyMs || 0,
        final_failed_checks_json: JSON.stringify(run.finalFailedChecks || []),
      });
    },
    close() {
      db.close();
    },
  };
}

function callCost(model, usage) {
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  return ((promptTokens * model.inPerM) + (completionTokens * model.outPerM)) / 1_000_000;
}

export async function fetchOpenRouterCredits(apiKey, { timeoutMs = 20000 } = {}) {
  const res = await fetch('https://openrouter.ai/api/v1/credits', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: json.error?.message || json.raw || text.slice(0, 500), rawResponse: json };
  }
  const data = json.data || json;
  return {
    ok: true,
    totalCredits: numberOrNull(data.total_credits ?? data.totalCredits),
    totalUsage: numberOrNull(data.total_usage ?? data.totalUsage),
    rawResponse: json,
  };
}

export async function fetchOpenRouterGeneration(apiKey, generationId, { timeoutMs = 20000, retries = 2 } = {}) {
  if (!generationId) return { ok: false, error: 'Missing generation id.' };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (res.ok) {
      const data = json.data || json;
      return {
        ok: true,
        id: generationId,
        totalCost: numberOrNull(data.total_cost ?? data.totalCost),
        nativeTokensPrompt: numberOrNull(data.native_tokens_prompt ?? data.nativeTokensPrompt),
        nativeTokensCompletion: numberOrNull(data.native_tokens_completion ?? data.nativeTokensCompletion),
        rawResponse: json,
      };
    }
    if (attempt === retries || ![404, 425, 429, 500, 502, 503, 504].includes(res.status)) {
      return { ok: false, status: res.status, error: json.error?.message || json.raw || text.slice(0, 500), rawResponse: json };
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return { ok: false, error: 'Generation lookup exhausted retries.' };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function benchmarkTools({ docNames = DEFAULT_DOC_NAMES } = {}) {
  return [
    {
      type: 'function',
      function: {
        name: 'read_clear_doc',
        description: 'Read a Clear documentation file before writing or revising Clear source.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
              enum: docNames,
              description: 'Documentation file to read.',
            },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'query_patterns_db',
        description: 'Search the local Clear pattern database for examples related to the task or compiler failure.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: {
              type: 'string',
              description: 'Search phrase such as scheduled job, call api, deal approval, chart, or requirements block.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
              description: 'Maximum matching pattern rows to return.',
            },
          },
          required: ['query'],
        },
      },
    },
  ];
}

export async function executeBenchmarkTool({ toolCall, rootDir, docNames = DEFAULT_DOC_NAMES, docMaxChars = DEFAULT_DOC_MAX_CHARS, patternLimit = DEFAULT_PATTERN_RESULT_LIMIT, dbPath = DEFAULT_DB_PATH, state = null, compiler = compileProgram }) {
  const normalized = normalizeToolCall(toolCall);
  let args = {};
  try {
    args = normalized.argumentsJson ? JSON.parse(normalized.argumentsJson) : {};
  } catch {
    return { ok: false, error: 'Tool arguments were not valid JSON.' };
  }

  if (normalized.name === 'read_clear_doc') {
    const name = args.name;
    if (!docNames.includes(name)) {
      return { ok: false, error: `Unknown doc "${name}".`, allowed: docNames };
    }
    const docPath = path.join(rootDir, name);
    const content = await fs.readFile(docPath, 'utf8');
    return {
      ok: true,
      name,
      chars: content.length,
      truncated: content.length > docMaxChars,
      content: content.slice(0, docMaxChars),
    };
  }

  if (normalized.name === 'query_patterns_db') {
    return queryPatternsDb({
      dbPath,
      query: String(args.query || ''),
      limit: Number(args.limit || patternLimit),
    });
  }

  const toolState = state || {};

  if (normalized.name === 'read_file') {
    const filename = String(args.filename || args.name || '');
    if (!docNames.includes(filename) && filename !== 'requests.md') {
      return { ok: false, error: `Unknown file "${filename}".`, allowed: [...docNames, 'requests.md'] };
    }
    const filePath = path.join(rootDir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    return {
      ok: true,
      filename,
      chars: content.length,
      truncated: content.length > docMaxChars,
      content: content.slice(0, docMaxChars),
    };
  }

  if (normalized.name === 'edit_code') {
    const action = String(args.action || 'read');
    if (action === 'read') {
      return { ok: true, source: toolState.source || '', errors: toolState.errors || [] };
    }
    if (action === 'write') {
      toolState.source = String(args.code || '');
      return { ok: true, applied: true, lines: toolState.source.split('\n').length };
    }
    if (action === 'undo') {
      toolState.source = '';
      toolState.compileResult = null;
      toolState.errors = [];
      return { ok: true, undone: true };
    }
    return { ok: false, error: `Unsupported edit_code action "${action}".` };
  }

  if (normalized.name === 'compile') {
    const source = String(args.source || toolState.source || '');
    if (!source.trim()) return { ok: false, error: 'No Clear source available. Use edit_code action=write first.' };
    const compiled = compiler(source);
    toolState.compileResult = compiled;
    toolState.errors = compiled.errors || [];
    return {
      ok: (compiled.errors || []).length === 0,
      errors: compiled.errors || [],
      warnings: compiled.warnings || [],
      hasHTML: !!compiled.html,
      hasServerJS: !!compiled.serverJS,
      hasJavascript: !!compiled.javascript,
      hasPython: !!compiled.python,
    };
  }

  if (normalized.name === 'run_app') {
    const compiled = toolState.compileResult || compiler(String(toolState.source || ''));
    toolState.compileResult = compiled;
    toolState.errors = compiled.errors || [];
    if ((compiled.errors || []).length > 0) {
      return { ok: false, error: 'Cannot run app while compile errors remain.', errors: compiled.errors || [] };
    }
    toolState.appRunning = true;
    toolState.port = toolState.port || 4001;
    return { ok: true, started: true, port: toolState.port };
  }

  if (normalized.name === 'click_element') {
    if (!toolState.appRunning) return { ok: false, error: 'No app running. Use run_app first.' };
    toolState.actions ||= [];
    toolState.actions.push({ type: 'click', selector: String(args.selector || ''), ts: new Date().toISOString() });
    return { ok: true, clicked: String(args.selector || '') };
  }

  if (normalized.name === 'fill_input') {
    if (!toolState.appRunning) return { ok: false, error: 'No app running. Use run_app first.' };
    toolState.actions ||= [];
    toolState.actions.push({ type: 'fill', selector: String(args.selector || ''), value: String(args.value || ''), ts: new Date().toISOString() });
    return { ok: true, filled: String(args.selector || ''), value: String(args.value || '') };
  }

  if (normalized.name === 'read_dom') {
    if (!toolState.appRunning) return { ok: false, error: 'No app running. Use run_app first.' };
    const html = String(toolState.compileResult?.html || '').slice(0, 5000);
    return { ok: true, url: `http://localhost:${toolState.port || 4001}/`, html, state: { appRunning: true } };
  }

  if (normalized.name === 'read_actions') {
    const actions = toolState.actions || [];
    return { ok: true, count: actions.length, actions };
  }

  if (normalized.name === 'read_network') {
    const requests = toolState.network || [];
    return { ok: true, count: requests.length, requests };
  }

  if (normalized.name === 'screenshot_output') {
    if (!toolState.appRunning) return { ok: false, error: 'No app running. Use run_app first.' };
    return { ok: true, screenshot: 'simulated', note: 'Benchmark harness confirms screenshot tool was available; real Studio/Ghost Meph returns PNG content.' };
  }

  if (normalized.name === 'write_request') {
    toolState.requests ||= [];
    const request = {
      title: String(args.title || args.summary || 'Benchmark request'),
      body: String(args.body || args.details || ''),
      created_at: new Date().toISOString(),
    };
    const validation = validateBenchmarkRequestWrite(request);
    if (!validation.ok) return validation;
    toolState.requests.push(request);
    return { ok: true, written: true, request };
  }

  if (normalized.name === 'edit_file') {
    const filename = String(args.filename || '');
    if (filename !== 'requests.md') {
      return { ok: false, error: 'Benchmark edit_file is read-only except simulated appends to requests.md.' };
    }
    if (String(args.action || '') !== 'append') {
      return { ok: false, error: 'Benchmark requests.md support only allows action="append".' };
    }
    toolState.requests ||= [];
    const request = {
      title: 'requests.md append',
      body: String(args.content || ''),
      created_at: new Date().toISOString(),
    };
    const validation = validateBenchmarkRequestWrite(request);
    if (!validation.ok) return validation;
    toolState.requests.push(request);
    return { ok: true, appended: true, request };
  }

  return { ok: false, error: `Unknown tool "${normalized.name}".` };
}

function validateBenchmarkRequestWrite(request) {
  const text = `${request.title || ''}\n${request.body || ''}`.toLowerCase();
  const looksLikeCompletion = /\b(implementation complete|task complete|app is complete|satisfies all requirements|compiles successfully|ready to ship|done)\b/.test(text);
  const namesFollowUpNeed = /\b(needs?|missing|bug|fix|improve|improvement|request|follow[- ]?up|compiler|diagnostic|harness|pattern|error hint|snap|ralph)\b/.test(text);
  if (looksLikeCompletion && !namesFollowUpNeed) {
    return {
      ok: false,
      written: false,
      error: 'write_request is for a follow-up request, bug, or improvement. Do not log completion/status announcements.',
    };
  }
  return { ok: true };
}

function queryPatternsDb({ dbPath = DEFAULT_DB_PATH, query = '', limit = DEFAULT_PATTERN_RESULT_LIMIT }) {
  const terms = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9_/:.-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : DEFAULT_PATTERN_RESULT_LIMIT, 12));

  const db = new Database(dbPath, { readonly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    const candidates = [];
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name);
      const textColumns = columns.filter((column) => /source|clear|pattern|prompt|response|content|summary|task|hint|error|title|name/i.test(column));
      if (textColumns.length === 0) continue;
      const selectColumns = columns.slice(0, 8).map((column) => quoteIdentifier(column)).join(', ');
      const where = terms.length
        ? textColumns.map((column) => terms.map(() => `LOWER(CAST(${quoteIdentifier(column)} AS TEXT)) LIKE ?`).join(' OR ')).join(' OR ')
        : '1 = 1';
      const params = textColumns.flatMap(() => terms.map((term) => `%${term}%`));
      let rows = [];
      try {
        rows = db.prepare(`SELECT ${selectColumns} FROM ${quoteIdentifier(table)} WHERE ${where} LIMIT ?`).all(...params, safeLimit);
      } catch {
        continue;
      }
      for (const row of rows) {
        candidates.push({ table, row });
        if (candidates.length >= safeLimit) break;
      }
      if (candidates.length >= safeLimit) break;
    }
    return {
      ok: true,
      query,
      terms,
      count: candidates.length,
      results: candidates,
    };
  } finally {
    db.close();
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function readOpenRouterKey(rootDir) {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const text = await fs.readFile(path.join(rootDir, '.env'), 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    if (line.slice(0, idx).trim() === 'OPENROUTER_API_KEY') {
      return line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error('OPENROUTER_API_KEY missing from environment and .env');
}

export async function callModel({ apiKey, model, messages, tools, toolChoice = 'auto', timeoutMs = 240000, lookupGenerationCost = false }) {
  const started = Date.now();
  const body = {
    model: model.id,
    messages,
    temperature: 0.2,
    max_completion_tokens: 1200,
    seed: 12,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
    body.parallel_tool_calls = true;
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://buildclear.dev',
      'X-Title': 'Clear iterative requirements benchmark',
      'X-OpenRouter-Experimental-Metadata': 'enabled',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  const latencyMs = Date.now() - started;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json.error?.message || json.raw || text.slice(0, 500),
      latencyMs,
      rawResponse: json,
    };
  }

  const usage = json.usage || {};
  const generationId = json.id || usage.generation_id || usage.generationId || null;
  const generation = lookupGenerationCost && generationId
    ? await fetchOpenRouterGeneration(apiKey, generationId, { timeoutMs: 20000, retries: 2 }).catch((error) => ({ ok: false, error: String(error?.message || error) }))
    : null;
  const generationCost = generation?.ok ? generation.totalCost : null;
  const cost = generationCost ?? usage.cost ?? callCost(model, usage);
  const message = json.choices?.[0]?.message || {};
  return {
    ok: true,
    latencyMs,
    content: message.content || '',
    toolCalls: message.tool_calls || [],
    finishReason: json.choices?.[0]?.finish_reason || null,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)),
    cost,
    generationId,
    costDetails: {
      source: generationCost != null ? 'generation_api' : (usage.cost != null ? 'usage' : 'estimate'),
      usage,
      generationId,
      generation,
    },
    rawResponse: json,
  };
}

async function runModelAttempt({
  caller,
  apiKey,
  model,
  messages,
  task,
  mode,
  rootDir,
  tools,
  docToolMode,
  maxToolRounds,
  docNames,
  docMaxChars,
  dbPath,
}) {
  let totalLatencyMs = 0;
  let totalCost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let rawResponse = null;
  let finishReason = null;
  const toolCalls = [];
  const attemptMessages = messages.map((message) => ({ ...message }));
  const firstToolChoice = docToolMode === 'required' ? 'required' : 'auto';

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const response = await caller({
      apiKey,
      model,
      messages: attemptMessages,
      task,
      mode,
      tools,
      toolChoice: round === 0 ? firstToolChoice : 'auto',
    });

    totalLatencyMs += response.latencyMs || 0;
    totalCost += Number(response.cost || 0);
    promptTokens += response.promptTokens || 0;
    completionTokens += response.completionTokens || 0;
    totalTokens += response.totalTokens || 0;
    rawResponse = response.rawResponse || rawResponse;
    finishReason = response.finishReason || finishReason;

    if (!response.ok) {
      return {
        ...response,
        latencyMs: totalLatencyMs,
        cost: totalCost,
        promptTokens,
        completionTokens,
        totalTokens,
        rawResponse,
        toolCalls,
      };
    }

    const responseToolCalls = response.toolCalls || [];
    if (!responseToolCalls.length) {
      return {
        ...response,
        latencyMs: totalLatencyMs,
        cost: totalCost,
        promptTokens,
        completionTokens,
        totalTokens,
        finishReason,
        rawResponse,
        toolCalls,
      };
    }

    attemptMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: responseToolCalls,
    });

    for (const toolCall of responseToolCalls) {
      const result = await executeBenchmarkTool({
        toolCall,
        rootDir,
        docNames,
        docMaxChars,
        dbPath,
      });
      const enriched = { ...toolCall, result };
      toolCalls.push(enriched);
      attemptMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: normalizeToolCall(toolCall).name,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    ok: false,
    error: `Model exceeded ${maxToolRounds} tool rounds without final Clear source.`,
    latencyMs: totalLatencyMs,
    cost: totalCost,
    promptTokens,
    completionTokens,
    totalTokens,
    finishReason,
    rawResponse,
    toolCalls,
  };
}

export async function runBenchmark(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const outPath = options.out || path.join(rootDir, '.tmp', 'openrouter-iteration-benchmark-2026-05-12.json');
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const spendCap = options.spendCap ?? DEFAULT_SPEND_CAP_USD;
  const models = options.models || DEFAULT_MODELS;
  const modes = options.modes || DEFAULT_MODES;
  const tasks = options.tasks || BENCHMARK_TASKS;
  const apiKey = options.apiKey || await readOpenRouterKey(rootDir);
  const caller = options.callModel || callModel;
  const log = options.log || console.log;
  const logger = options.logDb === false ? null : (options.logger || createBenchmarkLogger(options.dbPath || DEFAULT_DB_PATH));
  const compiler = options.compiler || compileProgram;
  const parallelModels = options.parallelModels !== false;
  const docToolMode = options.docToolMode || DEFAULT_DOC_TOOL_MODE;
  const maxToolRounds = options.maxToolRounds || DEFAULT_MAX_TOOL_ROUNDS;
  const docNames = options.docNames || DEFAULT_DOC_NAMES;
  const docMaxChars = options.docMaxChars || DEFAULT_DOC_MAX_CHARS;
  const tools = docToolMode === 'none' ? [] : (options.tools || benchmarkTools({ docNames }));
  const dbPath = options.dbPath || DEFAULT_DB_PATH;

  let payload = {
    createdAt: new Date().toISOString(),
    benchmark: 'openrouter-iteration-benchmark-v1',
    tasks: tasks.map(({ id, family, title, userAsk }) => ({ id, family, title, userAsk })),
    maxAttempts,
    spendCapUsd: spendCap,
    parallelModels,
    docToolMode,
    maxToolRounds,
    docNames,
    docMaxChars,
    models,
    modes,
    runs: [],
  };

  if (options.resume !== false) {
    try {
      const existing = JSON.parse(await fs.readFile(outPath, 'utf8'));
      if (Array.isArray(existing.runs)) payload = existing;
    } catch {}
  }

  const completed = new Set(payload.runs.map((run) => run.key));
  let saveQueue = Promise.resolve();

  async function save() {
    saveQueue = saveQueue.then(async () => {
      payload.updatedAt = new Date().toISOString();
      payload.totalSpend = Number(payload.runs
        .flatMap((run) => run.attempts || [])
        .reduce((sum, attempt) => sum + Number(attempt.cost || 0), 0)
        .toFixed(6));
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(payload, null, 2));
    });
    await saveQueue;
  }

  async function runCombination(task, model, mode) {
    const key = `${task.id}::${model.id}::${mode.id}`;
    if (completed.has(key)) {
      log(`SKIP ${task.id} / ${model.label} / ${mode.id}`);
      return null;
    }

    const runId = crypto.randomUUID();
    log(`RUN ${task.id} / ${model.label} / ${mode.id}`);
    const run = {
      key,
      runId,
      taskId: task.id,
      taskFamily: task.family,
      taskTitle: task.title,
      model: model.label,
      modelId: model.id,
      mode: mode.id,
      modeLabel: mode.label,
      startedAt: new Date().toISOString(),
      attempts: [],
      success: false,
      successAttempt: null,
      finalFailedChecks: [],
    };
    logger?.startRun({
      run_id: runId,
      benchmark: payload.benchmark,
      task_id: task.id,
      task_family: task.family,
      task_title: task.title,
      model_label: model.label,
      model_id: model.id,
      feedback_mode: mode.id,
      max_attempts: maxAttempts,
      started_at: run.startedAt,
      output_path: outPath,
    });

    const messages = [
      { role: 'system', content: 'You are being benchmarked as a Clear/Meph app-building assistant. Before writing or revising source, use read_clear_doc to inspect Clear docs and use query_patterns_db for relevant examples. Then produce checkable requirements and Clear source. Be concise. Do not explain the benchmark. Do not include analysis.' },
      { role: 'user', content: initialPrompt(task) },
    ];

    for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
      const requestMessages = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const response = await runModelAttempt({
        caller,
        apiKey,
        model,
        messages,
        task,
        mode,
        rootDir,
        tools,
        docToolMode,
        maxToolRounds,
        docNames,
        docMaxChars,
        dbPath,
      });
      const attempt = {
        attempt: attemptIndex,
        requestMessages,
        ok: response.ok,
        latencyMs: response.latencyMs,
        cost: Number(Number(response.cost || 0).toFixed(6)),
        promptTokens: response.promptTokens || 0,
        completionTokens: response.completionTokens || 0,
        totalTokens: response.totalTokens || 0,
        finishReason: response.finishReason || null,
        rawResponse: response.rawResponse || null,
        toolCalls: response.toolCalls || [],
      };

      if (!response.ok) {
        attempt.error = response.error;
        run.attempts.push(attempt);
        run.finalError = response.error;
        logger?.logAttempt(runId, attempt);
        break;
      }

      const evalResult = evaluateCandidate(response.content, { task, compiler });
      const feedbackText = evalResult.ok ? null : feedbackFor(mode, evalResult, attemptIndex, task);
      attempt.content = response.content;
      attempt.source = evalResult.source;
      attempt.nextFeedbackText = feedbackText;
      attempt.evaluation = {
        ok: evalResult.ok,
        taskId: evalResult.taskId,
        taskFamily: evalResult.taskFamily,
        sourceChars: evalResult.sourceChars,
        requirementsCount: evalResult.requirements.length,
        responseRequirementsCount: evalResult.responseRequirements.length,
        compileErrorCount: evalResult.compileErrors.length,
        failedCount: evalResult.failed.length,
        failed: evalResult.failed,
        checks: evalResult.checks,
        compileErrors: evalResult.compileErrors,
        compileWarnings: evalResult.compileWarnings,
      };
      run.attempts.push(attempt);
      run.finalFailedChecks = evalResult.failed;
      logger?.logAttempt(runId, attempt);

      log(`  ${model.label} attempt ${attemptIndex}: ${evalResult.ok ? 'PASS' : 'fail'} failures=${evalResult.failed.length} cost=$${attempt.cost.toFixed(6)} latency=${attempt.latencyMs}ms`);

      if (evalResult.ok) {
        run.success = true;
        run.successAttempt = attemptIndex;
        run.finalSource = evalResult.source;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: feedbackText });
    }

    run.endedAt = new Date().toISOString();
    run.totalCost = Number(run.attempts.reduce((sum, attempt) => sum + Number(attempt.cost || 0), 0).toFixed(6));
    run.totalLatencyMs = run.attempts.reduce((sum, attempt) => sum + Number(attempt.latencyMs || 0), 0);
    logger?.finishRun(run);
    payload.runs.push(run);
    completed.add(key);
    await save();
    log(`DONE ${task.id} / ${model.label} / ${mode.id}: ${run.success ? `PASS in ${run.successAttempt}` : 'FAIL'} cost=$${run.totalCost.toFixed(6)}`);
    return run;
  }

  try {
    for (const task of tasks) {
      for (const mode of modes) {
        if ((payload.totalSpend || 0) >= spendCap) {
          log(`STOP spend cap reached $${payload.totalSpend}`);
          await save();
          return payload;
        }

        const pendingModels = models.filter((model) => !completed.has(`${task.id}::${model.id}::${mode.id}`));
        if (pendingModels.length === 0) continue;

        if (parallelModels) {
          log(`BATCH ${task.id} / ${mode.id}: launching ${pendingModels.length} models in parallel`);
          await Promise.all(pendingModels.map((model) => runCombination(task, model, mode)));
        } else {
          for (const model of pendingModels) {
            if ((payload.totalSpend || 0) >= spendCap) break;
            await runCombination(task, model, mode);
          }
        }
      }
    }
    await save();
    return payload;
  } finally {
    await saveQueue.catch(() => {});
    logger?.close();
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.listModels) {
    for (const model of DEFAULT_MODELS) console.log(`${model.key}\t${model.id}\t${model.label}`);
    return;
  }
  if (args.listTasks) {
    for (const task of BENCHMARK_TASKS) console.log(`${task.id}\t${task.family}\t${task.title}`);
    return;
  }

  const payload = await runBenchmark({
    out: args.out,
    dbPath: args.db,
    maxAttempts: args.maxAttempts,
    spendCap: args.spendCap,
    models: selectModels(args.models),
    modes: selectModes(args.modes),
    tasks: selectTasks(args.tasks),
    resume: args.resume,
    logDb: args.logDb,
    parallelModels: args.parallelModels,
    docToolMode: args.docToolMode,
    maxToolRounds: args.maxToolRounds,
    docNames: args.docNames,
    docMaxChars: args.docMaxChars,
  });

  console.log(JSON.stringify({
    outPath: args.out,
    dbPath: args.logDb ? args.db : null,
    totalSpend: payload.totalSpend,
    runs: payload.runs.length,
    successes: payload.runs.filter((run) => run.success).length,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
