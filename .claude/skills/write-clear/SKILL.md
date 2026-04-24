---
name: write-clear
description: Write programs in the Clear language. Use when the user asks to write, build, or create something in Clear, or asks "how do I write X in Clear?", or says "write this in Clear".
---

# Write Clear Programs

**Purpose:** Write correct, idiomatic Clear programs following the AI Style Guide.

## What is Clear?

Clear is a programming language designed for AI to write and humans to read. You write `.clear` files that compile to JavaScript (Express + vanilla HTML) or Python (FastAPI). The human reads the Clear source -- never the compiled output.

## Before writing any Clear code

1. Read `clear/SYNTAX.md` -- the complete syntax reference
2. Read `clear/AI-INSTRUCTIONS.md` -- canonical forms and conventions
3. Skim `clear/PHILOSOPHY.md` -- design rules (one operation per line, no nesting, etc.)

## Core Rules

### File Structure (mandatory)
Every Clear program starts with a build target and uses section comments:
```
build for web and javascript backend

# Database
database is local memory
create a Todos table:
  todo, required
  completed, default false

# Backend
allow cross-origin requests
log every request

when user requests data from /api/todos:
  ...

# Frontend
page 'My App':
  ...
```

### Assignment Convention
- `=` for numbers and calculations: `price = 9.99`, `total = price + tax`
- `is` for strings and booleans: `name is 'Alice'`, `active is true`
- `=` for CRUD operations: `all_todos = get all Todos`

### One Operation Per Line
No nesting. Each line does one thing. Use named intermediate variables.
```
# BAD -- too much in one expression
result = avg(data.yield where data.temperature > 77)

# GOOD -- flat, one step per line
hot_yields = filter data where temperature is greater than 77
result = avg of hot_yields
```

### Possessive Access (not dot notation)
```
show person's name        # canonical
show person.name          # works but not canonical
```

### Single Quotes
```
name is 'Alice'           # canonical
name is "Alice"           # works but don't write this
```

### Input Elements
```
'What needs to be done?' is a text input saved as a todo
'How much?' is a number input saved as a price
'Notes' is a text area saved as a note            # plain multi-line
'Body' is a text editor saved as a body           # rich WYSIWYG (Quill)
'Color' is a dropdown with ['Red', 'Green', 'Blue']
'Gift Wrap' is a checkbox
'Resume' is a file input saved as a resume
```

Use `text editor` for long-form formatted content (blog posts, rich notes,
comments). It mounts a Quill editor via CDN with a toolbar (headers,
bold/italic/underline, lists, links, blockquote, code) and binds the
editor's HTML to `_state[var]` on every keystroke. Plain `text area` is
right for short multi-line plaintext.

### API Endpoints
```
when user requests data from /api/users:
  all_users = get all Users
  send back all_users

when user sends user_data to /api/users:
  requires login
  validate user_data:
    name is text, required, min 1, max 100
    email is text, required, matches email
  new_user = save user_data as new User
  send back new_user with success message

when user deletes user at /api/users/:id:
  requires login
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

### Frontend Data Flow
```
page 'My App':
  on page load get todos from '/api/todos'
  heading 'Todos'
  'Task' is a text input saved as a task
  button 'Add':
    send task as a new todo to '/api/todos'
    get todos from '/api/todos'
    task is ''
  display todos as table showing task, completed
```

### Chat Interface
```
on page load get messages from '/api/messages'
display messages as chat showing role, content
'Type your message...' is a text input saved as user_message
button 'Send':
  send user_message to '/api/chat'
  get messages from '/api/messages'
  user_message is ''
```
The compiler folds the input+button into the chat widget automatically. You get: message bubbles, markdown rendering, typing dots, Enter-to-send, New button, scroll-to-bottom — all built in. The `showing` clause maps role field first, content field second. If the agent has `stream response`, the chat auto-streams tokens in real-time (no extra code needed).

### Layout (inline modifiers)
```
section 'App' full height, side by side:
  section 'Sidebar' dark background, 280px wide, scrollable:
    heading 'Nav'
  section 'Main' fills remaining space, stacked:
    section 'Header' sticky at top, with shadow, padded:
      heading 'Dashboard'
    section 'Content' scrollable, padded:
      text 'Main content'
```

### Built-in Style Presets
Use presets for landing pages and apps -- no style definitions needed:
```
# Landing pages
section 'Hero' with style page_hero:           # dark bg, white text, centered
section 'Content' with style page_section:     # light bg
section 'CTA' with style page_section_dark:    # dark bg, white text

# Apps
section 'Nav' with style app_sidebar:          # dark panel, scrollable
section 'Main' with style app_content:         # fills space, padded
section 'Top' with style app_header:           # sticky, shadow
```
Override any preset by defining `style page_hero:` with your values.

### Auth Scaffolding
```
allow signup and login    # scaffolds /auth/signup, /auth/login, /auth/me with bcrypt + JWT

page 'Dashboard':
  needs login             # redirects to /login if no JWT token
  heading 'Welcome back'
```

### DB Relationships
```
create a Posts table:
  title
  author belongs to Users    # FK → INTEGER REFERENCES users(id), auto-stitches on lookup
```

### Aggregate Field Extraction (in-memory)
```
total_revenue = sum of amount in orders       # extracts 'amount' from each record, sums
avg_price = average of price in products      # same for average
highest = max of score in results             # and max/min
```

### SQL Aggregates (server-side) — prefer for dashboards and stats endpoints
```
total_revenue = sum of amount from Orders                              # single SQL query, no rows fetched
paid_revenue = sum of amount from Orders where status is 'paid'        # filtered — equality only
support_avg = avg of score from Tickets where team is 'support'        # works with sum/avg/count/min/max
ticket_count = count of id from Tickets                                # COUNT(*) under the hood
```
Capitalized table name after `from` is the trigger. Use `from Table` instead of `in variable` whenever the source is a table — never do `rows = get all X` then `sum of field in rows` for a stat, because `get all` caps at 50 and the total will be wrong.

### Pagination defaults
```
all_todos = get all Todos                     # default LIMIT 50 — safety cap
every_todo = get every Todo                   # opt out — returns all rows
page_of_items = get all Items page 2, 25 per page   # SQL LIMIT 25 OFFSET 25
```

### Has Many Relationships
```
Users has many Posts    # auto-generates GET /api/users/:id/posts
```

### Full Text Search
```
results = search Posts for query     # case-insensitive filter across all fields
```

### WebSocket Broadcasting
```
subscribe to 'chat':
  log message
  broadcast to all message           # sends to all connected clients
```

### Agent Argument Guardrails
```
agent 'Support' receives message:
  block arguments matching 'password|secret|ssn'
  can use: look_up_orders
  response = ask claude 'Help this customer' with message
  send back response
```

### AI Streaming (Default)
`ask claude` inside a POST endpoint streams by default — no keyword needed.
Frontend `get X from URL with Y` auto-detects streaming endpoints and reads
chunks into `_state[X]` live. Opt out with `without streaming` when you
need the full response once:
```
when user sends data to /api/ask:
  ask claude 'You are helpful.' with data's question          # streams

when user sends data to /api/summary:
  ask claude 'Summarize' with data's text without streaming   # one-shot JSON

page 'Chat' at '/':
  q = ''
  answer = ''
  'Ask' is a text input saved as q
  button 'Send':
    get answer from '/api/ask' with q    # streaming reader (auto-detected)
  display answer                          # grows live as tokens arrive
```

### Security Rules (compiler-enforced)
- DELETE/PUT without `requires login` = compiler error, won't compile
- Always validate POST/PUT data with `validate X:` blocks — returns ALL errors as `{ errors: [{ field, message }] }`
- Use `env('KEY')` for secrets, never hardcode them
- Use `guard` for business logic checks: `guard stock is greater than 0 or 'Out of stock'`

## Build Targets

| What you want | Build directive |
|---------------|----------------|
| Frontend only | `build for web` |
| Backend only (JS) | `build for javascript backend` |
| Backend only (Python) | `build for python backend` |
| Full-stack (JS) | `build for web and javascript backend` |
| Full-stack (Python) | `build for web and python backend` |

## Compilation

```bash
# Build
node cli/clear.js build app.clear --out dist/

# Run
cd dist/ && npm install express && node server.js

# Auto-generated E2E tests
node test.js
```

## When Tests Fail

Test failures speak plain English and name the fix. Don't guess — read the error:

```
POST /api/notes returned 404 (expected 201).
404 means "there is no endpoint at that URL." Either the path in your
test is wrong, or you forgot to write `when user calls POST /api/notes:`
in your Clear file. [clear:12]
```

The `[clear:N]` tag is the source line. Every status code (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 5xx) has its own plain-English hint. When fixing a failing test, the error message already tells you what to change — go straight to the named line and make the smallest edit.

## Available Features (all implemented)

**Core:** variables, math, strings, functions, loops, conditionals, pattern matching, objects, lists, maps, error handling, modules, comments. Every loop and recursion is auto-bounded for safety: `while cond:` caps at 100 iterations (override with `, max N times:`), self-recursive functions cap at depth 1000 (override with `define function f(x), max depth N:`). Every external call is auto-timed-out: `send email` 30s, `ask claude` 60s with auto-retry on transient failures, `call api` 30s. The compiler emits the bounds — you only declare overrides when you genuinely need more.

**Frontend:** pages, inputs (text/number/checkbox/dropdown/textarea), buttons, sections with inline layout, components, conditional UI, on-page-load, reactive tables with column whitelist, tabs, collapsible, slide-out panels, modals, toast notifications, ECharts (bar/line/pie/area with subtitle/stacked), images

**Backend:** REST endpoints, validation, auth guards, role-based access, rate limiting, CORS, logging, webhooks (HMAC), OAuth, Stripe checkout, background jobs, SSE streaming, WebSocket, broadcast, full text search, has many relationships. `owner is 'email@domain.com'` at the top of an auth-enabled app pins that email to role:'owner' at signup — unlocks the in-app Live App Editing widget for that user only. Add this line to every app that has `allow signup and login` so the owner can actually edit their running app.

**Policies (Enact Guards):** `policy:` block with 30+ runtime guards — database safety (block DDL, protect tables, filter-required deletes), prompt injection detection, access control (require role, block sensitive reads), code freeze, email (no mass emails), Slack (channel allowlist, block DMs), filesystem (restrict paths, block extensions), git safety (block push to main), CRM (no duplicate contacts), cloud storage (require human approval for deletes)

**Data:** in-memory DB, PostgreSQL/SQLite declaration, table schemas with constraints, row-level security, migrations, CSV load/save/filter/sort/group, JSON parse/stringify. Field modifiers include `required`, `unique`, `default VALUE`, `auto` (timestamp), `(number)` type hint, FK by capitalized name, `hidden` (column kept but stripped from API + UI — the safe "remove"), `renamed to NEW_NAME` (pair with a new field for non-destructive renames — use when the user says "remove X" or "rename X to Y" so data is preserved)

**AI Agents:** agent definitions, ask claude, tool use, skills, guardrails, conversation memory, user preferences, RAG, observability, pipelines, parallel agents, human-in-the-loop, agent testing, streaming

**Workflows:** stateful workflows with state threading, conditional routing, retry loops (`repeat until, max N times`), durable execution (DB checkpoint + Temporal.io), parallel branches (`at the same time` + `saves to`), workflow observability

**Utilities:** file I/O, regex, dates, email, web scraping, PDF generation, machine learning, parallel execution, multi-line strings with interpolation, string interpolation

## Canonical Example (37-line full-stack app)

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

when user requests data from /api/todos:
  all_todos = get all Todos
  send back all_todos

when user sends post_data to /api/todos:
  validate post_data:
    todo is text, required, min 1, max 500
  new_todo = save post_data as new Todo
  send back new_todo with success message

when user deletes todo at /api/todos/:id:
  requires login
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

## Common Patterns

### Status machine with guards
```clear
when user updates invoice at /api/invoices/:id/send:
  requires login
  define invoice as: look up records in Invoices table where id is incoming's id
  guard invoice is not nothing or 'Invoice not found'
  guard invoice's status is 'draft' or 'Only draft invoices can be sent'
  send back 'sent' with success message
```

### Computed values
```clear
subtotal = quantity * unit_price
tax = subtotal * tax_rate / 100
total = subtotal + tax
```

### Conditional UI
```clear
step = 1
button 'Next': increase step by 1
if step is 1:
  heading 'Step 1: Enter name'
if step is 2:
  heading 'Step 2: Confirm'
```

### Multi-table with FK
```clear
create a Teams table:
  name, required
create a Members table:
  team_id, required
  user_name, required
  email, required
```

### Images
```clear
image 'https://example.com/hero.jpg'
image 'https://example.com/avatar.jpg' rounded, 64px wide, 64px tall
```

### Charts (ECharts — auto-included)
```clear
# Bar chart — auto-detects x (string) and y (number) from data shape
bar chart 'Revenue' showing sales

# Pie chart — groups by field, counts occurrences
pie chart 'Status' showing tasks by status

# Bar chart with groupBy — same grouping, rendered as bars
bar chart 'Issues by Project' showing issues by project

# Subtitle + stacked
bar chart 'Weekly Trends' subtitle 'Opened vs closed' showing weekly_stats stacked

# Line and area charts
line chart 'Monthly Trend' showing monthly_data
area chart 'Growth' showing quarterly_data

# Title-first form (also valid)
'Revenue' bar chart showing sales
```

### Display as Cards (dynamic data)
```clear
# Render API data as card grid (instead of table)
display posts as cards showing image_url, category, title, excerpt, author_name
```
Field roles auto-detected by name: `image_url` → hero image, `category` → badge, `title` → heading, `excerpt` → body text, `author` → meta row.

### Stat cards with trend indicators
```clear
section 'Stats' as 4 columns:
  section 'Open' with style metric_card:
    small text 'Open Issues'
    heading '12'
    text '+3 this week'
```
Text starting with `+` renders green with up-arrow. Text starting with `-` renders red with down-arrow. Automatic — no extra syntax.

### TDD with define function (test-first pattern)
```clear
build for javascript backend

# Red step — write the test before the function exists
test 'discount math':
  result = apply_discount(100, 0.10)
  expect result is 10

# Green step — write the function to make it pass
define function apply_discount(price, rate):
  send back price * rate
```

`send back` inside `define function` compiles to a plain `return` — not HTTP.
Call it from test blocks, other functions, or endpoints. No server needed to test.
User-defined function names take priority over any built-in alias with the same name.

## What NOT to do

- Do NOT nest expressions: `avg(filter(data, x > 5))` -- use flat, one-step-per-line
- Do NOT use double quotes for strings -- use single quotes
- Do NOT use dot notation -- use possessive (`person's name`)
- Do NOT omit auth on DELETE/PUT endpoints -- compiler will reject it
- Do NOT hardcode secrets -- use `env('KEY')`
- Do NOT use CSS jargon in layout -- use `scrollable`, `sticky at top`, `side by side`
- Do NOT use `incoming` without naming it -- use `sending data_name` on the endpoint
