# Clear Language

Clear is a programming language designed for AI to write and humans to read.
Compiles plain English to JavaScript, Python, and HTML.

## On Startup -- Load These Tools First
Run ToolSearch for these before doing anything else:
`mcp__computer-use__screenshot`, `mcp__computer-use__zoom`, `mcp__Claude_in_Chrome__computer`, `mcp__Claude_in_Chrome__tabs_context_mcp`, `mcp__Claude_in_Chrome__navigate`, `mcp__Claude_in_Chrome__get_page_text`

## On Startup -- Read These First
1. **`intent.md`** -- the authoritative spec. All 96 node types, build targets, compiler passes, synonym collisions, validation rules. If it's not in intent.md, it doesn't exist.
2. **`learnings.md`** -- scan the TOC before any work. Engineering gotchas: synonym traps, tokenizer quirks, CRUD parse shapes, parser ordering, runtime coercion. Every section is a bug someone already hit.
3. **`PHILOSOPHY.md`** -- the 14 design rules. 14-year-old test, one op per line, no jargon, source-of-truth rule (Clear is source code, compiled output is build artifact), 1:1 mapping (every output line traces to one Clear line), explicit over terse, possessive access, colons signal blocks, deterministic compilation.
4. **`AI-INSTRUCTIONS.md`** -- how to WRITE Clear code and use the CLI. `=` for numbers, `is` for strings. Single quotes canonical. Numbers get px in styles. Use built-in presets before custom styles. `sending` not `receiving`. File structure: Database > Backend > Frontend sections.
5. **`SYNTAX.md`** -- complete syntax reference with examples for every feature.
6. **`design-system.md`** -- 3 themes (midnight/ivory/nova), all color tokens, typography, spacing, shadows, animation. DaisyUI v5 + Tailwind v4.
7. **`ai-build-instructions.md`** -- 10 hard UI rules, CDN imports, component patterns, ECharts config.
8. **`ROADMAP.md`** -- what's built (phases 1-46b, 75-84 complete), what's planned.
9. **`USER-GUIDE.md`** -- friendly tutorial with tested examples. Rails Tutorial style. Update when adding features.

## Testing
- Run all tests: `node clear.test.js` (1633 compiler tests)
- Run sandbox tests: `node sandbox.test.js` (9 integration tests — spins up real servers)
- Run playground tests (each is a separate file):
  - `node playground/server.test.js` (~85 server API tests)
  - `node playground/e2e.test.js` (~60 template compile + endpoint tests)
  - `node playground/ide.test.js` (~46 Playwright IDE UI tests)
  - `node playground/agent.test.js` (~50 Claude agent tool tests, needs ANTHROPIC_API_KEY)
- Total: 1633 compiler + 9 sandbox + ~241 playground tests
- No vitest -- uses custom runner in `lib/testUtils.js`
- Tests use `describe`, `it`, `expect` from testUtils

## Key Files
- `index.js` -- public API, `compileProgram(source)` is the entry point
- `tokenizer.js` -> `parser.js` -> `validator.js` -> `compiler.js` (the pipeline)
- `synonyms.js` -- keyword synonym table (check before adding new keywords)
- `cli/clear.js` -- CLI for AI agents: build, check, info, fix, lint, serve, test
- `intent.md` -- authoritative spec for all 99 node types
- `PHILOSOPHY.md` -- design rules (14-year-old test, one op per line, no jargon)
- `learnings.md` -- scan TOC before starting any work
- `patch.js` -- program diff/patch API (11 structured edit operations for RL)
- `curriculum/` -- 20 benchmark tasks for RL training (L1-L10 difficulty)

## CLI (for AI agents)
The CLI is designed for machines first. Every command supports `--json`.
```
clear build <file>     # compile to JS/Python/HTML
clear check <file>     # validate only (fast, no compilation)
clear info <file>      # introspect: endpoints, tables, pages, agents
clear fix <file>       # auto-fix patchable errors
clear lint <file>      # security + quality warnings
clear serve <file>     # compile + start local server
clear test <file>      # run test blocks
clear dev <file>       # watch + rebuild on changes
clear init [dir]       # scaffold new project
clear package <file>   # bundle for deployment (Dockerfile)
```
Exit codes: 0=ok, 1=compile error, 2=runtime error, 3=file not found, 4=test fail

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
- **Compiled output is self-documenting.** Every compiled file starts with an auto-generated ASCII architecture diagram (tables, endpoints, pages, data flow). Regenerates on every build. The diagram IS the intent file for that app.

## No Backward Compatibility
There are no users yet. Do not preserve backward compatibility. Always do things the right way.
If the right design breaks existing tests, update the tests. If it changes syntax, change it.
Speed of iteration > stability of APIs. We'll freeze interfaces when we have users, not before.

## File TOC Rule (MANDATORY)
Both `parser.js` and `compiler.js` have a TABLE OF CONTENTS at the top.
**Every time you change either file** — adding, removing, or moving a section —
update the TOC to match. Use section names, not line numbers (lines drift).
Read the TOC before working in the file so you know where things are.

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

## Before Adding New Features or Syntax (MANDATORY)
1. Use `/write-plan` to create an implementation plan
2. Use `/red-team-plan` to stress-test the plan before coding
3. Write 3+ example programs using the proposed syntax
4. Say each line out loud (phone test)
5. Check synonyms.js for collisions
6. Check if multi-word phrase appears inside any existing pattern
7. Write failing tests
8. Then implement

Always use these skills — never jump straight to coding a new feature.

## Compiler is Closed Source
Do not make this repo public. The playground uses an obfuscated bundle
(`playground/clear-compiler.min.js`). Rebuild it after compiler changes:

npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js


## No External Dependencies
The compiler is pure ESM JavaScript. Zero npm packages. Runs in Node and browser.

## Clear Studio (IDE)
Run `node playground/server.js` → opens `http://localhost:3456`.
Three-panel IDE: CodeMirror editor + preview/terminal + Claude agent chat.
43 template apps in dropdown. Light/dark theme. Save to Desktop.

The assistant inside Studio is **Mephistopheles (Meph)**. Meph is an app builder — NOT a compiler developer. Meph writes Clear code, compiles, runs, tests, and fixes errors. Meph can read SYNTAX.md, AI-INSTRUCTIONS.md, PHILOSOPHY.md, USER-GUIDE.md, and requests.md. Meph can only write .clear files and requests.md.

Meph has tools: edit_code, read_file, run_command, compile, run_app, stop_app, http_request, write_file.
Tests: `node playground/server.test.js` (85 tests).

`playground/index.html` is the old static playground (compiler bundle only).
`playground/ide.html` is the full Studio IDE with server backend.

## GAN Design Method (MANDATORY for all UI work)
Never edit the compiler or playground HTML directly to "make it look better." Always:
1. **Design a static HTML mock first** — pure HTML/CSS with DaisyUI, no compiler. This is the visual target.
2. **Use the mock as acceptance criteria** — screenshot it, compare side-by-side.

## GAN Page Loop (use when Russell says "GAN pages")
Iterate until 95% visual parity. One round = one fix. Don't break the loop for anything.

**Every round:**
1. Compile + restart app: POST source to `/api/stop` then `/api/run` at localhost:3456
2. Navigate Chrome tab to the new port, take full-page screenshot
3. Grade each section (header, sidebar, stat cards, content) — be harsh, use reference quality bar (Linear/Stripe/Vercel)
4. Pick the single worst-looking section
5. Fix it in the compiler (compiler.js or parser.js), run `node clear.test.js` to confirm no regressions
6. Go back to step 1

**Script to recompile + restart (node --input-type=module):**
```js
import { compileProgram } from './index.js';
import fs from 'fs'; import http from 'http';
const r = compileProgram(fs.readFileSync('apps/project-tracker/main.clear','utf8'));
await new Promise(res => { const q=http.request({hostname:'localhost',port:3456,path:'/api/stop',method:'POST',headers:{'Content-Type':'application/json','Content-Length':2}},()=>res()); q.write('{}');q.end(); });
const b = JSON.stringify({serverJS:r.serverJS,html:r.html,css:r.css||''});
await new Promise(res => { const q=http.request({hostname:'localhost',port:3456,path:'/api/run',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},re=>{let d='';re.on('data',c=>d+=c);re.on('end',()=>{console.log('port:',JSON.parse(d).port);res();})}); q.write(b);q.end(); });
```
3. **Edit the compiler/playground until its output matches the mock.**

The mock is the discriminator. The compiler is the generator. Iterate until output matches target.
This applies to: playground page redesigns, compiled app output quality, landing pages, dashboards, any visual work.

## Console First Rule
When debugging any browser/UI issue, **always check console errors first** before reading code or guessing. Use `preview_console_logs` or ask the user for the console output. A SyntaxError in the console tells you exactly what's broken in seconds. Guessing wastes everyone's time.

## Ross Perot Rule
Proactively do what makes sense. Don't wait to be told. If something obviously needs doing — fix it, build it, clean it up. Act on judgment, not just instructions.

## Open Claw Rule
At the end of every task, come up with the next relevant tasks and suggest them. Don't stop at "done" — show what's next and offer to keep going.

## Strong Opinion Rule
Always have an opinionated take on the right way to do things, backed by facts or best practices. Don't hedge with "it depends" or "you could go either way." State the best approach, explain why, and do it. If the user disagrees, they'll say so.

## Obvious Over Cryptic Rule
UI controls must say what they do in plain words. Never use a bare arrow, icon, or symbol as the only label for an action — pair it with a word (e.g. "Hide Chat" not "◀", "Delete" not "✕" alone). The label should change to reflect current state ("Hide Chat" → "Show Chat"). A user should never have to guess what a button does.

## Branching
Always create a new branch for features and fixes. Never commit directly to main.
Branch naming: `feature/[name]` or `fix/[name]`. Merge to main when done.

## Known Issues
- Browser server may 404 on some routes (untested in real browser)
- Playground styling needs visual verification
- DaisyUI v5 themes use `--color-base-100: oklch(%)` format, not old v4 vars
- `ui's Card()` in web target crashes buildHTML (namespaced component calls)

## Explain Your Thinking Rule
When making compiler changes, explain decisions in plain English in the chat as you go. Don't just code silently — the human needs to follow the reasoning, not reverse-engineer it from diffs.

## Science Documentary Rule (MANDATORY)
Narrate your work as you build — not after. Think David Attenborough watching a compiler evolve in the wild. Before touching a file, say what you're about to do and why it matters in the big picture. Not "I'm editing compiler.js" — that's a changelog. The narration explains *significance*: what problem this solves, why it wasn't solved before, what it unlocks.

**The bar:** if someone watched only the chat (not the code), they should understand what was built, why it matters, and feel the forward momentum.

**Format:** one short paragraph per meaningful action. Vivid, specific, not corporate. "The FAQ bug has been sitting in every compiled landing page since we built the preset system — every single template showed 'Q1, Q2, Q3' instead of actual questions. Nobody noticed because we were looking at the compiler, not the output. Now every app gets the fix on recompile." That's the tone.

**Never:** "I'll now update compiler.js to fix the FAQ issue." That's nothing. Say what the FAQ issue IS, why it matters, and what fixing it enables.

That's it. The compiler has no build step, no config files, no framework. `node clear.test.js` runs everything.
