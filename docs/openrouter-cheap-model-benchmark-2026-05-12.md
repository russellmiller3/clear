# OpenRouter Cheap Model Benchmark - 2026-05-12

## Short Answer

Use `google/gemini-3-flash-preview` as the cheap default for Meph.

It was the fastest model by a lot, handled the Clear-specific gotcha task best,
and was the only cheap model besides Kimi to finish the syntax-context Clear app
task cleanly. Kimi produced the most complete syntax-context app, but it was too
slow and had blank visible outputs on three earlier tasks. DeepSeek was the
best ultra-cheap fallback for requirements and summarization, but it was slow
and truncated on longer Clear generation. GLM 4.5 Air is not reliable enough for
Meph build work.

## Models Tested

| Model | OpenRouter id | Listed price per 1M tokens | Context |
| --- | --- | ---: | ---: |
| Gemini 3 Flash Preview | `google/gemini-3-flash-preview` | $0.50 in / $3.00 out | 1M |
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

Total spend: about **$0.032** across 20 calls.

## Results

| Rank | Model | Quality | Speed | Cost | Verdict |
| ---: | --- | --- | --- | --- | --- |
| 1 | Gemini 3 Flash Preview | Best overall | Best | Medium | Use as cheap default |
| 2 | DeepSeek V4 Flash | Good for extraction, weak for long Clear | Slow | Cheapest | Use for cheap side tasks |
| 3 | Kimi K2.5 | Good with syntax context, bad visible-output reliability | Very slow | Highest | Do not default |
| 4 | GLM 4.5 Air | Too unstable for Meph | Medium | Cheap | Avoid for build work |

## Notes by Model

### Gemini 3 Flash Preview

- Fastest: about **2.4s average** on the first four tasks.
- Best Clear-gotcha answer: caught route collision, weak update targeting, and validation/authorization.
- Completed the syntax-context Clear app in **2.3s** for about **$0.0012**.
- Weakness: without syntax context, it invented a decorator/class version of Clear.

Verdict: best cheap Meph default. It needs syntax context, but Meph already has that.

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

Use DeepSeek V4 Flash only for lower-risk background jobs:

```text
deepseek/deepseek-v4-flash
```

Do not use Kimi or GLM as the default until a follow-up benchmark proves stable
visible completions under Meph's real prompt.

## Next Benchmark

The next useful pass is not more chat sampling. It should run the generated
Clear through the actual compiler, score compile success, and run each model
three times against the same Meph prompt. That will tell us whether Gemini's
lead survives real app-build verification.
