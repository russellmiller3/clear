# Implementation Plan: Charts T2#8

**Date:** 2026-04-25
**Branch suggestion:** `feature/charts-t2-8-extension`
**Effort:** 6 cycles, ~30-45 min each.

## Reality check (read this first)

The bug filing in `requests.md` line 225 is **stale**. The shorthand `display X as bar chart` already works end-to-end for `bar/line/pie/area`. Verified by compiling `display [10,20,30] as bar chart` and `display sales as bar chart` — both emit ECharts CDN, init call, and chart `<div>`. All 6 tests in the existing `describe('display X as bar chart shorthand parses as CHART', ...)` block (`clear.test.js:13810–13868`) pass on main.

**What's actually missing:** the survey scope says 8 chart types — `donut, scatter, gauge, sparkline` are rejected. Parser whitelist `['line', 'bar', 'pie', 'area']` lives at `parser.js:6380, 6497, 6553`. Compiler codegen at `compiler.js:9742–9786` only branches on `pie` vs (line/bar/area). Reactive `_recompute()` chart update lives in the same block (`compiler.js:9725–9786`) — correct for the existing 4 types, just needs the new branches added.

So this is a **pure additive plan**: add 4 chart types. The existing infrastructure (CHART node type, `hasChart` flag, ECharts CDN injection at `compiler.js:11420`, `<div id="X_canvas">` emit, reactive `_recompute()` setOption) is reused as-is.

## Where things live (verified)

| Concern | File:line |
|---|---|
| Parser whitelist (canonical `bar chart 'T' showing X`) | `parser.js:6497` |
| Parser whitelist (type-first/title-first via `parseChartRemainder`) | `parser.js:6553` |
| Parser whitelist (`display X as Y chart` shorthand) | `parser.js:6380` |
| Compiler `_recompute()` chart updates | `compiler.js:9724–9786` |
| Compiler HTML emit for CHART (the `<div>`) | `compiler.js:10915–10926` |
| `hasChart` flag → ECharts CDN injection | `compiler.js:10176, 11420` |
| Existing tests | `clear.test.js:12940+, 13810–13868` |
| Docs | `SYNTAX.md:406–449`, `AI-INSTRUCTIONS.md:2604+`, `intent.md:111` |

## Build target note

Charts only render in `web` builds — they need a browser DOM. For `javascript backend` builds, CHART nodes inside a `page` block are unreachable (pages aren't emitted on the backend target). This already works correctly today; new chart types inherit it. **Python charts are out of scope** — separate Tier 2 entry.

## TDD cycles

### Cycle 1 — Donut chart (RED → GREEN)

**Red test** (`clear.test.js`, append to existing chart shorthand `describe`):

```js
it('emits ECharts pie option with hole for `display X as donut chart`', () => {
  const src = "build for web\npage 'p' at '/':\n  data = [{name:'A',value:10}]\n  display data as donut chart";
  const r = compileProgram(src);
  expect(r.errors).toHaveLength(0);
  expect(r.html).toContain('echarts');
  expect(r.html).toMatch(/radius:\s*\[['"]50%/); // donut has inner radius >0
});
```

**Min impl:**

- Add `'donut'` to all 3 whitelists in `parser.js` (lines 6380, 6497, 6553).
- In `compiler.js:9742` extend the pie branch: `if (chartType === 'pie' || chartType === 'donut')`. Inside, vary `radius` based on `chartType === 'donut' ? ['50%','70%'] : ['0%','70%']` (true pie has no hole; donut does). Existing pie codegen already uses `['40%','70%']` — change pie to solid (`['0%','70%']`), donut to hole (`['50%','70%']`).
- Watch for regression: existing pie test asserts on a doughnut-style radius. Update if needed.

**Files:** `parser.js`, `compiler.js`, `clear.test.js`.
**Depends on:** nothing.

### Cycle 2 — Scatter chart

**Red test:**

```js
it('emits scatter series for `display X as scatter chart`', () => {
  const src = "build for web\npage 'p' at '/':\n  pts = [{x:1,y:2},{x:3,y:4}]\n  display pts as scatter chart";
  const r = compileProgram(src);
  expect(r.errors).toHaveLength(0);
  expect(r.html).toMatch(/type:\s*['"]scatter['"]/);
  expect(r.html).toMatch(/xAxis:[^,]*type:\s*['"]value['"]/); // scatter needs value x-axis
});
```

**Min impl:**

- Add `'scatter'` to the 3 whitelists.
- In `compiler.js:9755`, add a separate scatter branch (above the line/bar/area else). Auto-detect: `_xKey = 'x'` if present else first numeric key; `_yKey = 'y'` else second. `_data.map(r => [Number(r[_xKey]), Number(r[_yKey])])` — array-of-pairs. Emit `xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [{ type: 'scatter', data: _series, symbolSize: 10 }]`.

**Depends on:** Cycle 1.

### Cycle 3 — Gauge chart

**Red test:**

```js
it('emits gauge series for `display X as gauge chart` with scalar value', () => {
  const src = "build for web\npage 'p' at '/':\n  progress = 73\n  display progress as gauge chart";
  const r = compileProgram(src);
  expect(r.errors).toHaveLength(0);
  expect(r.html).toMatch(/type:\s*['"]gauge['"]/);
});
```

**Min impl:**

- Add `'gauge'` to the 3 whitelists.
- Compiler: gauge takes a scalar (number 0–100) or `{value: N, max: M}`. In `compiler.js:9755`, add branch above the else: `if (chartType === 'gauge')`. Emit `_chart.setOption({ series: [{ type: 'gauge', progress: { show: true }, detail: { formatter: '{value}%' }, data: [{ value: _val }] }] }, true);`.
- Note: the outer guard `Array.isArray(_data) && _data.length > 0` at `compiler.js:9736` blocks scalars. For gauge, relax: split per-chart guards inside each branch.

**Depends on:** Cycle 2.

### Cycle 4 — Sparkline

**Red test:**

```js
it('emits compact line chart for `display X as sparkline`', () => {
  const src = "build for web\npage 'p' at '/':\n  trend = [1,2,3,4,5]\n  display trend as sparkline";
  const r = compileProgram(src);
  expect(r.errors).toHaveLength(0);
  expect(r.html).toContain('echarts');
  expect(r.html).toMatch(/showSymbol:\s*false/);
  expect(r.html).toMatch(/height:\s*['"]?60/); // shorter than 350px default
});
```

**Min impl:**

- Add `'sparkline'` to the 3 whitelists. **Special grammar:** sparkline is a single word, not `sparkline chart`. Accept both forms or treat as the lone exception.
- Easiest: in the parser shorthand at `parser.js:6371`, after detecting `as <word> chart`, also detect `as sparkline` (without `chart` suffix) → CHART node with `chartType='sparkline'`.
- Compiler: emit a compact line — no axes labels, `showSymbol: false`, smaller height. Override the `<div>` height for sparklines: in `compiler.js:10922`, key off `node.chartType === 'sparkline'` to use `height:60px;` instead of `350px`. Hide axes: `xAxis: { show: false }, yAxis: { show: false }, grid: { left: 0, right: 0, top: 5, bottom: 5 }`.

**Depends on:** Cycle 3.

### Cycle 5 — Reactive update for new types

**Red test:**

```js
it('updates donut/scatter/gauge/sparkline on _recompute when state changes', () => {
  for (const t of ['donut','scatter','gauge','sparkline']) {
    const trigger = t === 'sparkline' ? 'sparkline' : `${t} chart`;
    const src = `build for web\npage 'p' at '/':\n  on input number x:\n    nothing\n  display x as ${trigger}`;
    const r = compileProgram(src);
    expect(r.errors).toHaveLength(0);
    expect(r.html).toMatch(/_recompute|setOption/);
  }
});
```

**Min impl:** Should pass once Cycles 1–4 are done — the `for (const chart of chartNodes)` loop at `compiler.js:9726` walks every CHART node and the per-type branches emit setOption calls. This cycle is verification.

### Cycle 6 — Update `requests.md`, docs, error message

**Red test:**

```js
it('error message lists all 8 valid chart types when given a bad one', () => {
  const src = "build for web\npage 'p' at '/':\n  d=[1]\n  display d as neon chart";
  const r = compileProgram(src);
  expect(r.errors[0].message).toMatch(/donut/);
  expect(r.errors[0].message).toMatch(/sparkline/);
});
```

**Min impl:**

- Update the 3 error-message strings in `parser.js` (lines 6382, 6494, 6498, 6554) to list all 8 types.
- `requests.md`: mark T2#8 DONE with note that original 4 already worked.
- `SYNTAX.md:406–449`: extend the chart-types list and add example lines for each new type.
- `AI-INSTRUCTIONS.md:2604`: extend the chart-types prose.
- `intent.md:111`: minor tweak to mention all 8 types.

## Risks / gotchas

- Existing pie codegen uses `radius: ['40%','70%']` — already donut-ish. If you change pie to solid `['0%','70%']`, the existing pie test (`clear.test.js:12940+`) may need updating. Check before editing.
- The outer guard `Array.isArray(_data) && _data.length > 0` rejects scalars — gauge breaks unless you split the guard per chart type.
- The HTML `<div>` height is hard-coded `350px` at `compiler.js:10922`. Sparkline needs override; gauge looks better at ~250px.
- The synonym tokenizer may eat `sparkline` as a known token. Worth a 30-second grep before Cycle 4.
- 100+ unrelated chart tests exist — run the full `node clear.test.js` after each cycle.
