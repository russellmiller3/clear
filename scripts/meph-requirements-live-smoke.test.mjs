import { describe, it, expect, run } from '../lib/testUtils.js';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  APPROVAL_QUEUE_PROMPT,
  buildApprovedChatBody,
  buildRequirementsChatBody,
  createUsageLedgerRecorder,
  formatAuditItem,
  formatCostDollars,
  formatCostReport,
  resolveSmokeModel,
  smokePassed,
  summarizeSmoke,
} from './meph-requirements-live-smoke.mjs';

describe('Meph requirements live smoke harness', () => {
  it('defaults to the requested Gemini 3 Flash Preview OpenRouter model', () => {
    expect(resolveSmokeModel({})).toEqual('google/gemini-3-flash-preview');
    expect(resolveSmokeModel({ MEPH_REQUIREMENTS_SMOKE_MODEL: 'x/y' })).toEqual('x/y');
  });

  it('uses a vague user prompt instead of teaching the approval-queue answer', () => {
    expect(APPROVAL_QUEUE_PROMPT).toEqual('Build me a deal approval app for a sales team.');
    expect(APPROVAL_QUEUE_PROMPT).not.toContain('50000');
    expect(APPROVAL_QUEUE_PROMPT).not.toContain('approve and reject');
    expect(APPROVAL_QUEUE_PROMPT).not.toContain('optimistic');
    expect(APPROVAL_QUEUE_PROMPT).not.toContain('Include tests');
  });

  it('first turn asks for requirements without approved requirements', () => {
    const body = buildRequirementsChatBody({ prompt: APPROVAL_QUEUE_PROMPT });

    expect(body.messages.length).toEqual(1);
    expect(body.requirementsMode).toEqual('auto');
    expect(body.approvedRequirements).toEqual(undefined);
    expect(body.patternPreflight).toEqual('full');
  });

  it('second turn approves requirements and asks Meph to build', () => {
    const requirements = [
      'logged-in sellers can submit deals',
      'deals at least 50000 route to VP approval',
    ];
    const body = buildApprovedChatBody({
      prompt: APPROVAL_QUEUE_PROMPT,
      assistantText: 'requirements:\n  logged-in sellers can submit deals',
      requirements,
      requirementsId: 'req_123',
    });

    expect(body.messages.length).toEqual(3);
    expect(body.approvedRequirements).toEqual(requirements);
    expect(body.approvedRequirementsId).toEqual('req_123');
    expect(body.messages[2].content).toContain('Approved');
    expect(body.messages[2].content).toContain('Build the app now');
  });

  it('summarizes Ralph, compile, and requirements-review signals', () => {
    const summary = summarizeSmoke({
      model: 'google/gemini-3-flash-preview',
      requirementsRun: {
        requirementsReview: { requirements: ['a', 'b'], requirementsId: 'abc' },
        patternPreflight: { pattern_count: 0 },
        text: 'requirements:\n  a\n  b',
        toolNames: [],
        modelUsageEvents: [{ usage: { input_tokens: 100, output_tokens: 20, openrouter_cost: 0.001, openrouter_generation_id: 'gen_a' } }],
      },
      buildRun: {
        requirementsAudit: { summary: '1 passed, 1 unverified', items: [{ status: 'passed' }, { status: 'unverified' }] },
        requirementsRetryEvents: [{ type: 'requirements_retry' }],
        requirementsBlocked: null,
        done: true,
        patternPreflight: { pattern_count: 4 },
        source: 'build for web',
        toolNames: ['edit_code', 'compile'],
        modelUsageEvents: [{ usage: { prompt_tokens: 300, completion_tokens: 40, cost: 0.002, generation_id: 'gen_b' } }],
      },
      compileResult: { errors: [], warnings: [{ message: 'warn' }] },
    });

    expect(summary.model).toEqual('google/gemini-3-flash-preview');
    expect(summary.requirementsCount).toEqual(2);
    expect(summary.compileErrors).toEqual(0);
    expect(summary.compileWarnings).toEqual(1);
    expect(summary.ralphRetries).toEqual(1);
    expect(summary.ralphPassed).toEqual(1);
    expect(summary.ralphUnverified).toEqual(1);
    expect(summary.ralphRan).toEqual(true);
    expect(summary.openRouterCostCredits).toEqual(0.003);
    expect(summary.modelInputTokens).toEqual(400);
    expect(summary.modelOutputTokens).toEqual(60);
    expect(summary.costAccountingReady).toEqual(true);
    expect(summary.done).toEqual(true);
  });

  it('formats current run and running total cost in dollars and cents', () => {
    expect(formatCostDollars(0.4)).toEqual('$0.40');
    expect(formatCostDollars(3.4)).toEqual('$3.40');
    expect(formatCostReport({ currentCostCredits: 0.4, totalCostCredits: 3.4 }))
      .toEqual('Cost: current run $0.40, total: $3.40.');
  });

  it('writes OpenRouter usage events to the ledger immediately and dedupes generation ids', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clear-openrouter-ledger-'));
    const path = join(dir, 'ledger.jsonl');
    try {
      const recorder = createUsageLedgerRecorder({ model: 'google/gemini-3-flash-preview', path });
      const first = recorder.record({
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          openrouter_cost: 0.12,
          openrouter_generation_id: 'gen_1',
        },
      });
      const duplicate = recorder.record({
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          openrouter_cost: 0.12,
          openrouter_generation_id: 'gen_1',
        },
      });

      const rows = readFileSync(path, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
      expect(first.recorded).toEqual(true);
      expect(duplicate.recorded).toEqual(false);
      expect(rows.length).toEqual(1);
      expect(rows[0].cost_credits).toEqual(0.12);
      expect(rows[0].generation_id).toEqual('gen_1');
      expect(recorder.totals().currentCostCredits).toEqual(0.12);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails the smoke when the build finishes without a Ralph audit or cost accounting', () => {
    const summary = summarizeSmoke({
      model: 'google/gemini-3-flash-preview',
      requirementsRun: {
        requirementsReview: { requirements: ['deal creators can submit deal requests'], requirementsId: 'abc' },
        patternPreflight: { pattern_count: 3 },
        toolNames: [],
      },
      buildRun: {
        requirementsAudit: null,
        requirementsRetryEvents: [],
        requirementsBlocked: null,
        done: true,
        patternPreflight: { pattern_count: 3 },
        source: 'build for web',
        toolNames: ['edit_code'],
      },
      compileResult: { errors: [], warnings: [] },
    });

    expect(summary.ralphRan).toEqual(false);
    expect(summary.costAccountingReady).toEqual(false);
    expect(smokePassed(summary)).toEqual(false);
  });

  it('formats Ralph audit rows with the audited requirement text', () => {
    expect(formatAuditItem({
      status: 'unverified',
      text: 'managers receive an internal notification when a new deal is submitted',
      reason: 'No Ralph detector can verify this requirement yet.',
    })).toEqual('- unverified: managers receive an internal notification when a new deal is submitted (No Ralph detector can verify this requirement yet.)');
  });
});

run();
