# Plan: Landing Pages v2 — 95% Visual Parity
**Goal:** Compiled Clear output looks like Linear/Vercel/Stripe quality in a screenshot.
**Method:** GAN loop — screenshot → grade → fix worst gap → repeat. Visual quality is the only metric.
**NOT the goal:** Adding preset names. Refactoring the compiler. Passing tests.
(Tests must stay green, but green tests ≠ good-looking pages.)

---

## The Method

Every round:
1. Compile a landing page from its .clear source
2. Start preview server, take full-page screenshot
3. Grade each section 0-100 vs reference quality bar (Linear = 100)
4. Pick the single worst-scoring section
5. Fix it — whatever it takes (compiler change, .clear rewrite, CSS tweak)
6. Run `node clear.test.js` (must stay at 1489)
7. Go back to step 1

Repeat until every section scores ≥90/100.

---

## Reference Quality Bar

These are the sites I'm comparing against in my head. Every visual decision uses this standard:

| Element | What good looks like (Linear/Vercel/Stripe) |
|---------|---------------------------------------------|
| Hero | Left-aligned. One specific big claim. Single primary CTA. Subhead ≤2 lines. No centered everything. |
| Logo bar | Slim horizontal strip. Company names in muted uppercase. Subtle border separators. |
| Feature section | ASYMMETRIC layout. Big card + small cards. Not 3-equal-icon-grid. |
| Stats | 4 numbers in a row. Number huge (text-4xl), label tiny below. No cards around them. |
| Testimonials | Quote in quotes. Name bold below. Title + company muted. Real attribution. |
| Pricing | 3 tiers. Middle tier highlighted (different background). ✓ checkmarks on features. Price as big number. |
| Typography | Display font for h1. Tight tracking. Color hierarchy: full → /70 → /40. |
| Spacing | 8pt grid. Generous section padding (py-20 or more). |

---

## Phases

### Phase 0: Visual Baseline (do this FIRST, before any code changes)

1. Compile existing startup-landing and screenshot it
2. Grade every section against reference bar
3. List the top 5 gaps
4. Identify whether each gap needs: (a) compiler change, (b) .clear content change, or (c) CSS tweak

This tells me what to fix in what order. Nothing else happens until I've done this.

---

### Phase 1: startup-landing GAN loop (target: ≥90/100 overall)

Run GAN rounds until done. Each round follows the method above.

**Starting .clear anatomy (Clay style, ivory theme):**
```
navbar → hero_left → logo_bar → feature_split → feature_spotlight → stats_row → testimonial_grid → pricing_grid → page_cta
```

**What compiler changes will likely be needed (based on current code inspection):**
- `BUILTIN_PRESET_CLASSES`: all new presets missing (hero_left, logo_bar, feature_split, etc.)
- Section renderer: isGridSection branch missing → grids won't lay out
- Hero CTA: all buttons render as btn-primary instead of primary/outline split
- text case: no ✓ checkmarks in pricing, no stat labels, no company names in logo bar
- small case: testimonial attribution won't render right

But I won't implement these speculatively. I'll implement exactly what the screenshot tells me is broken, in the order the screenshot reveals gaps.

---

### Phase 2: saas-landing GAN loop (midnight theme, Linear style)
Same method. Goal: dark mode looks as good as Linear.app.

---

### Phase 3: devtool-landing GAN loop (midnight theme, Jasper style)
Same method. Goal: hyper-specific, code-forward, developer-credible.

---

## Acceptance Criteria (visual, not code)

For each page, every section must score ≥90/100:

**Hero:**
- [ ] Left-aligned text (NOT centered)
- [ ] h1 is big (text-5xl+), specific claim, not generic
- [ ] Subhead ≤2 lines, muted color
- [ ] Primary CTA left-aligned with hero text
- [ ] Secondary CTA is outline/ghost (NOT same style as primary)
- [ ] No visual clutter

**Logo bar:**
- [ ] Renders as a horizontal strip
- [ ] Company names readable but muted (not black)
- [ ] Border separator visible above/below strip

**Feature section:**
- [ ] NOT a 3-equal-column icon grid
- [ ] Has visual hierarchy (one large card, supporting smaller cards)
- [ ] Cards have hover state visible on screenshot

**Stats:**
- [ ] 4 numbers in a horizontal row
- [ ] Number is visually dominant (text-4xl, text-primary)
- [ ] Label is small/muted below the number
- [ ] No card borders around each stat

**Testimonials:**
- [ ] Quote text visible
- [ ] Author name bold, below quote
- [ ] Role + company in small muted text

**Pricing:**
- [ ] 3 tiers visible
- [ ] Middle tier visually distinct (different bg color)
- [ ] Feature list has ✓ checkmarks
- [ ] Price is a big number (text-3xl)

---

## Compiler State (verified 2026-04-09)

What's already done so I don't redo it:
- Context vars in content renderer ✅ (compiler.js:5680-5695)
- `heading` case updated ✅
- `subheading` case updated ✅

What needs doing (only implement what screenshots reveal is broken):
- `BUILTIN_PRESET_CLASSES` — missing all v2 presets
- Section renderer — isCardPreset/isHeroPreset/isGridSection/needsWrapper
- isGridSection rendering branch
- Hero CTA forEach+index
- text/small/link cases

Full code for each is in the previous version of this plan. Don't implement blindly — let screenshots drive order.

---

## Active Round Log

| Round | Page | Worst section | Score before | Fix | Score after |
|-------|------|---------------|-------------|-----|-------------|
| ... | | | | | |

(Fill this in as GAN rounds happen)

---

## Tests

`node clear.test.js` must stay at 1489 after every compiler change.
If a change breaks tests: fix the test or revert the change. Never skip.
