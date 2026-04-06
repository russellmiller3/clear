# Handoff — 2026-04-06

## Current State
- **Branch:** main (after merge of feature/app-output-quality)
- **Tests:** 1005 passing
- **Working tree:** Clean

## What Was Done This Session

### Compiled App Output Quality (Major)
- **Root cause fix:** `* { margin: 0; padding: 0; }` in CSS_BASE was overriding every Tailwind utility class. All padding, margin, gap, flex properties rendered as 0px. Fixed to `*, *::before, *::after { box-sizing: border-box; }`.
- **Context-aware rendering:** `buildHTML()` now tracks parent section presets via `sectionStack`. Headings, text, buttons, links, and small text all adapt based on whether they're inside `app_header`, `metric_card`, `card_bordered`, `page_hero`, `app_sidebar`, etc.
- **Landing page patterns:** Hero sections use `font-display text-5xl`, centered flex layout, eyebrow badges, `btn btn-primary btn-lg` for CTAs. Section headings use `text-3xl font-bold`. Subheadings use `text-lg text-base-content/60`.
- **Sidebar nav:** Static text nodes in `app_sidebar` render as `<li><a>` menu items. Brand heading gets `px-5 py-4 border-b` wrapper. Sidebar splits children into brand/nav/other groups.
- **Flex containers:** Cards (`card`, `card_bordered`, `metric_card`) have `flex flex-col gap-*`. `app_content` has `flex flex-col gap-6`. Form inputs drop `mb-4` when inside flex containers.
- **Single theme CSS:** Compiler only emits the active theme, not all 5. Split `CSS_BASE` into `CSS_RESET` + `THEME_CSS` map.
- **Empty section comments suppressed:** JS output no longer has `// Section: Nav` when section body produces no JS.
- **Table runtime classes:** `<th>` gets uppercase tracking, `<tr>` gets hover states, `<td>` gets proper text sizing.
- **Per-row delete buttons:** (Started, not finished) Auto-detect DELETE endpoints and add delete buttons to table rows.

### Midnight Theme → Tokyo Night
- Redesigned `midnight` theme: deep navy `#0d1117` bg, electric blue `#4a8cff` accent, light blue text `#c8d8f0`, green `#5dbb7a` for success, warm yellow `#ffbb44` for accent/warning.

### Playground Overhaul
- **Single Source tab:** Merged JS/HTML/CSS tabs into one "Source" tab showing the full compiled HTML file.
- **Download button:** Downloads compiled app as `{name}.html`.
- **No auto-compile:** Loading examples and typing no longer trigger compilation. Must click Compile.
- **Slower animation:** Stream animation runs ~3 seconds instead of ~800ms so users can watch it build.
- **Favicon + logo:** Crystal/prism SVG icon in browser tab and sidebar.
- **Compile button:** Subtle gradient, proper styling.
- **Sales Dashboard → ivory:** Default example now uses ivory theme instead of midnight.

### ASCII Diagrams
- All 6 playground examples have ASCII diagrams at the top.
- Added "ASCII Diagrams First (MANDATORY)" section to AI-STYLE-GUIDE.md with step-by-step box-drawing technique.
- Diagrams are source of truth — update before code changes.
- **Known issue:** Arrow characters (`►`, `◄`) cause character count mismatches with label text. Need simpler arrow syntax (e.g., `=>` instead of `►`). This is the next thing to fix.

### Documentation Updates
- **CLAUDE.md:** Added Strong Opinion Rule.
- **AI-STYLE-GUIDE.md:** ASCII diagrams mandatory, box-drawing technique, source of truth rule.
- **ROADMAP.md:** Added Phase 39 (Desktop Apps via Tauri), Phase 40 (Production Database Connectors — Supabase/PlanetScale/Turso).
- **design-system-v2.md:** Updated midnight theme to Tokyo Night colors.
- **Ship skill:** Comprehensive `/ship` with doc updates, bundle rebuild, test gate, merge, push.

## What's NOT Done (Priority Order)

1. **ASCII diagram arrows** — The `►`/`◄` characters cause `.length` mismatches vs label text between boxes. Need to step back and find a simpler approach — maybe `=>` instead of `►`. All 6 diagrams need fixing once the approach is settled.

2. **Per-row delete buttons (CRUD)** — Started in compiler.js (auto-detect DELETE endpoints, add delete column to tables) but not finished. The event delegation handler is not wired up yet. Contact Manager example has the DELETE endpoint but no delete buttons appear in the UI.

3. **GAN grid alignment** — The `section 'Metrics' as two column layout` uses inline CSS `display: grid` instead of Tailwind `grid grid-cols-2 gap-6` classes. Should use Tailwind for consistency.

4. **Phase 30 items 2-4** — Client-side validation before fetch, loading state on buttons during fetch, error display when server returns error.

5. **Chart syntax** — `chart 'Revenue' as line showing data` → ECharts.

6. **Supabase connector** — `database is supabase` compile target (Phase 40, planned).

## Key Decisions Made
1. **Single HTML file output** — Compiled apps are one file with inline CSS/JS. No separate files. This is the right call for Clear's "compile and it works" philosophy.
2. **GAN Design Method** — Create static HTML mock first, use as acceptance criteria, fix compiler until output matches. The mock is the discriminator, the compiler is the generator.
3. **Strong Opinion Rule** — Always have an opinionated take backed by facts. Don't hedge.
4. **ASCII diagrams are source of truth** — Update diagram before changing code. Diagram wins if code disagrees.
5. **No auto-compile in playground** — User must click Compile explicitly.
6. **No husky/pre-commit hooks** — Test gate lives in `/ship` skill. Zero npm dependencies preserved.

## Known Issues
- ASCII diagram right edges don't perfectly align due to `►` character counting
- Preview screenshots timeout with Tailwind CDN (works fine in real browser)
- Browser server auth is hard-coded `{ id: 1, role: "admin" }` for dev mode
- `page_cta` preset has `text-primary-content` which may not work on all themes

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, design rules, GAN method, Strong Opinion Rule |
| `AI-STYLE-GUIDE.md` | ASCII diagrams, assignment conventions, presets |
| `design-system-v2.md` | All component patterns, 5 themes (midnight is Tokyo Night now) |
| `learnings.md` | Scan TOC — new session "App Output Quality" at bottom |
| `compiler.js:3129` | `buildHTML()` with sectionStack context tracking |
| `compiler.js:3412` | Context-aware CONTENT rendering (headings/text/buttons/links) |
| `compiler.js:4172` | `CSS_RESET` + `THEME_CSS` (split theme system) |
| `playground/index.html:241` | All 6 example sources with ASCII diagrams |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, and AI-STYLE-GUIDE.md. The big issue: ASCII diagram arrows (`►`/`◄`) cause character count mismatches — step back and find a simpler approach (maybe `=>` instead of `►`, or just use `-->` and `<--`). Fix all 6 playground example diagrams. Then finish the per-row delete buttons for CRUD (compiler.js auto-detects DELETE endpoints, adds delete column to table rows with event delegation). Then GAN the grid layout (Tailwind grid classes instead of inline CSS). Run `node clear.test.js` to verify (1005 tests). Serve playground with `npx http-server ./playground -p 8181 -c-1`.
