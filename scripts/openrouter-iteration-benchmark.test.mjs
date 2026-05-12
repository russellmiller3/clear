import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, describeAsync, expect, it, itAsync, run } from '../lib/testUtils.js';
import {
  BENCHMARK_TASKS,
  benchmarkTools,
  createBenchmarkLogger,
  evaluateCandidate,
  extractRequirementLinesFromResponse,
  extractSource,
  feedbackFor,
  runBenchmark,
} from './openrouter-iteration-benchmark.mjs';

const dealDeskTask = BENCHMARK_TASKS.find((task) => task.id === 'deal_desk_approval');

function tempPath(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-openrouter-benchmark-'));
  return path.join(dir, name);
}

function fakeCompilerFor(source) {
  if (/not clear|broken/i.test(source)) {
    return { errors: [{ message: 'Line 1: fake compiler error' }], warnings: [], requirements: [] };
  }
  return {
    errors: [],
    warnings: [],
    requirements: Array.from({ length: 6 }, (_, index) => ({ text: `requirement ${index + 1}` })),
  };
}

function passingDealDeskOutput() {
  const source = [
    'requirements:',
    '  - create deal requests',
    '  - add line items',
    '  - submit deals',
    '  - approve deals',
    '  - reject deals',
    '  - filter deal queue',
    '',
    'build for web and javascript backend',
    'database is local memory',
    '',
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
    'create a ApprovalComments table:',
    '  deal_id, required',
    '  author_email, required',
    '  body, required',
    '  decision is text',
    '  created_at_date is date',
    '',
    'when user sends deal to /api/deals:',
    '  save deal as new DealRequests',
    '  send back deal',
    '',
    'when user sends changes to /api/deals/:id/line-items:',
    '  save changes as new DealLineItems',
    '  send back changes',
    '',
    'when user sends changes to /api/deals/:id/submit:',
    '  deal = look up DealRequests with this id',
    "  change deal's stage from 'draft' to 'submitted'",
    "  change deal's discount_percent from 0 to changes.discount_percent",
    "  change deal's margin_percent from 0 to changes.margin_percent",
    '  update deal to DealRequests',
    '  send back deal',
    '',
    'when user sends changes to /api/deals/:id/approve:',
    '  deal = look up DealRequests with this id',
    "  change deal's approval_status from 'pending' to 'approved'",
    '  save changes as new ApprovalComments',
    '  update deal to DealRequests',
    '  send back deal',
    '',
    'when user sends changes to /api/deals/:id/reject:',
    '  deal = look up DealRequests with this id',
    "  change deal's approval_status from 'pending' to 'rejected'",
    '  save changes as new ApprovalComments',
    '  update deal to DealRequests',
    '  send back deal',
    '',
    'when user calls GET /api/deals:',
    '  deals = get all DealRequests',
    '  filter deals where stage is stage and approval_status is approval_status',
    '  send back deals',
    '',
    "page 'Deal Desk' at '/':",
    "  'Customer Name' is a text input saved as customer_name",
    "  'Line item product' is a text input saved as line_item_product",
    "  button 'Submit Deal':",
    "    send { customer_name: customer_name } as a new record to '/api/deals'",
    '  display deals as table showing customer_name, stage, approval_status, margin_percent, discount_percent with actions:',
    "    'Approve':",
    "      send selected_deal to '/api/deals/:id/approve'",
    "    'Reject':",
    "      send selected_deal to '/api/deals/:id/reject'",
    "  display comments as table showing author_email, body, decision",
  ].join('\n');

  return [
    'REQUIREMENTS:',
    '- create deal requests',
    '- add line items',
    '- submit deals',
    '- approve deals',
    '- reject deals',
    '',
    'CLEAR_SOURCE:',
    '```clear',
    source,
    '```',
  ].join('\n');
}

describe('OpenRouter iterative benchmark extraction and evaluation', () => {
  it('extracts the Clear source and requirement lines from the requested output contract', () => {
    const output = passingDealDeskOutput();

    expect(extractRequirementLinesFromResponse(output)).toHaveLength(5);
    expect(extractSource(output)).toContain("page 'Deal Desk' at '/'");
  });

  it('passes a complex Deal Desk answer only when compile and task checks pass', () => {
    const result = evaluateCandidate(passingDealDeskOutput(), {
      task: dealDeskTask,
      compiler: fakeCompilerFor,
    });

    expect(result.ok).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it('includes compiler errors, failed checks, and pattern hints in corrective feedback', () => {
    const failed = evaluateCandidate('REQUIREMENTS:\n- one\n\nCLEAR_SOURCE:\nnot clear', {
      task: dealDeskTask,
      compiler: fakeCompilerFor,
    });
    const feedback = feedbackFor({ id: 'pattern_hints' }, failed, 1, dealDeskTask);

    expect(failed.ok).toBe(false);
    expect(feedback).toContain('Line 1: fake compiler error');
    expect(feedback).toContain('Task-specific Clear patterns');
    expect(feedback).toContain('create a DealRequests table:');
  });
});

describe('OpenRouter iterative benchmark database logging', () => {
  it('stores run summaries, prompts, feedback, content, source, and evaluation JSON', () => {
    const dbPath = tempPath('benchmark.sqlite');
    const logger = createBenchmarkLogger(dbPath);
    const runId = 'run-test-1';

    logger.startRun({
      run_id: runId,
      benchmark: 'openrouter-iteration-benchmark-v1',
      task_id: dealDeskTask.id,
      task_family: dealDeskTask.family,
      task_title: dealDeskTask.title,
      model_label: 'Fake Model',
      model_id: 'fake/model',
      feedback_mode: 'pattern_hints',
      max_attempts: 2,
      started_at: '2026-05-12T00:00:00.000Z',
      output_path: 'out.json',
    });
    logger.logAttempt(runId, {
      attempt: 1,
      ok: true,
      requestMessages: [{ role: 'user', content: 'build deal desk' }],
      nextFeedbackText: 'fix margin',
      toolCalls: [{
        id: 'call_1',
        type: 'function',
        function: {
          name: 'compile_clear',
          arguments: '{"source":"deal desk"}',
        },
      }],
      content: passingDealDeskOutput(),
      source: extractSource(passingDealDeskOutput()),
      evaluation: {
        ok: false,
        compileErrorCount: 0,
        failedCount: 1,
        requirementsCount: 6,
        responseRequirementsCount: 5,
      },
    });
    logger.finishRun({
      runId,
      endedAt: '2026-05-12T00:00:10.000Z',
      success: false,
      successAttempt: null,
      totalCost: 0.01,
      totalLatencyMs: 10000,
      finalFailedChecks: [{ id: 'margin' }],
    });
    logger.close();

    const db = new Database(dbPath);
    const row = db.prepare('SELECT * FROM model_benchmark_attempts WHERE run_id = ?').get(runId);
    const runRow = db.prepare('SELECT * FROM model_benchmark_runs WHERE run_id = ?').get(runId);
    const messages = db.prepare('SELECT role, phase, content FROM model_benchmark_messages WHERE run_id = ? ORDER BY sequence').all(runId);
    const toolCalls = db.prepare('SELECT tool_call_id, tool_name, arguments_json, raw_tool_call_json FROM model_benchmark_tool_calls WHERE run_id = ?').all(runId);
    db.close();

    expect(row.request_messages_json).toContain('build deal desk');
    expect(row.next_feedback_text).toContain('fix margin');
    expect(row.content).toContain('CLEAR_SOURCE');
    expect(row.source).toContain('DealRequests');
    expect(row.evaluation_json).toContain('"failedCount":1');
    expect(runRow.final_failed_checks_json).toContain('margin');
    expect(messages.map((message) => message.phase)).toEqual(['request', 'response', 'feedback']);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toContain('CLEAR_SOURCE');
    expect(row.tool_calls_json).toContain('compile_clear');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool_call_id).toBe('call_1');
    expect(toolCalls[0].tool_name).toBe('compile_clear');
    expect(toolCalls[0].arguments_json).toContain('deal desk');
  });
});

await describeAsync('OpenRouter iterative benchmark runner loop', async () => {
  await itAsync('logs failed attempt feedback and succeeds after a correction', async () => {
    const dbPath = tempPath('runner.sqlite');
    const outPath = tempPath('runner.json');
    let calls = 0;

    const payload = await runBenchmark({
      apiKey: 'test-key',
      dbPath,
      out: outPath,
      maxAttempts: 2,
      spendCap: 1,
      resume: false,
      models: [{ key: 'fake', label: 'Fake Model', id: 'fake/model', inPerM: 0, outPerM: 0 }],
      modes: [{ id: 'pattern_hints', label: 'Pattern hints' }],
      tasks: [dealDeskTask],
      compiler: fakeCompilerFor,
      docToolMode: 'none',
      log: () => {},
      callModel: async ({ tools, toolChoice }) => {
        expect(tools).toHaveLength(0);
        expect(toolChoice).toBe('auto');
        calls += 1;
        return {
          ok: true,
          latencyMs: 10,
          cost: 0.001,
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
          finishReason: 'stop',
          toolCalls: [],
          content: calls === 1
            ? 'REQUIREMENTS:\n- one\n\nCLEAR_SOURCE:\nbroken'
            : passingDealDeskOutput(),
        };
      },
    });

    const db = new Database(dbPath);
    const attempts = db.prepare('SELECT attempt, next_feedback_text, request_messages_json FROM model_benchmark_attempts ORDER BY attempt').all();
    const messages = db.prepare('SELECT attempt, phase, role, content FROM model_benchmark_messages ORDER BY attempt, sequence').all();
    const runRow = db.prepare('SELECT success, success_attempt FROM model_benchmark_runs').get();
    db.close();

    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0].success).toBe(true);
    expect(runRow.success).toBe(1);
    expect(runRow.success_attempt).toBe(2);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].next_feedback_text).toContain('Task-specific Clear patterns');
    expect(attempts[1].request_messages_json).toContain('Attempt 1 failed');
    expect(messages.filter((message) => message.phase === 'response')).toHaveLength(2);
    expect(messages.some((message) => message.phase === 'feedback' && message.content.includes('Attempt 1 failed'))).toBe(true);
  });

  await itAsync('runs all models for the same task and feedback mode in parallel', async () => {
    const dbPath = tempPath('parallel.sqlite');
    const outPath = tempPath('parallel.json');
    let inFlight = 0;
    let maxInFlight = 0;

    const payload = await runBenchmark({
      apiKey: 'test-key',
      dbPath,
      out: outPath,
      maxAttempts: 1,
      spendCap: 1,
      resume: false,
      parallelModels: true,
      models: [
        { key: 'fake-a', label: 'Fake A', id: 'fake/a', inPerM: 0, outPerM: 0 },
        { key: 'fake-b', label: 'Fake B', id: 'fake/b', inPerM: 0, outPerM: 0 },
      ],
      modes: [{ id: 'pattern_hints', label: 'Pattern hints' }],
      tasks: [dealDeskTask],
      compiler: fakeCompilerFor,
      log: () => {},
      callModel: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 25));
        inFlight -= 1;
        return {
          ok: true,
          latencyMs: 25,
          cost: 0.001,
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
          finishReason: 'stop',
          content: passingDealDeskOutput(),
        };
      },
    });

    expect(payload.runs).toHaveLength(2);
    expect(maxInFlight).toBe(2);
  });

  await itAsync('executes doc and pattern tools before evaluating the model answer', async () => {
    const dbPath = tempPath('tools.sqlite');
    const outPath = tempPath('tools.json');
    let calls = 0;

    const payload = await runBenchmark({
      apiKey: 'test-key',
      dbPath,
      out: outPath,
      rootDir: process.cwd(),
      maxAttempts: 1,
      spendCap: 1,
      resume: false,
      parallelModels: false,
      docToolMode: 'required',
      maxToolRounds: 2,
      docNames: ['SYNTAX.md', 'AI-INSTRUCTIONS.md'],
      tools: benchmarkTools({ docNames: ['SYNTAX.md', 'AI-INSTRUCTIONS.md'] }),
      models: [{ key: 'fake', label: 'Fake Model', id: 'fake/model', inPerM: 0, outPerM: 0 }],
      modes: [{ id: 'pattern_hints', label: 'Pattern hints' }],
      tasks: [dealDeskTask],
      compiler: fakeCompilerFor,
      log: () => {},
      callModel: async ({ messages, toolChoice }) => {
        calls += 1;
        if (calls === 1) {
          expect(toolChoice).toBe('required');
          return {
            ok: true,
            latencyMs: 10,
            cost: 0.001,
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
            finishReason: 'tool_calls',
            toolCalls: [
              {
                id: 'call_doc',
                type: 'function',
                function: { name: 'read_clear_doc', arguments: '{"name":"SYNTAX.md"}' },
              },
              {
                id: 'call_patterns',
                type: 'function',
                function: { name: 'query_patterns_db', arguments: '{"query":"deal approval","limit":2}' },
              },
            ],
            content: '',
          };
        }
        expect(messages.some((message) => message.role === 'tool' && message.tool_call_id === 'call_doc')).toBe(true);
        expect(messages.some((message) => message.role === 'tool' && message.tool_call_id === 'call_patterns')).toBe(true);
        return {
          ok: true,
          latencyMs: 10,
          cost: 0.001,
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
          finishReason: 'stop',
          toolCalls: [],
          content: passingDealDeskOutput(),
        };
      },
    });

    const db = new Database(dbPath);
    const toolCalls = db.prepare('SELECT tool_name, result_json, result_chars FROM model_benchmark_tool_calls ORDER BY sequence').all();
    db.close();

    expect(payload.runs[0].success).toBe(true);
    expect(toolCalls.map((row) => row.tool_name)).toEqual(['read_clear_doc', 'query_patterns_db']);
    expect(toolCalls[0].result_json).toContain('SYNTAX.md');
    expect(toolCalls[0].result_chars).toBeGreaterThan(1000);
    expect(toolCalls[1].result_json).toContain('deal approval');
  });
});

run();
