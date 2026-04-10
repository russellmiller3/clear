# Plan: Pareto 20 Preset Upgrade — Oatmeal Design Quality

**Branch:** `feature/landing-pages-v2` (continue existing)
**Date:** 2026-04-10

**References:**
- Marketing sections: Tailwind Plus — **screenshots only, NO code** (`tailwindcss.com/plus/ui-blocks/marketing`)
- Design system (palettes, fonts, spacing): Oatmeal kit — **screenshots only, NO code** (`tailwindcss.com/plus/kits/oatmeal`)
- Dashboard/App UI: TailAdmin OSS — **MIT licensed, CAN read/adapt code** (`github.com/TailAdmin/free-nextjs-admin-dashboard`)

**Implementation stack:** DaisyUI v5 (MIT) + Tailwind v4 utilities + TailAdmin OSS patterns (MIT) + Google Fonts CDN

---

## 0. The Pareto 20

These 20 components cover ~80% of real landing pages + app UIs:

### Marketing (12)
| # | Component | Current preset | Status |
|---|-----------|---------------|--------|
| 1 | Navbar (sticky, blur) | `page_navbar` | Upgrade |
| 2 | Hero centered | `page_hero` | Upgrade |
| 3 | Hero split (image left/right) | `hero_left` | Upgrade |
| 4 | Logo cloud | `logo_bar` | Upgrade |
| 5 | Feature grid (3-col cards) | `feature_grid` | Upgrade |
| 6 | Feature bento (asymmetric) | `feature_split` | Upgrade |
| 7 | Stats row | `stats_row` | Upgrade |
| 8 | Testimonial grid | `testimonial_grid` | Upgrade |
| 9 | Pricing 3-tier | `pricing_grid` | Upgrade |
| 10 | CTA section | `page_cta` | Upgrade |
| 11 | FAQ accordion | — | **NEW: `faq_section`** |
| 12 | Footer (link grid + copyright) | — | **NEW: `page_footer`** |

### App UI (8) — visual ref: TailAdmin
| # | Component | Current preset | Status |
|---|-----------|---------------|--------|
| 13 | Sidebar layout shell | `app_sidebar` + `app_layout` | Upgrade |
| 14 | Dashboard header | `app_header` | Upgrade |
| 15 | Data table | — | **NEW: `app_table`** |
| 16 | Metric/stat card | `metric_card` | Upgrade |
| 17 | Form layout | `form` | Upgrade |
| 18 | Modal/dialog | — | **NEW: `app_modal`** |
| 19 | Empty state | — | **NEW: `empty_state`** |
| 20 | Stacked list | — | **NEW: `app_list`** |

**6 new presets, 14 upgrades.**

---

## 1. Design System Foundation (Phase 0 — do first)

Copy Oatmeal's design DNA, not its code:

### Color Palettes
Oatmeal has 4 palettes. We have 4 themes. Upgrade each theme to match Oatmeal-tier contrast and warmth:

| Our theme | Oatmeal equivalent | Font combo |
|-----------|-------------------|------------|
| midnight | Dark palette | Inter + JetBrains Mono |
| ivory | Light/warm palette | DM Sans + Geist Mono (current) |
| slate | Cool dark palette | Inter + JetBrains Mono |
| nova | Warm accent palette | Plus Jakarta Sans + Geist Mono |

### Typography
- Add CSS custom properties per theme: `--font-body`, `--font-display`, `--font-mono`
- Update `CSS_RESET` (~line 7260) to use `var(--font-body)` instead of hardcoded `'DM Sans'`
- Update Google Fonts `<link>` (~line 6141) to load Inter + JetBrains Mono
- Copy Oatmeal's typography scale: hero headings `text-5xl/6xl`, section headings `text-3xl/4xl`, body `text-base/lg`

### Spacing Rhythm
- Copy Oatmeal's section padding pattern: hero `py-24 lg:py-32`, sections `py-16 lg:py-24`
- Inner content max-width: `max-w-7xl` for heroes, `max-w-6xl` for feature grids, `max-w-5xl` for pricing/testimonials
- Card padding: `p-6` standard, `p-8` for featured/large, `p-10` for hero cards

### Files to modify:
| File | Lines | What changes |
|------|-------|-------------|
| `compiler.js` | 6139-6143 | Google Fonts `<link>` — add Inter, JetBrains Mono |
| `compiler.js` | 7258-7264 | CSS_RESET — font-family uses CSS vars |
| `compiler.js` | 7262-7420 | THEME_CSS — add font vars to each theme |
| `compiler.js` | 7088-7149 | BUILTIN_PRESET_CLASSES — update spacing |

---

## 2. Phase Order

### Phase 1: Design System Foundation (themes, fonts, spacing)
Modify THEME_CSS, CSS_RESET, font loading. Test all 3 landing apps.

### Phase 2: Marketing top-of-page (navbar, heroes, logo cloud) — components 1-4
Fetch Tailwind Plus hero preview as visual target. Upgrade 4 presets.

### Phase 3: Marketing content sections (features, stats, testimonials) — components 5-8
Fetch Tailwind Plus feature/stats/testimonial previews. Upgrade 4 presets.

### Phase 4: Marketing conversion sections (pricing, CTA, FAQ, footer) — components 9-12
Fetch Tailwind Plus pricing/CTA previews. Upgrade 2 presets + create 2 new.

### Phase 5: App UI shells + dashboard (sidebar, header, metric card, table) — components 13-16
Clone/fetch TailAdmin OSS repo (MIT). Read their sidebar, header, table, and chart card components. Adapt patterns to Clear's compiler output using DaisyUI + Tailwind. Upgrade 3 presets + create 1 new.

### Phase 6: App UI interaction (form, modal, empty state, list) — components 17-20
Read TailAdmin OSS form layouts, modal patterns, empty states. Adapt to Clear. Upgrade 1 preset + create 3 new.

---

## CRITICAL: Context Array Checklist

**Every time a new preset is added to `BUILTIN_PRESET_CLASSES`, check ALL of these:**

| Array | Location | What it controls |
|-------|----------|-----------------|
| `isCardPreset` | ~line 5419 | Whether section gets max-w wrapper |
| `isHeroPreset` | ~line 5427 | Hero rendering path |
| `GRID_SECTION_PRESETS` | ~line 5429 | Custom inner grid rendering |
| `inPageSection` | ~line 5832 | Parent section text styling context |
| `inLandingCard` | ~line 5837 | Card context for h3/text rendering |
| `COLORED_CARD_PRESETS` | ~line 5848 | White text for colored bg cards |
| `inDarkSection` | ~line 5829 | Dark bg text color overrides |
| `heroInlineStyle` | ~line 5412 | Gradient bg for hero presets |

**Rule:** After adding ANY new preset, grep for each array name. Do not commit until verified.

---

## 3. Per-Phase Workflow

```
1. Fetch visual reference page (Tailwind Plus or TailAdmin — screenshot only)
2. Read current compiler.js code (exact lines from phase spec)
3. Write/upgrade BUILTIN_PRESET_CLASSES entries
4. Update section renderer HTML structure if new preset needs custom rendering
5. RUN CONTEXT ARRAY CHECKLIST for every new/changed preset
6. Run `node clear.test.js` — must stay 1490 pass / 7 fail
7. Restart preview server(s), screenshot at 1280x900
8. Grade vs visual reference: A/B/C/D
9. Fix worst section, repeat from step 6
10. Update compiler.js TOC
11. Commit when B+ or better
12. Run update-learnings skill
```

---

## 4. Edge Cases

| Scenario | How we handle |
|----------|---------------|
| New preset missing from context arrays | BLOCKED until all arrays checked |
| Font CSS var not set for a theme | Fall back to `'DM Sans', sans-serif` in CSS_RESET |
| FAQ accordion needs JS for toggle | Use DaisyUI `collapse` component (CSS-only, no JS) |
| `app_modal` needs JS for open/close | Use DaisyUI `modal` with `<dialog>` (native HTML, no JS) |
| `app_table` needs dynamic data | Render `<table>` with static rows from section children |
| Phase N breaks Phase N-1 | Run ALL 3 landing apps after each phase |
| preview_screenshot times out on dark pages | Use preview_eval + preview_snapshot |
| Parser doesn't know new preset names | Parser accepts any style name string — no changes needed |

---

## 5. Success Criteria

- [ ] All 20 Pareto components implemented and rendering
- [ ] All 4 themes match Oatmeal-tier visual polish (font combos, contrast, spacing)
- [ ] All 3 landing apps grade B+ or better vs Tailwind Plus visual quality
- [ ] 6 new presets created: `faq_section`, `page_footer`, `app_table`, `app_modal`, `empty_state`, `app_list`
- [ ] Test count stays at 1490 passing / 7 failing
- [ ] No new npm dependencies
- [ ] compiler.js TOC updated
- [ ] Context arrays verified for every new preset

---

## 6. Resume Prompt

> Read `HANDOFF.md` then this plan at `plans/plan-preset-upgrade-tailwind-quality-04-10-2026.md`.
>
> Branch: `feature/landing-pages-v2`. Execute the Pareto 20 preset upgrade phase by phase.
>
> **References:**
> - Marketing: Tailwind Plus — screenshots only, NO code (`tailwindcss.com/plus/ui-blocks/marketing`)
> - Design system: Oatmeal kit — screenshots only, NO code (`tailwindcss.com/plus/kits/oatmeal`)
> - Dashboard/App: TailAdmin OSS — MIT, CAN read code (`github.com/TailAdmin/free-nextjs-admin-dashboard`)
>
> **Implementation:** DaisyUI v5 + Tailwind v4 utilities (already in stack)
>
> Start with Phase 1 (Design System Foundation — themes, fonts, spacing).
> Test servers: startup-landing (ivory, 5001), saas-landing (midnight, 5002), devtool-landing (slate, 5003).
>
> CRITICAL: After adding ANY new preset, grep for: isCardPreset, isHeroPreset, GRID_SECTION_PRESETS, inPageSection, inLandingCard, COLORED_CARD_PRESETS, inDarkSection, heroInlineStyle — verify each includes the new preset where appropriate.
