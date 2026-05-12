# OpenRouter Iteration Benchmark Harness

This is the repeatable benchmark for testing whether models can build real Clear apps, read failure feedback, and recover on later attempts.

## What It Measures

- **Requirement emission:** model must output a `REQUIREMENTS:` section and Clear source with an internal `requirements:` block.
- **Compilation:** generated Clear source must compile with zero errors.
- **Requirement coverage:** task-specific checks verify the app includes the requested tables, workflows, endpoints, external calls, and UI.
- **Iteration recovery:** each failed attempt feeds back compiler errors, failed checks, and optionally Clear pattern hints.
- **Cost and latency:** every attempt logs tokens, cost, latency, and finish reason.
- **Chat mining:** every prompt, model response, and correction prompt logs to SQLite.
- **Tool-call mining:** doc reads and pattern-database searches are real model tool calls and log to a separate table.

## Core Files

- `scripts/openrouter-iteration-benchmark.mjs` runs the benchmark.
- `scripts/openrouter-iteration-benchmark.test.mjs` tests extraction, evaluation, logging, retry behavior, and model parallelism.
- `scripts/openrouter-iteration-report.mjs` converts a JSON artifact plus database rows into an HTML report.
- `docs/openrouter-iteration-benchmark-2026-05-12.html` is the iterative benchmark report.
- `docs/openrouter-model-benchmark-2026-05-12.html` is the earlier one-shot model comparison report.

## Default Task Set

The default tasks are intentionally not toy apps:

- **Deal Desk approval workflow:** multi-table workflow CRUD, line items, approval comments, filtering, margin/discount summary.
- **Scheduled Twitter publisher:** external API allowlist, scheduled job, retry/failure state, cancel flow.
- **Stripe reconciliation ETL:** external API fetch, transformation, dedupe, mismatch findings, hourly sync.
- **Customer health ops cockpit:** usage import, score recalculation, filters, interventions, renewal-risk chart.

## Run The Harness

Use the bundled Node runtime on this Windows machine:

```powershell
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-benchmark.mjs --no-resume --parallel-models --doc-tool-mode=required --max-tool-rounds=4 --doc-max-chars=40000 --max-attempts=3 --spend-cap=3 --out=.tmp\openrouter-iteration-benchmark-toolcalls-2026-05-12.json --db=studio\factor-db.sqlite
```

Useful variants:

```powershell
# List available models
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-benchmark.mjs --list-models

# List benchmark tasks
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-benchmark.mjs --list-tasks

# Run only Gemini and GPT-5.5 on Twitter scheduler with pattern hints
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-benchmark.mjs --no-resume --parallel-models --doc-tool-mode=required --models=gemini-flash,gpt-5.5 --tasks=twitter_scheduler --modes=pattern_hints --max-attempts=3 --spend-cap=0.50 --out=.tmp\twitter-iteration-smoke.json --db=studio\factor-db.sqlite

# Debug serially
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-benchmark.mjs --serial-models --doc-tool-mode=auto --models=gemini-flash --tasks=deal_desk_approval --modes=error_hints --max-attempts=2 --spend-cap=0.25 --out=.tmp\debug-iteration.json --db=studio\factor-db.sqlite
```

## Generate The HTML Report

```powershell
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-report.mjs --input=.tmp\openrouter-iteration-benchmark-toolcalls-2026-05-12.json --out=docs\openrouter-iteration-benchmark-2026-05-12.html --db=studio\factor-db.sqlite
```

## Database Tables

The harness writes into `studio/factor-db.sqlite`.

- `model_benchmark_runs`: one row per model/task/feedback-mode combination.
- `model_benchmark_attempts`: one row per model attempt, including cost, latency, raw response JSON, full content, extracted source, evaluation JSON, and serialized tool calls.
- `model_benchmark_messages`: one row per request message, model response, and feedback message.
- `model_benchmark_tool_calls`: one row per tool call returned by the provider, including parsed arguments and result JSON.

Important distinction: putting `SYNTAX.md` into a prompt is context, not a tool call. A tool call means the model requested `read_clear_doc` or `query_patterns_db`, the harness executed it, and the returned result was appended as a `tool` message.

## Tool Modes

- `--doc-tool-mode=required`: first model response must be a tool call. Use this for the main benchmark.
- `--doc-tool-mode=auto`: tools are available, but the model may answer directly.
- `--doc-tool-mode=none`: disables tools for a baseline.

Available tools:

- `read_clear_doc`: reads `SYNTAX.md` or `AI-INSTRUCTIONS.md`.
- `query_patterns_db`: searches local SQLite tables for matching Clear patterns and prior examples.

Pattern-database queries count as tool calls. They log to `model_benchmark_tool_calls` with the tool name, arguments, raw tool-call JSON, result JSON, and result size.

`--doc-max-chars` limits each doc result. The default is 40,000 characters. Do not raise it casually; full `SYNTAX.md` plus full `AI-INSTRUCTIONS.md` can make one parallel batch expensive on Opus, Sonnet, and GPT-5.5.

## Add A Model

Edit `DEFAULT_MODELS` in `scripts/openrouter-iteration-benchmark.mjs`.

Each model needs:

- `key`: short CLI key.
- `label`: human readable name.
- `id`: OpenRouter model id.
- `inPerM`: input dollars per million tokens.
- `outPerM`: output dollars per million tokens.

Use OpenRouter model metadata for current prices before running a paid benchmark.

## Add Or Modify A Task

Edit `BENCHMARK_TASKS`.

Each task needs:

- `id`: stable CLI id.
- `family`: category such as `etl`, `external_api_scheduler`, or `workflow_crud`.
- `title`: report label.
- `userAsk`: the user-facing task prompt.
- `requiredChecks`: regex-backed checks that decide pass/fail.
- `patternHints`: Clear examples used only in `pattern_hints` mode.

Keep tasks realistic. Prefer buyer-shaped apps over tiny CRUD:

- Multi-table workflows.
- External API allowlists.
- Scheduled jobs.
- Error states and retries.
- Filters, selected-detail views, charts, export, or approvals.

## Feedback Modes

- `minimal`: tells the model it failed, without specifics.
- `error_hints`: includes compiler errors and failed requirement checks.
- `pattern_hints`: includes compiler errors, failed checks, and task-specific Clear snippets.

The comparison we care about is whether `error_hints` and `pattern_hints` reduce attempts-to-success or raise pass rate.

## Test Before Running Paid Calls

```powershell
& 'C:\Users\rmill\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\openrouter-iteration-benchmark.test.mjs
```

The test suite verifies:

- source extraction,
- requirement extraction,
- task evaluation,
- corrective feedback,
- database message logging,
- tool-call logging,
- doc and pattern tool execution,
- retry recovery,
- model-level parallelism.

## Spend Discipline

Always use `--spend-cap`.

A full default run launches 10 models in parallel per task/mode batch:

- 4 tasks,
- 3 feedback modes,
- up to 3 attempts,
- 10 models.

That is up to 360 model calls. The cap stops the run, but parallel batches can already have in-flight calls when the cap is reached.

## Current Result Files

- One-shot quality/cost comparison: `docs/openrouter-model-benchmark-2026-05-12.html`
- Iterative recovery benchmark: `docs/openrouter-iteration-benchmark-2026-05-12.html`
