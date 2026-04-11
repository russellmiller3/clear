# Handoff — 2026-04-10

## Current State
- **Branch:** `main` (just merged `feature/fullstack-blog`)
- **Tests:** 1515 passing / 0 failing
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

### Display as Cards (New)
- **`display X as cards`** — New display format renders API data as responsive 3-column card grid
- **Smart field detection** — Auto-detects: `image_url` → hero, `avatar` → circle, `category` → badge, `title` → heading, `excerpt` → body, `author` → meta
- **Priority: `author` checked before `name/title`** — prevents `author_name` matching as card title

### Full-Stack Blog App
- `apps/blog-fullstack/main.clear` — CRUD backend + card grid + New Post modal

## Next Steps (Priority Order)
1. **Multi-series bar charts** — True multi-series (opened+closed by week) needs syntax for multiple `showing` clauses
2. **Chart time range tabs** — "12 months / 30 days / 7 days" tabs above charts
3. **Card template customization** — Explicit field role mapping instead of name-based auto-detection
4. **Component composition edge cases** — Block-form components with complex children untested

## Files to Read First
| File | Why |
|------|-----|
| `compiler.js` — display cards reactive (~line 4960) | Smart field detection + card HTML generation |
| `compiler.js` — seed dedup (~line 1664) | Auto-injected findAll guard at top of seed endpoints |
| `compiler.js` — blog presets in BUILTIN_PRESET_CLASSES (~line 7450) | blog_grid, blog_card, blog_article CSS |
| `parser.js` — `displayNode()` (~line 487) | cards tag detection |
| `apps/blog-fullstack/main.clear` | Full-stack blog with display-as-cards |

## Resume Prompt
> Read `HANDOFF.md` and continue from where we left off.
>
> Branch: `main`. All 1515 tests passing. New feature: `display X as cards` renders API data as card grids with smart field detection. Full-stack blog app demonstrates it. Next priorities: multi-series charts, chart time-range tabs, card template customization.
