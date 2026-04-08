# Plan: Local Playground — IDE + Compile + Run + Claude Agent

**Branch:** `feature/local-playground`
**Date:** 2026-04-08
**Red-teamed:** 2026-04-08

---

## 🎯 WHAT WE'RE BUILDING

A local Clear IDE that runs as `node playground/server.js` → opens `localhost:3456`.
Claude is a **full agent** — not a chatbot. It reads/writes the editor, runs CLI commands,
tests API endpoints, and iterates until the app works.

```
┌──────────────────────────────────────────────────────────────┐
│  Templates ▾     main.clear          [Compile ✓] [Run ▶]    │
├──────────────┬──────────────────┬────────────────────────────┤
│              │                  │  Claude Agent              │
│   Editor     │   Preview        │                            │
│  (CodeMirror │  (iframe for     │  Can: edit code, compile,  │
│   6 with     │   web apps,      │  run CLI, hit endpoints,   │
│   Clear      │   run server     │  see terminal output,      │
│   syntax)    │   output for     │  iterate until it works    │
│              │   backend)       │                            │
│              │                  │  "Build a todo app"        │
│              │                  │  → writes, compiles, runs, │
│              │                  │    tests, delivers          │
├──────────────┴──────────────────┤                            │
│  Terminal / Errors              │                            │
│  $ clear check main.clear      │                            │
│  ✓ 0 errors, 2 warnings        │                            │
└─────────────────────────────────┴────────────────────────────┘
```

---

## 📐 ARCHITECTURE

### Server Endpoints

```
GET  /                             → ide.html
GET  /api/templates                → [{name, description}] from apps/
GET  /api/template/:name           → .clear source file
POST /api/compile                  → compileProgram(source) result
POST /api/run                      → compile + start child server, return {port}
POST /api/stop                     → kill child process
POST /api/exec                     → run shell command, return {stdout, stderr, code}
POST /api/fetch                    → proxy HTTP request to running app
POST /api/chat                     → Anthropic API with agent tools
```

### Claude's Agent Tools

Claude gets these tools in the Anthropic API call. Each maps to a server endpoint:

| Tool | What It Does | Maps To |
|------|-------------|---------|
| `edit_code` | Read or replace the editor content | `POST /api/editor` |
| `run_command` | Execute a CLI command (clear build, clear check, clear test, etc.) | `POST /api/exec` |
| `compile` | Compile current editor content | `POST /api/compile` |
| `run_app` | Start the compiled app server | `POST /api/run` |
| `stop_app` | Stop the running app | `POST /api/stop` |
| `http_request` | Make HTTP request to the running app (GET, POST, etc.) | `POST /api/fetch` |

### System Prompt

Not tool-use for syntax lookup — Claude just gets the key syntax sections directly in the system prompt. ~2k tokens covering:
- Core rules (= for numbers, is for strings, single quotes, possessive access)
- File structure (Database > Backend > Frontend sections)
- All feature categories (agents, workflows, policies, inputs, CRUD, etc.)
- Key examples (agent, workflow, endpoint, page)

The full SYNTAX.md is ~4k tokens — include the most-used sections directly. Claude already knows how to write Clear from the system prompt; it doesn't need to fetch docs mid-conversation.

### Agent Loop

```
User: "build me a todo app with auth"
  ↓
POST /api/chat {messages, apiKey, editorContent}
  ↓
Claude (with tools):
  1. Calls edit_code({code: "build for web and javascript backend\n..."})
  2. Calls run_command({command: "node cli/clear.js check /tmp/main.clear"})
  3. Sees errors → calls edit_code() with fix
  4. Calls compile() → gets compiled output
  5. Calls run_app() → app starts on port 4001
  6. Calls http_request({method: "POST", url: "/api/todos", body: {todo: "test"}})
  7. Sees response → reports success
  ↓
Response streamed to chat panel with each step visible
```

---

## 📁 FILES

### New files:
| File | Purpose |
|------|---------|
| `playground/server.js` | Express server: all API endpoints + child process manager |
| `playground/ide.html` | Three-panel IDE: CodeMirror + preview/terminal + chat |

### Modified files:
| File | Change |
|------|--------|
| `ROADMAP.md` | Mark local playground as done |
| `CLAUDE.md` | Add playground instructions |

---

## 🔧 IMPLEMENTATION PHASES

### Phase 1: Server — compile + templates + exec

Create `playground/server.js` (ESM — `import` not `require`):

- **`POST /api/compile`** — takes `{source}`, returns `compileProgram(source)` result
- **`GET /api/templates`** — scans `apps/` dirs with `main.clear`, returns `[{name, description}]`
- **`GET /api/template/:name`** — returns `.clear` file contents
- **`POST /api/exec`** — runs a shell command (cwd = project root), returns `{stdout, stderr, exitCode}`
  - **Security:** whitelist commands starting with `node`, `clear`, `curl`, `ls`, `cat`
  - Timeout: 10 seconds max
- **`POST /api/fetch`** — proxies HTTP request to `localhost:{runningPort}` + path
- Static file serving for `ide.html`

**Test:**
```bash
node playground/server.js &
curl -s localhost:3456/api/templates | head -c 200
curl -s -X POST localhost:3456/api/compile -H 'Content-Type: application/json' \
  -d '{"source":"show 42"}'
curl -s -X POST localhost:3456/api/exec -H 'Content-Type: application/json' \
  -d '{"command":"node cli/clear.js check --json apps/todo-fullstack/main.clear"}'
```

### Phase 2: IDE frontend — editor + compile + preview + terminal

Create `playground/ide.html`:

- **Layout:** CSS grid: `grid-template-columns: 1fr 1fr 340px`
  - Left: CodeMirror editor + error panel below
  - Center: Preview (iframe) or Terminal output (toggle)
  - Right: Chat panel
- **CodeMirror 6** via esm.sh importmap (zero build step)
  - Clear syntax highlighting (keywords, strings, comments, numbers)
  - Line numbers, bracket matching
  - Auto-compile on change (debounced 500ms)
- **Template picker:** Dropdown fetches `/api/templates`, click loads source
- **Preview tab:** iframe with srcdoc (html + browserServer injection)
- **Terminal tab:** Shows compile output, CLI results, server logs
- **Error panel:** Below editor, click → jump to line
- **Status bar:** Compile status (✓/✗), running app port, error count

**Test:** Open browser, pick template, verify highlighting + compile + preview.

### Phase 3: Run server (child process management)

Add to `playground/server.js`:

- **`POST /api/run`** — takes compiled output from last compile:
  1. Write to `.playground-build/` with CJS `package.json`
  2. Copy `runtime/` files to `build/clear-runtime/`
  3. Kill previous child if running
  4. Spawn `node server.js` in build dir with auto-incrementing port
  5. Return `{port}` when server prints "running on port"
- **`POST /api/stop`** — kill child, clean up
- **Preview iframe** for web apps points to child port
- **Terminal** shows child stdout/stderr in real-time (via SSE or polling)

**Test:** Load todo-fullstack, click Run, verify app live at child port.

### Phase 4: Claude agent chat

Add to `playground/server.js`:

- **`POST /api/chat`** — Anthropic API with tool-use:
  - System prompt: Clear core rules + syntax overview (~2k tokens, inline)
  - Tools: `edit_code`, `run_command`, `compile`, `run_app`, `stop_app`, `http_request`
  - Multi-turn tool loop: call → tool_use → execute → feed result → repeat (max 10 iterations)
  - Stream text responses via SSE for real-time display

- **Tool implementations** (server-side, called when Claude uses a tool):
  - `edit_code({action: 'read'})` → return editor content (sent in request)
  - `edit_code({action: 'write', code: '...'})` → return `{applied: true}` + signal frontend
  - `run_command({command: '...'})` → exec with 10s timeout, return stdout/stderr
  - `compile()` → compileProgram on current editor content
  - `run_app()` → same as POST /api/run
  - `stop_app()` → same as POST /api/stop
  - `http_request({method, path, body})` → fetch to running app, return response

- **Frontend chat panel:**
  - API key input (localStorage)
  - Message list with Claude's text + tool-use steps shown inline
  - "Applied code" notifications when Claude edits
  - Auto-scroll, markdown rendering for code blocks

**Test:** Set API key, ask "write a hello world page", verify Claude writes code + compiles.

### Phase 5: Polish + ship

- Keyboard: Cmd+S = compile, Cmd+Enter = run, Cmd+K = focus chat
- Error click → jump to line in editor
- Template descriptions from first `#` comment
- Responsive: collapse chat below 1024px
- Auto-open browser on server start
- `.gitignore` the `.playground-build/` directory

---

## 🚨 EDGE CASES

| Scenario | Handling |
|----------|----------|
| No API key | Chat shows key input, compile/run/preview all work without it |
| Compile error | Preview keeps last good output, errors shown below editor |
| Run fails (port busy) | Auto-increment port, max 3 retries |
| Child crashes | Detect exit, show error in terminal, clean up |
| Shell command hangs | 10-second timeout, kill process |
| API key invalid | Anthropic returns 401 → show in chat |
| Claude tries dangerous command | Whitelist: only `node`, `clear`, `curl`, `ls`, `cat` allowed |
| Long Claude response | Stream via SSE, show incrementally |
| User types while Claude is editing | Claude's edit_code overwrites; user can undo (Cmd+Z) |
| esm.sh CDN down | Editor won't load; fallback message |
| No apps/ directory | Template list empty, editor starts with hello-world |

---

## 🧪 SUCCESS CRITERIA

- [ ] `node playground/server.js` starts, opens `http://localhost:3456`
- [ ] 43 templates load in dropdown
- [ ] CodeMirror editor with Clear syntax highlighting
- [ ] Auto-compile on edit (debounced)
- [ ] Errors with line numbers, clickable
- [ ] Preview renders web apps in iframe
- [ ] Run starts real Express server for full-stack apps
- [ ] Terminal shows compile output + server logs
- [ ] Claude can read/write editor, run CLI, hit endpoints
- [ ] Claude iterates: write → compile → fix errors → run → test → done
- [ ] API key persisted in localStorage
- [ ] Works offline (except chat)

---

## 📎 RESUME PROMPT

> Read `plans/plan-local-playground-04-08-2026.md`. Branch: `feature/local-playground`. Implement phases 1-5 in order. Server = `playground/server.js` (ESM, Express, imports compileProgram from ../index.js). Frontend = `playground/ide.html` (CodeMirror 6 via esm.sh importmap, three-panel CSS grid). Claude is a full agent with tools: edit_code, run_command, compile, run_app, stop_app, http_request. No build step. Test each phase with curl + manual browser checks.
