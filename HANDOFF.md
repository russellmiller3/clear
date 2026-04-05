# Handoff — 2026-04-05

## Current State
- **Branch:** main
- **Last commit:** 49bf252 (Clear language: compiler, runtime, playground, 1005 tests)
- **Working tree:** Dirty — significant uncommitted changes across compiler, playground, parser, tests, and new files

### Uncommitted changes
| File | What changed |
|------|-------------|
| `compiler.js` | Design-system-v2 themes (5 themes: midnight/ivory/nova/arctic/moss), new preset classes, DaisyUI v5 component patterns (fieldset inputs, rounded-box cards, proper headings/text), correct CDN links (daisyui.css + @tailwindcss/browser@4), Google Fonts, browser server `receiving` var binding fix, `process.env` shim |
| `parser.js` | Added `arctic` and `moss` to valid themes list (line ~1073) |
| `clear.test.js` | Fixed import path (`./lib/testUtils.js`), updated 6 preset tests to match new class strings |
| `playground/index.html` | Full rewrite — arctic theme, syntax highlighting with line numbers, browser mockup preview, interactive API tester, compile animation (scan line + streaming code), 6 new examples using different themes |
| `playground/clear-compiler.min.js` | Rebuilt bundle |
| `playground/daisyui.min.css` | Downloaded locally (969KB) for iframe injection |
| `playground/mock.html` | Design mock (arctic theme) — the GAN target |
| `ROADMAP.md` | Added Phase 29 (playground work) + Phases 30-38 (Part 2 roadmap) |
| `CLAUDE.md` | Added startup reading order, GAN Design Method, Ross Perot Rule, Open Claw Rule |
| `design-system-v2.md` | Full design token system — 5 themes, all component patterns, ECharts config |
| `learnings.md` | 12 new lessons from this session |

## What Was Done This Session
- Fixed 3 compiler bugs: DaisyUI CDN path, browser server `receiving` variable binding, browser server `process.env` crash
- Playground redesigned with arctic palette, syntax highlighting, line numbers, browser mockup preview, interactive API tester (live Send buttons that execute real requests via hidden iframe)
- Compiler updated to design-system-v2: 5 themes, new preset classes, fieldset inputs, proper card/table/heading patterns, Google Fonts
- 6 new examples: Sales Dashboard (midnight), Contact Manager (arctic), Invoice Manager (moss), SaaS Landing (ivory), Lead Scorer, Hiring Pipeline
- All 1005 tests passing

## What's In Progress
- **Phase 30 (form submit):** Item 1 (button → fetch → render) is DONE. The reactive compiler generates fetch calls, state management, input listeners, table re-rendering. Verified working: Contact Manager, Invoice Manager, Todo App all do full CRUD in the browser. Items 2-4 (client-side validation, loading state, error display) need compiler work.
- **Compiled app visual quality** — compiler emits correct DaisyUI classes but apps still look plain. Sidebar nav uses `<p>` tags not `menu menu-sm`. Metric card numbers lack `font-mono`. Tables need v2 styling. GAN against design-system-v2.md component patterns.

## Key Decisions Made
1. **GAN Design Method is mandatory** — never edit compiler output directly. Design a static HTML mock first, use it as acceptance criteria, then fix compiler until output matches. Added to CLAUDE.md.
2. **5 themes not 3** — added `arctic` (ice-blue light) and `moss` (sage green light) alongside midnight/ivory/nova. User preferred arctic for the playground.
3. **Interactive API tester, not static route list** — backend examples show a mini Postman with Send buttons that execute real requests via the browser server. This proves the compiler works.
4. **DaisyUI v5 + Tailwind v4 browser CDN** — correct combo is `daisyui@5/daisyui.css` + `@tailwindcss/browser@4`. The old `cdn.tailwindcss.com` still works but causes preview tool timeouts.
5. **Compile animation is honest** — scan line across editor + streaming code output showing real compiled JS line by line. Not fake progress bars.
6. **Ross Perot Rule** — proactively do what makes sense, don't wait to be told. **Open Claw Rule** — at end of every task, suggest next tasks.

## Known Issues / Bugs
- Preview screenshots timeout in Claude Preview tool (Tailwind CDN is heavy) — works fine in real browser
- AI agent examples (Lead Scorer, Hiring Pipeline) fail with "Set CLEAR_AI_KEY" — expected, needs BYOK key input
- Compiled app sidebar nav items don't use DaisyUI `menu` component — still plain `<p>` tags
- Compiled app metric cards lack `font-mono` on numbers

## Next Steps (Priority Order)
1. **GAN compiled app output** — metric cards need `font-mono text-3xl`, sidebar nav needs `menu menu-sm`, tables need v2 header styling. Compare compiler buildHTML() output to design-system-v2.md section by section.
2. **Phase 30 items 2-4** — client-side validation before fetch, loading state on button during fetch, error display in UI when server returns error. All in compiler.js reactive compiler.
3. **Chart syntax** — `chart 'Revenue' as line showing data` compiles to ECharts with `getBaseConfig(theme)` from design-system-v2
4. **Download button** — JSZip export with package.json + README
5. **BYOK key input** — text input for Anthropic API key, stored in sessionStorage, for AI agent examples

## Files to Read First
| File | Why |
|------|-----|
| `CLAUDE.md` | Startup reading order, design rules, GAN method |
| `design-system-v2.md` | Visual target — all component patterns the compiler should emit |
| `learnings.md` | Gotchas from this session (DaisyUI paths, browser server bugs, theme validation) |
| `ROADMAP.md` | Phases 30-38 are the implementation roadmap |
| `playground/mock.html` | The GAN target for the playground design |
| `playground/index.html` | Working playground with all compiler logic |
| `compiler.js:3506` | `compileToHTML()` — where compiled app HTML is generated |
| `compiler.js:3955` | `BUILTIN_PRESET_CLASSES` — preset name → CSS class mapping |
| `compiler.js:4055` | `CSS_BASE` — all theme CSS variables |

## Resume Prompt
> Read HANDOFF.md, CLAUDE.md, and design-system-v2.md. Start by creating a branch: `git checkout -b feature/app-output-quality`. The playground is redesigned and working (6 examples, all compile, interactive API tester). The compiler was updated to design-system-v2 (5 themes, new presets, fieldset inputs, DaisyUI v5). Next priority: GAN the compiled app output quality — the compiler's HTML for metric cards, sidebar nav, tables, and headings needs to match the component patterns in design-system-v2.md. Then start Phase 30 (form submit to endpoint). Run `npx http-server ./playground -p 8080 -c-1` to see the playground. Run `node clear.test.js` to verify (1005 tests, all should pass).
