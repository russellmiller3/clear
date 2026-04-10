# Handoff — 2026-04-10

## Current State
- **Branch:** `main` (just merged `feature/preset-upgrade-tailwind-quality`)
- **Tests:** 1496 passing / 7 failing (pre-existing component composition tests)
- **Synonym version:** 0.13.0

## What Was Done This Session

### ECharts Analytics Dashboard
- **Chart syntax upgrade:** Canonical form changed from `chart 'Title' as bar showing data` to `bar chart 'Title' showing data`. Also supports title-first (`'Title' bar chart showing data`) and legacy form.
- **groupBy for all chart types:** `by field` now works on bar/line/area charts, not just pie. Groups data by field value, counts occurrences, renders as category chart. Eliminates the need for separate stats tables.
- **ECharts config upgrade:** TailAdmin-quality color palette (`#465fff` blue, `#10b981` green, etc.), rounded bar corners, donut pies (40%/70% radius), polished tooltips with white background.
- **Chart card styling:** Better padding (`px-6 pt-5 pb-4`), larger title (`text-base`), removed `overflow-hidden` that collapsed chart containers.

### metric_card Upgrade
- **Trend indicators:** Text starting with `+`/`-` followed by a number auto-renders as green/red colored text with arrow SVG icons. Zero extra syntax — just write `text '+3 this week'`.
- **Hover effect:** `hover:shadow-md hover:border-base-300/60 transition-all duration-200` on stat cards.

### Layout Fixes
- **app_content:** Changed from `flex flex-col gap-6` to `space-y-6` (block layout). Flex column was collapsing tables/lists to 0px when chart siblings filled available space.
- **Synonym cleanup:** Removed `area` from section synonyms to free it for `area chart` syntax. Bumped synonym version to 0.13.0.

### project-tracker Reference App
- 3 ECharts: weekly trends (bar), issues by project (bar with groupBy), issues by priority (pie with groupBy)
- 4 stat cards with trend indicators (+3 green, -2 red)
- Full CRUD table + activity list
- GAN'd against TailAdmin analytics dashboard

## Key Decisions Made
- **Type-first chart syntax is canonical** — `bar chart 'Title' showing data` reads like English. Legacy `chart...as` still works.
- **groupBy uses client-side counting** — No separate aggregation endpoints needed. Just `bar chart 'By Project' showing issues by project`.
- **Block layout for app_content** — `space-y-6` instead of `flex flex-col gap-6` prevents flex child collapsing. All children size to their natural content height.
- **TailAdmin as quality bar** — Used https://demo.tailadmin.com/analytics as the GAN discriminator for dashboard presets.

## Known Issues
- Seed data duplicates on every page reload (POST /api/seed runs each time). Cosmetic — doesn't affect functionality.
- 7 pre-existing test failures in component composition (unrelated).
- `overflow-hidden` on card containers can collapse ECharts canvases — removed from chart cards, but still present on `app_table` and `app_list` (they don't have explicit-height children so it's fine).

## Next Steps (Priority Order)
1. **Seed deduplication** — Add check-if-already-seeded guard to prevent data multiplication on reload.
2. **Chart subtitles and time range tabs** — TailAdmin has "Visitor analytics of last 30 days" subtitle + "12 months / 30 days / 7 days" tabs. Would need new Clear syntax.
3. **Stacked/grouped bar charts** — Currently groupBy produces single-series. Multi-series groupBy (e.g. opened+closed by week) would need syntax extension.
4. **Fix 7 pre-existing test failures** (component composition — low priority).

## Files to Read First
| File | Why |
|------|-----|
| `compiler.js` — ECharts section (~line 4915) | Chart compilation: groupBy, auto-detect, color palette |
| `compiler.js` — `BUILTIN_PRESET_CLASSES` (~line 7330) | All preset CSS definitions including metric_card hover |
| `compiler.js` — node renderer metric_card branch (~line 6083) | Trend indicator detection logic |
| `parser.js` — `parseChartTypeFirst/TitleFirst/Remainder` (~line 4685) | New chart syntax parsing |
| `apps/project-tracker/main.clear` | Reference dashboard — best current example of charts + stat cards |

## Resume Prompt
> Read `HANDOFF.md` and continue from where we left off.
>
> Branch: `main`. ECharts analytics dashboard is complete. The project-tracker is the reference app for dashboard presets. Next priorities: seed deduplication, chart subtitles/tabs syntax, stacked bar charts.
