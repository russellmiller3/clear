# Compiler & Runtime Requests

## Request Template
```
## Request: [short name]
**App:** [description]
**What I needed:** [one sentence]
**Proposed syntax:**
\`\`\`clear
[Clear lines you wish existed]
\`\`\`
**Workaround used:** [what you did instead, or "none"]
**Error hit:** [exact error, or "no error but feature missing"]
**Impact:** [low / medium / high]
```

---

## Request: `_revive is not defined` runtime crash on GET endpoint with table
**Priority:** CRITICAL
**App:** Basic full-stack CRUD app (Tasks table, GET /api/tasks)
**What I needed:** `get all Tasks` to return the records as JSON without crashing
**Proposed syntax:**
```clear
when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks
```
**Workaround used:** None found — endpoint is completely broken
**Error hit:** `500 { error: 'Something went wrong', hint: '_revive is not defined' }`
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

create a Tasks table:
  title, required
  done, default false

when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks
```
Run app → GET /api/tasks → 500 `_revive is not defined`
The compiled serverJS calls `(await db.findAll('tasks')).map(_revive)` but `_revive` is never defined anywhere in the compiled output. This is a compiler codegen bug — it emits a reference to a function that doesn't exist.
**Impact:** CRITICAL — every GET endpoint using `get all [Table]` crashes at runtime. This breaks the most fundamental CRUD pattern in Clear.

---

## Request: `_revive is not defined` also crashes login endpoint
**Priority:** CRITICAL
**App:** Any app using built-in auth (login endpoint)
**What I needed:** `POST /auth/login` to look up the user and return a token
**Proposed syntax:**
```clear
build for web and javascript backend
database is local memory

allow sign up and login
```
**Workaround used:** None — login is completely broken
**Error hit:** `500 { error: 'Something went wrong', hint: '_revive is not defined' }`
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

allow sign up and login

when user calls GET /api/profile:
  requires auth
  send back current user
```
Run app → POST /auth/register (succeeds) → POST /auth/login → 500 `_revive is not defined`
Same root cause as the GET endpoint crash — the login handler queries the Users table and calls `.map(_revive)` on the result, but `_revive` is never defined.
**Impact:** CRITICAL — auth is completely broken. No app can log users in. This is a showstopper for any app using `allow sign up and login`.

---

## Request: `display [var] as list` compiles to a static card, not a list
**Priority:** HIGH
**App:** Any app displaying query results as a list
**What I needed:** `display tasks as list` to render each item in an `<ul><li>` or similar list structure
**Proposed syntax:**
```clear
display tasks as list
```
**Workaround used:** None found
**Error hit:** No error. Compiles to a static card div with a `<p>` tag that calls `String(tasks)` — renders `[object Object],[object Object]` or similar stringified output instead of a real list.
**Steps to reproduce:**
```clear
build for web and javascript backend
database is local memory

create a Tasks table:
  title, required

when user calls GET /api/tasks:
  tasks = get all Tasks
  send back tasks

page 'Tasks' at '/':
  on page load get tasks from '/api/tasks'
  display tasks as list
```
Compile → inspect HTML → see static card div, not a list. No `<ul>`, no `<li>`, no loop over items.
**Impact:** HIGH — `display as list` is a documented feature. Every app that tries to show query results as a list gets a broken static widget instead.

---

## Request: Preview panel renders blank even for valid HTML builds
**Priority:** CRITICAL
**App:** Any web build
**What I needed:** The preview panel to show rendered HTML output
**Proposed syntax:** N/A — this is a runtime/tooling bug, not a language gap
**Workaround used:** None — preview is completely unusable
**Error hit:** No error thrown. HTML compiles correctly with valid tags (h1, p, div etc) but preview panel renders blank white. Confirmed via screenshot_output tool.
**Steps to reproduce:**
```clear
build for web
page 'Test' at '/':
  heading 'Hello World'
  text 'This is a paragraph'
```
Compile → Run → screenshot_output shows blank white panel.
**Impact:** CRITICAL — the primary feedback loop for UI development is broken. Every web build appears to produce nothing.

---

## Request: String concatenation with variables drops the variable
**Priority:** HIGH
**App:** Any web build using dynamic text
**What I needed:** `text 'Price is: ' + price` to render the value of price inline
**Proposed syntax:**
```clear
price = 42
text 'Price is: ' + price
```
**Workaround used:** None found
**Error hit:** No error thrown. Compiles silently. But rendered HTML contains only the static string "Price is: " — the variable value is dropped entirely.
**Steps to reproduce:**
```clear
build for web
page 'Test' at '/':
  price = 42
  text 'Price is: ' + price
```
Expected: "Price is: 42" in the DOM. Actual: "Price is: " only.
**Impact:** HIGH — dynamic text rendering is broken for all string+variable concatenation.

---

## Request: Conditional blocks compile with empty JS bodies
**Priority:** CRITICAL
**App:** Any app using if/else logic on the frontend
**What I needed:** if/else blocks to actually toggle DOM element visibility
**Proposed syntax:**
```clear
score = 75
if score is greater than 90:
  text 'Excellent'
else if score is greater than 70:
  text 'Good'
else:
  text 'Keep trying'
```
**Workaround used:** None — conditionals are completely broken
**Error hit:** No error thrown. Compiles to JS with empty if/else bodies:
```javascript
if (score > 90) {
  // EMPTY
} else {
  if (score > 70) {
    // EMPTY
  }
}
```
The HTML has divs pre-rendered with display:none but the JS never calls .style.display = 'block'. Conditionals are dead code.
**Steps to reproduce:** Write any page with an if/else block. Compile. Inspect compiled JS — bodies are empty.
**Impact:** CRITICAL — every app using conditional display logic is broken.

---

## Request: `show alert` compiles to console.log(alert) instead of alert()
**Priority:** HIGH
**App:** Any app using form submission feedback
**What I needed:** `show alert 'Form submitted'` to trigger a browser alert dialog
**Proposed syntax:**
```clear
show alert 'Form submitted'
```
**Workaround used:** None found
**Error hit:** No error thrown. Compiles to `console.log(alert)` — logs the native alert function object to console instead of calling it. Nothing visible happens.
**Steps to reproduce:**
```clear
build for web
page 'Test' at '/':
  button 'Submit':
    show alert 'Done'
```
Compile → inspect JS → see `console.log(alert)` instead of `alert('Done')`.
**Impact:** HIGH — user feedback on actions is broken.

---

## Request: `text` keyword inside `for each` loop not recognized as display keyword
**Priority:** HIGH
**App:** Any app rendering lists dynamically
**What I needed:** `text` to work as a display keyword inside loop bodies
**Proposed syntax:**
```clear
for each item in items:
  text item
```
**Workaround used:** None found
**Error hit:** Compiler error — treats `text` as an undefined variable inside the loop body. Says "Define it on an earlier line" which is a nonsensical error for a built-in display keyword.
**Steps to reproduce:**
```clear
build for web
page 'Test' at '/':
  items = ['apple', 'banana', 'cherry']
  for each item in items:
    text item
```
**Impact:** HIGH — dynamic list rendering is broken.

---

## Request: Expose compiled JS output in compile tool response even on error
**Priority:** HIGH  
**App:** All apps — this is an agent tooling gap
**What I needed:** The compile tool to return the compiled JS/HTML source alongside errors, even when the build fails
**Proposed syntax:** N/A — tooling request
**Workaround used:** Add fake `requires auth` to force a clean build path, then strip after. Wastes 2-3 round trips per bug.
**Error hit:** compile tool returns errors + metadata flags but zero compiled source. To see compiled output I need a clean build. But broken code is exactly when I most need to inspect the output.
**The catch-22:**
```
Code is broken
→ need compiled output to diagnose
→ build refuses to emit on errors  
→ can't see what went wrong
→ debugging blind
```
**Proposed fix options:**
- A: compile tool returns partial compiled source alongside errors (best — output already exists in pipeline, just not exposed)
- B: --force CLI flag emits full output regardless of errors, flagged as unsafe/partial
- C: compile({ partial: true }) option
**Impact:** HIGH — every debugging session is longer than it needs to be. I'm flying blind on broken code.

---

## Request: `refresh page` compiles to broken JS
**Priority:** HIGH
**App:** Any app using page refresh after action
**What I needed:** `refresh page` to call `window.location.reload()`
**Proposed syntax:**
```clear
refresh page
```
**Workaround used:** None
**Error hit:** Compiles to mangled JS — `refresh` treated as undefined variable. `window.location.reload()` never called.
**Impact:** HIGH

---

## Request: Agent affordance — `init --template NAME` for scaffolding
**Priority:** MEDIUM
**App:** All new apps
**What I needed:** `node cli/clear.js init --template todos` or `--template auth-app` to scaffold real starter apps
**Proposed syntax:** CLI flag, not Clear syntax
**Workaround used:** Copy examples from USER-GUIDE.md manually
**Error hit:** `init` only produces a bare hello-world scaffold. No template library.
**Impact:** MEDIUM — slows down app creation, especially for common patterns like CRUD apps, auth flows, dashboards.

---

## Request: Agent affordance — compile tool should return compiled source on success
**Priority:** MEDIUM
**App:** All apps
**What I needed:** When compile succeeds, return the full compiled JS/HTML so I can inspect it without needing a separate build step
**Proposed syntax:** N/A — tooling request
**Workaround used:** run_app then read_terminal to infer behavior
**Error hit:** No error — feature just missing. compile() returns errors, warnings, flags (hasHTML, hasServerJS) but never the actual compiled text.
**Impact:** MEDIUM — adds round trips to every debugging session.

---

## Request: `write_file` needs append/insert/replace modes — replace with `edit_file`
**Priority:** HIGH
**App:** All apps — this is an agent tooling gap
**What I needed:** The ability to append to an existing file without reading and rewriting the whole thing
**Proposed syntax:** N/A — tooling request

**The problem:**
`write_file` is a full overwrite. Always. There is no append mode. This means every time the agent needs to log a new bug to requests.md, it must:
1. Read the entire file
2. Hold the full content in context
3. Construct old content + new content
4. Write the whole thing back

This is fragile as hell. During this testing session it wiped requests.md twice — once during a network error (write started, didn't finish), once when the content parameter got mangled mid-write. All previously filed bugs were lost both times.

**The analogy:** Right now the agent has a Sharpie and a blank piece of paper. It needs a notebook with pages.

**Proposed replacement — `edit_file` tool with action modes:**
```
edit_file(filename, action='append', content='...')   → add to end (most common for logs)
edit_file(filename, action='insert', line=42, content='...')  → add at line N
edit_file(filename, action='replace', find='...', replace='...')  → find/replace
edit_file(filename, action='overwrite', content='...')  → current behavior, now explicit
edit_file(filename, action='read')  → read current content
```

**The `append` action alone would have prevented every accidental wipe in this session.**

**Workaround used:** Read full file → reconstruct → write entire file back. Fragile. Caused two data loss incidents in one session.

**Steps to reproduce the data loss:**
1. Start a long testing session filing bugs to requests.md
2. Hit a network error mid-write
3. Retry the write — but now content param is constructed from stale memory
4. Old entries are silently overwritten with incomplete content
5. Data gone, no warning, no diff, no undo

**Impact:** HIGH — this is the primary mechanism for the agent to communicate findings to the compiler team. Data loss here means bugs go unreported. The append-mode gap is a systemic reliability issue, not a one-off mistake.
