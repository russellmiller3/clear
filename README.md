# Clear

A programming language designed for AI to write and humans to read.

Write once in Clear. Compile to JavaScript, Python, or both.
The compiler gets smarter every time you build something.

## Quick Start

```bash
# Build a Clear program
node cli/clear.js build app.clear --out dist/

# Run it
cd dist/ && npm install express && node server.js

# Run auto-generated E2E tests
node test.js
```

## What It Looks Like

```clear
build for web and javascript backend

# Database
database is local memory
create a Todos table:
  todo, required
  completed, default false
  created_at_date, auto

# Backend
allow cross-origin requests
log every request

when user calls GET /api/todos:
  all_todos = get all Todos
  send back all_todos

when user calls POST /api/todos sending post_data:
  validate post_data:
    todo is text, required, min 1, max 500
  new_todo = save post_data as new Todo
  send back new_todo with success message

when user calls DELETE /api/todos/:id:
  requires auth
  delete the Todo with this id
  send back 'deleted' with success message

# Frontend
page 'Todo App':
  on page load get todos from '/api/todos'
  heading 'Todos'
  'What needs to be done?' is a text input saved as a todo
  button 'Add':
    send todo as a new todo to '/api/todos'
    get todos from '/api/todos'
    todo is ''
  button 'Refresh':
    get todos from '/api/todos'
  display todos as table showing todo, completed
```

37 lines. Full-stack app. Backend API with validation, auth, and CRUD.
Frontend with inputs, buttons, and a live data table. Compiles to
Express + DaisyUI HTML + external CSS. Auto-generates E2E tests.

## What It Compiles To

| File | What |
|------|------|
| `server.js` | Express with validation, auth, CORS, logging, graceful shutdown |
| `index.html` | Self-contained DaisyUI page (CSS inlined, JS embedded, one file) |
| `test.js` | Auto-generated E2E tests from your endpoints |
| `clear-runtime/` | In-memory DB, JWT auth, rate limiting |

## Features

### Core Language
Variables, math, strings, functions, loops, conditionals, pattern matching,
objects, lists, maps, error handling, modules, comments.

### Web Frontend
Pages, text/number/checkbox/dropdown inputs, buttons with actions,
sections with layout, components with slots, conditional UI, multi-page routing,
on-page-load data fetching, reactive table display with column whitelist.

### Backend API
REST endpoints (GET/POST/PUT/DELETE), input validation with declarative rules,
auth guards, role-based access control, rate limiting, request logging, CORS,
webhooks with HMAC verification, OAuth flows, Stripe checkout, background jobs.

### Layout
Inline layout modifiers declare page structure right on the section:
```clear
section 'App' full height, side by side:
  section 'Sidebar' dark background, 280px wide, scrollable:
  section 'Main' fills remaining space, stacked:
    section 'Header' sticky at top, with shadow:
    section 'Content' scrollable, padded:
```

### Interactive Patterns
```clear
section 'Views' as tabs:             # tab switching
section 'FAQ' collapsible:           # expand/collapse
section 'Help' slides in from right: # slide-out panel
section 'Confirm' as modal:          # dialog overlay
```

### Data & Automation
CSV load/save/filter/sort/group, file I/O, JSON, regex, dates,
web scraping, PDF generation, machine learning, parallel execution,
multi-line strings with interpolation.

### Security (Compile-Time)
The compiler blocks insecure code:
- DELETE/PUT without `requires auth` -- error, won't compile
- GET returning all records from a `user_id` table without filtering -- error
- Validation field name typos -- warning with "did you mean?"
- Frontend calling URLs no backend serves -- warning

### Themes
```clear
theme 'midnight'   # dark (Linear-style)
theme 'ivory'      # light (Stripe-style, default)
theme 'nova'       # warm (creative)
```

### Design System & Presets
DaisyUI via CDN. Built-in presets for landing pages and app layouts:
```clear
# Landing page
section 'Hero' with style page_hero:
section 'Features' with style section_light:

# Dashboard layout
section 'Layout' with style app_layout:
  section 'Nav' with style app_sidebar:
  section 'Right' with style app_main:
    section 'Top' with style app_header:
    section 'Body' with style app_content:
      section 'Card' with style app_card:
```

### AI Agents
```clear
agent 'Lead Scorer' receiving lead:
  check lead's company is not missing, otherwise error 'Company required'
  set result to ask ai 'Rate 1-10 for enterprise potential' with lead returning:
    score (number)
    reasoning
    qualified (boolean)
  lead's score is result's score
  send back lead
```

Agents chain: `set scored to call 'Scorer' with data`. Structured output
via `returning:` block. BYOK via `CLEAR_AI_KEY` env var.

### Scheduled Agents
```clear
agent 'Cleanup' runs every 1 hour:
  remove old Sessions
  send back 'cleaned'
```

### Browser Storage
```clear
restore settings          # load from localStorage on page load
button 'Save':
  store settings          # persist to localStorage
```

### Multi-File Apps
```clear
# Namespaced (default) -- access via helpers's func()
use 'helpers'
result = helpers's total(items)

# Selective -- inline only what you need
use total, average from 'helpers'
result = total(items)

# Inline everything (legacy)
use everything from 'helpers'

# External JS library
use 'charts' from './chart-lib.js'
set graph to charts's render(data)

# Import components from another file
use Card from 'components'
show Card('Hello')
```

Circular dependencies detected at compile time.

### Raw JavaScript (Escape Hatch)
```clear
button 'Custom':
  script:
    document.title = 'Changed by raw JS';
```

### String Interpolation
```clear
message is 'Hello, {name}! You have {count} items.'
```

### Database Declaration
```clear
database is local memory                      # default
database is PostgreSQL at env('DATABASE_URL')  # production
```

## Build Output

The compiler runs 983 internal tests before every build. If any test fails,
the build is blocked.

```bash
# Build with test gate (default)
node cli/clear.js build app.clear --out dist/

# Build without test gate
node cli/clear.js build app.clear --out dist/ --no-test
```

The auto-generated `test.js` tests every endpoint:
- GET returns 200
- POST with valid data returns 201
- POST with no body returns 400
- POST with empty required field returns 400
- DELETE without auth returns 401
- GET after POST returns created records
- HTML page serves

Run with `node test.js` (server must be running on localhost:3000).

## Documentation

| Doc | What |
|-----|------|
| [SYNTAX.md](SYNTAX.md) | Complete syntax reference -- every feature with examples |
| [AI-STYLE-GUIDE.md](AI-STYLE-GUIDE.md) | How AI should write Clear code -- canonical forms and conventions |
| [PHILOSOPHY.md](PHILOSOPHY.md) | Why Clear exists, design rules, how it helps AI debug |
| [intent.md](intent.md) | All node types, compiler structure, synonym collisions |
| [ROADMAP.md](ROADMAP.md) | What's built, what's planned, capability matrix |

## Apps

| App | Lines | E2E | What |
|-----|-------|-----|------|
| [todo-v2](apps/todo-v2/) | 37 | 9/9 | The canonical full-stack example |
| [ecommerce-api](apps/ecommerce-api/) | 96 | 16/16 | Stripe checkout + webhooks + FK deps |
| [project-manager](apps/project-manager/) | 175 | 36/36 | 6 tables, deep FK chains, full-stack |
| [invoice-engine](apps/invoice-engine/) | 175 | 27/27 | Backend-only: status machine, business logic |
| [team-dashboard](apps/team-dashboard/) | 99 | -- | Midnight theme, app presets, sidebar layout |
| [dashboard-v2](apps/dashboard-v2/) | 95 | -- | Sidebar + sticky header + metric grid |
| [interactive](apps/interactive/) | 44 | -- | Tabs, collapsible, slide-out, modal |
| [lead-scorer](apps/lead-scorer/) | 32 | 6/6 | AI agent with structured output |
| [hiring-pipeline](apps/hiring-pipeline/) | 45 | 6/6 | 3-agent chain: screen, score, summarize |
| [content-moderator](apps/content-moderator/) | 29 | 6/6 | AI content classification |
| [cast-evaluator](apps/cast-evaluator/) | 604 | 16/16 | Recursive tree-walking interpreter |
| [blog-api](apps/blog-api/) | 90 | -- | Auth + RBAC + email validation |
| [playground](../playground/) | 130 | -- | Self-hosted playground (imports own compiler) |

## How It Works

```
main.clear          -- you write this (or AI writes it)
     |
     v
  [parser]           -- tokenize + parse to AST
     |
     v
  [validator]        -- security checks, type checks, cross-references
     |
     v
  [compiler]         -- AST to JS/Python/HTML/CSS
     |
     v
server.js            -- Express backend
index.html           -- DaisyUI frontend
style.css            -- tree-shaken CSS
test.js              -- auto-generated E2E tests
clear-runtime/       -- DB + auth + rate limit
```

The compiler is a pure function: same input always produces the same output.
No AI in the compile step. Deterministic.
