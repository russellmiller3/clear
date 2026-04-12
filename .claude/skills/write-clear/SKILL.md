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

when user calls GET /api/todos:
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
'Color' is a dropdown with ['Red', 'Green', 'Blue']
'Gift Wrap' is a checkbox
```

### API Endpoints
```
when user calls GET /api/users:
  all_users = get all Users
  send back all_users

when user calls POST /api/users sending user_data:
  requires login
  validate user_data:
    name is text, required, min 1, max 100
    email is text, required, matches email
  new_user = save user_data as new User
  send back new_user with success message

when user calls DELETE /api/users/:id:
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

### Aggregate Field Extraction
```
total_revenue = sum of amount in orders       # extracts 'amount' from each record, sums
avg_price = average of price in products      # same for average
highest = max of score in results             # and max/min
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

## Available Features (all implemented)

**Core:** variables, math, strings, functions, loops, conditionals, pattern matching, objects, lists, maps, error handling, modules, comments

**Frontend:** pages, inputs (text/number/checkbox/dropdown/textarea), buttons, sections with inline layout, components, conditional UI, on-page-load, reactive tables with column whitelist, tabs, collapsible, slide-out panels, modals, toast notifications, ECharts (bar/line/pie/area with subtitle/stacked), images

**Backend:** REST endpoints, validation, auth guards, role-based access, rate limiting, CORS, logging, webhooks (HMAC), OAuth, Stripe checkout, background jobs, SSE streaming, WebSocket

**Policies (Enact Guards):** `policy:` block with 30+ runtime guards — database safety (block DDL, protect tables, filter-required deletes), prompt injection detection, access control (require role, block sensitive reads), code freeze, email (no mass emails), Slack (channel allowlist, block DMs), filesystem (restrict paths, block extensions), git safety (block push to main), CRM (no duplicate contacts), cloud storage (require human approval for deletes)

**Data:** in-memory DB, PostgreSQL/SQLite declaration, table schemas with constraints, row-level security, migrations, CSV load/save/filter/sort/group, JSON parse/stringify

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

when user calls GET /api/todos:
  all_todos = get all Todos
  send back all_todos

when user calls POST /api/todos sending post_data:
  validate post_data:
    todo is text, required, min 1, max 500
  new_todo = save post_data as new Todo
  send back new_todo with success message

when user calls DELETE /api/todos/:id:
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
when user calls PUT /api/invoices/:id/send:
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

## What NOT to do

- Do NOT nest expressions: `avg(filter(data, x > 5))` -- use flat, one-step-per-line
- Do NOT use double quotes for strings -- use single quotes
- Do NOT use dot notation -- use possessive (`person's name`)
- Do NOT omit auth on DELETE/PUT endpoints -- compiler will reject it
- Do NOT hardcode secrets -- use `env('KEY')`
- Do NOT use CSS jargon in layout -- use `scrollable`, `sticky at top`, `side by side`
- Do NOT use `incoming` without naming it -- use `sending data_name` on the endpoint
