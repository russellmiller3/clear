# OpenRouter Cheap Model Benchmark - 2026-05-12

## Short Answer

Use `google/gemini-3-flash-preview` as the cheap default for Meph.
Use `anthropic/claude-opus-4.7` as the quality ceiling or escalation model.

Gemini delivered roughly **72% of Opus's judged quality** at about **7% of the
cost** and about **3.4x the speed**. Opus was clearly better on exactness and
was the only model whose syntax-context Clear app compiled locally. Sonnet was
not enough better than Gemini on this small run to justify being the cheap lane.

## Models Tested

| Model | OpenRouter id | Listed price per 1M tokens | Context |
| --- | --- | ---: | ---: |
| Gemini 3 Flash Preview | `google/gemini-3-flash-preview` | $0.50 in / $3.00 out | 1M |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4.6` | $3.00 in / $15.00 out | 1M |
| Claude Opus 4.7 | `anthropic/claude-opus-4.7` | $5.00 in / $25.00 out | 1M |
| DeepSeek V4 Flash | `deepseek/deepseek-v4-flash` | $0.14 in / $0.28 out | 1M |
| GLM 4.5 Air | `z-ai/glm-4.5-air` | $0.13 in / $0.85 out | 131K |
| Kimi K2.5 | `moonshotai/kimi-k2.5` | $0.40 in / $1.90 out | 262K |

Pricing sources: OpenRouter model pages, checked 2026-05-12.

## Test Set

Five tasks:

1. Write a Clear support triage app with no syntax context.
2. Explain and fix an outgoing-request allowlist compiler error.
3. Convert a vague discount-approval ask into checkable requirements.
4. Catch three known Clear gotchas in endpoint code.
5. Write the same Clear app with canonical Clear syntax examples injected.

The fifth task matters most for Meph because Meph normally has syntax context.

Total spend: about **$0.139** across 30 calls.

## Results

| Rank | Model | Quality | Speed | Cost | Verdict |
| ---: | --- | --- | --- | --- | --- |
| 1 | Claude Opus 4.7 | Best quality | Medium | Highest | Use as ceiling/escalation |
| 2 | Gemini 3 Flash Preview | Best cheap default | Best | Low | Use for cheap Meph lane |
| 3 | Claude Sonnet 4.6 | Strong but not decisive | Medium | High | Not worth defaulting here |
| 4 | DeepSeek V4 Flash | Good extraction, weak long Clear | Slow | Cheapest | Use for cheap side tasks |
| 5 | Kimi K2.5 | Bad reliability | Very slow | Medium-high | Do not default |
| 6 | GLM 4.5 Air | Too unstable for Meph | Medium | Cheap | Avoid for build work |

## Visual Report

Open the visual HTML version:

```text
docs/openrouter-model-benchmark-2026-05-12.html
```

It includes the task explanations, quality bars, spend bars, latency bars, a
cost-vs-quality scatter plot, and the compiler-pass comparison.

## Notes by Model

### Claude Opus 4.7

- Best judged quality: **7.6 / 10**.
- Only model whose syntax-context Clear app compiled locally.
- Correctly fixed the allowlist compiler error with the full endpoint URL.
- Cost: about **$0.0708** for five calls, around **13.5x Gemini**.

Verdict: best ceiling model. Use when correctness matters more than cheap speed.

### Claude Sonnet 4.6

- Judged quality: **5.7 / 10**, barely ahead of Gemini's **5.5 / 10**.
- Strong requirements and gotcha analysis.
- Still missed the exact allowlist fix and generated non-compiling Clear in the syntax-context app task.
- Cost: about **$0.0367**, around **7x Gemini**.

Verdict: good model, but not the right cheap default based on this run.

### Gemini 3 Flash Preview

- Fastest: about **2.4s average** on the first four tasks.
- Best Clear-gotcha answer: caught route collision, weak update targeting, and validation/authorization.
- Completed the syntax-context Clear app in **2.3s** for about **$0.0012**.
- Weakness: without syntax context, it invented a decorator/class version of Clear.
- Weakness versus Opus: missed the exact compiler-error fix and did not compile locally on the syntax-context app.

Verdict: best cheap Meph default. It is worse than Opus, but much cheaper and faster.

### DeepSeek V4 Flash

- Cheapest overall on the first four tasks: about **$0.0014** total.
- Strong requirements extraction.
- Good compiler-error explanation.
- Missed the route-order gotcha in the endpoint task.
- With syntax context, it started correctly but hit the output cap before finishing.

Verdict: good ultra-cheap helper for summaries, requirements, and classification. Not the primary app builder.

### Kimi K2.5

- Produced a strong syntax-context Clear app.
- But three earlier completions charged tokens and returned almost no visible content.
- Very slow: syntax-context task took **115s**.
- Highest spend: syntax-context task alone cost about **$0.011**.

Verdict: capability is there, but reliability and latency make it a bad default.

### GLM 4.5 Air

- Cheap and sometimes quick.
- No-syntax Clear app was not Clear.
- Gotcha task returned blank visible content.
- Syntax-context app began correctly but truncated.

Verdict: too brittle for Meph.

## Recommendation

Set Meph's cheap OpenRouter lane to:

```text
google/gemini-3-flash-preview
```

Use Opus as the escalation lane:

```text
anthropic/claude-opus-4.7
```

Use DeepSeek V4 Flash only for lower-risk background jobs:

```text
deepseek/deepseek-v4-flash
```

Do not use Sonnet, Kimi, or GLM as the default from this evidence. Sonnet is
capable, but it did not buy enough quality over Gemini here.

## Next Benchmark

The next useful pass is not more chat sampling. It should run the generated
Clear through the actual compiler, score compile success, and run each model
three times against the same Meph prompt. That will tell us whether Gemini's
lead survives real app-build verification.
