import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, describeAsync, expect, it, itAsync, run } from '../lib/testUtils.js';
import {
  RALPH_VARIANTS,
  buildRalphFeedback,
  ralphAuditFromEvaluation,
  runRalphRankingBenchmark,
} from './openrouter-ralph-ranking-benchmark.mjs';
import { evaluateCandidate } from './openrouter-iteration-benchmark.mjs';

const miniTask = {
  id: 'mini_app',
  family: 'test',
  title: 'Mini app',
  userAsk: [
    'Build a tiny Clear app.',
    'Target: web and javascript backend.',
    'Database: local memory.',
    'Things table: name required.',
  ].join('\n'),
  requiredChecks: [
    { id: 'target_db', label: 'Target and DB are declared', all: [/build for web and javascript backend/i, /database is local memory/i] },
    { id: 'table', label: 'Things table exists', all: [/create a things? table\s*:/i, /name.*required|name, required/i] },
  ],
  patternHints: 'create a Things table:\n  name, required',
};

const fakeModel = {
  key: 'fake',
  label: 'Fake Model',
  id: 'fake/model',
  tier: 'cheap',
  inPerM: 0,
  outPerM: 0,
};

function tempPath(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-ralph-benchmark-'));
  return path.join(dir, name);
}

function fakeCompiler(source) {
  if (/broken/i.test(source)) {
    return { errors: [{ message: 'Line 1: fake compiler error' }], warnings: [], requirements: [] };
  }
  return {
    errors: [],
    warnings: [],
    requirements: Array.from({ length: 5 }, (_, index) => ({ text: `requirement ${index + 1}` })),
  };
}

function passingOutput() {
  return [
    'REQUIREMENTS:',
    '- Store things with names.',
    '',
    'CLEAR_SOURCE:',
    'build for web and javascript backend',
    'database is local memory',
    '',
    'create a Things table:',
    '  name, required',
  ].join('\n');
}

await describeAsync('OpenRouter Ralph ranking benchmark', async () => {
  await itAsync('retries with Ralph feedback until requirements pass', async () => {
    const dbPath = tempPath('ralph.sqlite');
    const outPath = tempPath('ralph.json');
    let calls = 0;

    const payload = await runRalphRankingBenchmark({
      apiKey: 'test-key',
      dbPath,
      out: outPath,
      resume: false,
      parallelModels: false,
      timeoutMs: 10000,
      maxAttempts: 3,
      models: [fakeModel],
      variants: [RALPH_VARIANTS.find((variant) => variant.id === 'ralph_error_hints')],
      tasks: [miniTask],
      compiler: fakeCompiler,
      log: () => {},
      callModel: async () => {
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
            ? 'REQUIREMENTS:\n- Store things.\n\nCLEAR_SOURCE:\nbroken'
            : passingOutput(),
        };
      },
    });

    expect(calls).toBe(2);
    expect(payload.runs[0].success).toBe(true);
    expect(payload.runs[0].successAttempt).toBe(2);
    expect(payload.runs[0].attempts[0].nextFeedbackText).toContain('You are not done yet');
    expect(payload.runs[0].attempts[0].nextFeedbackText).toContain('fake compiler error');

    const db = new Database(dbPath);
    const row = db.prepare('SELECT feedback_mode, success FROM model_benchmark_runs').get();
    const attempts = db.prepare('SELECT COUNT(*) AS count FROM model_benchmark_attempts').get().count;
    db.close();
    expect(row.feedback_mode).toBe('ralph_error_hints');
    expect(attempts).toBe(2);
    expect(row.success).toBe(1);
  });

  await itAsync('captures pattern DB tool calls inside a Ralph variant', async () => {
    const dbPath = tempPath('tools.sqlite');
    const outPath = tempPath('tools.json');
    new Database(dbPath).close();
    let calls = 0;

    const payload = await runRalphRankingBenchmark({
      apiKey: 'test-key',
      dbPath,
      out: outPath,
      rootDir: process.cwd(),
      resume: false,
      parallelModels: false,
      timeoutMs: 10000,
      maxAttempts: 1,
      models: [fakeModel],
      variants: [RALPH_VARIANTS.find((variant) => variant.id === 'ralph_pattern_db')],
      tasks: [miniTask],
      compiler: fakeCompiler,
      log: () => {},
      callModel: async ({ messages, tools }) => {
        calls += 1;
        if (calls === 1) {
          expect(tools).toHaveLength(1);
          return {
            ok: true,
            latencyMs: 10,
            cost: 0.001,
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
            finishReason: 'tool_calls',
            content: '',
            toolCalls: [{
              id: 'call_patterns',
              type: 'function',
              function: { name: 'query_patterns_db', arguments: '{"query":"things table"}' },
            }],
          };
        }
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
          content: passingOutput(),
        };
      },
    });

    expect(payload.runs[0].success).toBe(true);
    expect(payload.runs[0].attempts[0].toolCalls).toHaveLength(1);

    const db = new Database(dbPath);
    const row = db.prepare('SELECT tool_name, arguments_json FROM model_benchmark_tool_calls').get();
    db.close();
    expect(row.tool_name).toBe('query_patterns_db');
    expect(row.arguments_json).toContain('things table');
  });

  await itAsync('stops retrying when another attempt would likely exceed the spend cap', async () => {
    const dbPath = tempPath('cap.sqlite');
    const outPath = tempPath('cap.json');
    let calls = 0;

    const payload = await runRalphRankingBenchmark({
      apiKey: 'test-key',
      dbPath,
      out: outPath,
      resume: false,
      parallelModels: false,
      spendCap: 1,
      timeoutMs: 10000,
      maxAttempts: 3,
      models: [fakeModel],
      variants: [RALPH_VARIANTS.find((variant) => variant.id === 'ralph_error_hints')],
      tasks: [miniTask],
      compiler: fakeCompiler,
      log: () => {},
      callModel: async () => {
        calls += 1;
        return {
          ok: true,
          latencyMs: 10,
          cost: 0.6,
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
          finishReason: 'stop',
          toolCalls: [],
          content: 'REQUIREMENTS:\n- Store things.\n\nCLEAR_SOURCE:\nbroken',
        };
      },
    });

    expect(calls).toBe(1);
    expect(payload.runs[0].success).toBe(false);
    expect(payload.runs[0].attempts).toHaveLength(1);
    expect(payload.runs[0].finalError).toContain('Spend cap would likely be exceeded');
  });
});

describe('Ralph evaluation helpers', () => {
  it('turns compiler and requirement failures into Ralph audit items', () => {
    const evalResult = evaluateCandidate('REQUIREMENTS:\n- one\n\nCLEAR_SOURCE:\nbroken', {
      task: miniTask,
      compiler: fakeCompiler,
    });
    const audit = ralphAuditFromEvaluation(evalResult);
    expect(audit.ok).toBe(false);
    expect(audit.items.some((item) => item.id === 'compile_clean')).toBe(true);
    expect(audit.items.some((item) => item.id === 'target_db')).toBe(true);
  });

  it('builds Ralph feedback with optional error hints', () => {
    const evalResult = evaluateCandidate('REQUIREMENTS:\n- one\n\nCLEAR_SOURCE:\nbroken', {
      task: miniTask,
      compiler: fakeCompiler,
    });
    const feedback = buildRalphFeedback({
      variant: RALPH_VARIANTS.find((item) => item.id === 'ralph_error_hints'),
      evalResult,
      attemptIndex: 1,
      maxAttempts: 3,
      task: miniTask,
    });
    expect(feedback).toContain('You are not done yet');
    expect(feedback).toContain('Compiler and requirement repair details');
    expect(feedback).toContain('fake compiler error');
  });
});

run();
