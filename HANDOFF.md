# Handoff — 2026-04-10

## Current State
- **Branch:** `feature/landing-pages-v2`
- **Last commit:** `e5b0bd5 feat: GAN loop pass — landing page polish and bug fixes`
- **Working tree:** Dirty — `.claude/launch.json`, `.claude/settings.local.json`, `clear.test.js`, `parser.js` modified (unrelated to landing page work, don't commit)

## What Was Done This Session
- **Bug fix:** Colored card variants (`feature_card_teal`, `feature_card_purple`, `feature_card_indigo`, `feature_card_emerald`, `feature_card_rose`, `feature_card_amber`) were missing from `inLandingCard` — headings rendered as `<h1>` instead of `<h3>` with white text. Fixed.
- **GAN loop polish:** Decorative `"` quote mark before stars in testimonial cards; terminal traffic-light dots on code blocks; hero badge upgraded to colored pill with `oklch()` inline style; radial gradient added to `page_hero` (was already on `hero_left`).
- **Bento layout for saas/devtool:** Converted uniform 6-card feature grids → asymmetric bento split (`feature_split` / `feature_split_dark`: large primary card + 2 stacked colored cards) + secondary 3-card dark grid. Matches Linear/Jasper reference design.
- **3 landing apps committed:** `apps/startup-landing/` (ivory), `apps/saas-landing/` (midnight), `apps/devtool-landing/` (slate) all on branch.

## What's In Progress
**Next big upgrade: Flowbite-sourced preset rewrites.**

Flowbite is MIT licensed — no website builder restrictions (confirmed). Plan: fetch Flowbite's marketing + app UI component pages, use as canonical visual references, rewrite Clear's compiler presets to match that quality bar. Much better than screenshot-matching 6 different reference sites.

Target sections:
- Hero Sections → `page_hero`, `hero_left`
- Feature Sections → `feature_grid`, `feature_split`, bento variants
- Pricing Sections → `pricing_grid` cards
- Testimonials → better quote layouts
- Logo Clouds → styled logo bar (not just text labels)
- App UI: navbars, sidebars, tables, modals → app presets

## Key Decisions Made
- **Flowbite over Tailwind UI** — Tailwind Plus doesn't allow use in website builders. Flowbite is MIT, no restrictions.
- **`feature_card_large` is the bento hero card** — always `bg-primary text-primary-content`, col-span-2. Colored variants go in the stacked right column.
- **Dark pages use `feature_split_dark` + `feature_grid_dark`** — saas = midnight theme, devtool = slate theme, startup = ivory.
- **`bg-white/5` on `feature_card_dark` is intentional** — Linear-style frosted glass card on dark backgrounds, not a bug.
- **Terminal dots in code blocks** — red/amber/green traffic-light circles. Standard for dev-tool marketing.

## Known Issues / Bugs
- `preview_screenshot` times out on dark-themed pages (ports 5002, 5003) — use `preview_eval` for DOM inspection instead. Pages render correctly, it's a tool timeout.
- Chrome has a stuck screenshot-annotation overlay — doesn't affect functionality.
- 7 pre-existing test failures in `clear.test.js` — component composition feature tests, unrelated to this work.

## Next Steps (Priority Order)
1. **Fetch Flowbite marketing components** — hero, feature sections, pricing, testimonials, logo clouds. Rewrite Clear compiler presets to match. `https://flowbite.com/blocks/marketing/hero/` etc.
2. **Upgrade app UI presets from Flowbite app blocks** — navbars, sidebars, tables, command palettes.
3. **Logo bar visual upgrade** — currently text-only (NOTION, STRIPE etc.). Even styled placeholder marks with brand colors would be a big improvement.
4. **Merge `feature/landing-pages-v2` to main** once Flowbite pass is done.
5. **Fix 7 pre-existing test failures** (component composition — low priority).

## Files to Read First
| File | Why |
|------|-----|
| `compiler.js` — `BUILTIN_PRESET_CLASSES` (~line 7084) | All preset CSS definitions — this is what gets upgraded |
| `compiler.js` — section renderer (~line 5400–5650) | Bento grid logic, hero mock, feature_split structure |
| `compiler.js` — node renderer (~line 5820–5990) | `inLandingCard`, `inDarkCard`, `inHero` context — heading/text/button per context |
| `apps/startup-landing/main.clear` | Ivory theme, `hero_left` + bento — best current example |
| `apps/saas-landing/main.clear` | Midnight theme, `page_hero`, `feature_split` bento |
| `apps/devtool-landing/main.clear` | Slate theme, `feature_split_dark`, code block section |

## Resume Prompt
> Read `HANDOFF.md` and continue from where we left off.
>
> Branch: `feature/landing-pages-v2`. Landing page GAN loop is complete for this round. Next task: **upgrade Clear's compiler presets using Flowbite as the reference** (MIT licensed — confirmed, no website builder restrictions).
>
> Flowbite blocks live at `https://flowbite.com/blocks/marketing/` — fetch hero, feature, pricing, testimonials, logo-cloud sections. Study the patterns, then rewrite the relevant presets in `compiler.js` (`BUILTIN_PRESET_CLASSES` + section/node renderer) from scratch to match that quality. Run `node clear.test.js` after each change — must stay at 1490 passing / 7 failing. Preview servers defined in `.claude/launch.json`: startup-landing (5001), saas-landing (5002), devtool-landing (5003).
