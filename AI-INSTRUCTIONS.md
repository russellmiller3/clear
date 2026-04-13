# Clear — AI Instructions

How to write Clear code and use the Clear CLI. This is the instruction manual
for AI agents building apps in Clear. The compiler accepts aliases and both
quote styles, but always write the canonical form for maximum readability.

## ASCII Diagrams First (MANDATORY — Source of Truth)

**Every Clear program must start with an ASCII diagram.** No exceptions.
The diagram is the source of truth for the app's structure. When changing
an app's layout or logic, update the diagram FIRST, then change the code
to match. If the code disagrees with the diagram, the diagram wins.

**USE `/* */` FOR DIAGRAMS, NOT `#`.** Single-line `#` comments become TOC
entries in the Studio IDE. Architecture diagrams pollute the TOC with
box-drawing fragments. Always wrap diagrams in `/* ... */` block comments.

**When AI updates a program:**
1. Read the existing diagram to understand current structure
2. Update the diagram to reflect the planned changes
3. Then modify the code to match the new diagram

**Layout diagram** — for any app with sections, sidebar, header, content areas:
```
/*
LAYOUT:
┌─────────────┬──────────────────────────┐
│  Sidebar    │  Header        [Q4 2026] │
│             ├──────────────────────────┤
│  Dashboard  │  ┌─────────┐ ┌────────┐ │
│  Customers  │  │ Revenue │ │ Deals  │ │
│  Invoices   │  │ $42,300 │ │   23   │ │
│  Settings   │  └─────────┘ └────────┘ │
│             │  ┌──────────────────────┐│
│             │  │ Recent Activity      ││
│             │  └──────────────────────┘│
└─────────────┴──────────────────────────┘
*/
```

**Dataflow diagram** — for any app with frontend → backend → database:
```
/*
DATAFLOW:
┌──────────┐    POST /api/contacts    ┌──────────┐    save    ┌────────┐
│ Frontend │ ──────────────────────> │ Backend  │ ────────> │   DB   │
│  (form)  │ <────────────────────── │ (server) │ <──────── │(memory)│
└──────────┘    GET /api/contacts    └──────────┘   query   └────────┘
     │                                     │
     │  on page load --> GET --> table      │  DELETE /api/contacts/:id
     │  button click --> POST --> refresh   │  --> remove row --> refresh
*/
```

**Landing page section diagram** — for marketing/content pages:
```
/*
LAYOUT:
┌──────────────────────────────────────┐
│           HERO (centered)            │
│  badge · headline · subhead · CTA    │
├──────────────────────────────────────┤
│      FEATURES (3-col grid)          │
│  [Card 1]  [Card 2]  [Card 3]      │
├──────────────────────────────────────┤
│           CTA (centered)            │
│       headline · text · button       │
└──────────────────────────────────────┘
*/
```

**Dataflow diagram** — for backend-only apps with agents or API chains:
```
/*
DATAFLOW:
┌────────┐  POST /api/leads  ┌───────────────┐  ask ai  ┌──────┐
│ Client │ ────────────────> │ Lead Scorer   │ ───────> │  AI  │
└────────┘                   │   (agent)     │ <─────── │      │
                             └───────┬───────┘          └──────┘
                                     │ save
                             ┌───────v───────┐
                             │   Leads DB    │
                             └───────────────┘
*/
```

**How to draw aligned boxes:**

Every box is a fixed-width rectangle. Pick the width first (widest content + 2 padding),
then pad every interior line to that width. Preview the diagram in a monospace font
before committing.

```
# Step 1: Pick box width (widest content + 2 chars padding)
#   "Lead Scorer" = 11 chars → box interior = 15 chars
#
# Step 2: Draw top/bottom with exact width
#   ┌───────────────┐    (15 dashes)
#   └───────────────┘
#
# Step 3: Fill rows — pad content with spaces to hit the width
#   │ Lead Scorer   │    ("Lead Scorer" + 3 spaces = 15)
#   │   (agent)     │    ("  (agent)" + 5 spaces = 15)
#
# Step 4: Arrows between boxes — use consistent spacing
#   ┌────────┐  label  ┌───────────────┐
#   │ Client │ ──────> │ Lead Scorer   │
#   └────────┘         └───────────────┘
```

**Rules:**
1. Always put the diagram at the very top of the file, before `build for`
2. Use box-drawing characters (`┌─┐│└─┘├┤┬┴┼`) for clean lines
3. **Every row inside a box must be the same character width.** Count characters. Pad with spaces.
4. Preview in monospace before committing — if edges don't line up, fix the padding
5. Label every section, data source, and API endpoint
6. Show the direction of data flow with arrows (`──>`, `<──`, `->`, `v`). Use plain ASCII `>`, `<`, `v` — never Unicode arrows (`►`, `◄`, `▼`) which cause width mismatches.
7. Keep it under 15 lines — this is a map, not documentation
8. **The diagram is the source of truth.** Update it before changing code

**Agent flow diagram** — MANDATORY for any app with 2+ agents, pipelines, or parallel execution:
```
# AGENT FLOW:
#
# User message
#   │
#   ├──> Triage Agent [tools, guardrails, tracking]
#   │       │
#   │       ├── category = 'software' ──> Software Specialist [tools, RAG]
#   │       ├── category = 'hardware' ──> Hardware Specialist [tools]
#   │       └── otherwise ──> General Agent
#   │                              │
#   │    ┌─── parallel ────────────┤
#   │    │                         │
#   │    v                         v
#   │  Knowledge Agent         Sentiment Agent
#   │  [RAG, tracking]        [tracking]
#   │    │                         │
#   │    └──────────┬──────────────┘
#   │               │
#   │               v
#   │         Resolution Agent [tools, guardrails, tracking]
#   │               │
#   v               v
# Response ──> User
```

**When editing agents, ALWAYS update the agent flow diagram:**
1. Adding/removing an agent? Update the flow diagram
2. Changing pipeline steps? Update the flow diagram
3. Adding tools/skills/guardrails to an agent? Update the `[...]` annotations
4. Adding parallel execution? Show the fork and join in the diagram
5. The compiled output auto-generates a text version — but the source diagram is richer and is the source of truth

## Minimize Cognitive Load (First Principle)

Every Clear program should be readable in one pass without backtracking.
The reader should never have to hold more than 2-3 things in working memory
at once. This is the principle behind every other rule in this file.

**Eliminate unnecessary variables.** If a value is used once, don't name it.
Assign results directly to where they belong:
```
# BAD: reader tracks 'result' for one line, then throws it away
set result to ask ai 'Rate 1-10' with lead's company
lead's score is result

# GOOD: one line, one idea, nothing to remember
set lead's score to ask ai 'Rate 1-10' with lead's company
```

**Flatten, don't nest.** If a reader needs to match brackets or trace through
three levels of indentation, the code is too complex. Break it into
sequential steps:
```
# BAD: nested logic forces reader to hold multiple conditions in their head
if order's total is greater than 100:
  if order's status is 'pending':
    if order's country is 'US':
      order's shipping is 'free'

# GOOD: each line is self-contained
check order's total is greater than 100, otherwise error 'Minimum order is $100'
check order's status is 'pending', otherwise error 'Order already processed'
if order's country is 'US':
  order's shipping is 'free'
```

**Name things for the reader, not the compiler.** Variable names should make
the code readable as prose. If you have to think about what a name means,
it's wrong:
```
# BAD
set r to call 'Scorer' with d
set s to save r as new Lead

# GOOD
set scored_lead to call 'Scorer' with lead_data
set saved to save scored_lead as new Lead
```

**One idea per line.** Each line should do exactly one thing. If you're
reading a line and need to pause to parse it, split it up. The goal:
a non-programmer should be able to point at any line and say what it does.

## Assignment Convention

**Use `=` when the result is a number (calculations, numeric values):**
```
price = 9.99
tax = price * 0.08
total = price + tax
quantity = 100
```

**Use `is` when the result is a string, boolean, or identity:**
```
name is 'Alice'
active is true
status is 'pending'
greeting is 'Hello, ' + name
```

**Use `=` for CRUD operations (v2 shorthand):**
```
all_users = get all Users
new_user = save user_data as new User
```

**`define X as:` still works for complex expressions:**
```
define total as: price + tax
define all_users as: look up all records in Users table
```

## No Self-Assignment — Intermediates Need Different Names

**Never write `x is x`.** When a field name matches an argument name, the line
becomes opaque: `subject is subject` — which is the field and which is the argument?

**Bad — can't tell field from argument:**
```
define function create_ticket(subject, customer_email):
  create new_ticket:
    subject is subject
    customer_email is customer_email
  saved = save new_ticket as new Ticket
  return saved
```

**Good — arguments have descriptive prefixes:**
```
define function create_ticket(title, email_address):
  create new_ticket:
    subject is title
    customer_email is email_address
  saved = save new_ticket as new Ticket
  return saved
```

The rule: **function arguments should describe *what* the value is, not match the
field they'll be stored in.** Use `title` not `subject`, `email_address` not
`customer_email`, `amount` not `total`. The reader should instantly see which
side is the source and which is the destination.

## Name Intermediates After What They Are

**No dummy variable names.** `saved`, `result`, `tmp`, `data`, `res` tell the reader
nothing. Name intermediates after what they contain:

**Bad — what is "saved"?**
```
saved = save data as new Ticket
send back saved with success message
```

**Good — it's a new ticket:**
```
new_ticket = save data as new Ticket
send back new_ticket with success message
```

You need the intermediate when the save adds fields (like `id` or `created_at`)
that you want to send back. If you `send back data`, you get the input without
the auto-generated id. If you `send back new_ticket`, you get the full record.

Visual hint for the human reader: `=` lines are formulas to check,
`is` lines are values to note. The compiler doesn't care.

## Design System

Clear is a **DaisyUI v5 + Tailwind CSS v4 design system**. The compiler emits
DaisyUI semantic classes and Tailwind utilities. No custom CSS ever.

### Step 1: Use a preset (covers 90% of cases)

```
# Landing
section 'Hero'     with style page_hero:         # centered, py-32
section 'Features' with style page_section:      # bg-base-100, py-24
section 'Dark'     with style page_section_dark: # bg-neutral, white text
section 'Card'     with style page_card:         # bg-base-200, border, shadow
section 'CTA'      with style page_cta:          # bg-primary, centered

# App / dashboard (always use in this nesting order)
section 'Root'  with style app_layout:   # flex h-screen
  section 'Nav'  with style app_sidebar: # w-52, bg-base-200
  section 'Main' with style app_main:    # flex-1 flex-col
    section 'Top'  with style app_header:  # sticky h-14 border-b
    section 'Body' with style app_content: # scrollable bg-base-200/30 p-6
      section 'Card' with style app_card:  # bg-base-200 rounded-xl border shadow
```

### Step 2: Compose with tokens (fills the gaps)

When no preset fits, build a style from **semantic tokens** — they compile
to DaisyUI/Tailwind classes and adapt to all three themes automatically.
Never use hex colors or pixel values inside style blocks.

```
style my_feature_card:
  background is 'canvas'       # bg-base-200
  corners are 'very rounded'   # rounded-2xl
  padding is 'spacious'        # p-8
  has border                   # border border-base-300/40
  has shadow                   # shadow-sm
  layout is 'column'           # flex flex-col
  gap is 'normal'              # gap-4
```

**Tailwind escape hatch** — for anything not in the token vocab:
```
style my_badge:
  background is 'primary'
  tailwind is 'ring-2 ring-offset-2 ring-primary/30'
```

#### Quick token reference (full table in SYNTAX.md)

| Property | Values |
|----------|--------|
| `background is '...'` | `'surface'` `'canvas'` `'sunken'` `'dark'` `'primary'` `'transparent'` |
| `text is '...'` | `'default'` `'muted'` `'subtle'` `'light'` `'primary'` `'small'` `'large'` |
| `padding is '...'` | `'none'` `'tight'` `'normal'` `'comfortable'` `'spacious'` `'loose'` |
| `gap is '...'` | `'none'` `'tight'` `'normal'` `'comfortable'` `'large'` |
| `corners are '...'` | `'sharp'` `'subtle'` `'rounded'` `'very rounded'` `'pill'` |
| `layout is '...'` | `'column'` `'row'` `'centered'` `'split'` `'2 columns'` `'3 columns'` `'4 columns'` |
| `width is '...'` | `'full'` `'narrow'` `'contained'` `'wide'` |
| `has / no` | `shadow` `large shadow` `border` `strong border` |

### Three themes
`ivory` (default, light), `midnight` (dark), `nova` (warm).
Set with `theme 'midnight'` at top of file.
Full token spec: `design-system.md`. Hard UI rules: `ai-build-instructions.md`.

## Imports

**Namespaced by default.** `use 'helpers'` creates a namespace -- access
functions via `helpers's total(items)` or `helpers.total(items)`:
```
use 'helpers'
result = helpers's total(items)
```

**Selective for frequently used functions.** `use total from 'helpers'`
inlines just what you need -- no prefix required:
```
use total, average from 'helpers'
result = total(items)
```

**Components import the same way:**
```
use Card, Badge from 'components'
show Card('Hello')
```

**Never use `use everything from` in new code** -- it risks name collisions.
Prefer namespaced or selective imports.

## File Structure (MANDATORY)

**Always use section comments to delimit the major parts of a Clear program.**
A full-stack app has three or four sections:

```
# Database
create a Todos table:
  ...

# Backend
log every request
allow cross-origin requests
when user calls GET /api/todos:
  ...

# Frontend
page 'Todo App':
  ...
```

If the program uses a database adapter, add a Database section at the top.
If there's no backend, skip the Backend section. The comments are for the
human reading the file -- the compiler ignores them.

## Multi-File Architecture (When Apps Get Complex)

**First decision: is this a simple or complex app?**

| Simple (one file) | Complex (multiple files) |
|-------------------|------------------------|
| 1 page | 3+ pages |
| 1-2 database tables | 4+ tables |
| < 100 lines | > 150 lines |
| No reusable components | Shared components across pages |
| 1 agent or none | Multiple agents |

**If simple, keep everything in one file.** One file is always easier to read,
debug, and hand to someone new. Don't split prematurely.

**If complex, use this file structure:**

```
my-app/
  main.clear           # Build target, database, shared config
  backend.clear         # All API endpoints
  frontend.clear        # All pages and UI
  components.clear      # Reusable UI components (if needed)
  agents.clear          # AI agents (if needed)
```

**Rules for splitting:**

1. **`main.clear` is the entry point.** It has `build for`, `database is`,
   `create a X table`, `allow cross-origin requests`, and `use` imports.
   It's the table of contents for the whole app.

2. **Split by concern, not by page.** All endpoints go in `backend.clear`,
   all pages go in `frontend.clear`. Don't make one file per page — that
   scatters related code.

3. **Extract a component when it's used 3+ times.** Not before. Three
   similar sections of HTML is better than a premature abstraction. When
   you do extract, put it in `components.clear`.

4. **Agents get their own file when there are 2+.** One agent can live
   in `backend.clear`. Multiple agents go in `agents.clear`.

5. **Never split a table definition from its endpoints.** If `backend.clear`
   has `when user calls GET /api/users`, then `main.clear` must have
   `create a Users table`. The reader finds the schema in main, the
   logic in backend.

**Example main.clear for a complex app:**
```clear
build for web and javascript backend

# Database
database is local memory

create a Users table:
  name, required
  email, required, unique
  role, default 'member'

create a Projects table:
  title, required
  owner, required
  status, default 'active'

# Config
allow cross-origin requests
log every request

# Import modules
use 'backend'
use 'frontend'
```

**When in doubt, keep it in one file.** Splitting adds navigation overhead.
A 200-line file with clear section comments is better than 5 files with
40 lines each where the reader has to jump between files to understand
the flow.

## Infrastructure Lines

**Always explain infrastructure lines with a comment.**
Lines like `allow cross-origin requests` and `log every request` are
invisible to non-programmers. Add a comment explaining what they do and why:

```
# Allow the frontend to talk to the backend (required when they run on different URLs)
allow cross-origin requests

# Print every request to the console for debugging
log every request
```

## Quotes

**Single quotes are canonical.** No shift key needed.
```
name is 'Alice'           # canonical
name is "Alice"           # works, but don't write this
```

## CSS Rule

**All CSS goes in external files. Never inline.**
The compiler outputs CSS to `style.css`, linked from HTML via `<link rel="stylesheet">`.
No `<style>` blocks in generated HTML. The only CSS in the `<head>` comes from CDN links
(DaisyUI, Tailwind). This keeps the HTML clean and the CSS cacheable.

## Style Properties

**Numbers always get px.** Don't make the reader guess the unit.
```
style card:
  padding = 16
  rounded = 8
  gap = 12
```

For non-px values, use a string:
```
style card:
  width is '100%'
  height is '100vh'
```

**Layout patterns use plain English, not CSS jargon:**
```
style header:
  sticky at top
  text centered

style body:
  scrollable
  fills remaining space

style grid:
  two column layout
```

**Style variables for reusable values:**
```
primary is '#2563eb'
surface is '#f8fafc'

style card:
  background is primary
  padding = 24
```

## Input Elements

**Canonical form: 'Label' is a type input saved as a variable**
```
'What needs to be done?' is a text input saved as a todo
'How much?' is a number input saved as a price
'Color' is a dropdown with ['Red', 'Green', 'Blue']
'Gift Wrap' is a checkbox
'Notes' is a text area saved as a note
```

Articles (`a`, `an`, `the`) are optional but encouraged for readability:
```
'Name' is a text input saved as a name       # with article
'Name' is a text input saved as name          # without -- also works
```

Variable names auto-derive from labels: 'Hourly Rate' becomes `hourly_rate`.
Use `saved as` when you need a custom variable name:
```
'Gift Wrap (+$5)' is a checkbox saved as a gift_wrap
```

Legacy form `that saves to` still works but `saved as` is canonical.

## Displaying Content

**Use `show` for everything visible.**

Static content (quotes required):
```
show heading 'Welcome'
show text 'Hello world'
show bold text 'Important'
show divider
show code block 'price = 100'
image 'https://example.com/photo.jpg'
image 'https://example.com/avatar.jpg' rounded, 64px wide, 64px tall
```

Dynamic values (no quotes):
```
show total
show user's name
show Greeting(name)
```

Bare content keywords (`heading 'X'`, `text 'Y'`) still work as aliases
but `show` is canonical because it eliminates ambiguity.

## Reactive Displays

Use `display` for values that update when inputs change:
```
display subtotal as dollars              # auto-labels as "Subtotal"
display tax as dollars called 'Sales Tax'  # explicit label
display count called 'Items'
display response as table called 'Results'
display rate as percent called 'Growth'
display created as date called 'Created'
display config as json called 'Config'
```

Format types: `dollars`/`currency` (toLocaleString USD), `percent`, `date`, `json` (formatted `<pre>`), `number` (default).

The label auto-generates from the variable name: `subtotal` -> "Subtotal",
`total_due` -> "Total Due". Only use `called` when the label differs.

## UI Actions

```
show loading                    # full-page spinner overlay
hide loading                    # remove spinner
show toast 'Saved!'             # temporary notification (also: alert, notification)
hide the sidebar                # set display:none on element
copy invite_link to clipboard   # navigator.clipboard.writeText
download report as 'data.csv'  # trigger browser file download
```

## Endpoints

**Canonical: when user calls METHOD /path:**
```
when user calls GET /api/users:
  all_users = get all Users
  send back all_users

when user calls POST /api/users sending user_data:
  requires login
  validate user_data:
    name is text, required
    email is text, required, matches email
  new_user = save user_data as new User
  send back new_user with success message
```

Use `sending` (not `receiving`) -- from the user's perspective, they send data.

**Auth goes at the top. Check before doing work:**
```
when user calls DELETE /api/users/:id:
  requires login
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

**`with success message`** adds a `message` field and returns 201.
**`delete the X with this id`** removes the record matching the URL param.
**`requires login`** is the preferred style for protecting endpoints (also accepts `requires auth`).
**`allow signup and login`** scaffolds full auth system (signup/login/me endpoints + JWT middleware).
**`needs login`** on a page redirects to /login if no JWT token is present.
**`belongs to Users`** in a table field declaration creates a foreign key relationship.
**`Users has many Posts`** declares a one-to-many relationship and auto-generates nested endpoints (e.g., `GET /api/users/:id/posts`).
**`sum of amount in orders`** extracts a field from each record and aggregates it.
**`search Posts for query`** filters records where any field contains the search term (case-insensitive).
**`broadcast to all message`** inside a WebSocket handler sends the value to all connected clients.
**`block arguments matching 'pattern'`** in an agent adds a regex guard on tool inputs — rejects matching arguments before execution.

## Guards

**Use custom messages that tell the user what happened:**
```
guard product's stock is greater than 0 or 'Out of stock'
guard user's plan is not 'free' or 'Upgrade to Pro to use this feature'
```

## Database Declaration

**Always declare the storage backend at the top of the Database section.**
This tells the reader where data lives and makes it easy to change later:

```
# Database
database is local memory                    # default: in-memory, JSON file backup
database is supabase                        # production: Supabase (recommended)
database is PostgreSQL at env('DATABASE_URL') # raw PostgreSQL
```

**Use `local memory` for prototyping** — zero setup, data persists to a JSON file.
**Use `supabase` for production** — real database, auth, and RLS out of the box.
Switching is one line: change `local memory` to `supabase` and create the tables
in your Supabase dashboard. All CRUD operations compile to Supabase SDK calls
automatically. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars.

If no `database is` declaration is present, the compiler uses local memory.

## Data Tables

**Always include constraints. Bare fields are incomplete.**
```
create a Users table:
  name, required
  email, required, unique
  role, default 'member'
  age (number), default 0
  active, default true
  created_at_date, auto
```

Use `created_at_date` (not `created_at`) -- the `_date` suffix tells the reader
it's a timestamp, not a regular field.

## Dynamic Maps

**Explicit over terse. Use `get` and `set`:**
```
result = get key from scope
set key in scope to 100
```

## Pattern Matching

**Use match/when for type dispatch:**
```
match node's type:
  when 'number':
    return node's value
  when 'add':
    return evaluate(node's left) + evaluate(node's right)
  otherwise:
    return 0
```

## Loops

**Use `in X list:` for clarity:**
```
for each item in items list:
  show item

for each user in users list:
  show UserCard(user)
```

## Frontend API Calls

**Named data fetching (canonical):**
```
get todos from '/api/todos'           # result stored in 'todos'
get users from '/api/users'           # result stored in 'users'
```

**Posting data with decorative intent:**
```
button 'Add':
  send todo as a new todo to '/api/todos'    # 'as a new todo' is for the reader
  get todos from '/api/todos'                 # refresh the list
  todo is ''                                  # clear the input

button 'Sign Up':
  send name and email to '/api/signup'        # multiple fields
```

**Display with column whitelist:**
```
display todos as table showing todo, completed   # only these columns
display users as table showing name, email       # hides id, created_at, etc.
```

**Display as card grid (instead of table):**
```
display posts as cards showing image_url, category, title, excerpt, author_name
```
Auto-detects field roles by name: `image_url` → hero image, `category` → badge, `title` → heading, `excerpt` → body, `author` → meta row. Renders as responsive 3-column grid.

**Display as chat (conversational UI):**
```
display messages as chat showing role, content
'Type your message...' is a text input saved as user_message
button 'Send':
  send user_message to '/api/chat'
  get messages from '/api/messages'
  user_message is ''
```
The compiler automatically folds the input and button into the chat widget.
You get: message bubbles, markdown rendering, typing dots, Enter-to-send,
New button, scroll-to-bottom — all from the compiler. No manual assembly needed.

The `showing` clause maps the first field to message role, the second to message
content. These must match your Messages table fields (e.g., `role` and `content`).

**When to use `display as chat`:** Any app with a conversational interface —
agent apps, support chat, AI assistants. Pairs naturally with `agent` + `ask claude`.

**Don't manually build chat UIs.** Never use `for each` loops with conditional
role checks to render message bubbles. The compiler generates a production-quality
chat component with proper styling, scrolling, and input handling.

**Streaming is automatic.** If the agent has `stream response`, the chat component
auto-detects it and streams tokens in real-time. No extra syntax or wiring needed.
Tool-using agents don't stream (tool loops need full responses), so the compiler
falls back to the normal send-and-wait pattern for those.

## Components

**Name what you're receiving:**
```
define component Card receiving content:
  show heading 'Card'
  show content
  show divider

show Card:
  show text 'Inside the card'
```

## Conditional UI

**Block-form if for showing/hiding sections:**
```
step = 1

button 'Next': increase step by 1

if step is 1:
  show heading 'Enter your name'
if step is 2:
  show heading 'Confirm details'
```

## On Page Load

**Inline form (canonical for single actions):**
```
on page load get todos from '/api/todos'
```

**Block form (for multiple actions):**
```
on page load:
  get todos from '/api/todos'
  get users from '/api/users'
```

## Layout

**Layout goes inline. Visual styling goes in style blocks.**

If changing it changes the SHAPE of the page, put it inline on the section.
If changing it changes the LOOK (colors, shadows), put it in a `style` block.

```
# Layout is inline -- you see the structure by reading the code
section 'App' full height, side by side:
  section 'Sidebar' dark background, 280px wide, scrollable:
    ...
  section 'Main' fills remaining space, stacked:
    section 'Header' sticky at top, with shadow, padded:
      ...
    section 'Content' scrollable, padded:
      ...

# Visual styling is in named blocks -- reuse across sections
style metric_card:
  background is '#f8fafc'
  padding = 16
  rounded = 8
  text centered

section 'Accuracy' with style metric_card:
section 'Precision' with style metric_card:
```

Rule: if you use it once, inline it. If you use it more than once, name it.

## Built-in Style Presets

**Use presets instead of defining styles from scratch.** Clear ships with presets for common patterns:

**For landing pages / marketing sites:**
```
section 'Hero' with style page_hero:         # dark bg, white text, centered
section 'Features' with style page_section:  # light bg, standard padding
section 'CTA' with style page_section_dark:  # dark bg, white text
section 'Plans' with style page_card:        # white card with shadow
```

**For apps / dashboards:**
```
section 'Nav' with style app_sidebar:        # dark panel, scrollable
section 'Main' with style app_content:       # fills space, scrollable
section 'Top' with style app_header:         # sticky top, shadow
section 'Widget' with style app_card:        # bordered card
```

**When writing a landing page:** use `page_hero` and `page_section`/`page_section_dark` for alternating bands. Do NOT define custom styles unless the preset defaults need changing.

**When writing an app:** use `app_sidebar`, `app_content`, `app_header` for layout structure. Use `app_card` for visual grouping of related content.

**Override a preset** by defining it in the file:
```
style page_hero:
  background is '#1a1a2e'
  padding = 100
```

## Design System & Presets

This is the complete reference for building beautiful pages with Clear's
built-in preset system. Use presets first, customize second. Every preset
compiles to Tailwind/DaisyUI classes -- zero custom CSS.

### The 20 Pareto Presets

These cover ~90% of all UI you'll ever build. Reach for a preset before
writing a custom style block.

#### Marketing Presets (12)

| Preset | What it does | Use for |
|--------|-------------|---------|
| `page_navbar` | Sticky nav, backdrop blur, logo + links + CTA button, mobile hamburger drawer | Top of every marketing page |
| `page_hero` | Centered text, py-24, radial gradient glow from primary color | Main hero section |
| `hero_left` | Left-aligned hero, py-28, radial gradient glow right side | Hero with image/screenshot on right |
| `logo_bar` | Light bg, border-y, py-8, opacity-muted logos | "Trusted by" social proof strip |
| `feature_grid` | bg-base-100, py-16/24, auto-wraps children into grid | 3-col feature cards |
| `feature_split` | bg-base-100, py-20, side-by-side layout | Feature with image + text |
| `stats_row` | bg-base-200, py-14/20, centered numbers | "10K+ users" stat strip |
| `testimonial_grid` | bg-base-200/50, py-16/24 | Customer quote cards |
| `pricing_grid` | bg-base-200, py-20 | 2-3 tier pricing cards |
| `page_cta` | bg-primary, white text, py-20/28, centered | Full-width conversion CTA |
| `faq_section` | bg-base-100, py-16/24 | Accordion Q&A |
| `page_footer` | bg-base-200, border-t, py-12/16 | Links, legal, copyright |

#### App UI Presets (8)

| Preset | What it does | Use for |
|--------|-------------|---------|
| `app_layout` | `flex h-screen overflow-hidden` | Root wrapper for any dashboard |
| `app_sidebar` | w-56, bg-base-200/60, border-r, flex-col | Navigation sidebar |
| `app_header` | Sticky, h-16, backdrop blur, border-b, flex between | Top bar with title + actions |
| `app_main` | flex-1 flex-col, overflow hidden | Right-side container (header + content) |
| `app_content` | flex-1, overflow-y-auto, p-6, flex-col gap-5 | Scrollable main content area |
| `app_card` | bg-base-200, rounded-xl, border, shadow-md, p-5 | Any content card in a dashboard |
| `metric_card` | bg-base-200, rounded-xl, p-6, border | KPI / stat display card |
| `app_table` | bg-base-200, rounded-xl, border, overflow hidden | Data table wrapper |
| `app_modal` | bg-base-100, rounded-xl, shadow-2xl, p-8, max-w-md, ring | Dialog / confirmation box |
| `empty_state` | bg-base-200/50, dashed border, p-12, centered, min-h-200 | "No items yet" placeholder |
| `app_list` | bg-base-200, rounded-xl, border, divide-y | Stacked list items |
| `form` | bg-base-100, rounded-xl, border, shadow-sm, p-8, max-w-lg, centered | Standalone form card |

#### Blog Presets (3)

| Preset | What it does | Use for |
|--------|-------------|---------|
| `blog_grid` | bg-base-100, py-16/24, 3-column grid | Blog listing page |
| `blog_card` | Rounded, border, shadow, hover lift effect | Individual post card |
| `blog_article` | bg-base-100, py-16, max-w-3xl, mx-auto | Single article (Medium-style) |

### Layout Diagrams

**Typical marketing landing page:**
```
# ┌──────────────────────────────────────────┐
# │  page_navbar                             │  sticky, backdrop-blur
# ├──────────────────────────────────────────┤
# │            page_hero                     │  py-24, centered, radial glow
# │   badge · headline · subhead · CTA       │
# ├──────────────────────────────────────────┤
# │  logo_bar   [Logo] [Logo] [Logo]        │  py-8, muted opacity
# ├──────────────────────────────────────────┤
# │  feature_grid                            │  py-16/24
# │   [feature_card] [feature_card] [card]   │  3-col auto-grid
# ├──────────────────────────────────────────┤
# │  stats_row    10K+   99.9%   <1s        │  py-14/20, bg-base-200
# ├──────────────────────────────────────────┤
# │  testimonial_grid                        │  py-16/24
# │   [quote]  [quote]  [quote]              │
# ├──────────────────────────────────────────┤
# │  pricing_grid                            │  py-20
# │   [Starter] [Pro*] [Enterprise]          │  * = featured card
# ├──────────────────────────────────────────┤
# │  page_cta     bg-primary, white text     │  py-20/28
# │     headline  ·  button                  │
# ├──────────────────────────────────────────┤
# │  faq_section                             │  py-16/24, accordion
# ├──────────────────────────────────────────┤
# │  page_footer   links · legal · (c)       │  py-12/16, bg-base-200
# └──────────────────────────────────────────┘
```

**Typical app dashboard:**
```
# ┌────────────┬───────────────────────────────────┐
# │            │  app_header          [Search] [+]  │  sticky, h-16
# │ app_       ├───────────────────────────────────┤
# │ sidebar    │  app_content (scrollable)          │
# │            │                                    │
# │ Dashboard  │  ┌─metric──┐ ┌─metric──┐ ┌─────┐ │
# │ Projects   │  │ Revenue │ │  Users  │ │ NPS │ │
# │ Settings   │  │ $42.3K  │ │  1,204  │ │  72 │ │
# │            │  └─────────┘ └─────────┘ └─────┘ │
# │ w-56       │                                    │
# │ border-r   │  ┌─app_table──────────────────┐   │
# │            │  │  Name    Status    Action   │   │
# │            │  │  Alice   Active    [Edit]   │   │
# │            │  │  Bob     Pending   [Edit]   │   │
# │            │  └────────────────────────────┘   │
# ├────────────┴───────────────────────────────────┤
# │        app_layout  (flex h-screen)              │
# └─────────────────────────────────────────────────┘
```

### Theme & Font System

Clear ships with 4 primary themes. Set once at the top of your file:

```
theme 'midnight'   # dark SaaS (Linear, Vercel vibe)
theme 'ivory'      # light enterprise (Stripe, Ramp) -- default
theme 'slate'      # dark neutral (GitHub dark)
theme 'nova'       # warm creative (Lovable, Amie)
```

**Font stack (all themes):**
- **Body:** DM Sans -- clean, geometric sans-serif. All UI text, nav, labels.
- **Display:** Plus Jakarta Sans (semibold-black) -- headlines, hero text. Used via `font-display` class.
- **Mono:** Geist Mono -- code blocks, badges, data values. Used via `font-mono` class.

Fonts load from Google Fonts CDN automatically. No configuration needed.

### Spacing Rhythm

Consistent vertical rhythm makes pages feel professional. These are the
spacing values baked into presets -- follow them in custom sections too:

| Section type | Vertical padding | Why |
|-------------|-----------------|-----|
| Hero | `py-24` (96px) to `py-28` (112px) | Breathing room, draws the eye |
| Landing sections | `py-16` (64px) to `py-24` (96px) | Comfortable reading rhythm |
| CTA | `py-20` (80px) to `py-28` (112px) | Big, bold, conversion-focused |
| Footer | `py-12` (48px) to `py-16` (64px) | Compact but not cramped |
| Card padding | `p-5` to `p-8` (20-32px) | App cards p-5, marketing cards p-7/p-8 |
| App content area | `p-6` (24px) with `gap-5` (20px) | Dashboard grid breathing room |
| Stats row | `py-14` (56px) to `py-20` (80px) | Numbers need vertical space |
| Header bar | `h-16` (64px) | Standard app header height |

### Common Patterns

**Full marketing landing page:**
```
build for web

theme 'midnight'

page 'Landing' at '/':

  section 'Nav' with style page_navbar:
    heading 'Acme'
    link 'Features' to '#features'
    link 'Pricing' to '#pricing'
    button 'Get Started'

  section 'Hero' with style page_hero:
    show text 'Ship 10x faster with AI'
    show text 'Build production apps in plain English. No frameworks, no config.'
    button 'Start Free'
    button 'See Demo'

  section 'Logos' with style logo_bar:
    show text 'Trusted by 500+ teams'
    show image 'stripe.svg'
    show image 'linear.svg'
    show image 'vercel.svg'

  section 'Features' with style feature_grid:
    show heading 'Everything you need'
    section 'Card 1' with style feature_card:
      show heading 'AI Compiler'
      show text 'Write English, get production code.'
    section 'Card 2' with style feature_card:
      show heading 'One-Click Deploy'
      show text 'Push to production in seconds.'
    section 'Card 3' with style feature_card:
      show heading 'Built-in Auth'
      show text 'User accounts out of the box.'

  section 'Stats' with style stats_row:
    section 'S1' with style stat_item:
      show heading '10K+'
      show text 'Developers'
    section 'S2' with style stat_item:
      show heading '99.9%'
      show text 'Uptime'
    section 'S3' with style stat_item:
      show heading '<1s'
      show text 'Compile time'

  section 'CTA' with style page_cta:
    show heading 'Ready to ship?'
    show text 'Start building for free. No credit card required.'
    button 'Get Started Free'

  section 'Footer' with style page_footer:
    show text '(c) 2026 Acme Inc.'
    link 'Privacy' to '/privacy'
    link 'Terms' to '/terms'
```

**App dashboard skeleton:**
```
build for web and javascript backend

page 'Dashboard' at '/':

  section 'Root' with style app_layout:
    section 'Sidebar' with style app_sidebar:
      show heading 'MyApp'
      link 'Dashboard' to '/'
      link 'Projects' to '/projects'
      link 'Settings' to '/settings'

    section 'Main' with style app_main:
      section 'Header' with style app_header:
        show heading 'Dashboard'
        button 'New Project'

      section 'Body' with style app_content:
        section 'Metrics' side by side:
          section 'Rev' with style metric_card:
            show text 'Revenue'
            show heading '$42,300'
          section 'Users' with style metric_card:
            show text 'Active Users'
            show heading '1,204'
          section 'NPS' with style metric_card:
            show text 'NPS Score'
            show heading '72'

        section 'Table' with style app_table:
          display projects as table showing name, status, owner
```

**Form with modal:**
```
section 'Add Contact' with style form:
  'Name' is a text input saved as a name
  'Email' is a text input saved as an email
  button 'Save':
    send name and email to '/api/contacts'

section 'Confirm Delete' with style app_modal:
  show heading 'Delete this contact?'
  show text 'This cannot be undone.'
  button 'Delete':
    close modal
  button 'Cancel':
    close modal
```

**Empty state (no data yet):**
```
if projects list is empty:
  section 'No Projects' with style empty_state:
    show heading 'No projects yet'
    show text 'Create your first project to get started.'
    button 'New Project'
```

**List preset:**
```
section 'Recent Activity' with style app_list:
  for each event in events list:
    section 'Item' padded:
      show text event's description
      show text event's timestamp
```

### Preset Selection Cheat Sheet

**Ask yourself:**
1. Is this a marketing/landing page? Start with `page_navbar` + `page_hero` + alternating `feature_grid` / `stats_row` / `testimonial_grid` + `page_cta` + `page_footer`.
2. Is this an app/dashboard? Start with `app_layout` > `app_sidebar` + `app_main` > `app_header` + `app_content`. Fill content with `metric_card`, `app_table`, `app_card`.
3. Need a standalone form? Use `form`.
4. Need a dialog? Use `app_modal`.
5. No data to show? Use `empty_state`.
6. Showing a list? Use `app_list`.

**Never define a custom style for something a preset already handles.**

## Interactive Patterns

**Tabs -- for switching between content panels:**
```
section 'Views' as tabs:
  tab 'Overview':
    text 'Overview content'
  tab 'Settings':
    text 'Settings content'
```

**Collapsible -- for expandable sections:**
```
section 'Advanced' collapsible, starts closed:
  text 'Click header to expand'
```

**Slide-out panel -- for help, settings, filters:**
```
section 'Help' slides in from right:
  text 'Help content'

button 'Help':
  toggle the Help panel
```

**Modal -- for confirmations and dialogs:**
```
section 'Confirm' as modal:
  heading 'Are you sure?'
  button 'Yes':
    close modal
  button 'Cancel':
    close modal

button 'Delete':
  open the Confirm modal
```

## Page Navigation

```
button 'Go to Dashboard':
  go to '/dashboard'
```

## Full Example

```
build for web and javascript backend

# Database
create a Contacts table:
  name, required
  email, required, unique
  created_at_date, auto

# Backend

# Allow the frontend to talk to the backend (required when they run on different URLs)
allow cross-origin requests

# Print every request to the console for debugging
log every request

when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts

when user calls POST /api/contacts sending contact_data:
  validate contact_data:
    name is text, required
    email is text, required, matches email
  new_contact = save contact_data as new Contact
  send back new_contact with success message

# Frontend
page 'Contacts':
  on page load get contacts from '/api/contacts'
  heading 'Contacts'
  'Name' is a text input saved as a name
  'Email' is a text input saved as an email
  button 'Save':
    send name and email to '/api/contacts'
    get contacts from '/api/contacts'
    name is ''
    email is ''
  display contacts as table showing name, email
```

## Security Rules

### Never put secrets in source code
```
# WRONG
api_key is 'sk-abc123...'

# RIGHT
api_key is env('API_KEY')
```

### Always require auth on write endpoints
```
when user calls DELETE /api/users/:id:
  requires login
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

The compiler will **refuse to compile** DELETE or PUT endpoints without `requires login`.
It will also error if a table with `user_id` has a GET endpoint that returns all records
without filtering by user.

### Rate limit public endpoints
```
when user calls POST /api/contact:
  rate limit 5 per minute
  validate incoming:
    message is text, required
  send back 'sent'
```

### Never expose internals in errors
```
# WRONG
send back 'Error: column user_id not found' status 500

# RIGHT
send back 'Something went wrong' status 500
```

## Agent Style Rules

### Assign AI results directly to the target property

Never create an intermediate variable just to pass it to another variable
on the next line. Assign the `ask ai` result directly where it belongs:

```
# BAD: pointless intermediate variable
set result to ask ai 'Rate 1-10' with lead's company
lead's score is result

# GOOD: direct assignment
set lead's score to ask ai 'Rate 1-10' with lead's company
```

An intermediate variable is fine when you actually use it more than once,
or when you need to inspect/branch on it:

```
# OK: used in a condition
set verdict to ask ai 'SAFE or UNSAFE?' with post's content
post's moderation is verdict
if verdict contains 'UNSAFE':
  post's flagged is true
```

### Use canonical explicit forms

```
# CANONICAL (use these)
check lead's email is not missing, otherwise error 'Email is required'
set scored to call 'Lead Scorer' with lead_data
set analysis to ask ai 'Rate 1-10' with lead's company

# TERSE (still work, but don't generate these)
guard lead's email is not nothing or 'Email is required'
scored = call 'Lead Scorer' with lead_data
analysis = ask ai 'Rate 1-10' with lead's company
```

### Keep prompts short and specific

The prompt in `ask ai` should be a focused instruction. Context comes from
the `with` clause -- don't repeat the context inside the prompt:

```
# BAD: context repeated in prompt
set score to ask ai 'The company is Anthropic. Rate Anthropic 1-10.' with lead's company

# GOOD: prompt is the instruction, context is the data
set score to ask ai 'Rate this company 1-10 for enterprise potential.' with lead's company
```

### Use structured output when you need multiple fields

When the AI should return an object (not just a string), use `returning JSON text:`
with an indented field block. Each field has an optional type: `(number)`,
`(boolean)`, `(list)`, or plain (defaults to text).

```
# GOOD: structured output -- result is an object with typed fields
set result to ask ai 'Analyze this lead for enterprise potential' with lead returning JSON text:
  score (number)
  reasoning
  qualified (boolean)
lead's score is result's score
lead's reasoning is result's reasoning

# BAD: asking AI to return JSON as a string and parsing it yourself
set json_text to ask ai 'Return JSON with score and reasoning' with lead
```

The compiler tells the AI to respond with JSON matching the schema.
The runtime parses the JSON response into an object. No manual parsing needed.

### Agent Guards and Directives

Every production agent should have guards. Place directives at the top of the
agent body, before any executable code:

```clear
agent 'Customer Support' receives message:
  # --- DIRECTIVES (order doesn't matter, but group them at top) ---
  can use: look_up_orders, check_status, send_email
  must not: delete records, modify prices, access admin tables
  knows about: Products, FAQ
  remember conversation context
  track agent decisions
  using 'claude-sonnet-4-6'

  # --- BODY (executable code below directives) ---
  response = ask claude 'Help this customer' with message
  send back response
```

**Always add these guards for production agents:**

1. **`must not:`** — compile-time safety. The compiler rejects code that violates these policies:
   ```clear
   must not: delete records, access Users table
   # OR block form for complex policies:
   must not:
     delete any records
     modify Products prices
     call more than 5 tools per request
     spend more than 10000 tokens
   ```

2. **`track agent decisions`** — observability. Logs every AI call with timing:
   ```clear
   track agent decisions
   # Requires: AgentLogs table with agent_name, action, latency_ms, created_at
   ```

3. **`using 'model'`** — explicit model selection, no surprises:
   ```clear
   using 'claude-sonnet-4-6'
   ```

### Use Skills for Reusable Tool Bundles

Don't repeat `can use:` lists across agents. Define skills once, attach everywhere:

```clear
skill 'Order Management':
  can: look_up_orders, update_order, cancel_order
  instructions:
    Always verify customer identity before changes.
    Include order number in all responses.

skill 'Email Support':
  can: send_email, check_inbox
  instructions:
    Use professional tone. Include order number in subject.

# Both agents share the same tools + instructions
agent 'Support' receives message:
  uses skills: 'Order Management', 'Email Support'
  must not: delete records
  response = ask claude 'Help' with message
  send back response

agent 'Returns' receives request:
  uses skills: 'Order Management'
  must not: modify prices
  response = ask claude 'Process return' with request
  send back response
```

### Use Text Blocks for Long System Prompts

Never cram instructions into a single-line string. Use text blocks with interpolation:

```clear
agent 'Support' receives message:
  today = format date current time as 'YYYY-MM-DD'

  system_prompt is text block:
    You are a customer support agent for Acme Corp.
    Today is {today}. Be friendly but professional.
    Always look up the customer's order before answering.
    Never reveal internal pricing or margins.
    If you cannot resolve the issue, say so honestly.

  response = ask claude system_prompt with message
  send back response
```

### Always Write Tests for Agents

Every agent should have at least one test with mocked AI responses:

```clear
test 'support agent handles order question':
  mock claude responding:
    answer is 'Your order #42 is shipped, arriving tomorrow.'
    action is 'respond'
  result = call 'Support' with 'Where is my order?'
  expect result's action is 'respond'

test 'support agent escalates billing issues':
  mock claude responding:
    answer is 'I need to transfer you to billing.'
    action is 'escalate'
  result = call 'Support' with 'I was double charged!'
  expect result's action is 'escalate'
```

Multiple mocks are consumed in order (first AI call gets first mock, second gets second).

### Agent Tables (Required Infrastructure)

Production agents need these tables. Create them before the agent definition:

```clear
# For conversation memory:
create a Conversations table:
  user_id, required
  messages, default '[]'

# For long-term memory:
create a Memories table:
  user_id, required
  fact, required
  created_at (timestamp), auto

# For observability:
create an AgentLogs table:
  agent_name, required
  action, required
  input
  output
  latency_ms (number)
  created_at (timestamp), auto

# For human-in-the-loop:
create an Approvals table:
  action, required
  details, required
  status, default 'pending'
  decided_by
  decided_at (timestamp)
```

### Pipeline vs Parallel

Use **pipelines** when each step depends on the previous (sequential):
```clear
pipeline 'Hiring' with candidate_id:
  'Resume Screener'
  'Technical Assessor'
  'Culture Fit'

result = call pipeline 'Hiring' with candidate_id
```

Use **parallel** when steps are independent (fan-out):
```clear
do these at the same time:
  sentiment = call 'Sentiment' with text
  topic = call 'Topic' with text
  lang = call 'Language' with text
```

### Workflows (Stateful Multi-Step Graphs)

Use **workflows** when you need shared state, conditional routing, retry loops, or durable execution:
```clear
workflow 'Content Pipeline' with state:
  save progress to Workflows table
  track workflow progress
  state has:
    topic, required
    draft
    quality_score (number), default 0
    published (boolean), default false

  step 'Research' with 'Research Agent'
  step 'Write' with 'Writer Agent'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer Agent'
    if state's quality_score is less than 8:
      step 'Revise' with 'Writer Agent'
  step 'Publish' with 'Publisher Agent'
```

Workflow directives (before steps):
- `state has:` — define state shape with types and defaults
- `save progress to TableName table` — DB checkpoint at each step
- `track workflow progress` — state history array
- `runs on temporal` — compile to Temporal.io workflow

Invoke with: `result = run workflow 'Content Pipeline' with data`

### App-Level Policies (Enact Guards)

Add a `policy:` block at the app level for runtime safety guards. These wrap all db operations with deterministic checks — no LLMs, just enforcement.

```clear
policy:
  block schema changes
  block deletes without filter
  protect tables: AuditLog
  block prompt injection
  no mass emails
  require role 'admin'
```

**Always add policies to production apps.** At minimum: `block schema changes`, `block deletes without filter`, and `block prompt injection`. These prevent the most common agent failure modes.

**Policy categories:** database safety, prompt injection, access control, code freeze, email/Slack, filesystem, git safety, CRM, cloud storage.

## CLI Workflow (How Agents Build Apps)

When building a Clear app, use the CLI for fast feedback loops:

```bash
# 1. Scaffold
clear init my-app

# 2. Write main.clear (the agent writes this)

# 3. Fast validation (no compilation, just parse + validate)
clear check main.clear --json

# 4. Security audit
clear lint main.clear --json

# 5. Auto-fix patchable errors (e.g. missing auth on DELETE)
clear fix main.clear

# 6. Compile
clear build main.clear --out build/

# 7. Introspect what was built
clear info main.clear --json

# 8. Serve locally for testing
clear serve main.clear --port 3000

# 9. Package for deployment
clear package main.clear --out deploy/
```

**Always use `--json` when the agent is parsing output.** Human-readable output is
for terminal display only. JSON output has structured errors, warnings, file lists,
and metadata the agent can act on programmatically.

**Use `check` before `build`.** `check` is faster — it validates without compiling.
Use it in the tight edit loop. Use `build` when you need the output files.

**Use `lint` before shipping.** It categorizes warnings into security, quality, and
other. Zero security warnings is the bar for shipping.

## Charts

**Use charts for any numeric data from an API.** If you're displaying a table of
numbers, add a chart above it for visual context:

```
bar chart 'Revenue Trend' showing sales
line chart 'Deals by Month' showing sales
pie chart 'Status Breakdown' showing tasks by status
area chart 'Growth' showing monthly_data
bar chart 'Issues by Project' showing issues by project
```

**Chart types:** `line` (trends over time), `bar` (comparisons), `pie` (proportions),
`area` (cumulative trends). The compiler auto-detects x-axis (first string field)
and y-axis (number fields).

**groupBy (`by field`) works for all chart types**, not just pie. Use it whenever you
want to group and count by a field:
- `pie chart 'Status' showing tasks by status` -- pie slices per status
- `bar chart 'By Project' showing issues by project` -- one bar per project

**Three valid syntax forms** (all compile identically):
1. **Type-first (canonical):** `bar chart 'Title' showing data`
2. **Title-first:** `chart 'Title' as bar showing data`
3. **Legacy:** `chart 'Title' as bar showing data` (same as #2, kept for compat)

Always prefer the type-first canonical form in new code.

**Chart modifiers:**
- **Subtitle:** `bar chart 'Title' subtitle 'Description' showing data` — adds small text below chart title
- **Stacked:** `bar chart 'Title' showing data stacked` — stacks bar series on top of each other
- Both are optional and can be combined: `bar chart 'Trends' subtitle 'Last 4 weeks' showing data stacked`

**Always pair charts with seed data** so the chart has something to show on first load:

```
when user calls POST /api/seed:
  create jan:
    month is 'Jan'
    revenue = 31200
  save jan as new Sale
  send back 'seeded'

page 'Dashboard' at '/':
  on page load:
    send nothing to '/api/seed'
    get sales from '/api/sales'
  bar chart 'Revenue' showing sales
```

## Table Action Buttons

**Use `with delete` when the user should be able to remove rows.** Use `with edit`
when they should be able to modify rows. Use both when appropriate:

```
display contacts as table showing name, email with delete
display contacts as table showing name, email with edit
display contacts as table showing name, email with delete and edit
```

The compiler auto-wires these to matching DELETE and PUT endpoints. The validator
warns if you write `with delete` but have no DELETE endpoint. **This is explicit —
the compiler never adds buttons the user didn't ask for.**

## Reactive Input Handlers

**Use `when X changes:` for search-as-you-type and live filtering.** Always debounce
API calls to avoid hammering the server:

```
'Search' is a text input saved as a query

# Without debounce (fires on every keystroke)
when query changes:
  get results from '/api/search?q={query}'

# With debounce (waits 250ms after last keystroke — preferred)
when query changes after 250ms:
  get results from '/api/search?q={query}'
```

**Always use debounce for API calls.** 250ms is the right default. Without it,
every keystroke fires a network request.

## Transactions

**Use `as one operation:` for multi-step database changes that must all succeed
or all fail.** E-commerce checkouts, bank transfers, inventory updates:

```
when user calls POST /api/checkout sending order:
  requires login
  as one operation:
    decrease product's stock by order's quantity
    save order as new Order
    send email:
      to is order's email
      subject is 'Order confirmed'
```

This compiles to `BEGIN`/`COMMIT`/`ROLLBACK`. If any step fails, all changes
are rolled back. Never do multi-step data changes without a transaction.

## Compound Unique Constraints

**Use `one per X and Y` to prevent duplicates on combinations:**

```
create a Votes table:
  user_id, required
  poll_id, required
  choice, required
  one per user_id and poll_id    # one vote per user per poll
```

This is clearer than `unique together` — say it out loud and a 14-year-old
understands "one per user and poll."

## Pagination

**Use `page N, M per page` for any list that might have 50+ items:**

```
items = get all Items page 1, 25 per page
```

For Supabase, this compiles to `.range()`. For local memory, it compiles to
array `.slice()`. Always paginate production endpoints.

## File Uploads

```
'Profile Photo' is a file input saved as a photo
```

File inputs use `<input type="file">` with DaisyUI styling. The value is a
`File` object in state, accessible in button handlers. Uses `change` event
(not `input`).

## CSS Hover, Focus, and Transitions

**Use `hover_` and `focus_` prefixes in style blocks for interactive states:**

```
style card:
  background is 'white'
  hover_background is '#f0f0f0'
  focus_border is '2px solid blue'
  transition is 'all 0.2s ease'
```

The compiler auto-adds `transition: all 0.2s` when hover/focus props exist
but no explicit transition is set. Use `for_screen is 'small'` for responsive.

## Database: Local Memory vs Supabase

```
# Development (default) — data persists to JSON file
database is local memory

# Production — real Postgres via Supabase
database is supabase
```

**Start with `local memory`.** Switch to `supabase` when deploying. It's a
one-line change — all CRUD operations compile to Supabase SDK calls
automatically. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars.

## Retry, Timeout, and Race (Production Resilience)

**Use `retry` for flaky external calls.** Exponential backoff is built in:

```
retry 3 times:
  send order to '/api/payment'
```

**Use `with timeout` to prevent hanging operations:**

```
with timeout 5 seconds:
  result = call 'Lead Scorer' with lead_data
```

**Use `first to finish` when you have redundant sources:**

```
first to finish:
  fetch page 'https://api-east.example.com'
  fetch page 'https://api-west.example.com'
```

These compile to `try/catch` with backoff (retry), `Promise.race` with reject
timer (timeout), and `Promise.race` with concurrent tasks (race). All three
work in both JS and Python.


## General-Purpose Language Features

### String Interpolation
Embed expressions inside strings with `{...}`:
```
set msg to 'Hello, {name}!'
set summary to 'Total: {price * quantity} items'
set info to 'User: {user's email}'   # possessive works inside {}
```
Compiles to JS template literals / Python f-strings. Works in single OR double quoted strings.

### Typed Function Parameters
Annotate params for documentation and type-mismatch warnings:
```
define function add(a is number, b is number) returns number:
  return a + b

define function greet(name is text) returns text:
  return 'Hello, {name}!'
```
Emits JSDoc `@param`/`@returns` in JS. Python output is unaffected.
Types: `text`, `number`, `boolean`, `list`, `map`, `any`.

### Map Iteration
Iterate over both keys and values in one loop:
```
for each key, value in settings:
  show '{key}: {value}'
```
Access map metadata:
```
set k to keys of settings
set v to values of settings
if 'theme' exists in settings:
  show 'has theme'
```

### First-Class Functions (Higher-Order)
Pass named functions to map/filter:
```
define function double(x):
  return x * 2

set doubled to apply double to each in numbers   # → list.map(double)
set evens to filter numbers using is_even         # → list.filter(is_even)
```

### Typed Error Handling
Route errors by type and access the error object:
```
try:
  fetch data from '/api/items'
if error 'not found':
  show 'Item does not exist'
if error 'forbidden':
  show error's message        # error's message, error's status, etc.
if error:
  show 'Unexpected: {error's message}'
```
Status mappings: `not found`=404, `forbidden`=403, `unauthorized`=401, `bad request`=400, `server error`=500.
`error` is automatically bound in every handler body.

### Throwing Errors
Throw custom errors from any context (functions, endpoints, agents):
```
if product is nothing:
  send error 'Product not found'
```
Synonyms: `throw error`, `fail with`, `raise error` — all compile identically.
Compiles to `throw new Error()` (JS) / `raise Exception()` (Python).
Errors propagate to the nearest `try/if error` handler, or crash if uncaught.

### Finally Blocks
Cleanup code that always runs after try/catch:
```
try:
  save data as new Order
if error:
  show error's message
finally:
  release_lock()
```
Synonyms: `always do:`, `after everything:` compile identically to `finally:`.

## npm Package Imports (Phase 99)

Import any npm package into a JS backend app with `use npm`:

```
use npm 'stripe'                           # alias = stripe
use npm 'openai' as OpenAI                 # alias = OpenAI
use npm '@sendgrid/mail' as sendgrid       # scoped packages work too
```

The `as` alias is optional — defaults to the package name (minus scope prefix).
Compiles to `const alias = require('package')` at the top of server.js, alongside `require('express')`.

`clear package` auto-includes all npm packages in the generated `package.json`.

**Example — Stripe payment endpoint:**
```
build for javascript backend

use npm 'stripe' as stripe_pkg

when user calls POST /api/charge sending params:
  amount = params's amount
  script:
    const stripe = stripe_pkg(process.env.STRIPE_SECRET_KEY);
    const charge = await stripe.paymentIntents.create({ amount: amount, currency: 'usd' });
    return res.json({ id: charge.id, status: charge.status });
```

## Shell Command Execution (Phase 100)

Run any shell command from a JS or Python backend:

```
run command 'npm run build'
run command './deploy.sh'
run command 'git pull origin main'
```

Compiles to:
- **JS backend**: `execSync('cmd', { stdio: 'inherit' })` — output goes to stdout
- **Python backend**: `subprocess.run('cmd', shell=True, check=True)`

`child_process` / `subprocess` is auto-imported only when `run command` is used — no manual imports needed.

Use inside endpoints:
```
when user calls POST /api/deploy:
  run command 'git pull'
  run command 'npm run build'
  send back 'Deployed successfully'
```
