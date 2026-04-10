# Handoff — 2026-04-10

## Current State
- **Branch:** `main` (just merged `feature/tests-charts-blog`)
- **Tests:** 1511 passing / 0 failing
- **Synonym version:** 0.13.0

## What Was Done This Session

### Component Composition Fix (7 tests → 0 failures)
- **4 distinct bugs fixed:** reactive detection missed COMPONENT_USE, component functions emitted inside `_recompute`, COMPONENT_USE children on wrong property, lowercase SHOW+CALL incorrectly got component containers.
- **Test adjustments:** Changed `heading title` → `show title` in component bodies (parser rejects bare identifiers after heading).

### Chart Modifiers
- **Subtitle:** `bar chart 'Title' subtitle 'Description' showing data` — renders as `<p>` below chart title.
- **Stacked:** `showing data stacked` — adds `stack: 'total'` to all ECharts series for stacked bar charts.
- Both are optional keyword modifiers parsed positionally in `parseChartRemainder`.

### Image Element (New)
- **Syntax:** `image 'url'` with optional `rounded`, `Npx wide`, `Npx tall` modifiers.
- **Parser:** `parseImage()` function, added `image` to contentCanonicals and dispatch.
- **Compiler:** Renders `<img>` tag with `loading="lazy"`, responsive or fixed sizing, optional `rounded-full`.
- **Synonym:** Only `image` registered — `photo`/`picture` collide with file input tests.

### Blog Presets (3 new)
- `blog_grid` — Card listing page (3-column responsive grid, py-16 lg:py-24)
- `blog_card` — Post card with hover lift effect (border, shadow, translate-y)
- `blog_article` — Medium-style single post (max-w-3xl mx-auto centered)

### Blog Demo Apps (2 new)
- `apps/blog-landing/main.clear` — 3 blog cards with images, badges, author avatars
- `apps/blog-article/main.clear` — Full article with author meta, hero image, paragraphs, author bio card

### Seed Auto-Dedup
- Compiler auto-injects `findAll` check at top of seed endpoints.
- If table already has records, returns `{ message: 'already seeded' }` instead of inserting duplicates.
- Production guard also injected: seed endpoints return 403 in production.

### Trend Alignment Fix
- Metric card trend text (`+3 this week`) now uses `flex items-center gap-1` for proper horizontal alignment of arrow SVG + text.

## Key Decisions Made
- **Image has no synonyms** — `photo` and `picture` collide with file input patterns. Only `image` works.
- **Seed dedup at compiler level, not language level** — `guard existing is empty` doesn't work because `empty` = `nothing` (null), but `findAll` returns `[]` (truthy). Auto-injection is safer.
- **Component functions hoisted before _recompute** — COMPONENT_DEF and FUNCTION_DEF must be defined before the reactive loop that calls them.

## Known Issues
- `overflow-hidden` on card containers can collapse ECharts canvases — removed from chart cards, still on app_table/app_list (fine for those).
- Blog demo apps have compiled `index.html` checked in — these are build artifacts but useful as references.

## Next Steps (Priority Order)
1. **Multi-series bar charts** — Currently stacked works with single data source. True multi-series (e.g. opened+closed by week) needs syntax for multiple `showing` clauses or computed series fields.
2. **Chart time range tabs** — TailAdmin has "12 months / 30 days / 7 days" tabs above charts. Would need new Clear syntax for tab-filtered data.
3. **Blog grid with real backend** — Current blog apps are static. Full-stack blog would need CRUD for posts + image URLs.
4. **Component composition edge cases** — Tests pass now but block-form components with complex children (nested sections, charts) untested.

## Files to Read First
| File | Why |
|------|-----|
| `compiler.js` — seed dedup (~line 1664) | Auto-injected findAll guard at top of seed endpoints |
| `compiler.js` — `isReactiveApp()` (~line 4580) | COMPONENT_USE + uppercase SHOW+CALL detection |
| `compiler.js` — blog presets in BUILTIN_PRESET_CLASSES (~line 7422) | blog_grid, blog_card, blog_article CSS |
| `parser.js` — `parseImage()` (~line 3896) | Image element parsing with modifiers |
| `parser.js` — `parseChartRemainder()` (~line 4711) | Subtitle + stacked parsing |
| `apps/blog-landing/main.clear` | Blog card grid reference app |
| `apps/blog-article/main.clear` | Medium-style article reference app |

## Resume Prompt
> Read `HANDOFF.md` and continue from where we left off.
>
> Branch: `main`. All 1511 tests passing. New features: image element, chart subtitle/stacked, blog presets, seed auto-dedup, component test fixes. Next priorities: multi-series charts, chart time-range tabs, full-stack blog app.
