# Clear Language

Clear is a programming language designed for AI to write and humans to read.
Compiles plain English to JavaScript, Python, and HTML.

## On Startup -- Session Bootstrap (MANDATORY)
Every new session starts the same way, in this order:
1. Read `HANDOFF.md` — know where the last session left off
2. Read `PHILOSOPHY.md` — internalize the design rules before touching code
3. Read `CLAUDE.md` — load project instructions and constraints
Then load tools and read the rest of the startup files below.

## On Startup -- Load These Tools First
Run ToolSearch for these before doing anything else:
`mcp__computer-use__screenshot`, `mcp__computer-use__zoom`, `mcp__Claude_in_Chrome__computer`, `mcp__Claude_in_Chrome__tabs_context_mcp`, `mcp__Claude_in_Chrome__navigate`, `mcp__Claude_in_Chrome__get_page_text`

## On Startup -- Read These First
1. **`intent.md`** -- the authoritative spec. All 119+ node types, build targets, compiler passes, synonym collisions, validation rules. If it's not in intent.md, it doesn't exist. **Always check the parser too** -- intent.md has historically lagged behind the implementation.
2. **`learnings.md`** -- scan the TOC before any work. Engineering gotchas: synonym traps, tokenizer quirks, CRUD parse shapes, parser ordering, runtime coercion. Every section is a bug someone already hit.
3. **`PHILOSOPHY.md`** -- the 14 design rules. 14-year-old test, one op per line, no jargon, source-of-truth rule (Clear is source code, compiled output is build artifact), 1:1 mapping (every output line traces to one Clear line), explicit over terse, possessive access, colons signal blocks, deterministic compilation.
4. **`AI-INSTRUCTIONS.md`** -- how to WRITE Clear code and use the CLI. `=` for numbers, `is` for strings. Single quotes canonical. Numbers get px in styles. Use built-in presets before custom styles. `sending` not `receiving`. File structure: Database > Backend > Frontend sections.
5. **`SYNTAX.md`** -- complete syntax reference with examples for every feature.
6. **`design-system.md`** -- 3 themes (midnight/ivory/nova), all color tokens, typography, spacing, shadows, animation. DaisyUI v5 + Tailwind v4.
7. **`ai-build-instructions.md`** -- 10 hard UI rules, CDN imports, component patterns, ECharts config.
8. **`ROADMAP.md`** -- what's built (phases 1-46b, 75-84 complete), what's planned.
9. **`USER-GUIDE.md`** -- friendly tutorial with tested examples. Rails Tutorial style. Update when adding features.

## Testing
- Run all tests: `node clear.test.js`
- Run sandbox tests: `node sandbox.test.js` (integration tests — spins up real servers)
- Run playground tests (each is a separate file):
  - `node playground/server.test.js` (server API tests)
  - `node playground/e2e.test.js` (template compile + endpoint + CRUD + curriculum tests)
  - `node playground/ide.test.js` (Playwright IDE UI tests)
  - `node playground/agent.test.js` (Claude agent tool tests, needs ANTHROPIC_API_KEY)
  - `node playground/eval-meph.js` (Meph tool eval — 16 scenarios, real LLM, ~$0.10–0.30, ~90s)
  - `node playground/eval-fullloop-suite.js` (Meph builds 3 complex apps end-to-end — heavier eval)
- **Husky hooks:** pre-commit runs compiler tests, pre-push runs compiler + e2e + meph eval (when `ANTHROPIC_API_KEY` set; skips cleanly otherwise)
- Bypass meph eval for one push: `SKIP_MEPH_EVAL=1 git push`
- No vitest -- uses custom runner in `lib/testUtils.js`
- Tests use `describe`, `it`, `expect` from testUtils

## Meph Tool Eval (MANDATORY when changing Meph)
**If you touch any of these, run `node playground/eval-meph.js` BEFORE shipping:**
- `playground/server.js` — tool dispatch, schemas, validators, /api/chat handler
- `playground/system-prompt.md` — Meph's instructions
- The TOOLS array (tool definitions, descriptions, input_schemas)

The eval drives Meph through 16 scenarios covering every tool he has, asks
him to self-report whether each tool worked, and grades the result. Catches:
- Schema mismatches (e.g. validator says `path`, real schema says `filename`)
- Missing executeTool cases (Meph sees "Unknown tool")
- Hallucinated tool names that the validator should reject
- Bad JSON outputs (lint catches `{trailing: true,}`)
- Server-side coercion bugs that produce `[object Object]`
- Timeout regressions on long Meph turns

The pre-push hook runs it automatically when your env has `ANTHROPIC_API_KEY`.
For deeper integration testing (Meph builds full apps from scratch, ~3min,
~$0.50–1.00), run `node playground/eval-fullloop-suite.js` manually — not
in pre-push, because it's slower and more variable.

See `.claude/skills/eval-meph/SKILL.md` for the full guide.

## App-Level Testing Rule (MANDATORY)
**Compiler tests passing does NOT mean the app works.** When building or modifying a .clear app:
1. Run compiler tests: `node clear.test.js` — verifies the compiler itself
2. Run the app's own tests: `node cli/clear.js test <file>` — runs `test` blocks embedded in the .clear file
3. Syntax-check the compiled output: `node --check <compiled-output>.js` — catches malformed JS the compiler emitted
4. If the app has a frontend, compile + run it and verify the preview loads

Never declare an app "done" or "compiles clean" based only on step 1. Steps 2-3 catch bugs in the COMPILED OUTPUT that the compiler tests don't cover (e.g. parentheses in skill instructions breaking generated JS, missing closing braces, malformed string concatenation).

## Never Test By Hand (MANDATORY)
**Never manually click buttons in a browser to verify an app works.** If you're tempted to open Chrome and click something, that means the compiler is missing a generated test. Fix the compiler to emit the test, then run `clear test`. The compiler knows every button, link, input, endpoint, and page in the app — it should generate tests for ALL of them:
- Every button click triggers an action (not a dead button)
- Every link navigates to its target page
- Every input accepts and stores a value
- Every endpoint returns the expected status code
- Every page renders without JS errors
- Every display element shows data (not "undefined" or "OUTPUT")

If `clear test` doesn't cover it, the gap is in the compiler's test generator — fix that, not the app.

Never declare an app "done" or "compiles clean" based only on step 1. Steps 2-3 catch bugs in the COMPILED OUTPUT that the compiler tests don't cover (e.g. parentheses in skill instructions breaking generated JS, missing closing braces, malformed string concatenation).

## Plain-English Comments in .clear Files (MANDATORY)
Comments in `.clear` files must read like plain English — written for a curious 14-year-old, not a JavaScript engineer. No CS or compiler jargon: no "async generator", "drains into a string", "coroutine", "yield", "await", "stream", "token", "compiler", "runtime", "mutation", "promise". If a concept like streaming matters to the reader, explain it concretely — "the answer arrives as finished text, not one word at a time" — instead of reaching for the technical term. The reader shouldn't need to know JavaScript or Python to follow the comment. Before committing, re-read every comment and ask: would a 14-year-old understand this? If not, rewrite it.

## Read AI-INSTRUCTIONS.md Before Writing Clear (MANDATORY)
**Always re-read `AI-INSTRUCTIONS.md` before writing a `.clear` file — every time, not just at session start.** The file covers the conventions that make Clear code readable: mandatory ASCII architecture diagram at the top wrapped in `/* */`, no self-assignment (`x is x`), plain English section headers, `=` for numbers and `is` for strings, single-quote canonical form, and several others. Missing these conventions produces code that compiles but reads badly — and Russell will send it back.

If you're editing an existing `.clear` file, read AI-INSTRUCTIONS.md first so your edits match the surrounding style. If you're starting a new one, read AI-INSTRUCTIONS.md first so you start with the diagram and conventions in place.

## Key Files
- `index.js` -- public API, `compileProgram(source)` is the entry point
- `tokenizer.js` -> `parser.js` -> `validator.js` -> `compiler.js` (the pipeline)
- `synonyms.js` -- keyword synonym table (check before adding new keywords)
- `cli/clear.js` -- CLI for AI agents: build, check, info, fix, lint, serve, test
- `intent.md` -- authoritative spec for all node types (119+). Check parser.js if in doubt.
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

## Core 7 Templates
These are the showcase apps — each archetype exercises a different feature slice.
Playwright-tested. If a template breaks, the compiler has a regression.

| # | Template | Archetype | Features Showcased |
|---|----------|-----------|-------------------|
| 1 | `todo-fullstack` | CRUD basics | Tables, endpoints, auth, validation, pages |
| 2 | `crm-pro` | Data dashboard | Charts, filters, search, aggregates, multiple tables, `has many` |
| 3 | `blog-fullstack` | Content app | `belongs to`, rich display, public + admin pages |
| 4 | `live-chat` | Real-time | WebSocket, `subscribe to`, `broadcast to all`, auth |
| 5 | `helpdesk-agent` | AI agent | `ask claude`, `has tools:`, `knows about:`, `remember conversation`, `block arguments matching`, keyword search |
| 6 | `booking` | Workflow | Multi-step logic, validation, relationships, scheduling |
| 7 | `expense-tracker` | Personal app | CRUD, aggregates, charts, CSV export, categories |

## No Self-Assignment Rule
Never write `x is x` in Clear code. When building records from function arguments, the argument names must differ from the field names: `subject is title` not `subject is subject`. The reader must instantly see which side is the source and which is the destination. See AI-INSTRUCTIONS.md for full examples.

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

## Documentation Rule (MANDATORY)
**If a feature exists in the compiler but not in the docs, it doesn't exist.** Every new feature MUST be documented in ALL of these before shipping:
1. `intent.md` — node type row in the spec table
2. `SYNTAX.md` — complete syntax reference with example
3. `AI-INSTRUCTIONS.md` — conventions, when to use, gotchas
4. `USER-GUIDE.md` — tutorial coverage with worked example
5. `ROADMAP.md` — mark the phase complete, update counts
6. `landing/*.html` — when the feature is user-facing (new syntax, new agent capability, new primitive), sync the marketing pages. `landing/business-agents.html` and related pages show end users what Clear looks like; stale examples there mislead prospects. Grep `landing/` for any old syntax being replaced and update every example/code snippet to match the new canonical form.
7. `playground/system-prompt.md` — Meph reads this every session; if Meph should know about the feature, document it here.

`intent.md` is the **authoritative spec** — always check it before building. If a feature isn't in intent.md, check the parser before assuming it doesn't exist. We have 119+ node types; the docs have historically lagged behind the implementation.

**Canonical-syntax changes are extra dangerous — they must propagate everywhere.** When a keyword becomes canonical (or a legacy form gets deprecated), update ALL seven surfaces above PLUS all 8+ core templates and any reference apps. Missing the landing page is the worst case: prospective users see syntax that's either wrong or not what you'd write today. Grep broadly before calling a canonical change done.

Before building a new feature, grep the parser for similar existing features. We've nearly rebuilt things that already existed (e.g. SERVICE_CALL for Stripe/SendGrid/Twilio was implemented but undocumented, which almost led to building a parallel "batteries" system).

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

## GAN Frontend Directly (MANDATORY)
When working on a .clear app's frontend, always compile, run, and verify the output yourself in the browser. Navigate to the page, screenshot it, test buttons and inputs, check for errors. Never declare a frontend change "done" based on compiler tests alone — compiler tests don't catch field mismatches, broken layouts, missing data, or dead buttons. If you'd tell Russell "it should work," you didn't test it.

## Template Smoke Test on New Syntax (MANDATORY)
When introducing new syntax or synonyms, ALWAYS compile all 8 core templates to verify 0 errors before committing. New syntax that passes unit tests but breaks real apps is a shipped bug — the templates ARE the acceptance test. Run this after any parser/synonym change:
```
node -e "import { compileProgram } from './index.js'; import fs from 'fs'; ['todo-fullstack','crm-pro','blog-fullstack','live-chat','helpdesk-agent','booking','expense-tracker','ecom-agent'].forEach(a => { const r = compileProgram(fs.readFileSync('apps/'+a+'/main.clear','utf8')); console.log(a+': '+r.errors.length+' errors, '+r.warnings.length+' warnings'); });"
```

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

**At inflection points, narrate the bigger arc with `/bigpicture` (alias `/bp`).** End of session, after a feature ships, after a bug class fixed — invoke the bigpicture skill to step back and tell the story. Different from running narration (Science Documentary Rule covers that): bigpicture distills the session into a 60-second read with theme groupings, why-it-matters context, and an open-claw next-moves list. See `.claude/skills/bigpicture/SKILL.md`. Russell doesn't have to ask — proactively run it after meaningful chunks.

That's it. The compiler has no build step, no config files, no framework. `node clear.test.js` runs everything.

## No Invisible Agent Work (MANDATORY)
Do code changes and accuracy-sensitive doc updates directly in the main conversation where Russell can see every edit. Don't delegate these to background agents — their output is invisible and unverifiable. Background agents are fine for read-only exploration, parallel grunt work, and tasks where wrong = harmless. But anything that ships (code, docs, compiler changes) happens in-conversation.

## No Emoji in Landing Pages (MANDATORY)
Landing pages (`landing/*.html`) must never use emoji characters. Use Lucide icons (SVG) instead — they're sharper, scale properly, and look professional. Emoji render differently across OS/browser and look amateurish on marketing pages.

## Rich Chat Output (MANDATORY)
Studio chat (Meph) should support SVG diagrams and markdown rendering as standard output. When Meph explains architecture, data flow, or relationships, render them as inline SVG diagrams in the chat — not ASCII art. Markdown formatting (headers, bold, code blocks, lists) should render properly in chat bubbles.

## Test Before Declaring Done (MANDATORY)
Test everything you build before declaring it done. "The variable updated" is not verification — verify the user-visible outcome. For UI: check rendered content, not just DOM state. For flows: drive the flow end-to-end and assert the final result. If you can't test it, say so explicitly instead of claiming success. A route selector that updates `iframe.src` is not tested until you've confirmed the rendered page content actually changed.
