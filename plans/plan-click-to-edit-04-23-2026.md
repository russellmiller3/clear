# Plan (STUB): Click-to-Edit + Constrained Design System

**Status:** Design captured, not yet scheduled. Not in active work.
**Sibling plan:** `plans/plan-builder-mode-v0.1-04-21-2026.md` — these interlock.
**Precedence:** Do AFTER the Cloudflare WFP deploy plan lands. Builder Mode UX
work is surface; Cloudflare is infrastructure. Different muscles.

---

## Why This Exists

Marcus's interface looks similar to Lovable at first glance (chat + preview +
Publish). But three features Lovable structurally can't do cheaply are where
Clear pulls ahead within 2 minutes of use:

1. **Click-to-edit on preview elements** — click any button/text/section →
   contextual menu → one-click edits without typing.
2. **"All N features working ✓" badge** — the compiler already generates tests
   for every button, endpoint, and flow; surface that state in the chrome.
3. **Real version rollback** — every Publish snapshots `main.clear` (200 lines
   of text); one-click restore to Tuesday's version.

This stub captures the design so we don't re-derive it when we pick it up.

---

## The Three-Tier Edit Model

| Tier | Trigger | Cost | Coverage |
|------|---------|------|----------|
| **1. Deterministic menu** | Click element → fixed menu from node taxonomy | $0 | ~80% of edits |
| **2. Scoped LLM** | "Describe…" field in menu → Meph with one-node context | ~$0.005 | ~15% of edits |
| **3. Full chat** | Studio chat panel | ~$0.02 | ~5% of edits |

**Average edit cost: ~$0.002.** Lovable's equivalent is ~$0.10 (they re-emit
whole React components). 50× cost advantage, structural.

### Tier 1 — Deterministic menu

Compiler injects `data-clear-line="N"` and `data-clear-node="BUTTON"` on every
UI element at emit time. Click handler in preview overlays the element and
pops a node-type-specific menu generated from a lookup table:

| Node | Menu items |
|------|------------|
| Button | Label, Variant (primary/secondary/ghost), Size, Icon, Action, Remove, Duplicate |
| Heading | Text, Level (h1/h2/h3), Remove |
| Input | Label, Placeholder, Required on/off, Type (text/number/email), Remove |
| Image | Source, Alt, Width/Height, Remove |
| Section | Padding token (tight/normal/roomy), Background preset, Layout (stack/row/grid) |
| Card | Padding, Background variant, Border on/off, Remove |
| Text | Content, Size, Weight, Color token, Remove |
| Link | Label, Target, Remove |
| Divider | Remove |

Picking "Variant → secondary" computes the Clear-source edit
(`button 'Submit', variant is secondary`), POSTs to a new
`/api/edit-clear-node` endpoint, server recompiles, preview hot-reloads in
<200ms. No LLM.

The menu is **generated from `parser.js` node definitions + a modifier table**
so adding a new modifier to the compiler automatically adds it to the menu.
No separate front-end config to drift.

### Tier 2 — Scoped "Describe…" LLM

Menu has a free-text field at the bottom. User types "make this more
playful" → server sends Meph a scoped context: the one node's source, its
immediate parent, the theme tokens, the app's archetype. NOT the full 200-line
app. Meph returns a Clear-source patch. Apply + recompile.

Scoped context keeps the LLM call tiny (~1k input, ~100 output). Haiku-priced.

### Tier 3 — Chat

Unchanged. Full-app context Meph conversation for broad changes ("add auth
across the app", "rewrite the hero to sell harder").

---

## The CSS Flexibility Decision — CONSTRAINED BY DEFAULT

Click-to-edit operates on **design tokens and variants**, never raw CSS.

Marcus can pick:
- Theme (midnight/ivory/nova — already built)
- Accent color (curated palette bound to theme)
- Density (compact/normal/spacious — edits padding token)
- Radius scale (sharp/soft/pill — edits border-radius token)
- Font pairing (curated set)

He CANNOT type a hex code. He CANNOT set `padding: 17px`. He picks from the
design system.

### Why this is a feature

Lovable lets users set any CSS value. Their output looks unpolished ~40% of
the time because non-designers make bad CSS decisions (clashing colors, wrong
weights, off-grid spacing).

Clear enforces the **10 hard UI rules** at compiler level (one accent,
8pt grid, cards-bg-OR-border-not-both, one btn-primary per section, hero
≤10 words, etc.). Marcus's app looks professional by default because he
can't break the design system. **That's a selling point, not a cage.**

Webflow's moat is "we constrain you to good design." Lovable dropped that for
flexibility and their output shows it. Clear inherits the Webflow lesson but
with an AI front-end.

### Escape hatch for Dave

Raw `style:` blocks in Clear source remain legal. If Dave opens `main.clear`
and writes `padding is 17px`, the compiler accepts it. Click-menu doesn't
expose the escape hatch. Two audiences, one source, one compiler.

---

## Preconditions (check before building)

- [ ] Compiler emits `data-clear-line` and `data-clear-node` attrs on every
      UI node. Verify in `compiler.js:buildHTML()`. If missing, that's a
      small prerequisite plan.
- [ ] Preview iframe postMessage bridge exists in Studio (likely already —
      check `playground/ide.html`).
- [ ] Node-modifier table covers at least the 9 node types above. Derive
      from `parser.js` TOC.
- [ ] Design token system exposed as a flat object the menu can read/write.
      Likely already in `design-system.md` territory.

---

## TDD Phases (sketch only — flesh out when activated)

1. Compiler injects `data-clear-line` + `data-clear-node` on every UI node.
   Unit test verifies attrs present for every node type.
2. Node-modifier registry (`modifiers.js`): table mapping node → supported
   modifiers. Tests that every compiler node type has a registry entry.
3. `POST /api/edit-clear-node` endpoint: takes `{line, node, modifier, value}`,
   computes source patch deterministically, recompiles, returns new source +
   compiled output. Server tests.
4. Preview → Studio postMessage bridge for click events. Playwright test.
5. Overlay UI: hover highlight + menu pop. Playwright visual test.
6. Menu generator: renders from modifier registry. Unit tests per node type.
7. Apply-edit flow: menu click → /api/edit-clear-node → hot-reload preview.
   End-to-end test.
8. Scoped-LLM "Describe…" field: calls Meph with minimal context. Real-LLM
   eval.
9. "Tests passing" badge in chrome — reads `clear test` output, green/red.
10. Publish-snapshot + rollback: every Publish tags source, `/api/rollback/:tag`
    restores. Tests.
11. Docs sync: USER-GUIDE Builder Mode chapter, landing/marcus.html demo
    recording.

Estimated ~2 weeks of focused work. Much lighter than the Cloudflare plan.

---

## Integration Points

- **Cloudflare WFP deploy plan (active):** the `data-clear-line` attrs MUST
  survive into the Workers bundle. The Cloudflare plan's Phase 1 (compiler
  target emission) needs to preserve them. Add a drift-guard test in the
  Cloudflare plan that asserts attrs present in Workers-target output.
- **Builder Mode v0.1 (`plans/plan-builder-mode-v0.1-04-21-2026.md`):**
  that plan covers the mode-detection and chrome-restyle. This plan covers
  the click-to-edit interaction inside that chrome. Read both before
  activating either.

---

## Why This Belongs in Clear, Not Lovable Territory

This stub is why Clear is not just "Lovable with a language underneath." The
language + deterministic compiler makes deterministic click-edits possible.
Lovable would need to throw out React-emission and build a DSL to match
this — which they won't.

See `COMPETITION.md` for the broader strategic framing.
