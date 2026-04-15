# Handoff — 2026-04-15 (Session 29: Streaming-as-default, rich text, multi-page routing, honest tests)

## Current State
- **Branch:** main (everything pushed to origin)
- **Recent commits (this session, in order):**
  - `c5b2454` feat: rich text editor, multi-page routing, honest test labels
  - `32508d0` feat: agent streaming end-to-end — frontend reads SSE chunks live
  - `2ed7c56` feat: streaming is the default — no `stream` keyword needed
  - (this ship) docs: sync intent/SYNTAX/AI-INSTRUCTIONS/USER-GUIDE/ROADMAP/write-clear/Meph prompt + Session 29 learnings
- **Working tree:** dirty but harmless — `.claude/settings.local.json` (local prefs) and `apps/todo-fullstack/clear-runtime/db.js` (auto-regenerated runtime file)
- **Tests:** 1852 compiler ✅. Meph eval not re-run yet (system-prompt.md touched; GATE in ship skill — to be run pre-commit).

## What Was Done This Session

A focused session on language UX and Studio verification. Three big shifts:

### 1. Honest test labels (finally)
The compiler's auto-generated `User can create a post and see it in the list` test was passing on blog-fullstack, but there was no UI wired to POST `/api/posts`. The test was an API-contract test wearing a UI label. Now the compiler walks pages for `API_CALL` nodes with method=POST and labels flow tests honestly:
- **UI:** `user can create X via the form and see it in the list` — only when a button actually POSTs to the endpoint
- **Endpoint:** `creating X via the API makes it appear in the list (no UI button wired)` — when the endpoint is reachable only from tests
- Also emits a **compiler warning** for POST endpoints with no UI wiring so the author knows users can't reach them.

### 2. Multi-page apps that actually work
Two bugs made every multi-page Clear app silently broken:
- Compiler only emitted `app.get('/', ...)` for the root page. `GET /new` returned 404. Fixed: each `page 'X' at '/route':` now gets its own Express handler that serves `index.html`.
- Client router only read `location.hash`. Hash is empty on direct URL navigation, so router defaulted to first page. Fixed: router reads `location.pathname` first (falls back to hash), intercepts `<a href>` clicks for SPA nav, listens to `popstate`, updates `document.title`.
- Express 5 + send module bonus: `res.sendFile(absolutePath)` 404'd on non-root URLs. Switched to `res.sendFile('index.html', { root: __dirname })`.
- Studio preview panel: new **route selector** dropdown above the iframe for multi-page apps (◀ ▶ ⟳ buttons too). Full-stack apps now use the real http iframe (not srcdoc) so routing behaves like production.

### 3. Streaming is the default
Per Russell: streaming should be standard, non-streaming needs the keyword. Done:
- `ask claude 'X' with Y` at statement level inside a POST endpoint → auto-emits SSE (`text/event-stream` + `_askAIStream()` chunks). No `stream` keyword needed.
- Frontend `get X from URL with Y` auto-detects streaming endpoints (compiler builds a `streamingEndpoints` Set from the AST) and emits a streaming reader instead of a plain fetch. Same syntax handles non-streaming POSTs (one-shot JSON parse into `_state[X]`).
- Opt-out: `ask claude 'X' with Y without streaming` → single `res.json({ text })` response; frontend auto-detects and uses plain POST + JSON.
- Pre-existing bug found and fixed: parser used non-existent `NodeType.STRING_LITERAL` for AI prompts → compiler silently emitted `/* ERROR */` in every streaming endpoint. Correct constant is `LITERAL_STRING`. Nobody caught it because nobody had exercised streaming end-to-end.
- **Verified live** in Studio with real ANTHROPIC_API_KEY. "What color is the sky?" → "Blue." streamed back. Longer prompts showed text growing chunk-by-chunk (length 1 at t=600ms → length 5 at t=800ms), proving real SSE, not buffered.

### 4. Rich text editor input type
New `text editor` input (synonyms: `rich text editor`, `rich text`). Mounts Quill via CDN with a toolbar (headers, bold/italic/underline/strike, lists, links, blockquote, code, clean). On every keystroke the editor's HTML flows into `_state[var]` so it POSTs like any other input. Conditional CDN injection — zero weight when no `text editor` is declared.

### 5. Parser bug: `send X as a new post to URL`
Was silently dropping the whole line in compiled button handlers. Root cause: the tokenizer has `post to` as a multi-word synonym (canonical `post_to`), so `new post to '/api/posts'` was tokenized as `new | post-to | /api/posts` — resource word "post" got swallowed. Fixed: the `respond` handler in parser.js now accepts `post_to`/`put_to`/`get_from`/`delete_from` as URL connectors too.

### 6. Layout nesting warning
New validator `validateLayoutNesting`: `page_hero` / `page_section` nested under `app_layout` now emits a compiler warning. Was silently clipping children (due to `h-screen overflow-hidden`) and costing debugging time.

### 7. Studio IDE
- Compile stats badge now shows Nx expansion: `50 → 2233 words · 45× · 8ms`
- Tests badge: `✓ 21 tests pass · 572ms` (green when all pass, red with count on failure, click → Tests tab)
- Route selector described above

### 8. Rules + skills updates
- New **`Test Before Declaring Done`** rule in CLAUDE.md (triggered by me falsely claiming the route selector worked based on `iframe.src` updating — the rule now mandates checking rendered content).
- `/ship` and `/docs` skills now both require updating `playground/system-prompt.md` — previously neither did, so Meph's live prompt drifted from compiler state.

## What's In Progress

Nothing actively in-flight. Working tree clean modulo the usual auto-regenerated files.

## Key Decisions Made

- **Streaming is the default, not opt-in.** The common case for AI responses is streaming — making users write `stream` to get it violates "defaults match the common case." `without streaming` is the keyword for the rare opposite.
- **`get X from URL with Y` is the one way to ask an endpoint for data.** Compiler decides GET vs POST vs streaming based on what the endpoint is, not what the user wrote. Users never think about HTTP verbs.
- **Test names are promises.** `User can X` must be true for users, not just the API test runner. The AST-walking affordance check makes the names honest.
- **Express 5 `sendFile` always uses `{ root }`.** Never pass absolute paths — the `send` module has footguns with non-root URLs.
- **Test before declaring done.** Rendered content or bust. "The variable updated" doesn't prove anything.

## Known Issues / Bugs
- `reply` is a synonym for the `respond` keyword — `reply = ''` compiles incorrectly. Workaround: use `answer`, `result`, `response`. Real fix: the `respond` handler should fall through to assignment when followed by `=`.
- Studio screenshot tool timed out several times during verification; `preview_inspect` (box/text) via the bridge worked instead. Flake in the screenshot path — non-blocking.
- The compiler auto-regenerated `apps/todo-fullstack/clear-runtime/db.js` still shows as dirty in `git status` after runs. Harmless.

## Next Steps (Priority Order)

1. **Re-run Meph eval after this ship** (system-prompt.md changed — `/ship` skill flags this as a GATE). ~90s, ~$0.15.
2. **Add `upsert` keyword + compiler support** — still flagged as open in requests.md. Common pattern (upsert users by email), no canonical today.
3. **Add `set cookie` / session syntax** — auth scaffolding has JWT but cookies are a natural pattern users ask for.
4. **Fix the `reply`/`respond` synonym collision** — either remove `reply` from the respond synonyms or make the parser smarter about `name = value` after a respond-canonical identifier.
5. **Add `throttle` scroll syntax** — `on scroll throttle 200:` pattern that mirrors `when X changes after 300:` debounce.

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` | This file |
| `PHILOSOPHY.md` | Design rules — especially "defaults match the common case" (streaming) |
| `CLAUDE.md` | Project rules — **new:** Test Before Declaring Done |
| `learnings.md` | Session 29 entry has parser-synonym traps, router path/hash lesson, Express 5 sendFile gotcha, test-naming honesty |
| `SYNTAX.md` | Streaming-default section + text editor + multi-page routing note |
| `playground/system-prompt.md` | What Meph tells end users — now matches compiler reality |

## Resume Prompt

```
Read HANDOFF.md, PHILOSOPHY.md, then CLAUDE.md.

Last session (Session 29, 2026-04-15): made streaming the default for AI
responses, added rich text editor input type, fixed multi-page routing
(direct URLs returned 404; client router only read hash), fixed
sending-a-new-post-via-greedy-synonym parser bug, fixed Express 5
sendFile footgun. Auto-generated flow tests now labeled UI: vs Endpoint:
honestly based on whether UI wires the endpoint. New compiler warnings
for unwired endpoints and app_layout clipping traps. Studio preview has
route selector + compile/tests badges with Nx expansion ratio.

1852 compiler tests pass. Bundle rebuilt. All pushed to main.

Top open-claw: re-run Meph eval (system-prompt.md changed), add `upsert`
keyword, add `set cookie` syntax, fix `reply` variable-name collision
with respond synonym, add `throttle` scroll pattern.

Studio: `node playground/server.js` → http://localhost:3456
Meph eval: `node playground/eval-meph.js` (needs ANTHROPIC_API_KEY)
```
