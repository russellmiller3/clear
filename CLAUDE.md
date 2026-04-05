# Clear Language

Clear is a programming language designed for AI to write and humans to read.
Compiles plain English to JavaScript, Python, and HTML.

## On Startup -- Read These First
1. **`intent.md`** -- the authoritative spec. All 96 node types, build targets, compiler passes, synonym collisions, validation rules. If it's not in intent.md, it doesn't exist.
2. **`learnings.md`** -- scan the TOC before any work. Engineering gotchas: synonym traps, tokenizer quirks, CRUD parse shapes, parser ordering, runtime coercion. Every section is a bug someone already hit.
3. **`PHILOSOPHY.md`** -- the 14 design rules. 14-year-old test, one op per line, no jargon, source-of-truth rule (Clear is source code, compiled output is build artifact), 1:1 mapping (every output line traces to one Clear line), explicit over terse, possessive access, colons signal blocks, deterministic compilation.
4. **`AI-STYLE-GUIDE.md`** -- how to WRITE Clear code. `=` for numbers, `is` for strings. Single quotes canonical. Numbers get px in styles. Use built-in presets before custom styles. `sending` not `receiving`. File structure: Database > Backend > Frontend sections.
5. **`SYNTAX.md`** -- complete syntax reference with examples for every feature.
6. **`design-system.md`** -- 3 themes (midnight/ivory/nova), all color tokens, typography, spacing, shadows, animation. DaisyUI v5 + Tailwind v4.
7. **`ai-build-instructions.md`** -- 10 hard UI rules, CDN imports, component patterns, ECharts config.
8. **`ROADMAP.md`** -- what's built (phases 1-28 complete), what's planned.

## Testing
- Run all tests: `node clear.test.js` (1005 tests)
- No vitest -- uses custom runner in `lib/testUtils.js`
- Tests use `describe`, `it`, `expect` from testUtils

## Key Files
- `index.js` -- public API, `compileProgram(source)` is the entry point
- `tokenizer.js` -> `parser.js` -> `validator.js` -> `compiler.js` (the pipeline)
- `synonyms.js` -- keyword synonym table (check before adding new keywords)
- `intent.md` -- authoritative spec for all 96 node types
- `PHILOSOPHY.md` -- design rules (14-year-old test, one op per line, no jargon)
- `learnings.md` -- scan TOC before starting any work

## Core Design Principles (from PHILOSOPHY.md)
- **Clear is source code.** Compiled JS/Python is build output. Never edit output.
- **14-year-old test.** If a curious 14-year-old can't read it, simplify.
- **One operation per line.** Named intermediates, no nesting, no chaining.
- **Words for structure, symbols for math.** `+` `-` `*` `/` `=` for math, English words for everything else.
- **No jargon.** No "state", "computed", "callback", "instance". Use "create", "define", "send back".
- **No magic variables.** Everything declared or received explicitly. No implicit `this`/`self`/`incoming`.
- **1:1 mapping.** Every compiled output line traces to exactly one Clear line.
- **Deterministic.** Same input = same output. No AI in the compile step.
- **Compiler accumulates quality.** Fix a bug once, every app gets the fix on recompile.

## Compiler Architecture
- **4 passes:** tokenize -> parse -> validate -> compile
- **Context object:** `{ lang, indent, declared, stateVars, mode, filterItemPrefix, streamMode }`
- **5 top-level paths:** Non-reactive JS, Reactive JS, Backend JS, Backend Python, HTML scaffold
- **All node compilation** goes through `compileNode()` + `exprToCode()` in compiler.js
- **Parser sets `node.ui`** on UI nodes with pre-computed HTML metadata
- **Synonyms drive tokenizer** -- longest-match greedy. Bump `SYNONYM_VERSION` on changes.
- **Reserved words:** `a`, `an`, `the`, `in`, `on`, `to`, `by`, `as`, `at`

## Synonym Collision Risks
- `count by` vs `increase count by 1` -- token sequence detection
- `send email` vs `send email to '/api'` -- parser detects block vs API call
- `find all`/`find first` vs `find pattern` -- token sequence, not synonym
- `toggle` (checkbox synonym) vs `toggle the X panel` -- parser guard
- `delete` (remove synonym) vs `delete the X with this id` -- detected first
- `get` (map access) vs `get all X` / `get X from URL` -- detected first
- `sending` is synonym for `receiving` -- both work

## UI/Design System
- **Stack:** HTML + vanilla JS + Tailwind CSS v4 (CDN) + DaisyUI v5
- **Themes:** `midnight` (dark), `ivory` (light, default), `nova` (warm)
- **Built-in presets:** `page_hero`, `page_section`, `page_section_dark`, `page_card`, `app_layout`, `app_sidebar`, `app_main`, `app_content`, `app_header`, `app_card`
- **10 hard rules:** One accent color, one btn-primary per section, hero <= 10 words, 8pt grid, cards bg OR border not both, etc.

## Before Adding New Syntax
1. Write 3+ example programs using the proposed syntax
2. Say each line out loud (phone test)
3. Check synonyms.js for collisions
4. Check if multi-word phrase appears inside any existing pattern
5. Write failing tests
6. Then implement

## Compiler is Closed Source
Do not make this repo public. The playground uses an obfuscated bundle
(`playground/clear-compiler.min.js`). Rebuild it after compiler changes:

npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js


## No External Dependencies
The compiler is pure ESM JavaScript. Zero npm packages. Runs in Node and browser.

## Playground
`playground/` is self-contained (index.html + compiler bundle). Serve with any
static server. Full-stack apps run via browser server (fetch interception with
real DB runtime, validation, and CRUD).

## GAN Design Method (MANDATORY for all UI work)
Never edit the compiler or playground HTML directly to "make it look better." Always:
1. **Design a static HTML mock first** — pure HTML/CSS with DaisyUI, no compiler. This is the visual target.
2. **Use the mock as acceptance criteria** — screenshot it, compare side-by-side.
3. **Edit the compiler/playground until its output matches the mock.**

The mock is the discriminator. The compiler is the generator. Iterate until output matches target.
This applies to: playground page redesigns, compiled app output quality, landing pages, dashboards, any visual work.

## Ross Perot Rule
Proactively do what makes sense. Don't wait to be told. If something obviously needs doing — fix it, build it, clean it up. Act on judgment, not just instructions.

## Open Claw Rule
At the end of every task, come up with the next relevant tasks and suggest them. Don't stop at "done" — show what's next and offer to keep going.

## Branching
Always create a new branch for features and fixes. Never commit directly to main.
Branch naming: `feature/[name]` or `fix/[name]`. Merge to main when done.

## Known Issues
- Browser server may 404 on some routes (untested in real browser)
- Playground styling needs visual verification
- DaisyUI v5 themes use `--color-base-100: oklch(%)` format, not old v4 vars
- `ui's Card()` in web target crashes buildHTML (namespaced component calls)

That's it. The compiler has no build step, no config files, no framework. `node clear.test.js` runs everything.
