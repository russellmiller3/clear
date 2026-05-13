#!/usr/bin/env node
// Ralph-loop OpenRouter benchmark.
//
// This is the ranking harness Russell asked for:
//   - real Ralph retry/block semantics
//   - hard Clear app tasks
//   - 2-minute timeout per model/task/variant
//   - model chat output, tool calls, timing, tokens, and cost logged to Factor DB
//
// Start with docs/openrouter-iteration-benchmark-harness.md for operating notes.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileProgram } from '../index.js';
import { formatRalphMessage, shouldRalphRetry } from '../studio/ralph-layer.js';
import {
  BENCHMARK_TASKS,
  DEFAULT_DB_PATH,
  DEFAULT_DOC_MAX_CHARS,
  DEFAULT_DOC_NAMES,
  DEFAULT_MAX_TOOL_ROUNDS,
  DEFAULT_MODELS,
  DEFAULT_PATTERN_RESULT_LIMIT,
  DEFAULT_SPEND_CAP_USD,
  benchmarkTools,
  callModel,
  createBenchmarkLogger,
  evaluateCandidate,
  executeBenchmarkTool,
  feedbackFor,
  fetchOpenRouterCredits,
  initialPrompt,
  readOpenRouterKey,
  selectModels,
  selectTasks,
} from './openrouter-iteration-benchmark.mjs';

export const DEFAULT_RALPH_TIMEOUT_MS = 120000;
export const DEFAULT_RALPH_MAX_ATTEMPTS = 50;
export const DEFAULT_MODEL_PARALLELISM = 3;

export const RALPH_VARIANTS = Object.freeze([
  {
    id: 'single_shot',
    label: 'Single shot, no Ralph',
    description: 'One attempt. No Ralph retry, no error hints, no pattern DB.',
    loop: false,
    errorHints: false,
    patternDbTool: false,
  },
  {
    id: 'ralph_plain',
    label: 'Ralph only',
    description: 'Ralph sends missing requirement gaps back until pass or timeout.',
    loop: true,
    errorHints: false,
    patternDbTool: false,
  },
  {
    id: 'ralph_error_hints',
    label: 'Ralph + error hints',
    description: 'Ralph retry plus compiler errors and failed requirement details.',
    loop: true,
    errorHints: true,
    patternDbTool: false,
  },
  {
    id: 'ralph_pattern_db',
    label: 'Ralph + pattern DB',
    description: 'Ralph retry plus the local pattern-search tool.',
    loop: true,
    errorHints: false,
    patternDbTool: true,
  },
  {
    id: 'ralph_error_pattern_db',
    label: 'Ralph + error hints + pattern DB',
    description: 'Ralph retry plus compiler hints and the local pattern-search tool.',
    loop: true,
    errorHints: true,
    patternDbTool: true,
    requiredToolNames: ['read_clear_doc', 'query_patterns_db'],
  },
]);

export function selectVariants(ids, available = RALPH_VARIANTS) {
  if (!ids || ids.length === 0 || ids.includes('all')) return available;
  const byId = new Map(available.map((item) => [item.id, item]));
  return ids.map((id) => {
    const found = byId.get(id);
    if (!found) {
      throw new Error(`Unknown variant "${id}". Available: ${available.map((item) => item.id).join(', ')}`);
    }
    return found;
  });
}

export function ralphAuditFromEvaluation(evalResult) {
  const items = [];

  if ((evalResult.compileErrors || []).length > 0) {
    items.push({
      id: 'compile_clean',
      text: 'Clear source compiles cleanly',
      status: 'missing',
      reason: evalResult.compileErrors.map((item) => item.message || String(item)).join('\n'),
    });
  }

  for (const check of evalResult.checks || []) {
    items.push({
      id: check.id,
      text: check.label || check.id,
      status: check.pass ? 'passed' : 'missing',
      reason: check.pass ? 'Requirement evidence found.' : (check.details || 'No matching implementation evidence found.'),
      evidence: check.evidence || [],
    });
  }

  if ((evalResult.requirements || []).length === 0 && (evalResult.responseRequirements || []).length === 0) {
    items.push({
      id: 'requirements_present',
      text: 'Model emits checkable requirements',
      status: 'missing',
      reason: 'No requirements were found in the model response or Clear source.',
    });
  }

  return {
    ok: evalResult.ok,
    summary: evalResult.ok ? 'All benchmark requirements passed.' : 'One or more benchmark requirements are missing.',
    items,
  };
}

export function buildRalphFeedback({ variant, evalResult, attemptIndex, maxAttempts, task }) {
  const audit = ralphAuditFromEvaluation(evalResult);
  const lines = [
    formatRalphMessage({
      audit,
      retryIndex: attemptIndex,
      maxRetries: Math.max(1, maxAttempts - 1),
      blockOnUnverified: true,
    }),
  ];

  if (variant.errorHints) {
    lines.push('');
    lines.push('Compiler and requirement repair details:');
    lines.push(feedbackFor({ id: 'error_hints' }, evalResult, attemptIndex, task));
  }

  if (variant.patternDbTool) {
    lines.push('');
    lines.push('Before revising, use query_patterns_db for the missing workflow or syntax shape.');
  }

  return lines.join('\n');
}

const MEPH_LIKE_TOOL_NAMES = Object.freeze([
  'edit_code',
  'compile',
  'run_app',
  'click_element',
  'fill_input',
  'read_dom',
  'read_actions',
  'read_network',
  'screenshot_output',
  'read_file',
  'edit_file',
  'write_request',
]);

function objectTool(name, description, properties = {}, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties,
        required,
      },
    },
  };
}

function mephLikeBenchmarkTools() {
  return [
    objectTool('edit_code', 'Ghost Meph style editor tool. Read, write, or undo Clear source.', {
      action: { type: 'string', enum: ['read', 'write', 'undo'] },
      code: { type: 'string' },
    }, ['action']),
    objectTool('compile', 'Compile the current Clear source and return friendly compiler errors.', {
      include_compiled: { type: 'boolean' },
    }),
    objectTool('run_app', 'Run the compiled app so app-inspection tools can verify behavior.'),
    objectTool('click_element', 'Click a selector in the running app.', {
      selector: { type: 'string' },
    }, ['selector']),
    objectTool('fill_input', 'Fill a selector in the running app.', {
      selector: { type: 'string' },
      value: { type: 'string' },
    }, ['selector', 'value']),
    objectTool('read_dom', 'Read a DOM snapshot from the running app.'),
    objectTool('read_actions', 'Read the recent app/user action buffer.'),
    objectTool('read_network', 'Read recent network requests from the app.'),
    objectTool('screenshot_output', 'Take a visual screenshot of the running app.'),
    objectTool('read_file', 'Read an allowed Clear repo file, including docs and requests.md.', {
      filename: { type: 'string' },
    }, ['filename']),
    objectTool('edit_file', 'Append a simulated request to requests.md during the benchmark.', {
      filename: { type: 'string' },
      action: { type: 'string', enum: ['append'] },
      content: { type: 'string' },
    }, ['filename', 'action', 'content']),
    objectTool('write_request', 'Log a request/improvement candidate discovered during the benchmark.', {
      title: { type: 'string' },
      body: { type: 'string' },
    }, ['title', 'body']),
  ];
}

export function toolsForVariant(variant, docNames = DEFAULT_DOC_NAMES) {
  if (!variant.patternDbTool) return [];
  const base = benchmarkTools({ docNames });
  if (variant.errorHints && variant.patternDbTool) {
    const byName = new Map(base.map((tool) => [tool.function.name, tool]));
    for (const tool of mephLikeBenchmarkTools()) byName.set(tool.function.name, tool);
    return [...byName.values()];
  }
  return base.filter((tool) => tool?.function?.name === 'query_patterns_db');
}

function systemPromptForVariant(variant) {
  const patternLine = variant.errorHints && variant.patternDbTool
    ? 'Your first move must be tool calls: read_clear_doc for Clear syntax/instructions, query_patterns_db for task patterns, then use Ghost Meph-style tools to write source, compile, run the app, inspect DOM/actions/network/screenshot evidence, and write requests when the compiler or harness needs a follow-up.'
    : variant.patternDbTool
      ? 'When you need a Clear shape or repair example, call query_patterns_db before final source.'
    : 'Do not use tools. Work from the prompt and feedback only.';
  return [
    'You are being benchmarked as a Clear/Meph app-building assistant.',
    'Produce a hard app, not a sketch.',
    'Always output exactly two sections: REQUIREMENTS and CLEAR_SOURCE.',
    'Requirements must be checkable outcome claims.',
    'Clear source must be complete enough for the compiler and Ralph checks.',
    patternLine,
    'Do not explain the benchmark. Do not include markdown fences.',
  ].join('\n');
}

async function runToolAwareAttempt({
  caller,
  apiKey,
  model,
  messages,
  tools,
  task,
  variant,
  rootDir,
  maxToolRounds,
  docNames,
  docMaxChars,
  dbPath,
  timeoutMs,
  compiler,
  lookupGenerationCost = true,
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
  const toolState = { source: '', errors: [], compileResult: null, appRunning: false, actions: [], network: [], requests: [] };
  const requiredToolNames = new Set(variant.requiredToolNames || []);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const mustUseTool = tools.length > 0 && requiredToolNames.size > 0;
    let response;
    try {
      response = await caller({
        apiKey,
        model,
        messages: attemptMessages,
        tools,
        toolChoice: mustUseTool ? 'required' : 'auto',
        task,
        variant,
      timeoutMs,
      lookupGenerationCost,
    });
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error),
        timeout: /timeout|aborted/i.test(String(error?.name || '') + ' ' + String(error?.message || error)),
        latencyMs: totalLatencyMs,
        cost: totalCost,
        promptTokens,
        completionTokens,
        totalTokens,
        rawResponse,
        toolCalls,
        requestWrites: toolState.requests || [],
      };
    }

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
        requestWrites: toolState.requests || [],
      };
    }

    const responseToolCalls = response.toolCalls || [];
    if (mustUseTool && responseToolCalls.length === 0) {
      attemptMessages.push({
        role: 'assistant',
        content: response.content || '',
      });
      attemptMessages.push({
        role: 'user',
        content: `Use the available tools before final code. Still required: ${[...requiredToolNames].join(', ')}.`,
      });
      continue;
    }
    if (responseToolCalls.length === 0) {
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
        requestWrites: toolState.requests || [],
      };
    }

    attemptMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: responseToolCalls,
    });

    for (const toolCall of responseToolCalls) {
      const toolName = toolCall.function?.name || toolCall.name || 'unknown_tool';
      requiredToolNames.delete(toolName);
      const result = await executeBenchmarkTool({
        toolCall,
        rootDir,
        docNames,
        docMaxChars,
        patternLimit: DEFAULT_PATTERN_RESULT_LIMIT,
        dbPath,
        state: toolState,
        compiler,
      });
      toolCalls.push({ ...toolCall, result });
      attemptMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
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
    requestWrites: toolState.requests || [],
  };
}

export async function runRalphRankingBenchmark(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const outPath = options.out || path.join(rootDir, '.tmp', 'openrouter-ralph-ranking-2026-05-12.json');
  const timeoutMs = options.timeoutMs || DEFAULT_RALPH_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_RALPH_MAX_ATTEMPTS;
  const spendCap = options.spendCap ?? DEFAULT_SPEND_CAP_USD;
  const models = options.models || DEFAULT_MODELS;
  const variants = options.variants || RALPH_VARIANTS;
  const tasks = options.tasks || BENCHMARK_TASKS;
  const apiKey = options.apiKey || await readOpenRouterKey(rootDir);
  const caller = options.callModel || callModel;
  const log = options.log || console.log;
  const events = createProgressEmitter({
    streamPath: options.streamPath || null,
    log,
    espn: options.espn === true,
  });
  const logger = options.logDb === false ? null : (options.logger || createBenchmarkLogger(options.dbPath || DEFAULT_DB_PATH));
  const compiler = options.compiler || compileProgram;
  const parallelModels = options.parallelModels !== false;
  const modelParallelism = Math.max(1, Number(options.modelParallelism || DEFAULT_MODEL_PARALLELISM));
  const maxToolRounds = options.maxToolRounds || DEFAULT_MAX_TOOL_ROUNDS;
  const docNames = options.docNames || DEFAULT_DOC_NAMES;
  const docMaxChars = options.docMaxChars || DEFAULT_DOC_MAX_CHARS;
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const lookupGenerationCost = options.lookupGenerationCost !== false;

  let payload = {
    createdAt: new Date().toISOString(),
    benchmark: 'openrouter-ralph-ranking-benchmark-v1',
    tasks: tasks.map(({ id, family, title, userAsk }) => ({ id, family, title, userAsk })),
    timeoutMs,
    maxAttempts,
    spendCapUsd: spendCap,
    parallelModels,
    modelParallelism,
    maxToolRounds,
    docNames,
    docMaxChars,
    models,
    variants,
    runs: [],
    costSnapshots: [],
  };

  if (options.resume !== false) {
    try {
      const existing = JSON.parse(await fs.readFile(outPath, 'utf8'));
      if (Array.isArray(existing.runs)) payload = existing;
    } catch {}
  }

  const completed = new Set(payload.runs.map((run) => run.key));
  let saveQueue = Promise.resolve();
  let observedSpend = currentSpend();

  function currentSpend() {
    return Number(payload.runs
      .flatMap((run) => run.attempts || [])
      .reduce((sum, attempt) => sum + Number(attempt.cost || 0), 0)
      .toFixed(6));
  }

  function recordObservedSpend(cost) {
    observedSpend = Number((observedSpend + Number(cost || 0)).toFixed(6));
    return observedSpend;
  }

  async function save() {
    saveQueue = saveQueue.then(async () => {
      payload.updatedAt = new Date().toISOString();
      payload.totalSpend = currentSpend();
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(payload, null, 2));
    });
    await saveQueue;
  }

  async function captureCredits(label) {
    const snapshot = await fetchOpenRouterCredits(apiKey).catch((error) => ({ ok: false, error: String(error?.message || error) }));
    const event = {
      label,
      capturedAt: new Date().toISOString(),
      ok: snapshot.ok,
      totalCredits: snapshot.totalCredits ?? null,
      totalUsage: snapshot.totalUsage ?? null,
      error: snapshot.error || null,
      rawResponse: snapshot.rawResponse || null,
    };
    payload.costSnapshots.push(event);
    await events.emit({ type: 'credits', label, totalCredits: event.totalCredits, totalUsage: event.totalUsage, ok: event.ok });
    logger?.logCostEvent?.({
      eventKind: `credits_${label}`,
      creditsTotal: event.totalCredits,
      creditsUsage: event.totalUsage,
      payload: event,
      outputPath: outPath,
    });
    await save();
    return event;
  }

  async function runCombination(task, model, variant) {
    const key = `${task.id}::${model.id}::${variant.id}`;
    if (completed.has(key)) {
      log(`SKIP ${task.id} / ${model.label} / ${variant.id}`);
      return null;
    }

    const runId = crypto.randomUUID();
    const tools = toolsForVariant(variant, docNames);
    const startedMs = Date.now();
    const deadlineMs = startedMs + timeoutMs;
    log(`RUN ${task.id} / ${model.label} / ${variant.id}`);
    await events.emit({
      type: 'run_start',
      taskId: task.id,
      taskTitle: task.title,
      model: model.label,
      modelId: model.id,
      modelTier: model.tier || 'cheap',
      variant: variant.id,
      timeoutMs,
    });

    const run = {
      key,
      runId,
      taskId: task.id,
      taskFamily: task.family,
      taskTitle: task.title,
      model: model.label,
      modelId: model.id,
      modelTier: model.tier || 'cheap',
      mode: variant.id,
      modeLabel: variant.label,
      variant: variant.id,
      variantDescription: variant.description,
      timeoutMs,
      startedAt: new Date(startedMs).toISOString(),
      attempts: [],
      success: false,
      successAttempt: null,
      timedOut: false,
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
      feedback_mode: variant.id,
      max_attempts: variant.loop ? maxAttempts : 1,
      started_at: run.startedAt,
      output_path: outPath,
    });

    const messages = [
      { role: 'system', content: systemPromptForVariant(variant) },
      { role: 'user', content: initialPrompt(task) },
    ];

    const attemptLimit = variant.loop ? maxAttempts : 1;
    for (let attemptIndex = 1; attemptIndex <= attemptLimit; attemptIndex += 1) {
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        run.timedOut = true;
        break;
      }
      if (observedSpend >= spendCap) {
        run.finalError = `Spend cap reached before attempt ${attemptIndex}.`;
        await events.emit({
          type: 'spend_cap',
          taskId: task.id,
          model: model.label,
          variant: variant.id,
          totalSpend: observedSpend,
          spendCap,
        });
        break;
      }

      const requestMessages = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await runToolAwareAttempt({
        caller,
        apiKey,
        model,
        messages,
        tools,
        task,
        variant,
        rootDir,
        maxToolRounds,
        docNames,
        docMaxChars,
        dbPath,
        timeoutMs: Math.max(1000, remainingMs),
        compiler,
        lookupGenerationCost,
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
        requestWrites: response.requestWrites || [],
        generationId: response.generationId || null,
        costDetails: response.costDetails || null,
      };
      const totalSpend = recordObservedSpend(attempt.cost);

      if (!response.ok) {
        attempt.error = response.error;
        attempt.timeout = response.timeout || /timeout|aborted/i.test(String(response.error || ''));
        run.attempts.push(attempt);
        run.finalError = response.error;
        run.timedOut = run.timedOut || attempt.timeout;
        logger?.logAttempt(runId, attempt);
        break;
      }

      const evalResult = evaluateCandidate(response.content, { task, compiler });
      const audit = ralphAuditFromEvaluation(evalResult);
      const decision = shouldRalphRetry({
        audit,
        retryCount: attemptIndex - 1,
        maxRetries: attemptLimit - 1,
        blockOnUnverified: true,
      });
      const shouldRetry = variant.loop && decision.retry && Date.now() < deadlineMs;
      const feedbackText = shouldRetry
        ? buildRalphFeedback({ variant, evalResult, attemptIndex, maxAttempts: attemptLimit, task })
        : null;

      attempt.content = response.content;
      attempt.source = evalResult.source;
      attempt.ralphDecision = decision;
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
        ralphAudit: audit,
      };
      run.attempts.push(attempt);
      run.finalFailedChecks = evalResult.failed;
      logger?.logAttempt(runId, attempt);

      log(`  ${model.label} ${variant.id} attempt ${attemptIndex}: ${evalResult.ok ? 'PASS' : 'fail'} failures=${evalResult.failed.length} cost=$${attempt.cost.toFixed(6)} latency=${attempt.latencyMs}ms`);
      await events.emit({
        type: 'attempt',
        taskId: task.id,
        model: model.label,
        variant: variant.id,
        attempt: attemptIndex,
        pass: evalResult.ok,
        failedCount: evalResult.failed.length,
        failedChecks: evalResult.failed.map((item) => item.id),
        cost: attempt.cost,
        latencyMs: attempt.latencyMs,
        totalSpend,
      });

      if (evalResult.ok) {
        run.success = true;
        run.successAttempt = attemptIndex;
        run.finalSource = evalResult.source;
        break;
      }

      if (!shouldRetry) {
        run.ralphBlocked = decision.blocked || !variant.loop;
        break;
      }

      if (totalSpend + attempt.cost >= spendCap) {
        run.finalError = `Spend cap would likely be exceeded by another attempt.`;
        await events.emit({
          type: 'spend_cap',
          taskId: task.id,
          model: model.label,
          variant: variant.id,
          totalSpend,
          spendCap,
        });
        break;
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: feedbackText });
    }

    if (!run.success && Date.now() >= deadlineMs) {
      run.timedOut = true;
    }
    run.endedAt = new Date().toISOString();
    run.durationMs = Date.now() - startedMs;
    run.totalCost = Number(run.attempts.reduce((sum, attempt) => sum + Number(attempt.cost || 0), 0).toFixed(6));
    run.totalLatencyMs = run.attempts.reduce((sum, attempt) => sum + Number(attempt.latencyMs || 0), 0);
    logger?.finishRun(run);
    payload.runs.push(run);
    completed.add(key);
    await save();
    log(`DONE ${task.id} / ${model.label} / ${variant.id}: ${run.success ? `PASS in ${run.successAttempt}` : (run.timedOut ? 'TIMEOUT' : 'FAIL')} cost=$${run.totalCost.toFixed(6)}`);
    await events.emit({
      type: 'run_done',
      taskId: task.id,
      taskTitle: task.title,
      model: model.label,
      modelId: model.id,
      modelTier: model.tier || 'cheap',
      variant: variant.id,
      success: run.success,
      successAttempt: run.successAttempt,
      timedOut: run.timedOut,
      cost: run.totalCost,
      attempts: run.attempts.length,
      totalSpend: observedSpend,
      finalFailedChecks: (run.finalFailedChecks || []).map((item) => item.id),
      finalError: run.finalError || null,
    });
    return run;
  }

  try {
    await captureCredits('start');
    for (const task of tasks) {
      for (const variant of variants) {
        if (observedSpend >= spendCap) {
          log(`Spend cap reached before ${task.id} / ${variant.id}; stopping.`);
          await events.emit({ type: 'spend_cap', taskId: task.id, variant: variant.id, totalSpend: observedSpend, spendCap });
          await save();
          return payload;
        }
        if (parallelModels) {
          await runWithParallelism(models, modelParallelism, (model) => runCombination(task, model, variant));
        } else {
          for (const model of models) {
            if (observedSpend >= spendCap) {
              log(`Spend cap reached before ${task.id} / ${model.label} / ${variant.id}; stopping.`);
              await events.emit({ type: 'spend_cap', taskId: task.id, model: model.label, variant: variant.id, totalSpend: observedSpend, spendCap });
              await save();
              return payload;
            }
            await runCombination(task, model, variant);
          }
        }
      }
    }
  } finally {
    await captureCredits('end').catch(() => null);
    logger?.close?.();
  }

  await events.flush();
  await save();
  return payload;
}

function createProgressEmitter({ streamPath = null, log = console.log, espn = false } = {}) {
  let queue = Promise.resolve();
  async function emit(event) {
    const entry = { ts: new Date().toISOString(), ...event };
    if (espn) log(formatProgressEvent(entry));
    if (streamPath) {
      queue = queue.then(() => fs.appendFile(streamPath, `${JSON.stringify(entry)}\n`));
      await queue;
    }
  }
  return {
    emit,
    flush: () => queue,
  };
}

function formatProgressEvent(event) {
  if (event.type === 'credits') {
    return `[credits] ${event.label}: used=$${Number(event.totalUsage || 0).toFixed(4)} total=$${Number(event.totalCredits || 0).toFixed(2)}`;
  }
  if (event.type === 'run_start') {
    return `[kickoff] ${event.model} vs ${event.taskId} (${event.variant})`;
  }
  if (event.type === 'attempt') {
    const result = event.pass ? 'TOUCHDOWN' : `stopped at ${event.failedCount} gaps`;
    return `[attempt ${event.attempt}] ${event.model} / ${event.taskId}: ${result}, +$${Number(event.cost || 0).toFixed(4)}, total=$${Number(event.totalSpend || 0).toFixed(4)}`;
  }
  if (event.type === 'run_done') {
    const result = event.success ? `PASS in ${event.successAttempt}` : (event.timedOut ? 'TIMEOUT' : 'FAIL');
    return `[final] ${event.model} / ${event.taskId}: ${result}, attempts=${event.attempts}, cost=$${Number(event.cost || 0).toFixed(4)}`;
  }
  if (event.type === 'spend_cap') {
    return `[cap] total=$${Number(event.totalSpend || 0).toFixed(4)} cap=$${Number(event.spendCap || 0).toFixed(2)}`;
  }
  return `[${event.type}] ${JSON.stringify(event)}`;
}

async function runWithParallelism(items, parallelism, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(parallelism, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function parseArgs(argv) {
  const args = {
    models: ['all'],
    variants: ['single_shot', 'ralph_error_pattern_db'],
    tasks: ['twitter_scheduler', 'deal_desk_approval'],
    resume: true,
    logDb: true,
    parallelModels: true,
    modelParallelism: DEFAULT_MODEL_PARALLELISM,
    spendCap: DEFAULT_SPEND_CAP_USD,
    timeoutMs: DEFAULT_RALPH_TIMEOUT_MS,
    maxAttempts: DEFAULT_RALPH_MAX_ATTEMPTS,
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
    lookupGenerationCost: true,
    out: path.join(process.cwd(), '.tmp', 'openrouter-ralph-ranking-2026-05-12.json'),
    dbPath: DEFAULT_DB_PATH,
  };

  for (const arg of argv) {
    if (arg.startsWith('--models=')) args.models = splitCsv(arg.slice('--models='.length));
    else if (arg.startsWith('--variants=')) args.variants = splitCsv(arg.slice('--variants='.length));
    else if (arg.startsWith('--tasks=')) args.tasks = splitCsv(arg.slice('--tasks='.length));
    else if (arg.startsWith('--spend-cap=')) args.spendCap = Number(arg.slice('--spend-cap='.length));
    else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg.startsWith('--max-attempts=')) args.maxAttempts = Number(arg.slice('--max-attempts='.length));
    else if (arg.startsWith('--max-tool-rounds=')) args.maxToolRounds = Number(arg.slice('--max-tool-rounds='.length));
    else if (arg.startsWith('--model-parallelism=')) args.modelParallelism = Number(arg.slice('--model-parallelism='.length));
    else if (arg.startsWith('--stream-jsonl=')) args.streamPath = path.resolve(arg.slice('--stream-jsonl='.length));
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--db=')) args.dbPath = path.resolve(arg.slice('--db='.length));
    else if (arg === '--no-db') args.logDb = false;
    else if (arg === '--no-generation-cost') args.lookupGenerationCost = false;
    else if (arg === '--no-resume') args.resume = false;
    else if (arg === '--serial-models') args.parallelModels = false;
    else if (arg === '--parallel-models') args.parallelModels = true;
    else if (arg === '--espn') args.espn = true;
    else if (arg === '--list-variants') args.listVariants = true;
    else if (arg === '--list-models') args.listModels = true;
    else if (arg === '--list-tasks') args.listTasks = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.listVariants) {
    for (const variant of RALPH_VARIANTS) console.log(`${variant.id}\t${variant.label}\t${variant.description}`);
    return;
  }
  if (args.listModels) {
    for (const model of DEFAULT_MODELS) console.log(`${model.key}\t${model.tier || 'cheap'}\t${model.id}\t${model.label}`);
    return;
  }
  if (args.listTasks) {
    for (const task of BENCHMARK_TASKS) console.log(`${task.id}\t${task.family}\t${task.title}`);
    return;
  }

  const payload = await runRalphRankingBenchmark({
    models: args.models.includes('all') ? DEFAULT_MODELS : selectModels(args.models),
    variants: selectVariants(args.variants),
    tasks: args.tasks.includes('all') ? BENCHMARK_TASKS : selectTasks(args.tasks),
    resume: args.resume,
    logDb: args.logDb,
    parallelModels: args.parallelModels,
    modelParallelism: args.modelParallelism,
    spendCap: args.spendCap,
    timeoutMs: args.timeoutMs,
    maxAttempts: args.maxAttempts,
    maxToolRounds: args.maxToolRounds,
    lookupGenerationCost: args.lookupGenerationCost,
    streamPath: args.streamPath,
    espn: args.espn,
    out: args.out,
    dbPath: args.dbPath,
  });

  console.log(JSON.stringify({
    out: args.out,
    runs: payload.runs.length,
    successes: payload.runs.filter((run) => run.success).length,
    spend: payload.totalSpend || 0,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
