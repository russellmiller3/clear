# Plan: Studio Visual Features — Code Highlighting, Compile Animation, Compile Stats

**Branch:** `feature/studio-visuals`

## What We're Building

Three visual features that make Clear Studio feel like a real IDE, not a text editor:

1. **Code tab with real syntax highlighting** — JS/HTML/Python output gets proper CodeMirror highlighting, not raw text
2. **Compiler animation** — line-by-line visual mapping from Clear source → compiled output
3. **Prominent compile stats** — "24 → 187 lines · 12ms" displayed prominently, not buried in status bar

---

## Feature 1: Code Tab with Syntax Highlighting

### What exists now
- Code tab renders compiled output as `<pre>` with escaped HTML (no highlighting)
- A read-only CodeMirror was added but uses the Clear syntax highlighter (wrong language)

### What we have to work with
- The `codemirror.bundle.js` **already exports `javascript`** — a full JS language mode with JSX/TS support
- The bundle exports `StreamLanguage` for custom languages
- Import: `import { javascript } from './codemirror.bundle.js'`

### Implementation
```
import { javascript } from './codemirror.bundle.js';
```

In `showCompiled()`:
- Detect language from compiled output (serverJS → JS, html → HTML, python → Python)
- Create read-only EditorView with `javascript()` extension for JS output
- For HTML: JS mode still works reasonably (HTML is less critical since it's mostly generated)
- For Python: use StreamLanguage with a basic Python tokenizer (comments=#, strings, numbers)
- Tab selector at top of code panel: "HTML | Server JS | Client JS | Python" — click to switch

### Phase 1 steps:
1. Import `javascript` from bundle
2. Replace `showCompiled()` to use read-only CodeMirror with `javascript()` 
3. Add sub-tabs for HTML/ServerJS/ClientJS/Python when multiple outputs exist
4. Test with a full-stack template (has both HTML + serverJS)

---

## Feature 2: Compiler Animation

### The vision
When user hits Compile, instead of instantly showing the result:
1. Each Clear line on the left highlights sequentially (gold/accent flash)
2. The corresponding compiled lines "appear" on the right Code tab
3. Slow enough for a human to follow (~50-80ms per Clear line)
4. After animation completes, Code tab shows final result as normal

### How to map Clear lines → compiled lines
The compiler already emits `// clear:N` markers in compiled output. These tell us exactly which Clear line produced each section of compiled code. The mapping algorithm:

```
Parse compiled output for `// clear:N` markers
Build map: { clearLine: [compiledLineStart, compiledLineEnd] }
Animate: for each clearLine in order, highlight it on left, reveal its compiled lines on right
```

### Implementation
- New function: `animateCompile(clearSource, compiledCode)`
- Uses `requestAnimationFrame` or `setInterval(fn, 60)` for smooth pacing
- Left panel: temporarily overlay a line-highlight div on the editor (CSS transition)
- Right panel: the CodeMirror view starts empty, lines are inserted incrementally
- After animation: switch to normal static Code tab view

### Phase 2 steps:
1. Parse `// clear:N` markers from compiled output into line mapping
2. Build animation function that highlights Clear editor line N
3. Build incremental reveal of compiled lines in Code tab
4. Wire to compile button — animation plays on successful compile
5. Add "Skip" button or click-to-skip for impatient users
6. Polish: easing, timing, flash color

### Edge cases:
- Very large programs (>200 lines): skip animation, show result
- Compile errors: no animation, show error panel
- User edits during animation: cancel animation

---

## Feature 3: Prominent Compile Stats

### What exists now
- `sb-compile-stats` element at line 414 of ide.html
- Populated correctly: `${clearLines} → ${codeLines} lines · ${elapsed}ms`
- But: hidden by default, small text, buried between status bar items

### What Russell wants
"Move it up here cause it's cool and I want to see it." — make it visually prominent, not a footnote.

### Implementation
- Move stats display to the **toolbar area** (near the Compile button) or to a **banner below the toolbar**
- Style: accent-colored, slightly larger font, with a subtle animation on compile
- Format: `24 lines → 187 lines · 12ms` with a right-arrow icon
- Flash animation on compile: stats briefly glow/pulse when values change

### Phase 3 steps:
1. Add a stats display element in the toolbar or below it
2. Style with accent color, larger font
3. Add pulse animation on compile
4. Keep the status bar version too (redundancy is fine)
5. Add test: verify `sb-compile-stats` is populated after compile

---

## Files to Modify

| File | What changes |
|------|-------------|
| `playground/ide.html` | Code tab CodeMirror, animation function, stats display |
| `playground/ide.html` CSS section | Animation keyframes, stats styling |

No compiler changes. No test changes (except the stats test).

## TDD Cycles

### Cycle 1: Code tab with JS highlighting
- Import `javascript` from bundle
- Replace `showCompiled()` with CodeMirror + `javascript()` extension
- Add output type sub-tabs (HTML/JS/Python)
- Verify: load a template, compile, Code tab shows highlighted JS

### Cycle 2: Compile stats prominence  
- Add stats banner below toolbar
- Style with accent color + pulse animation
- Add IDE test: compile → verify stats element has content
- Verify: compile → stats are visible and prominent

### Cycle 3: Compiler animation
- Parse `// clear:N` from compiled output
- Build `animateCompile()` with line-by-line reveal
- Wire to compile button
- Add skip mechanism
- Verify: compile → animation plays → final state matches non-animated

### Cycle 4: Polish
- Test all three features together
- Dark mode appearance
- Performance on large programs
- Edge cases (errors, fast re-compile, template switch during animation)

---

## Feature 4: Structured Runtime Errors (from requests.md)

### The problem
When a compiled app throws a runtime error (e.g. empty table, missing API key, bad data), the user sees a silent HTTP 500 with no body. No message, no hint, no Clear line reference. A non-developer has zero signal about what went wrong.

### What "perfect" looks like
Three surfaces, each for a different audience:

1. **API response (JSON):** `{ error: "Database read failed", hint: "Tasks table may be empty", code: "DB_READ_ERROR" }`
2. **Terminal (structured log):** `[Runtime Error] GET /api/tasks → DB_READ_ERROR · Line: tasks = get all Tasks`
3. **Preview panel (toast):** Friendly inline message for non-devs

### Known cases to handle
| Scenario | Current behavior | Should say |
|----------|-----------------|------------|
| `get all X` on empty table | 500, no body | "X table is empty" |
| `get all X` on undefined table | 500, no body | "X table doesn't exist" |
| `save data to X` missing required field | 500, no body | "Missing required field: name" |
| `ask claude` with no API key | 500, no body | "ANTHROPIC_API_KEY not set" |
| DB constraint violation | 500, no body | "Unique constraint failed on email" |

### Implementation
The compiler already wraps CRUD operations in `_clearTry()`. That wrapper catches errors but doesn't produce structured output. Fix: make `_clearTry` return `{ error, hint, code, clearLine }` and have the endpoint handler format it properly.

### Phase 4 steps:
1. Update `_clearTry` wrapper in compiler.js to produce structured error objects
2. Update endpoint compilation to catch structured errors and send proper JSON responses
3. Add `_clearError` formatting for terminal output (already partially exists)
4. Test: empty table → structured 200/404 instead of 500

---

## Feature 5: Python Syntax Highlighting

The Code tab needs Python highlighting when viewing Python backend output. The CodeMirror bundle may not include a Python mode, so we may need a basic `StreamLanguage` tokenizer for Python (comments=#, strings, keywords like def/class/import/return/if/else/for/in/async/await).

### Phase 5 steps:
1. Check if Python mode exists in bundle
2. If not, create a minimal StreamLanguage Python tokenizer
3. Detect output language and switch CodeMirror extension accordingly
4. Test with `build for python backend` template

---

## Feature 6: Compile Tool Returns Output Even on Errors (from requests.md)

### The problem
When compilation has errors, the `compile` tool returns only errors — no compiled JS. Meph can't inspect the generated code to debug issues like `refresh page → console.log(refresh)`. The agent is blind exactly when it needs to see the output most.

### The fix
Option B from the request: add a `force` mode that compiles past errors and always returns the output. The compiler already generates output even with warnings — just don't suppress it.

### Implementation
1. In `playground/server.js` compile handler: always include `serverJS`, `javascript`, `html` in the response, even when `errors.length > 0`
2. Add a `forceOutput: true` flag in the response when errors exist
3. In `compileProgram()` in `index.js`: check if errors are warnings-only vs hard errors. Warnings should never block output.

### Phase 6 steps:
1. Read the compile tool handler in server.js
2. Change it to always return compiled output alongside errors
3. Test: compile code with warnings → verify both errors and JS are returned
4. Test: Meph can read compiled output to diagnose bad code generation

---

## Feature 7: SVG Diagrams Rendering in Chat

### The problem
When Meph returns SVG diagrams (e.g. architecture diagrams, flowcharts), the chat panel shows raw SVG markup instead of rendering it visually.

### The fix
In the chat message renderer (`renderMsgInner`), detect SVG blocks in assistant responses and render them as inline `<img>` or directly as DOM elements instead of escaping them as text.

### Implementation
1. In `renderMsgInner()`: detect `<svg` in assistant message content
2. Wrap SVG in a sanitized container (strip scripts, event handlers)
3. Render as inline element with proper sizing
4. Alternative: detect ```svg code blocks in markdown and render those

### Phase 7 steps:
1. Find `renderMsgInner` in ide.html
2. Add SVG detection and rendering in the markdown→HTML pipeline
3. Sanitize: strip `onload`, `onclick`, `<script>` from SVG
4. Test: ask Meph to draw a diagram → verify it renders visually

---

---

## Open Compiler Requests (from requests.md — need compiler work, separate session)

### Request: `post to` sends entire `_state` instead of form fields only
- `body: JSON.stringify(_state)` sends all state, not scoped fields
- Needs: compiler tracks which inputs belong to which section/page and scopes the POST body

### Request: `post to` in button handler generates broken JS  
- Parser crash at line 2033, compiled output is `let result = post_to;`
- Needs: parser fix for `post to '/path' with variable` inside button blocks

### Request: `ask agent 'X'` from inside an endpoint
- `ask agent 'DigestAgent' with data` treats `agent` as a variable name
- Needs: parser to recognize `ask agent 'Name'` as RUN_AGENT invocation

---

## Execution Order

### Batch 1 — Ship today (IDE/server, no compiler changes):
1. ~~Feature 3: Compile stats badge~~ ✅ SHIPPED
2. Feature 1: Code tab JS/Python highlighting
3. Feature 5: Python StreamLanguage tokenizer
4. Feature 6: Compile tool returns output even on errors

### Batch 2 — Separate session (compiler + complex UI):
5. Feature 4: Structured runtime errors (`_clearTry` upgrade)
6. Feature 2: Compiler animation
7. Feature 7: SVG rendering in chat
8. Fix `post to` bugs (requests 4 + 6)
9. Fix `ask agent` from endpoint (request 7)

---

## Tech Debt Found
- **Minor:** The old `#preview-content pre .cl` CSS (lines 289-291) for the pre-based code display is now dead code since we're using CodeMirror. Remove it in the cleanup phase.
- **Minor:** `showCompiled()` currently concatenates all output types into one string. The sub-tab approach needs them separate.
