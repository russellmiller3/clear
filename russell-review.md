# Russell Review — Session 45 continuation

Running log of design calls + visual work shipped autonomously while Russell was AFK. Each entry: what the decision was, why I picked it over alternatives, where to look if you want to change it. Check these and either approve or tell me to iterate.

Format per item: **design choice** / **alternatives I considered** / **evidence it works** / **where to change it if you disagree**.

---

*Will append entries as I ship. Timestamps in HH:MM local.*

---

## 1. Charts shorthand — `display X as bar chart` (T2 #8)

**Design choice:** `display X as <type> chart` (where `<type>` ∈ bar/line/pie/area) parses as a CHART node identical to the canonical `bar chart 'Title' showing X`. Title defaults to the capitalized variable name (`display sales as bar chart` → `"Sales"`); the existing 4 chart types stay the whitelist.

**Alternatives I considered:**
- **Silent continuation with format='bar' as a no-op** — the current bug. Rejected: silent drops are the worst bug class. Russell's charter calls these out specifically.
- **Require explicit title: `display X as bar chart titled 'Y'`** — more verbose. Rejected because the "just works" English reading is what Meph keeps writing.
- **Canonical redirect via INTENT_HINTS** — tells Meph to rewrite. Rejected after the `table X:` fix: Russell said to make the compiler learn, not nag Meph.

**Evidence it works:**
- 6 new tests green — bar/line/pie/area all emit ECharts CDN + init; canonical still works (regression floor); unknown chart type errors cleanly with list of valid types; `as json`/`as dollars`/`as date`/`as percent` still route to DISPLAY (not captured by the shorthand).
- 2459/2459 compiler tests, all 8 core templates clean.

**Where to change it if you disagree:**
- Title inference: `parser.js` around the new `if (pos + 2 < tokens.length && tokens[pos].canonical === 'as_format'...)` branch. Change the `title = expr.node.name.charAt(0).toUpperCase()...` line to whatever default you want.
- Whitelist: same block, `['bar', 'line', 'pie', 'area']` — add/remove types.
- Title default when the expression isn't a simple variable (e.g., `display sum of sales as bar chart`): currently falls back to `"Bar Chart"` etc. If you want a smarter title, that's the `chartType.charAt(0).toUpperCase()...` branch.

**Not visually verified.** I didn't render the emitted HTML in a browser because you said to check later. The canonical chart tests (which go through the same CHART codegen) already pass the full compile-and-render path used by the 8 core templates, and the emitted HTML contains the expected ECharts CDN + init. Visual-polish review still yours.

