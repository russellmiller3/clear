# Clear Language — Complete Syntax Reference

Everything Clear can do, with examples. This is the definitive reference.

---

## Values & Variables

```clear
# Numbers use =
price = 9.99
count = 0

# Strings and booleans use "is"
name is 'Alice'
active is true

# Named assignment (canonical)
define total as: price + tax

# Empty list
items is an empty list
```

## TBD Placeholders (Lean Lesson 1)

`TBD` is a placeholder marker. Drop it anywhere a value or a whole step
belongs and you have not decided yet. The compiler accepts it, the program
still compiles green, and only the line that holds the placeholder fails
at runtime — every other piece keeps working.

```clear
# As a value
greeting = TBD
plan_for_thursday = TBD

# As a whole step (a line on its own)
to greet with name:
  TBD

# Mixed in a real workflow
when user requests data from /api/leads:
  send back all Leads

when user sends lead to /api/leads:
  validate lead:
    name, required
  TBD                       # the auth + audit log piece is for later
  send back lead
```

What runs:
- A program with one or more `TBD` markers compiles with **zero compile errors**.
- The compiler emits a clean line-tagged stub at every `TBD`. If running code
  reaches a placeholder it throws `placeholder hit at line N — fill it in or remove it`.
- The compiled test harness catches that exact error and reports the test as
  **SKIPPED** (not FAILED), with the line number. Skips do not fail the build.
- The Results line reads: `X passed, Y failed, Z skipped due to stub`.
- `compileProgram(source).placeholders` returns `[{ line: N }, ...]` — every
  line that still holds a stub.

When to use it:
- The spec is ambiguous about one piece (auth flow, edge case, error message).
  Drop a `TBD`, ship the rest, ask Russell, fill it in next session.
- You are sketching the structure of a program and want compiler feedback on
  the parts that ARE written without being blocked by the parts that are not.

When NOT to use it:
- Do not use `TBD` to dodge a hard part. The placeholder is a bookmark for a
  decision that is genuinely open, not a way to hide a piece you do not want
  to write. Programs with leftover `TBD`s in shipped code are a smell.

## Math

```clear
total = price + tax
discount = total * 0.10
tax = price * rate / 100
remainder = count % 3
squared = value * value
```

## Strings

```clear
# String interpolation — any expression inside {}
greeting is 'Hello, {name}! You have {count} items.'
total_msg is 'Total: {price * quantity}'
user_msg  is 'User: {user's name}'   # possessive works in interpolation

# Concatenation still works
greeting = 'Hello, ' + name
upper = uppercase(name)
lower = lowercase(name)
trimmed = trim(input)
found = contains(text, 'search')
starts = starts_with(name, 'A')
part = substring(text, 0, 5)
position = index_of(text, 'world')
pieces = split(text, ',')
joined = join(pieces, ', ')
char = character(text, 0)
is_letter(char)
is_digit(char)
```

## Objects

```clear
# Create with indented fields
create person:
  name is 'Alice'
  age = 30

# Read properties (possessive)
show person's name

# Set properties
person's age = 31
```

## Maps (Dynamic Keys)

```clear
create scope:
  x = 5
  y = 10

key is 'x'
result = get key from scope         # scope[key] -> 5
set key in scope to 100             # scope[key] = 100

# Iterate keys and values together
for each k, v in scope:
  show '{k} = {v}'

# Map metadata
all_keys   = keys of scope          # ['x', 'y']
all_values = values of scope        # [5, 10]
if 'x' exists in scope:
  show 'x is defined'
```

## Lists

```clear
items is an empty list
add 'hello' to items
remove 'hello' from items
sort items by name
sort items by price descending
```

## Collection Operations

```clear
total = sum of prices
average = avg of scores
biggest = max of values
smallest = min of values
how_many = count of items

first_item = first of items
last_item = last of items
remaining = rest of items

all_names = each user's name in users
merged = combine defaults with overrides

# Field extraction from a list of records (in-memory variable)
total_revenue = sum of amount in orders
avg_price = average of price in products
highest_score = max of score in results
lowest_score = min of score in results

# Server-side SQL aggregates (capitalized table name after "from")
total_revenue = sum of amount from Orders
paid_total = sum of amount from Orders where status is 'paid'
support_avg = avg of score from Tickets where team is 'support' and priority is 'high'
order_count = count of id from Orders
```

**In memory vs SQL:** `in variable` reduces over data you already have (`Array.reduce`). `from Table` runs a single SQL `SELECT FN(col) FROM ...` — no rows are fetched into memory. Use `from Table` for dashboard stats and anything that aggregates a whole table.

Filtered aggregates (`where ...`) support equality only — `is X` and `A is X and B is Y`. For complex filters (`>`, `<`, ranges), fetch with `look up every X where ...` and aggregate the result in memory.

## Functions

```clear
# One-liner
double(x) = x * 2
tax(price, rate) = price * rate / 100

# Block function
define function greet(name):
  message = 'Hello, ' + name
  return message

# Typed parameters (emits JSDoc, enables type-mismatch warnings)
define function add(a is number, b is number) returns number:
  return a + b

define function label(name is text) returns text:
  return 'Name: {name}'

# Higher-order functions
define function double(x):
  return x * 2

numbers is [1, 2, 3, 4]
doubled = apply double to each in numbers   # list.map(double)
evens   = filter numbers using is_even      # list.filter(is_even)
```

## Conditionals

```clear
# Inline
if x is 5 then show 'yes'
if x is 5 then show 'yes' otherwise show 'no'

# Block
if x is 5:
  show 'five'
otherwise if x is 10:
  show 'ten'
otherwise:
  show 'other'
```

## Pattern Matching

```clear
match node's type:
  when 'number':
    return node's value
  when 'add':
    return evaluate(node's left) + evaluate(node's right)
  otherwise:
    return 0
```

## Loops

```clear
# Count
repeat 5 times:
  show 'hello'

# Each
for each item in items:
  show item

# Each with key and value (map iteration)
for each key, value in settings:
  show '{key} = {value}'

# While — always bounded
while count is less than 10:
  increase count by 1
# The compiler caps this at 100 iterations by default — tight so a
# hallucinated infinite loop fails fast. Declare `, max N times` when
# you need more (pagination, state machines, small simulations):

while count is less than 10, max 50 times:
  increase count by 1

while has_more_pages, max 1000 times:
  page = fetch_next_page()

# Recursive functions are auto-depth-capped at 1000.
# Example of one that IS recursive (the compiler notices and wraps it):
define function walk(n):
  if n is greater than 0:
    walk(n - 1)
  send back n

# Sending email uses a 30-second default timeout so a frozen mail server
# can't hang the request. Override with `with timeout N seconds` if needed.
send email to 'user@example.com':
  subject 'Hi'
  body 'Hello'
  with timeout 60 seconds
```

## Error Handling

```clear
# Basic
try:
  risky_operation()
if error:
  show 'Something went wrong'

# Typed handlers (routes by HTTP status code)
try:
  fetch data from '/api/item'
if error 'not found':
  show 'Item missing'                   # 404
if error 'forbidden':
  show error's message               # 403 — `error` is bound automatically
if error 'unauthorized':
  show 'Please log in'                  # 401
if error 'bad request':
  show error's message               # 400
if error 'server error':
  show 'Try again later'               # 500
if error:
  show error's message               # catch-all

# `error` is always available inside handlers:
# error's message, error's status, error's code
```

## Finally (Cleanup Code)

```clear
# Code that always runs, whether an error occurred or not
try:
  process_data(connection)
if error:
  show error's message
finally:
  close_connection()

# Synonyms: always do:, after everything:
```

## Throwing Errors

```clear
# Throw a custom error from any context (functions, endpoints, etc.)
if price is less than 0:
  send error 'Price cannot be negative'

# Synonyms all compile identically:
throw error 'Invalid input'
fail with 'Database connection failed'
raise error 'Unauthorized access'
```

## Live Blocks (Explicit Effect Fence)

A `live:` block is the visible label for code that talks to the outside world —
asking Claude, calling an API, opening a websocket, running a timer. Pure code
(arithmetic, string handling, table reads, validation) doesn't need a fence;
it lives wherever you write it. Effects belong inside `live:` so the reader
(and the compiler) can see exactly where the program meets the world.

```clear
# Inside an endpoint — canonical form: instructions string + with data
when user sends note to /api/chat:
  live:
    reply = ask claude 'You are a helpful assistant' with note
  send back reply

# Inside an agent — same shape, different home
agent 'Replier' receiving message:
  live:
    answer = ask claude 'Reply to the user politely' with message
  send back answer

# Live can sit anywhere a statement can — top level, inside endpoints,
# inside agents, inside functions. The `'instructions' with <data>`
# pattern is canonical for every effect call inside the fence.
```

**What `live:` does today (Phase B-1, 2026-04-25):**

- Marks the boundary between pure code and effect code.
- Compiles permissively — any statement is allowed inside, body emits inline
  with a `// live: block — explicit effect fence` comment in the output.
- Is a *fence*, not a scope: variables created inside `live:` are still
  visible to code that follows the block.

**What `live:` will do next (Phase B-2):**

- The compiler will start *requiring* effect-shaped calls (`ask claude`,
  `call API`, `subscribe to`, `every N seconds`) to sit inside a `live:`
  fence. Pure blocks become provably total — they cannot hang.

See `PHILOSOPHY.md` Rule 18 (Total by Default, Effects by Label) for the
design intent.

## Transactions

```clear
# Multi-step database changes that must all succeed or all fail
as one operation:
  decrease product's stock by order's quantity
  save order as new Order
  send email:
    to is order's email
    subject is 'Order confirmed'
```

Compiles to `BEGIN`/`COMMIT`/`ROLLBACK`. If any step fails, all changes are rolled back.

## Comparisons

```clear
x is 5                    # equals
x is not 5                # not equals
x is greater than 10      # >
x is less than 10         # <
x is at least 10          # >=
x is at most 10           # <=
x and y                   # both true
x or y                    # either true
not x                     # inverse
```

---

## Web Pages

```clear
build for web

# Route is optional — title auto-slugifies: 'My App' → /my-app
page 'My App':
  heading 'Welcome'
  text 'Hello world'
  subheading 'Details'
  bold text 'Important'
  italic text 'A note'
  small text 'Fine print'
  link 'Learn more' to '/about'
  divider
  code block 'price = 100'
  image 'https://example.com/photo.jpg'
  image 'https://example.com/avatar.jpg' rounded, 64px wide, 64px tall
```

## Inputs

```clear
# Canonical form (v2)
'What needs to be done?' is a text input saved as a todo
'How much?' is a number input saved as a price
'Notes' is a text area saved as a note
'Gift Wrap' is a checkbox
'Color' is a dropdown with ['Red', 'Green', 'Blue']
'Body' is a text editor saved as body          # rich WYSIWYG (Quill)
'Resume' is a file input saved as a resume

# Articles (a, an, the) are optional but encouraged
'Name' is a text input saved as a name
'Name' is a text input saved as name          # also works

# Legacy form still works
'Name' is a text input that saves to name
```

`text editor` (alias: `rich text editor`, `rich text`) mounts a Quill editor
via CDN with toolbar (headers, bold/italic/underline/strike, lists, links,
blockquote, code block). On every keystroke the editor's HTML flows into
`_state[var]` so the value can be POSTed like any other input. Use this when
you want users to write formatted content (blog posts, notes, rich comments).

## Buttons & Actions

```clear
button 'Save':
  add item to items
  name is ''

button 'Submit':
  send name and email to '/api/signup'

button 'Add':
  send todo as a new todo to '/api/todos'   # 'as a new todo' is for the reader
  get todos from '/api/todos'               # named fetch -- result stored in 'todos'
  todo is ''                                # clear the input

button 'Refresh':
  get todos from '/api/todos'
```

## Display

```clear
display total as dollars called 'Total'
display count called 'Items'
display todos as table showing todo, completed        # column whitelist
display users as table showing name, email, role      # only these columns shown
display response as table called 'Results'            # all columns (no 'showing')

# Action buttons — compiler auto-wires to matching endpoints
display contacts as table showing name, email with delete
display contacts as table showing name, email with edit
display contacts as table showing name, email with delete and edit
# "with delete" adds a Delete button per row (needs DELETE /api/contacts/:id)
# "with edit" adds an Edit button that populates the form (needs PUT /api/contacts/:id)
```

## Charts (ECharts)

```clear
# Bar chart (canonical form — type first)
bar chart 'Revenue' showing sales

# Line chart
line chart 'Trend' showing monthly_data

# Area chart (line with fill)
area chart 'Growth' showing quarterly_data

# Pie chart — groups by field and counts
pie chart 'Status Breakdown' showing tasks by status

# Bar chart with groupBy — groups by field and counts
bar chart 'Issues by Project' showing issues by project

# Title-first form (also valid)
'Revenue' bar chart showing sales

# Legacy form (still works)
chart 'Revenue' as bar showing sales
```

**Three valid forms** (all equivalent):
1. **Type-first (canonical):** `bar chart 'Title' showing data`
2. **Title-first:** `'Title' bar chart showing data`
3. **Legacy:** `chart 'Title' as bar showing data`

Chart types: `line`, `bar`, `pie`, `area`. Data comes from a state variable (array of objects).
For line/bar/area, the compiler auto-detects x-axis (first string field) and y-axis (number fields).
**groupBy works for all chart types** — add `by <field>` to group and count occurrences per unique value.
ECharts CDN is only included when charts are used.

### Chart Modifiers

```clear
# Subtitle — appears below the chart title
bar chart 'Weekly Trends' subtitle 'Opened vs closed issues' showing weekly_stats

# Stacked bars — multiple series stacked on top of each other
bar chart 'Weekly Trends' subtitle 'Opened vs closed' showing weekly_stats stacked

# Combined
bar chart 'Weekly Trends' subtitle 'Last 4 weeks' showing data by category stacked
```

## Display as Cards

```clear
# Render API data as a card grid instead of a table
display posts as cards showing image_url, category, title, excerpt, author_name

# Auto-detect columns (excludes id and timestamp fields)
display products as cards
```

The compiler auto-detects field roles by name:
- `image`/`url`/`img` → hero image; `avatar` → circular avatar in meta row
- `category`/`tag`/`status` → colored badge
- `title`/`name` → card heading
- `excerpt`/`description`/`body` → truncated text (120 chars max)
- `author`/`date` → meta row at bottom

Renders as a responsive 3-column grid with hover lift effect.

## Display as Chat

```clear
display messages as chat showing role, content
```

Renders messages as a chat interface with:
- User/assistant message bubbles
- Full markdown rendering in assistant messages (code blocks, tables, lists, headings)
- Built-in textarea and Send button
- New button to clear chat history
- Scroll-to-bottom button
- Typing indicator (animated dots)
- Enter to send, Shift+Enter for newline

**Input absorption:** When `display as chat` is immediately followed by a text input and Send button, the compiler folds them into the chat component's built-in controls:

```clear
display messages as chat showing role, content
'Type your message...' is a text input saved as user_message
button 'Send':
  send user_message to '/api/chat'
  get messages from '/api/messages'
  user_message is ''
```

This compiles to a single chat component — no duplicate controls.

**The `showing` clause** maps fields: first field is the role field, second is the content field. Default: `role, content`.

**Streaming:** When the POST endpoint calls a streaming agent (one with `stream response`), the chat component automatically switches to real-time token streaming — text appears character-by-character in the assistant bubble as the AI generates it. No extra syntax needed; the compiler detects the connection and wires it automatically.

## Reactive Input Handlers

```clear
# Run code when an input changes
when query changes:
  get results from '/api/search?q={query}'

# Debounced: wait 250ms after last keystroke before firing
when search changes after 250ms:
  get suggestions from '/api/suggest?q={search}'
```

## Conditional UI

```clear
step = 1

button 'Next': increase step by 1
button 'Back': decrease step by 1

if step is 1:
  heading 'Step 1: Enter your name'
if step is 2:
  heading 'Step 2: Confirm'
```

## Page Navigation

```clear
go to '/dashboard'

# Multi-page SPA — routes auto-slugify from title
page 'Home' at '/':      # explicit root
  heading 'Home'
page 'About':            # auto-routes to /about
  heading 'About'
page 'Contact Us':       # auto-routes to /contact-us
  heading 'Contact'
```

## On Page Load

```clear
# Inline (canonical for single actions)
on page load get todos from '/api/todos'

# Block form (for multiple actions)
on page load:
  get todos from '/api/todos'
  get users from '/api/users'
```

## Components

```clear
# Define
define component Card receiving content:
  heading 'Card'
  show content
  divider

# Use with content
show Card:
  text 'Inside the card'
  text 'More content'

# Use with props
define component Greeting receiving name:
  show name

show Greeting(user_name)

# In loops
for each user in users list:
  show UserCard(user)

# From an imported module (namespaced call)
use 'ui'

show ui's Card('Revenue')
show ui's Badge('New')
```

The namespaced form `ui's ComponentName(args)` works wherever the bare form works. Use it when you have a local name that would otherwise collide, or just to make the source file of a component explicit.

### Reserved Component Names

These names collide with built-in content types and **cannot** be used as component names:
`Text`, `Heading`, `Subheading`, `Badge`, `Link`, `Divider`, `Image`, `Button`, `Display`, `Section`

The compiler will error with a suggestion:
```
Component name 'Badge' collides with a built-in keyword.
Use a more specific name like 'BadgeCard', 'CustomBadge', or 'MyBadge'.
```

---

## Styles

### Design System

Clear compiles to DaisyUI v5 + Tailwind CSS v4. Three built-in themes:
- `ivory` -- light enterprise (default). Clean, trustworthy. Like Stripe.
- `midnight` -- dark SaaS. Technical credibility. Like Linear.
- `nova` -- AI/creative. Warm, human. Like Lovable.

See `design-system.md` for full color tokens, typography, and component patterns.
See `ai-build-instructions.md` for the 10 hard design rules.

---

### Built-in Presets

Always reach for a preset first. Presets emit correct DaisyUI/Tailwind classes and
adapt to all three themes. No custom CSS needed.

```clear
# ── Landing page ──────────────────────────────────────────────────────────────
section 'Hero'     with style page_hero:          # centered, py-32, radial glow
section 'Features' with style page_section:       # bg-base-100, py-24
section 'Dark'     with style page_section_dark:  # bg-neutral, white text
section 'Card'     with style page_card:          # bg-base-200, border, shadow
section 'CTA'      with style page_cta:           # bg-primary, centered
section 'Stats'    with style page_stats:         # bg-base-200, py-16

# ── App / dashboard ────────────────────────────────────────────────────────────
section 'Root'    with style app_layout:    # flex h-screen (outermost wrapper)
section 'Nav'     with style app_sidebar:  # w-52, bg-base-200, border-r
section 'Right'   with style app_main:     # flex-1 flex-col overflow-hidden
section 'Top'     with style app_header:   # sticky, h-14, border-b
section 'Body'    with style app_content:  # scrollable, bg-base-200/30, p-6
section 'Widget'  with style app_card:     # bg-base-200, rounded-xl, border, shadow

# ── Generic ────────────────────────────────────────────────────────────────────
section 'Box'  with style card:            # bg-base-100, border, rounded, p-6
section 'Form' with style form:            # bg-base-100, border, p-8, max-w-lg
section 'Code' with style code_box:        # bg-base-200, font-mono, border
```

---

### Style Token Vocabulary

When presets don't fit, compose your own style using **semantic tokens**.
Tokens compile to DaisyUI/Tailwind classes — no raw CSS ever emitted.

```clear
style my_card:
  background is 'surface'   # → bg-base-100
  corners are 'rounded'     # → rounded-xl
  padding is 'comfortable'  # → p-6
  has border                # → border border-base-300/40
  has shadow                # → shadow-sm
  layout is 'column'        # → flex flex-col
  gap is 'normal'           # → gap-4

section 'Card' with style my_card:
  heading 'Title'
  text 'Body text'
```

#### Background tokens  (`background is '...'`)
| Token | Compiles to | Use for |
|-------|------------|---------|
| `'surface'` | `bg-base-100` | Cards, panels, elevated content |
| `'canvas'` | `bg-base-200` | Page backgrounds, sidebars |
| `'sunken'` | `bg-base-300` | Input areas, code blocks |
| `'dark'` | `bg-neutral` | Dark sections, footers |
| `'primary'` | `bg-primary` | CTA banners, highlights |
| `'transparent'` | `bg-transparent` | Overlays, ghost panels |

#### Text tokens  (`text is '...'`)
| Token | Compiles to | Use for |
|-------|------------|---------|
| `'default'` | `text-base-content` | Primary body text |
| `'muted'` | `text-base-content/60` | Secondary, supporting text |
| `'subtle'` | `text-base-content/40` | Timestamps, metadata |
| `'light'` | `text-neutral-content` | Text on dark backgrounds |
| `'primary'` | `text-primary` | Links, accents |
| `'small'` | `text-sm` | Captions, labels |
| `'large'` | `text-lg` | Subheadings, emphasis |

#### Padding tokens  (`padding is '...'`)
| Token | Compiles to | px equivalent |
|-------|------------|---------------|
| `'none'` | `p-0` | 0 |
| `'tight'` | `p-3` | 12px |
| `'normal'` | `p-4` | 16px |
| `'comfortable'` | `p-6` | 24px |
| `'spacious'` | `p-8` | 32px |
| `'loose'` | `p-12` | 48px |

#### Gap tokens  (`gap is '...'`)
| Token | Compiles to | px equivalent |
|-------|------------|---------------|
| `'none'` | `gap-0` | 0 |
| `'tight'` | `gap-2` | 8px |
| `'normal'` | `gap-4` | 16px |
| `'comfortable'` | `gap-5` | 20px |
| `'large'` | `gap-8` | 32px |

#### Corner tokens  (`corners are '...'`)
| Token | Compiles to | Use for |
|-------|------------|---------|
| `'sharp'` | `rounded-none` | Tables, full-bleed elements |
| `'subtle'` | `rounded-md` | Badges, tags |
| `'rounded'` | `rounded-xl` | Cards, panels (default) |
| `'very rounded'` | `rounded-2xl` | Hero cards, landing |
| `'pill'` | `rounded-full` | Avatars, status dots, tags |

#### Shadow tokens
| Syntax | Compiles to | Use for |
|--------|------------|---------|
| `has shadow` | `shadow-sm` | Cards, dropdowns (default) |
| `has large shadow` | `shadow-md` | Modals, popovers |
| `no shadow` | *(nothing)* | Flat design, tables |

#### Border tokens
| Syntax | Compiles to | Use for |
|--------|------------|---------|
| `has border` | `border border-base-300/40` | Cards, panels (default) |
| `has strong border` | `border border-base-300` | Inputs, forms |
| `no border` | `border-0` | Seamless layouts |

#### Layout tokens  (`layout is '...'`)
| Token | Compiles to | Use for |
|-------|------------|---------|
| `'column'` | `flex flex-col` | Vertical stacks (default for sections) |
| `'row'` | `flex flex-row items-center` | Horizontal toolbars, nav |
| `'centered'` | `flex flex-col items-center text-center` | Hero sections, empty states |
| `'split'` | `flex items-center justify-between` | Headers, footers |
| `'2 columns'` | `grid grid-cols-2 gap-5` | Two-col grids |
| `'3 columns'` | `grid grid-cols-3 gap-5` | Feature cards, pricing |
| `'4 columns'` | `grid grid-cols-4 gap-4` | Metric rows, stat cards |

#### Width tokens  (`width is '...'`)
| Token | Compiles to | Use for |
|-------|------------|---------|
| `'full'` | `w-full` | Full-width containers |
| `'narrow'` | `max-w-sm mx-auto` | Forms, modals |
| `'contained'` | `max-w-5xl mx-auto` | App content areas |
| `'wide'` | `max-w-6xl mx-auto` | Landing page sections |

---

### Token Examples

```clear
# Dark landing hero with centered layout
style hero_dark:
  background is 'dark'
  text is 'light'
  layout is 'centered'
  padding is 'loose'
  gap is 'large'

# Compact sidebar card
style sidebar_widget:
  background is 'canvas'
  corners are 'rounded'
  padding is 'tight'
  has border
  layout is 'column'
  gap is 'tight'

# Metrics row
style metrics_grid:
  layout is '4 columns'
  gap is 'normal'
  width is 'full'

# Stat card inside metrics row
style stat_card:
  background is 'surface'
  corners are 'rounded'
  padding is 'comfortable'
  has border
  has shadow

# Feature card (landing page)
style feature_card:
  background is 'canvas'
  corners are 'very rounded'
  padding is 'spacious'
  has border
  has shadow
  layout is 'column'
  gap is 'normal'
```

---

## Style Presets Reference

Presets are built-in section styles that emit production-quality DaisyUI/Tailwind markup.
They handle layout, spacing, responsive breakpoints, hover states, and theme adaptation
automatically. Always reach for a preset before composing tokens manually.

Syntax: `section 'Name' with style preset_name:`

### Marketing Presets

| Preset | Description | Typical children |
|--------|-------------|-----------------|
| `page_navbar` | Sticky top nav bar. First heading = brand, links = nav items, last button = CTA. | `heading`, `link`, `button` |
| `page_hero` | Centered hero section with radial glow background. Large py, text-center. | `small text` (badge), `heading`, `subheading`, `link` (CTA buttons) |
| `hero_left` | Left-aligned hero with space for a product screenshot on the right. | `small text`, `heading`, `subheading`, `link` |
| `logo_bar` | Trusted-by logo strip. Centered flex row with grayscale logos. | `section` children with style `logo_item` containing `text` |
| `feature_split` | Asymmetric bento grid: one large card (2/3) + stacked small cards (1/3). | `heading`, `text`, `section` children with `feature_card_large` + `feature_card_*` |
| `feature_grid` | Even grid of feature cards (auto 2-3 columns). | `heading`, `text`, `section` children with `feature_card` |
| `stats_row` | Horizontal row of stat numbers (4-column grid on desktop). | `section` children with style `stat_item`, each containing `heading` (number) + `text` (label) |
| `testimonial_grid` | Grid of customer quotes with star ratings and quote marks. | `heading`, `section` children with `testimonial_card` |
| `pricing_grid` | 3-column pricing comparison. Center card can be `pricing_card_featured`. | `heading`, `text`, `section` children with `pricing_card` or `pricing_card_featured` |
| `page_cta` | Full-width primary-color CTA banner. Centered text + link. | `heading`, `text`, `link` |
| `faq_section` | Accordion FAQ. Child sections become collapse/expand items. Section title = question, body text = answer. | `heading`, `section` children (title = question, body `text` = answer) |
| `page_footer` | Multi-column footer. First heading = brand, child sections = link columns, last text = copyright. | `heading` (brand), `section` children (column title + `link` items), `small text` (copyright) |

**Blog presets:**

| Preset | Description | Typical children |
|--------|-------------|-----------------|
| `blog_grid` | Blog listing page with card grid (3 columns on desktop). | `heading`, `text`, `section` children with `blog_card` |
| `blog_card` | Individual blog post card with image, badge, title, excerpt, author. | `image`, `badge`, `heading`, `text`, `section` (author meta) |
| `blog_article` | Single blog post layout (Medium-style). Centered max-w-3xl column. | `badge`, `heading`, `text`, `subheading`, `image`, `divider` |

**Dark variants:** Most marketing presets have a `_dark` variant (e.g., `feature_grid_dark`, `pricing_grid_dark`) that uses `bg-neutral` with light text.

**Card sub-presets** used inside marketing grids:

| Preset | Description |
|--------|-------------|
| `feature_card` | Standard feature card with hover border effect |
| `feature_card_dark` | Feature card for dark sections (white/10 border) |
| `feature_card_large` | Bold primary-bg hero card for bento layouts |
| `feature_card_teal` / `_purple` / `_indigo` / `_emerald` / `_rose` / `_amber` | Colored accent cards for bento grids |
| `pricing_card` | Standard pricing tier card |
| `pricing_card_featured` | Highlighted pricing card with ring + scale effect |
| `testimonial_card` | Quote card with auto-injected star rating + quote mark |
| `stat_item` | Centered stat number + label |
| `logo_item` | Grayscale logo with hover opacity |

#### Marketing preset examples

```clear
# Navbar
section 'Nav' with style page_navbar:
  heading 'Acme'
  link 'Features' to '#features'
  link 'Pricing' to '#pricing'
  button 'Get Started':
    go to '/signup'

# Centered hero
section 'Hero' with style page_hero:
  small text 'Now in beta'
  heading 'Build faster with Acme'
  subheading 'The platform that does the thing you need.'
  link 'Start free' to '/signup'
  link 'See demo' to '/demo'

# Stats row
section 'Stats' with style stats_row:
  section 'S1' with style stat_item:
    heading '10k+'
    text 'Happy users'
  section 'S2' with style stat_item:
    heading '99.9%'
    text 'Uptime'

# Feature bento grid
section 'Features' with style feature_split:
  heading 'Why teams choose Acme'
  text 'Three reasons you will love it.'
  section 'Main' with style feature_card_large:
    heading 'Lightning Fast'
    text 'Sub-100ms responses across the board.'
  section 'Small 1' with style feature_card_teal:
    heading 'Secure'
    text 'SOC 2 compliant out of the box.'
  section 'Small 2' with style feature_card_purple:
    heading 'Scalable'
    text 'From 10 users to 10 million.'

# FAQ accordion
section 'FAQ' with style faq_section:
  heading 'Frequently asked questions'
  section 'Q1':
    text 'Yes, there is a generous free tier with no credit card required.'
  section 'Q2':
    text 'We support Slack, email, GitHub, and 200+ integrations via Zapier.'

# Footer
section 'Footer' with style page_footer:
  heading 'Acme'
  section 'Product':
    link 'Features' to '/features'
    link 'Pricing' to '/pricing'
  section 'Company':
    link 'About' to '/about'
    link 'Blog' to '/blog'
  small text '2026 Acme Inc. All rights reserved.'
```

### App UI Presets

> **Phase 1-4 shell upgrade (04-25/26-2026):** the four shell presets `app_layout`,
> `app_sidebar`, `app_main`, `app_header` now emit polished slate-on-ivory chrome
> matching `landing/marcus-app-target.html`. Sidebar is a 240px `<aside>`, header
> is a 56px sticky `<header>` with brand/breadcrumb/actions slots. Sidebar nav
> now has explicit `nav section` / `nav item` syntax with counts, icons, and
> route-based active state. Main content now has `page header` and `tab strip`
> primitives for queue/workbench pages, plus `stat strip` / `stat card` for KPI rows.

| Preset | HTML tag | Description | Typical children |
|--------|----------|-------------|-----------------|
| `app_layout` | `<div>` | Outermost shell. `flex min-h-screen` — page owns the scroll. | Two children: `app_sidebar` + a main column |
| `app_sidebar` | `<aside>` | 240px rail. Hairline-right border, scroll-y, rail bg from `--clear-bg-rail`. First heading = brand; `nav section` groups `nav item` rows. Legacy `text`/`link` children still render as simple nav rows. | `heading` (brand), `nav section`, `nav item` |
| `app_main` | `<main>` | Right-side flex column that fills remaining space. `flex-1 min-w-0 flex flex-col`. | `app_header` + `app_content` |
| `app_header` | `<header>` | 56px sticky top bar. Hairline-bottom, canvas bg. Auto-sorts children into three slots: `heading` → brand-slot, text → breadcrumb-slot, `button` → actions-slot (right-aligned). | `heading`, `text`, `button` |
| `app_content` | `<div>` | Scrollable content area with padding and gap. | `section` children (cards, tables, grids) |
| `app_card` | `<div>` | Dashboard card with border, shadow, and rounded corners. | Any content: `heading`, `text`, tables, charts |
| `metric_card` | Compact stat card for KPI rows. | `display X as number called 'Label'` or `heading` + `text` |
| `app_table` | Table container with rounded corners and border. Overflow hidden. | `display X as table showing ...` |
| `app_modal` | Centered modal dialog card with ring shadow. | `heading`, inputs, `button` |
| `empty_state` | Dashed-border placeholder for empty content areas. | `heading`, `text`, `button` |
| `app_list` | Divided list with hover rows. First heading = list title, remaining children = row items. | `heading` (title), `text`/`link` items (one per row) |
| `form` | Centered form card with max-width constraint. | inputs, `button` |

#### Sidebar navigation

```clear
section 'Sidebar' with style app_sidebar:
  heading 'Deal Desk'

  nav section 'Approvals':
    nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'
    nav item 'Approved' to '/approved' with count approved_count with icon 'check-circle-2'

  nav section 'System':
    nav item 'Settings' to '/settings' with icon 'settings'
```

Counts can be literal values or variables already available on the page.
Quoted icon names map to Lucide icons; quote names with hyphens. The compiled
sidebar marks the matching `data-nav-path` row active from the current route.

#### Page header and tab strip

```clear
section 'Content' with style app_content:
  page header 'CRO Review':
    subtitle '5 deals waiting'
    actions:
      button 'Refresh'
      button 'Export'

  tab strip:
    active tab is 'Pending'
    tab 'Pending' to '/cro'
    tab 'Approved' to '/approved'
    tab 'Escalated' to '/escalated'
```

`page header` emits the main title row, optional subtitle, and right-aligned
actions. `tab strip` emits routed underline tabs and marks the matching path
active from `location.pathname`.

#### Stat strip and stat card

```clear
stat strip:
  stat card 'Pending Count':
    value pending_count
    delta '+1.8 pts vs last week'
    sparkline [3, 4, 6, 5, 8]
    icon 'inbox'
```

`stat strip` wraps a responsive row of KPI cards. Each `stat card` needs one
`value` line. `delta`, `sparkline`, and `icon` are optional.

#### Right detail panel

```clear
detail panel for selected_deal:
  text selected_deal's customer
  display selected_deal's amount as dollars called 'Value'
  text selected_deal's status
  actions:
    button 'Reject'
    button 'Counter'
    button 'Approve'
```

Use `detail panel for selected_row:` next to a selectable table when the user
needs to inspect and act on one record without leaving the queue. The panel body
accepts normal Clear UI primitives. Put final decisions inside `actions:` so
they render as the sticky bottom action bar.

#### App UI preset examples

```clear
# Full app shell
section 'App' with style app_layout:

  section 'Sidebar' with style app_sidebar:
    heading 'MyApp'
    nav section 'Main':
      nav item 'Dashboard' to '/' with icon 'layout-dashboard'
      nav item 'Projects' to '/projects' with count project_count with icon 'folder'
      nav item 'Settings' to '/settings' with icon 'settings'

  section 'Main' with style app_main:

    section 'Header' with style app_header:
      heading 'Dashboard'
      button 'New Project':
        open the New Project modal

    section 'Content' with style app_content:

      section 'Metrics' as 4 columns:
        section 'M1' with style metric_card:
          display revenue as dollars called 'Revenue'
        section 'M2' with style metric_card:
          display users as number called 'Active Users'
        section 'M3' with style metric_card:
          display orders as number called 'Orders'
        section 'M4' with style metric_card:
          display growth as percent called 'Growth'

      section 'Table' with style app_table:
        display projects as table showing name, status, owner

      section 'Empty' with style empty_state:
        heading 'No tasks yet'
        text 'Create your first task to get started.'
        button 'Create Task':
          open the New Task modal

      section 'Activity' with style app_list:
        heading 'Recent Activity'
        text 'Russell deployed v2.1.0'
        text 'Jess updated the pricing page'
        text 'Adam closed issue #42'

  section 'New Project' as modal:
    section 'Form' with style form:
      subheading 'New Project'
      'Name' is a text input saved as a project_name
      button 'Create':
        send project_name as a new project to '/api/projects'
        close modal
```

---

### Token Rules

- **Tokens compile to Tailwind/DaisyUI utilities** — no custom CSS is generated
- **Tokens are additive** — each line appends classes to the section's class list
- **Presets win over tokens** — if a built-in preset exists, use it; tokens are for gaps
- **No hex colors or pixel values** — use tokens; they adapt to all three themes
- **Escape hatch:** `tailwind is '...'` — inject any Tailwind classes directly:
  ```clear
  style my_badge:
    background is 'primary'
    tailwind is 'ring-2 ring-offset-2 ring-primary/30'
  ```
- **Raw CSS still works** — unknown properties fall through to `.style-X {}` CSS

## Inline Layout Modifiers

Layout goes inline with the section declaration. You see the structure by reading the code.

```clear
# Sidebar + main layout
section 'App' full height, side by side:
  section 'Sidebar' dark background, 280px wide, scrollable:
    heading 'Nav'
  section 'Main' fills remaining space, stacked:
    section 'Header' sticky at top, with shadow, padded:
      heading 'Dashboard'
    section 'Content' scrollable, padded:
      text 'Main content here'
```

Available modifiers:
```clear
# Layout
two column layout         # CSS grid, 2 equal columns
three column layout       # 3 columns
full height               # height: 100vh
side by side              # flex row
stacked                   # flex column
scrollable                # overflow-y: auto
fills remaining space     # flex: 1

# Sizing
280px wide                # fixed width, no shrink
padded                    # padding: 1.5rem
centered                  # max-width: 800px, margin auto

# Appearance
dark background           # dark bg + light text
light background          # light gray bg
with shadow               # subtle box shadow
rounded                   # border-radius: 12px
text centered             # text-align: center
```

Use inline modifiers for one-off layout. Use `with style name` for reused visual styling.

## Tabs

```clear
section 'Views' as tabs:
  tab 'Overview':
    heading 'Overview'
    text 'First tab content'
  tab 'Details':
    text 'Second tab content'
  tab 'Settings':
    text 'Third tab content'
```

First tab is active by default. Clicking a tab shows its panel and hides others.

## Collapsible Sections

```clear
# Starts open (click header to collapse)
section 'Details' collapsible:
  text 'Visible by default, click to hide'

# Starts closed (click header to expand)
section 'Advanced' collapsible, starts closed:
  text 'Hidden until clicked'
```

## Slide-in Panel

```clear
# Hidden by default, slides in from the right edge
section 'Help' slides in from right:
  heading 'Help'
  text 'Help content here'

# Toggle it with a button
button 'Help':
  toggle the Help panel
```

## Modal

```clear
# Dialog overlay, hidden by default
section 'Confirm' as modal:
  heading 'Are you sure?'
  text 'This cannot be undone.'
  button 'Yes':
    delete the Item with this id
    close modal
  button 'Cancel':
    close modal

# Open it from a button
button 'Delete':
  open the Confirm modal
```

---

## Database Declaration

```clear
# Explicit storage backend (at top of file)
database is local memory                        # default: in-memory with JSON backup
database is supabase                            # production: Supabase (set SUPABASE_URL + SUPABASE_ANON_KEY)
database is SQLite at 'todos.db'                # file-based
database is PostgreSQL at env('DATABASE_URL')   # raw PostgreSQL
database is PostgreSQL                          # shorthand (uses DATABASE_URL env var)
```

PostgreSQL uses `runtime/db-postgres.js` — same API as the SQLite adapter. Tables are created lazily on first query. Deploy with `clear deploy` to Railway.

When using Supabase, CRUD operations compile to Supabase SDK calls:
- `get all Contacts` → `supabase.from('contacts').select('*')`
- `save X as new Contact` → `supabase.from('contacts').insert(X).select().single()`
- `delete the Contact with this id` → `supabase.from('contacts').delete().eq('id', id)`

Tables must exist in your Supabase dashboard — the compiler doesn't create them.

## Retry, Timeout, Race (Production Resilience)

```clear
# Retry with exponential backoff (1s, 2s, 4s between attempts)
retry 3 times:
  send order to '/api/payment'

# Timeout — cancel if it takes too long
with timeout 5 seconds:
  result = call 'Lead Scorer' with lead_data

# Timeout in minutes
with timeout 2 minutes:
  data = fetch page 'https://slow-api.example.com'

# Race — run multiple tasks, take the first result
first to finish:
  fetch page 'https://api-east.example.com'
  fetch page 'https://api-west.example.com'
```

Retry compiles to a for loop with exponential backoff. Timeout compiles to `Promise.race` with a reject timer. Race compiles to `Promise.race` with multiple concurrent tasks. All three work in both JS and Python.

## Table shorthand

Three equivalent ways to declare a table:

```clear
# Canonical
create a Users table:
  name, text
  email, text, unique

# Shorthand (no `create a` prefix)
table Users:
  name, text
  email, text, unique

# Long form (legacy)
create data shape User:
  name, text
  email, text, unique
```

All three parse to the same `data_shape` node. The shorthand `table Users:` was added in session 45 because Meph reached for it naturally and the parser wasn't wiring `table` → `data_shape` at the statement lead. Use whichever reads best.

Fields accept two forms too:

```clear
table Products:
  price, number, required    # comma form (canonical)
  name is text, required     # is form (also valid)
  description is text        # FK references work here too: `author is User`
```

Both field forms compile to the same schema entry. Pick the one that reads most naturally in context.

## Compound Unique Constraints

```clear
create a Votes table:
  user_id, required
  poll_id, required
  choice, required
  one per user_id and poll_id    # only one vote per user per poll
```

`one per field1 and field2` prevents duplicate combinations. Compiles to `UNIQUE(field1, field2)`.

## DB Relationships

```clear
create a Users table:
  name
  email, unique

create a Posts table:
  title
  body
  author belongs to Users

create a Comments table:
  text
  post belongs to Posts
```

`belongs to` declares a foreign key relationship. The field stores the related record's ID and compiles to an INTEGER column with `REFERENCES`. When you `get all Posts`, the compiler auto-stitches related records by looking up each FK.

## Declaring the owner (Phase A — Live App Editing)

Every auth-enabled Clear app should declare who the owner is. The owner is the one user who sees the Meph edit widget on the running app. Everyone else uses the app normally with no edit surface.

```clear
build for web and javascript backend
database is local memory
owner is 'marcus@acme.com'

allow signup and login
```

When Marcus signs up with that email, his JWT carries `role: 'owner'` and the widget mounts. Anyone else signing up gets `role: 'user'` and the widget stays silent. If you omit the `owner is` line, nobody can ever reach the widget — that's the safe default when the author hasn't decided who owns the app.

## Hidden fields (Phase B — Live App Editing)

When a field is marked `hidden`, the column stays in the database but is stripped from API responses and UI renderers. Data is preserved; un-hiding is a one-line source edit. This is how Clear implements "remove" without destroying data.

```clear
create a Users table:
  name
  email, unique
  notes, hidden              # column kept; data preserved; stripped from responses
```

For renames, add the new field AND mark the old one hidden with `renamed to`:

```clear
create a Users table:
  name
  notes, hidden, renamed to reason   # old field kept, flagged as renamed
  reason                             # new field; runtime can copy data on first read
```

**Runtime behavior.** `db.findAll(table)` and `db.findOne(table, filter)` drop hidden columns from every row they return. Admin/backend code that legitimately needs the full row opts in explicitly:

```js
db.findAll('Users', filter, { includeHidden: true });
db.findOne('Users', { id: 1 }, { includeHidden: true });
```

**Classification.** Adding `, hidden` to an existing field is a `reversible` change (not destructive) — the change classifier detects it and the Live App Editing widget ships it through the reversible path. `renamed to` is also reversible because the data never leaves the table.

## Backend

```clear
build for javascript backend

# Database
database is local memory

create a Users table:
  name, required
  email, required, unique
  role, default 'member'
  age (number), default 0
  active, default true
  created_at_date, auto

# Backend
when user requests data from /api/users:
  send back all Users                 # Shorthand — inline retrieval, up to 50 rows (default cap)

when user requests data from /api/users/active:
  send back all Users where active is true    # Shorthand — with filter

when user requests data from /api/users/all:
  every_user = get every User         # no cap — use when you actually need every row
  send back every_user

when user requests data from /api/users/:id:
  send back the User with this id     # Shorthand — single record by URL param

# Longhand still valid when you need to transform the result first:
when user requests data from /api/users/summary:
  users = get all Users
  count = length of users
  send back { total is count }

when user sends signup to /api/users:
  requires login
  validate signup:
    name is text, required, min 1, max 100
    email is text, required, matches email
    age is number
  # Validation collects ALL errors, returns 400 with:
  # { errors: [{ field: "name", message: "name is required" }, ...] }
  new_user = save signup as new User
  send back new_user with success message

when user updates profile at /api/users/:id:
  requires login
  save profile to Users
  send back 'updated'

when user deletes user at /api/users/:id:
  requires login
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

> **Synonym:** `when user calls GET /api/users:`, `when user calls POST /api/users sending data:`, etc. still work. The English forms above are canonical.

### URL Path Parameters — `this X`

When an endpoint path has a parameter like `/:id` or `/:workspace_id`, access it with `this X` in any expression position. Works inside `look up`, `delete`, filter conditions, or as a standalone value:

```clear
when user calls GET /api/workspaces/:id/items:
  send back all Items where workspace_id is this id

when user calls DELETE /api/todos/:id:
  requires login
  delete the Todo with this id
  send back 'ok'

when user sends member to /api/teams/:team_id/members:
  requires login
  member's team_id is this team_id       # Bind URL param into request body
  save member as new Member
  send back 'added'
```

`this X` compiles to `incoming?.X` (URL path params are exposed on `incoming`). Rule: always prefer multi-word param names (`this team_id`, `this post_id`) — bare `id` sometimes collides with the tokenizer's typo-detection for `if`.

## Auth Scaffolding

```clear
# One line scaffolds full auth system:
# - POST /auth/signup (bcrypt hash, JWT token)
# - POST /auth/login (bcrypt compare, JWT token)
# - GET /auth/me (returns the caller)
# - JWT middleware on every request
allow signup and login
```

Requires `bcryptjs` and `jsonwebtoken` npm packages. Auto-generates an in-memory `_users` table. JWT secret from `JWT_SECRET` env var or auto-generated.

## Auth & Guards

**`requires login` goes on the FIRST line of an endpoint body.** When every auth-gated endpoint puts the guard on line 1, you can scan a file and instantly see which endpoints are protected. The compiler currently permits it in other positions (legacy behavior) but every template and canonical example writes it first. Write it first.

```clear
requires login
requires role 'admin'
guard product's stock is greater than 0 or 'Out of stock'

# Access the authenticated caller
# `caller` is the canonical one-word form. `current user` still works
# as a legacy synonym — both resolve to the same compiled output.
define user_id as: caller's id
define email as: caller's email

# Frontend guard — redirects to /login if no token
page 'Dashboard':
  needs login
  heading 'Welcome back'
```

## Role Definitions

```clear
# Define custom roles with permissions
define role 'editor':
  can edit articles
  can delete comments

define role 'viewer':
  can read articles

# Use in endpoints
requires role 'editor'
```

## File Uploads

```clear
# Upload to cloud storage
upload file to 's3-bucket'

# Accept file uploads in endpoints (see Accept File section)
```

## Social Login

```clear
# Redirect-based social login
login with 'google'
login with 'github'
```

## Cookies

```clear
# Plain cookies (readable by client JS)
set cookie 'theme' to 'dark'
set cookie 'flash' to 'Saved!' for 5 minutes
set cookie 'last_visit' to today for 30 days
favorite = get cookie 'theme'
clear cookie 'theme'

# Signed cookies (tamper-proof, server-side verifiable)
set signed cookie 'user_id' to caller's id for 7 days
verified = get signed cookie 'user_id'
```

`for N days/hours/minutes` sets `maxAge` on the cookie. Without it, the cookie expires when the browser closes.

Plain and signed cookies share secure-by-default flags: `sameSite: 'lax'`, plus `secure: true` whenever `NODE_ENV=production`. Signed cookies additionally set `httpOnly: true` (client JS cannot read them).

Signed cookies require `COOKIE_SECRET` in env. The runtime warns loudly if unset and uses an ephemeral fallback (sessions invalidate on every restart — fine for dev, breaks prod).

`get signed cookie 'name'` returns `undefined` when the signature doesn't verify — never throws — so callers must handle the missing-or-tampered case explicitly.

`cookie-parser` middleware auto-wires when any cookie node exists in the program. No manual `app.use()` needed.

## Production Features

```clear
log every request
allow cross-origin requests
rate limit 10 per minute

# Environment variables
api_key is env('API_KEY')
```

## Webhooks

```clear
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  send back 'ok'
```

## Background Jobs

```clear
background 'cleanup':
  runs every 1 hour
```

## WebSockets (Real-Time)

```clear
# Subscribe to a named channel — creates a WebSocket server
subscribe to 'chat':
  log message
```

Compiles to a native `ws` WebSocket server (JS) or FastAPI WebSocket (Python) with:
- Connection tracking per channel
- Heartbeat/ping-pong every 30s to detect dead connections
- Automatic cleanup on disconnect

### Broadcasting

Send a message to all connected WebSocket clients:

```clear
subscribe to 'chat':
  log message
  broadcast to all message
```

`broadcast to all X` compiles to `wss.clients.forEach(c => c.send(...))` — sends the value to every connected client on that channel.

## Full Text Search

```clear
# Search across all fields (case-insensitive)
results = search Posts for query
```

`search X for Y` filters records where ANY field contains the search term (case-insensitive). Compiles to a `.filter()` that checks every string field with `.toLowerCase().includes()`. Works with any table.

## Has Many Relationships

```clear
create a Users table:
  name
  email, unique

create a Users table:
  name
  email, unique
  posts has many Posts

create a Posts table:
  title
  body
  author belongs to Users
```

`has many` is a field modifier inside the parent table definition (like `belongs to` is a field modifier in the child table). It auto-generates nested REST endpoints (e.g., `GET /api/users/:id/posts`) that return all child records belonging to that parent.

## Agent Argument Guardrails

```clear
agent 'Support' receives message:
  block arguments matching 'password|secret|ssn'
  response = ask claude 'Help this customer' with message
  send back response
```

`block arguments matching 'pattern'` adds a regex guard on all tool inputs. If any argument matches the pattern, the tool call is rejected before execution. Compiles to a runtime check on every tool invocation.

## Database Migrations

```clear
update database:
  in Users table:
    add status field as text, default 'active'
    remove legacy field
```

## Billing Config

```clear
checkout 'Pro Plan':
  price is 'price_pro_monthly'
  mode is 'subscription'
  success_url is '/billing/success'

limit 'api_calls':
  free allows 100 per month
  pro allows 10000 per month
  enterprise allows unlimited
```

---

## Full-Stack

```clear
build for web and javascript backend

# One file = frontend + backend + database
# Backend endpoints serve API
# Frontend pages serve HTML
# One server handles both
```

## Testing

```clear
test 'addition works':
  result = 2 + 3
  expect result is 5

test 'function works':
  result = double(5)
  expect result is 10
```

### Unit-Level Value Assertions

Assert directly on values — no server or HTTP needed. Use inside any `test:` block.

```clear
test 'tax calculation':
  price = 100
  tax = price * 0.08
  expect price is 100
  expect tax is 8.0
  expect tax is not 0

test 'comparison checks':
  score = 85
  expect score is greater than 80
  expect score is less than 100
  expect score is at least 85
  expect score is at most 90

test 'string equality':
  name is 'Alice'
  expect name is 'Alice'
  expect name is not 'Bob'

test 'empty checks':
  filled is 'hello'
  expect filled is not empty
  blank is ''
  expect blank is empty
```

**All comparison forms:**

```clear
expect x is 5              # equals (==)
expect x is not 5          # not equal (!=)
expect x is greater than 5 # > 5
expect x is less than 5    # < 5
expect x is at least 5     # >= 5
expect x is at most 5      # <= 5
expect x is empty          # null, '', or zero-length list
expect x is not empty      # non-null, non-empty string/list
```

When an assertion fails, the error message names the variable and the source line:

```
`tax` was expected to equal 8, but got 9 instead. [clear:5]
```

**Limitation:** unit assertions work on variables and expressions within the test block. Calling functions defined elsewhere in the app requires going through an endpoint.

### Intent-Based Test Assertions

Write tests that read like user stories. The compiler figures out which endpoints to call:

```clear
test 'todo workflow':
  can user create a new todo with title: 'Buy groceries'
  expect it succeeds
  can user view all todos
  expect it succeeds
  can user delete a todo
  expect it succeeds

test 'validation works':
  can user create a todo without a title
  expect it is rejected

test 'auth required':
  deleting a todo should require login

test 'display shows data':
  does the todos list show 'Buy groceries'

test 'agent smoke test':
  can user ask agent 'Support' with message: 'hello'
  expect it succeeds
```

**Intent verbs:** `create` (POST), `view` (GET), `delete` (DELETE), `update` (PUT).

**With fields:** `can user create a todo with title: 'Buy milk' and priority: 'high'` (colon or `is` both work)

**Without fields:** `can user create a todo without a title` — sends request missing the field, expects rejection.

**Auth checks:** `deleting/creating/updating/viewing a todo should require login` — sends unauthenticated request, asserts 401. (`should` is canonical, `does` also works.)

**Display checks:** `does the todos list show 'Buy groceries'` — fetches list and checks response body contains text.

### Response Expectations

```clear
expect it succeeds          # 2xx status
expect it fails             # non-2xx status
expect it requires login    # 401
expect it is rejected       # 400
expect it is not found      # 404
expect response has id      # field exists in response body
expect response contains 'success'  # body contains text
```

---

## File I/O

```clear
# Read a file (returns string)
contents = read file 'data.csv'
config_text = load file 'config.json'

# Write a file (overwrites)
write file 'output.txt' with results

# Append to a file
append to file 'log.txt' with message

# Check if file exists (returns true/false)
found = file exists 'config.json'
```

## JSON

```clear
# Parse JSON string into object
data = parse json response_text
config = from json config_text

# Convert object to JSON string
output = to json results
text = as json data
```

## Regex (Pattern Matching)

```clear
# Find all matches (returns list)
nums = find pattern '[0-9]+' in text

# Test if text matches pattern (returns true/false)
valid = matches pattern '^[a-z]+$' in text

# Replace all matches
cleaned = replace pattern '[0-9]+' in text with 'X'
```

## Date / Time

```clear
# Current timestamp
now = current time
today = current date

# Format a date
formatted = format date now as 'YYYY-MM-DD'
timestamp = format date now as 'YYYY-MM-DD HH:mm:ss'

# Days between two dates
gap = days between start_date and end_date
```

## Data Operations (CSV)

```clear
# Load CSV into array of objects (headers become keys, numbers auto-detected)
sales = load csv 'sales.csv'

# Save array of objects to CSV
save csv 'output.csv' with sales

# Filter rows
big_sales = filter sales where revenue is greater than 10000

# Sort (uses existing sort syntax)
sort sales by revenue descending

# Extract a column
revenues = each row's revenue in sales

# Aggregate
total = sum of revenues
average = avg of revenues
biggest = max of revenues

# Group by field (returns object with arrays)
by_region = group by region in sales

# Count per group
status_counts = count by status in orders

# Unique values
regions = unique values of region in sales
```

## Database

```clear
# Connect to a database
connect to database:
  type is 'postgres'
  url is env('DATABASE_URL')

# Query (returns rows)
users = query 'select * from users where active = true'

# Query with parameters
results = query 'select * from orders where total > :min' with min_total

# Run a statement (no return value)
run 'update users set last_login = now() where id = :id' with user_id
```

## Email

```clear
# Configure email service
configure email:
  service is 'gmail'
  user is env('EMAIL_USER')
  password is env('EMAIL_PASSWORD')

# Send an email
send email:
  to is customer_email
  subject is 'Your order shipped'
  body is 'Tracking: ' + tracking_id
```

## Web Scraper

```clear
# Fetch a web page (returns HTML text)
html = fetch page 'https://example.com'

# Also: scrape page, download page (synonyms)
html = scrape page 'https://news.ycombinator.com'

# Find all matching elements (returns list of objects)
# Each element has: text, href, src, class, id
stories = find all '.titleline a' in html
for each story in stories list:
  show story's text
  show story's href

# Find first matching element (returns single object or nothing)
main_title = find first 'h1' in html
show main_title's text

# Fetch page URL can be a variable
target = 'https://example.com/pricing'
content = fetch page target
prices = find all '.price' in content
```

## PDF Generation

```clear
# Create a PDF with content elements
create pdf 'report.pdf':
  heading 'Monthly Report'
  subheading 'Sales Summary'
  text 'Revenue was up 15% this quarter.'
  divider
  bold text 'Total: $99.99'
  italic text 'Generated automatically'

# Synonyms: generate pdf, make pdf
generate pdf 'summary.pdf':
  heading 'Quick Summary'
  text 'All systems operational.'

# Variable path
output_path = 'invoice.pdf'
create pdf output_path:
  heading 'Invoice #1234'
  text 'Date: March 15, 2026'
  divider
  bold text 'Amount Due: $500.00'
```

Reuses Clear's content vocabulary: heading, subheading, text, bold text, italic text, small text, divider.
JS compiles to PDFKit. Python compiles to reportlab.

## Machine Learning

```clear
# Train a model (Python: scikit-learn, JS: REST call to Python service)
data = load csv 'customers.csv'
model = train model on data predicting churn

# Also: build model, fit model (synonyms)
model = build model on sales predicting revenue

# Model has properties: accuracy, important_features
show model's accuracy

# Predict with a trained model
result = predict with model using age and income

# Also: classify with (synonym)
result = classify with model using signup_days and usage_hours

# Multiple features separated by 'and'
result = predict with model using feature_a and feature_b and feature_c
```

## Multi-Line Strings (Text Block)

```clear
# Multi-line text with interpolation using {variable}
message is text block:
  Hello {name},
  Your order {order_id} has shipped.
  Tracking number: {tracking}

# Also: text template, multiline text (synonyms)
email_body is text template:
  Dear {customer_name},
  Thank you for your purchase.
```

JS compiles to template literals (backticks with `${var}`).
Python compiles to f-strings with triple quotes.

## Parallel Execution (Do All)

```clear
# Run multiple tasks in parallel, collect results
results = do all:
  fetch page 'https://api.example.com/users'
  fetch page 'https://api.example.com/orders'
  fetch page 'https://api.example.com/products'

# Also: run all, all at once (synonyms)
data = run all:
  query 'select * from users'
  query 'select * from orders'
```

JS compiles to `Promise.all([...])`.
Python compiles to `asyncio.gather(...)`.

## Multi-File Modules

```clear
# main.clear
use 'helpers'
result = double(100)
show result

# helpers.clear (separate file, same directory)
double(x) = x * 2
format_price(amount) = '$' + round(amount, 2)
```

`use 'modulename'` reads `modulename.clear` from the same directory and inlines
its functions and variables. Imported functions are called directly (no namespace prefix).

```clear
# Import from a subdirectory
use 'lib/math_utils'
use 'components/helpers'
```

Built-in adapter names (`data`, `database`, `email`, `web-scraper`, `pdf`, `ml`)
are NOT treated as file imports.

Run tests: `node cli/clear.js test myfile.clear`

## CLI (for AI Agents)

The Clear CLI is designed for machines first, humans second. Every command supports `--json`.

```bash
# Validate without compiling (fast)
clear check app.clear --json

# Introspect: list endpoints, tables, pages, agents
clear info app.clear --json

# Security + quality analysis
clear lint app.clear --json

# Auto-fix patchable errors (e.g. missing auth guards)
clear fix app.clear

# Compile
clear build app.clear --out dist/

# Compile + start local server
clear serve app.clear --port 3000

# Watch + rebuild on changes
clear dev app.clear

# Bundle for deployment (Dockerfile + package.json)
clear package app.clear --out deploy/

# Deploy to Railway (package + railway up)
clear deploy app.clear

# Scaffold new project
clear init my-app
```

Exit codes: `0` success, `1` compile error, `2` runtime error, `3` file not found, `4` test failure.

All commands return structured JSON with `--json` flag for agent consumption.

## Build & Deploy

```bash
# Build
node cli/clear.js build app.clear --out dist/

# Build without test gate
node cli/clear.js build app.clear --out dist/ --no-test

# Output files:
#   server.js      -- Express backend
#   index.html     -- DaisyUI frontend
#   style.css      -- External stylesheet (tree-shaken)
#   test.js        -- Auto-generated E2E tests
#   clear-runtime/ -- DB, auth, rate limit modules

# Run
cd dist/ && npm install express && node server.js

# Run E2E tests (server must be running)
node test.js

# Package for deployment (Dockerfile + package.json)
node cli/clear.js package app.clear --out deploy/

# Docker
docker build -t myapp deploy/
docker run -p 3000:3000 myapp

# Deploy to Railway (one command)
node cli/clear.js deploy app.clear
# Auto-detects database backend, packages with correct adapter,
# runs `railway up`, prints env var guidance
```

## npm Package Imports

Use any npm package directly in backend apps:

```clear
use npm 'stripe' as Stripe
use npm 'nodemailer' as mailer
use npm '@sendgrid/mail' as sendgrid   # scoped packages work too

when user sends params to /api/charge:
  client = Stripe(env('STRIPE_SECRET'))
  script:
    const charge = await client.charges.create({ amount: params.amount, currency: 'usd' });
  send back 'charged'
```

- Compiles to `const Stripe = require('stripe');` at the top of server.js
- `as` sets the variable name; defaults to a sanitized version of the package name
- `clear package` includes npm deps in the generated `package.json`

## Shell Commands

Run shell commands from backend endpoints:

```clear
when user sends deploy_request to /api/deploy:
  run command 'git pull origin main'
  run command 'npm run build'
  send back 'Deployed'
```

- Compiles to `execSync(cmd, { stdio: 'inherit' })` in JS, `subprocess.run()` in Python
- `child_process` / `subprocess` auto-imported only when used — no manual imports needed

### Capture Output

Assign a run command to a variable to capture stdout as a string:

```clear
when user requests data from /api/version:
  version = run command 'node --version'
  send back version
```

- Compiles to `execSync(cmd, { encoding: 'utf-8' }).trim()` in JS
- Compiles to `subprocess.run(cmd, capture_output=True, text=True).stdout.strip()` in Python

### Multiline Commands

Use `run command:` with an indented block for complex shell operations:

```clear
when user sends deploy_request to /api/deploy:
  run command:
    git pull origin main
    npm run build
    pm2 restart app
```

- Indented lines are joined with ` && ` and run as a single shell command

## External API Calls

Call any REST API with custom headers, body, and timeout:

```clear
# Simple GET
data = call api 'https://api.github.com/users/octocat'

# Full POST with headers and timeout
result = call api 'https://api.example.com/data':
  method is 'POST'
  header 'Authorization' is 'Bearer ' + env('API_KEY')
  header 'Content-Type' is 'application/json'
  body is request_data
  timeout is 10 seconds
```

Defaults: GET without body, POST with body. 30-second timeout if not specified.
Compiles to `fetch()` with `AbortController`. Auto-detects JSON vs text responses.

## Service Presets

Zero-config wrappers for common services. Just set the env var.

```clear
# Stripe — charge a card (requires STRIPE_KEY)
charge via stripe:
  amount = 2000
  currency is 'usd'
  token is payment_token

# SendGrid — send an email (requires SENDGRID_KEY)
send email via sendgrid:
  to is customer's email
  from is 'team@myapp.com'
  subject is 'Invoice sent'
  body is email_body

# Twilio — send SMS (requires TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM)
send sms via twilio:
  to is customer's phone
  body is 'Your booking is confirmed'
```

## AI Integration

```clear
# Anthropic (canonical form)
answer = ask claude 'Summarize this article' with article_text

# With model selection
answer = ask claude 'Write a poem' with topic using 'claude-haiku-4-5-20251001'

# Structured output
result = ask claude 'Analyze this lead' with lead_data returning JSON text:
  score (number)
  reasoning
  qualified (boolean)

# ask ai still works as an alias
answer = ask ai 'Summarize this' with data
```

Requires `ANTHROPIC_API_KEY` (falls back to `CLEAR_AI_KEY`).

### Streaming (Default)

When `ask claude` appears at statement level inside a POST endpoint, Clear
**streams by default**. The backend emits `text/event-stream` headers and
writes each token as an SSE frame. No keyword needed:

```clear
when user sends query to /api/ask:
  ask claude 'You are a helpful assistant.' with query's question

page 'Chat' at '/':
  question = ''
  answer = ''
  'Ask something' is a text input saved as question
  button 'Send':
    get answer from '/api/ask' with question    # auto-streams into _state.answer
  display answer                                  # grows live as tokens arrive
```

The frontend `get X from URL with Y` auto-detects streaming endpoints (via
the compiled AST) and emits a streaming reader (`fetch` POST → `getReader` →
SSE frame parser → append each chunk to `_state[X]` → call `_recompute()`).
For non-streaming POST endpoints, the same syntax emits a one-shot POST +
JSON parse. Users never think about HTTP verbs.

### Opting out of streaming

When you need a one-shot JSON response (e.g. for server-side post-processing
or when a downstream consumer needs the full text), add `without streaming`:

```clear
when user sends article to /api/summary:
  ask claude 'Summarize this in one sentence.' with article's text without streaming
  # Responds with { text: "..." } after the full answer is generated
```

The frontend `get answer from '/api/summary' with text` auto-detects that
this endpoint does NOT stream, so it uses a plain POST + JSON parse (the
result goes into `_state.answer` all at once).

## Webhooks (Natural Syntax)

```clear
# When a service sends events to your server
when stripe notifies '/stripe/events':
  if event is 'payment.succeeded':
    update order's status to 'paid'

when twilio notifies '/sms-received':
  save message as new IncomingMessage

# Legacy syntax still works:
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  send back 'ok'
```

## Auth Aliases

```clear
# Both work — needs login is the natural form
needs login
requires login
```

---

## AI Agents

### Basic Agent
```clear
agent 'Lead Scorer' receives lead:
  check lead's company is not missing, otherwise error 'Company required'
  score = ask claude 'Rate 1-10 for enterprise potential' with lead's company
  send back score
```

### Agent with Tool Use
```clear
define function look_up_orders(customer_email):
  orders = look up all Orders where email is customer_email
  return orders

agent 'Support' receives message:
  has tool: look_up_orders
  response = ask claude 'Help this customer' with message
  send back response
```

### Skills (Reusable Tool Bundles)
```clear
skill 'Order Management':
  can: look_up_orders, check_status
  instructions:
    Always verify customer identity before changes.
    Include order number in responses.

agent 'Support' receives message:
  uses skills: 'Order Management'
  response = ask claude 'Help' with message
  send back response
```

### Guardrails
```clear
agent 'Public Bot' receives question:
  has tool: search_products
  must not:
    delete any records
    access Users table
    call more than 5 tools per request
  response = ask claude 'Help find products' with question
  send back response
```

### Multi-Turn Conversation
```clear
agent 'Chat' receives message:
  remember conversation context
  response = ask claude 'You are a helpful assistant' with message
  send back response
```

### Agent Memory
```clear
agent 'PA' receives message:
  remember user's preferences
  response = ask claude 'Help the user' with message
  send back response
```

### RAG / Knowledge Base
```clear
agent 'KnowledgeBot' receives question:
  knows about: Documents, Products, FAQ
  answer = ask claude 'Answer using context' with question
  send back answer
```

### Observability
```clear
agent 'Bot' receives message:
  track agent decisions
  response = ask claude 'Help' with message
  send back response
```

### Long Prompts (Text Blocks)
```clear
agent 'Bot' receives message:
  today = format date current time as 'YYYY-MM-DD'
  prompt is text block:
    You are a support agent. Today is {today}.
    Be concise and professional.
  response = ask claude prompt with message
  send back response
```

### Multi-Agent Orchestration

Agents can call other agents. Clear has four orchestration patterns; combine
them freely inside any agent or endpoint body.

**1. Sequential chain — a coordinator delegates in order.**
```clear
agent 'Screener' receives candidate:
  send back candidate

agent 'Scorer' receives candidate:
  score = ask claude 'Rate 1-10' with candidate
  send back score

# Coordinator agent calls specialists in sequence. The result of each
# call flows into the next. Streaming specialists (text response) are
# drained into strings automatically — the coordinator sees a value,
# not a generator.
agent 'Hiring' receives candidate:
  screened = call 'Screener' with candidate
  final = call 'Scorer' with screened
  send back final
```

**2. Parallel fan-out — known arity, all run at once.**
```clear
agent 'Triage' receives text:
  do these at the same time:
    sentiment = call 'Sentiment' with text
    topic = call 'Topic' with text
    lang = call 'Language' with text
  create summary:
    sentiment is sentiment
    topic is topic
    lang is lang
  send back summary
```
Compiles to `Promise.all([...])` in JS / `asyncio.gather(...)` in Python.

**3. Dynamic fan-out — loop over a runtime-sized list, accumulate results.**
```clear
agent 'Researcher' receives question:
  answer = ask claude 'Answer this' with question
  send back answer

agent 'Research All' receives questions:
  findings is an empty list
  for each question in questions:
    answer = call 'Researcher' with question
    add answer to findings
  send back findings
```
Compiles to a real `for..of` loop. When the specialist is a streaming
agent, each call is wrapped in an inline generator-drain IIFE that
concatenates the stream into a string before pushing it to the list.
Use this when the number of items is not known at compile time.

**4. Pipeline — named linear chain, reusable.**
```clear
# Form A — bare agent names (steps get auto-named)
pipeline 'Process Inbound' with text:
  'Classifier'
  'Scorer'
  'Router'

# Form B — named steps (clearer when reading the compiled trace)
pipeline 'Process Inbound' with text:
  classify with 'Classifier'
  score with 'Scorer'
  route with 'Router'

result = call pipeline 'Process Inbound' with data
```
Same data flows through each step end-to-end. The `result` is whatever
the last step returned.

**5. Iterative refinement — `repeat until X, max N times:`**
```clear
agent 'Critic' receives draft:
  score = ask claude 'Rate 1-10 for clarity' with draft
  send back score

agent 'Polish' receives topic:
  draft = ask claude 'Write a first draft' with topic
  score = 0
  repeat until score is greater than 8, max 3 times:
    draft = ask claude 'Improve this' with draft
    score = call 'Critic' with draft
  send back draft
```
Runs the body, checks the condition after each pass, breaks early once
it holds. The `max N times` cap guarantees termination — agent quality
can plateau, and you don't want an infinite loop when it does. Works
in any body (agent, endpoint, top-level), not just workflows.

Other loop forms also work inside agent bodies: `while X:` for
condition-driven loops, `repeat N times:` for fixed-count fan-out,
`for each X in list:` for runtime-sized iteration (Pattern 3 above).

### Legacy: Pipelines
See **Multi-Agent Orchestration → Pattern 4 (Pipeline)** above.

### Legacy: Parallel Execution
See **Multi-Agent Orchestration → Pattern 2 (Parallel fan-out)** above.

### Human-in-the-Loop
```clear
agent 'Refund' receives request:
  if request's amount is greater than 100:
    ask user to confirm 'Process large refund?'
  send back 'Refund processed'
```

### Agent Testing
```clear
test 'handles product question':
  mock claude responding:
    answer is 'The Widget costs $29.99'
    action is 'respond'
  result = call 'Support' with 'How much is the Widget?'
  expect result's action is 'respond'
```

### Agent Evals (auto-generated + user-defined)

Every agent in a Clear file gets **two evals generated automatically**
from its source:

- **Role eval** — Claude grades whether the agent did its job, judged
  against the agent's own `ask claude` prompts, skills, tools, and
  constraints.
- **Format eval** — deterministic shape check. If the agent has a
  `returning JSON text:` schema, each field is verified. Otherwise
  the response just has to be non-empty.

Each POST endpoint that calls an agent gets a **third eval**:

- **E2E eval** — full happy-path hit on the endpoint with a realistic
  probe; grader checks the top-line result.

Internal agents (called by other agents, not exposed via an endpoint)
also get role + format evals — the compiler emits synthetic
`/_eval/agent_<name>` endpoints at eval time so they're individually
graddable without polluting the production app.

Probes are built from the agent's receiving-var name, any matching
table schema, and noun hints from its prompts. No `'hello'` fallback
on any of the 8 core templates.

Run from Studio's Tests tab — Run Evals button. Each row is
individually re-runnable; click Run next to any row to re-grade just
that eval. Export MD / Export CSV buttons save the full run as a
downloadable report.

### User-defined evals — top-level `eval 'name':` block

Scenarios that span multiple agents or hit an endpoint directly. Parses
like `test 'name':` but produces grader-ready specs:

```clear
# Agent scenario with string input + LLM-graded rubric
eval 'Support greets politely':
  given 'Support' receives 'hi'
  expect 'Output opens with a warm greeting and offers to help.'

# Compound-object input
eval 'Screener preserves resume':
  given 'Screener' receives:
    name is 'Jane Doe'
    resume is 'Senior engineer, 8 years backend'
  expect 'Output contains the same resume text unmodified.'

# Endpoint scenario with deterministic shape check
eval 'Classify returns shape':
  call POST '/api/classify' with text is 'billing question'
  expect output has category, confidence
```

Rules:
- `given 'Agent Name' receives ...` scenarios post to the agent's
  endpoint (real if exposed, synthetic if internal).
- `call METHOD 'path' with ...` scenarios post to the literal path.
- `expect '<rubric>'` → LLM-graded.
- `expect output has <fields>` → deterministic format check.

### User-defined evals — per-agent `evals:` subsection

For scenarios scoped to one agent, place them inside the agent block
alongside other directives (before the executable body):

```clear
agent 'Support' receives message:
  evals:
    scenario 'warm greeting':
      input is 'hi'
      expect 'The agent greets the user warmly.'
    scenario 'handles complaint':
      input is 'my order is broken'
      expect 'Acknowledges the problem and offers next steps.'
  response = ask claude 'Help the user' with message
  send back response
```

Scenario inputs override the auto-probe for that entry only. The
auto-generated role + format rows for the agent stay, so you see both
the baseline and your custom signals.

### Grader provider (default Anthropic, Gemini or OpenAI optional)

Set `EVAL_PROVIDER` in `.env` to choose:

- `anthropic` (default) — uses `ANTHROPIC_API_KEY`. Model: claude-sonnet-4.
- `google` — uses `GOOGLE_API_KEY`. Model: gemini-1.5-pro. Independent
  signal — breaks the Claude-grading-Claude loop.
- `openai` — uses `OPENAI_API_KEY`. Model: gpt-4o-mini. Cheapest option.

Studio's Run Evals modal shows the active provider before the run so
you know what'll be graded (and paid for).

### Streaming (Default for Text Agents)
Text agents stream by default — token-by-token via SSE. No directive needed.
```clear
# Streams automatically (text response, no returning JSON text:)
agent 'Chat' receives message:
  response = ask claude 'Help the user' with message
  send back response

# Auto non-streaming (structured output can't stream partial JSON)
agent 'Classifier' receives text:
  result = ask claude 'Classify' with text returning JSON text:
    category
    confidence (number)
  send back result

# Explicit opt-out (pipeline step needs full response)
agent 'Summarizer' receives text:
  do not stream
  summary = ask claude 'Summarize in one sentence' with text
  send back summary
```

### Intent Classification
```clear
# AI-powered routing — sorts input into categories using Claude Haiku
intent = classify message as 'order status', 'return or refund', 'general'
match intent:
  when 'order status':
    response = ask claude 'Look up their order' with message
  when 'return or refund':
    response = ask claude 'Process the return' with message
  otherwise:
    response = ask claude 'General help' with message
```

### Extended RAG (Knowledge Sources)
```clear
# Tables (existing) — keyword search against DB records
knows about: Products, FAQ

# URLs (new) — fetches page text at startup, keyword search
knows about: 'https://docs.myapp.com/support'

# Files (new) — reads file at startup, keyword search
knows about: 'policies/return-policy.pdf'
knows about: 'handbook/guide.docx'
knows about: 'README.md'

# Mixed — all sources in one directive
knows about: Products, 'https://docs.example.com', 'guide.txt'
```

Supported file types: `.pdf` (pdf-parse), `.docx` (mammoth), `.txt`, `.md` (fs.readFileSync).

### Multi-Context Ask AI
```clear
# Pass multiple variables as context — merged into JSON object
summary = ask claude 'Write a report' with orders, returns, inventory
```

Compiles to: `_askAI(prompt, JSON.stringify({ orders, returns, inventory }))`.

### Scheduled Agents
```clear
# Interval-based (existing)
agent 'Daily Report' runs every 1 day:
  leads = get all Leads where status is 'new'
  send back leads

# With time-of-day (new) — compiles to node-cron
agent 'Morning Report' runs every 1 day at '9:00 AM':
  orders = get all Orders
  send back orders

agent 'Afternoon Check' runs every 1 day at '2:30 PM':
  low_stock = get_low_stock_items()
  send back low_stock
```

### Send Email with Inline Recipient
```clear
# Inline recipient — cleaner than config block when recipient is dynamic
send email to order's customer_email:
  subject is 'Your order has shipped'
  body is 'Track at {tracking_url}'

# Config block (existing) — still works
send email:
  to is 'admin@example.com'
  subject is 'Alert'
  body is 'Something happened'
```

### Convenience: find all, today
```clear
# find all — synonym for look up all
active_orders = find all Orders where status is 'active'
all_products = find all Products

# today — start of current day as Date
recent = find all Orders where created_at is today
date = today
```

## Policies (Enact Guards)

App-level safety policies. Pure runtime guards — no LLMs, just deterministic checks.

### Database Safety
```clear
policy:
  block schema changes
  block deletes without filter
  block updates without filter
  protect tables: Users, AuditLog
```

### Prompt Injection
```clear
policy:
  block prompt injection
```

### Access Control
```clear
policy:
  require role 'admin'
  block reads on CreditCards, AuditLog
```

### Code Freeze & Maintenance
```clear
policy:
  code freeze active
```

### Email, Slack, Filesystem
```clear
policy:
  no mass emails
  block direct messages
  block file deletion
  block file types: '.env', '.key', '.pem'
  restrict paths: '/app', '/data'
```

### Git Safety
```clear
policy:
  block push to main
  block merge to main
  block deleting branches
  max files per commit = 10
  require branch prefix 'feature/'
```

### CRM & Cloud
```clear
policy:
  block duplicate contacts
  require human approval for gdrive delete
```

All guards compile to runtime middleware that wraps db operations. Policy violations return 403 with a clear error message.

---

## Workflows (Stateful Agent Graphs)

### Basic Workflow
```clear
workflow 'Support Ticket' with state:
  state has:
    message, required
    category
    status, default 'new'
  step 'Triage' with 'Triage Agent'
  step 'Resolve' with 'Resolution Agent'
```

### Conditional Routing
```clear
workflow 'Router' with state:
  state has:
    message, required
    category
  step 'Triage' with 'Triage Agent'
  if state's category is 'software':
    step 'Software Fix' with 'Software Specialist'
  otherwise:
    step 'General' with 'General Agent'
  step 'Done' with 'Closer Agent'
```

### Retry Loops
```clear
workflow 'Content Review' with state:
  state has:
    draft, required
    quality_score (number), default 0
  step 'Write' with 'Writer Agent'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer Agent'
    if state's quality_score is less than 8:
      step 'Revise' with 'Writer Agent'
  step 'Publish' with 'Publisher Agent'
```

### Parallel Branches
```clear
workflow 'Analysis' with state:
  state has:
    text, required
    sentiment
    topics
  at the same time:
    step 'Sentiment' with 'Sentiment Agent' saves to state's sentiment
    step 'Topics' with 'Topic Agent' saves to state's topics
  step 'Report' with 'Report Agent'
```

### Durable Execution (DB Checkpoint)
```clear
workflow 'Onboarding' with state:
  save progress to Workflows table
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
```

### Durable Execution (external engine)
```clear
workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
```

`runs durably` is the canonical, vendor-neutral form. The compiler picks the
backend at emit time based on `--target`:
- Node / default → Temporal SDK
- `--target cloudflare` → Cloudflare Workflows

`runs on temporal` is a legacy synonym that still parses to the same AST flag.

### Workflow Observability
```clear
workflow 'Support' with state:
  track workflow progress
  state has:
    message, required
  step 'Triage' with 'Triage Agent'
  step 'Resolve' with 'Resolution Agent'
# _state._history contains state snapshots at each step
```

### Running a Workflow
```clear
when user sends ticket to /api/support:
  result = run workflow 'Support' with ticket
  send back result
```

---

## Approval Queues (Single-Stage Reviewer)

When an entity needs human approval before its status changes, declare a queue. One block generates the audit table, the outbound notification queue, the filtered GET handler, and a login-gated PUT handler per action.

### Basic Queue
```clear
create a Deals table:
  customer
  status, default 'pending'

queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter
```

This emits:
- A `deal_decisions` audit table (`deal_id`, `decision`, `decided_by`, `decided_at`, `decision_note`).
- `GET /api/deals/queue` — filtered by `status = 'pending'`.
- `GET /api/deal-decisions` — full audit history.
- `PUT /api/deals/:id/approve`, `/reject`, `/counter` — each requires login, updates the deal's status, and inserts an audit row.

### Queue with Notifications
```clear
create a Deals table:
  customer
  customer_email
  rep_email
  status, default 'pending'

queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  email customer when counter, awaiting customer
  email rep when approve, reject
```

Adds a `deal_notifications` outbound queue table and inserts a row whenever a matching action fires. Recipient email is resolved by convention — `email customer when ...` reads `deal.customer_email`. If the field is missing, the validator warns; the notification row is still queued with a blank email.

### Action keyword variants (F4)

`options:` and `buttons:` are accepted as synonyms for `actions:`. The clauses below all parse identically:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter

queue for deal:
  reviewer is 'CRO'
  options: approve, reject, counter

queue for deal:
  reviewer is 'CRO'
  buttons: approve, reject, counter
```

### `waiting on customer` canonical action (F4)

`waiting on customer` reads more naturally than legacy `awaiting customer`. Both forms produce the same terminal status (`'awaiting'`) so an email-trigger watching `'awaiting'` fires either way. URL slug for `waiting on customer` is `/api/deals/:id/waiting`:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, waiting on customer
```

### Plural input is accepted (F2)

`queue for deals:` produces the same audit table + URLs as `queue for deal:`. The parser singularizes English plurals (`-s`, `-ies`, `-(s|x|z|sh|ch)es`) on the way in. `-ss` endings (`address`, `business`, `status`) stay as-is so they don't get truncated wrong.

**Canonical form is `email <role> when <action>, <action>`** (the verb names HOW the recipient gets reached). The legacy form `notify <role> on <action>` still parses for backwards compatibility, but new code should prefer `email`. Future communication primitives will follow the same pattern: `slack <role> when ...`, `text <role> when ...`, `webhook <role> when ...`.

### Action naming
- Multi-word actions slugify to a single URL token: `awaiting customer` → `PUT /api/deals/:id/awaiting`.
- Status transitions: `approve` → `'approved'`, `reject` → `'rejected'`, `counter` → `'awaiting'`, `awaiting customer` → `'awaiting'`. Other action names become the status verbatim.

### Triggered emails — `email <role> when <entity>'s status changes to <value>:`

Same `email <role> when <trigger>` atom as the queue clause above, but at the top level. Declares: when ANY URL handler sets the entity's status to the trigger value, queue an email row. Today the queue primitive's auto-generated PUT handlers wire this up automatically — when the action's terminal status matches the trigger value, the handler queues an email after the audit row.

```clear
create a Deals table:
  customer
  customer_email
  status, default 'pending'

queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter

email customer when deal's status changes to 'awaiting':
  subject is 'We countered your offer'
  body is 'Sarah from our team has prepared a counter offer for you. Please review and respond.'
  provider is 'agentmail'
  track replies as deal activity
```

The compiler emits a single shared `workflow_email_queue` table per app (used by every email trigger). Each queued row has: `entity_type`, `entity_id`, `recipient_role`, `recipient_email` (resolved via the `<role>_email` field on the entity — same convention as the queue's `email when` clause), `subject`, `body`, `provider` (default `'agentmail'`), `reply_tracking`, `queue_status` (`'pending'` until a delivery worker flips it), `attempts`, `last_error`, `queued_at`/`sent_at`/`replied_at`.

**Real provider sends are deferred behind an explicit `enable live email delivery via X` directive** (not yet shipped). Default builds queue rows only — tests, previews, and dev never accidentally email a customer. The queued rows show up in your app's tables, so you can verify the right messages would have gone out before flipping the live switch.

**Sub-clauses inside the body:**
- `subject is '...'` (required)
- `body is '...'` (required)
- `provider is '...'` (optional; default `'agentmail'`; valid values: `agentmail`, `sendgrid`, `resend`, `postmark`, `mailgun`)
- `track replies as <free text>` (optional; e.g. `track replies as deal activity`)

**Hard-fails on:**
- Entity that isn't a declared table (`email customer when fakeentity's status changes to ...`)
- Missing required `subject` or `body`
- Unknown body line (same F1 pattern as queue clauses — typos get a did-you-mean hint)

### CSV export (auto-included; opt out with `no export`)

Every queue auto-emits `GET /api/<entity>/export.csv` — a plain CSV download of every row in the entity's table, with proper RFC 4180 escaping (commas, quotes, and newlines wrapped + doubled correctly) and sensitive fields (password, token, api_key, secret, hash) automatically omitted. Marcus moves FROM spreadsheets, but spreadsheets stay in his workflow for reporting and handoffs — default-on by GTM list.

Suppress with `no export`:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  no export
```

When suppressed, the CSV URL is not emitted and the auto-rendered Download button (when Phase 2 lands) is hidden.

### Wiring action buttons
The queue primitive does not yet auto-render UI buttons (deferred). Hand-add buttons that call the auto-generated PUT URLs:

```clear
display pending as table showing customer, status with actions:
  'Approve' is primary
  'Reject' is danger
```

Bind each button to the matching PUT URL the queue emitted.

---

## Scheduled Tasks (Cron)

Run code on a schedule — intervals or specific times:

### Interval

```clear
every 5 minutes:
  stale = look up all Sessions where created_at is less than 24 hours ago
  delete stale from Sessions
```

- Compiles to `setInterval(async () => { ... }, 300000)` in JS
- Supports: `minutes`, `hours`

### Daily Schedule

```clear
every day at 9am:
  users = look up all Users
  for each user in users:
    send email to user's email with subject 'Daily digest'
```

- Compiles to a daily scheduler using `setTimeout` that fires at the specified time
- Supports: `8am`, `2:30pm`, `9:00am` etc.
- Time parsing handles `hour:minute am/pm` format

---

## HTTP Test Assertions

Write integration tests that make real HTTP calls against your app:

```clear
test 'create a user':
  call POST /api/users with name is 'Alice' and email is 'alice@test.com'
  expect response status is 201
  expect response body has id

test 'list users':
  call GET /api/users
  expect response status is 200
  expect response body length is greater than 0
```

### Intent-Based Tests (Recommended)

Instead of writing raw HTTP calls, describe what you want to test in English:

```clear
test 'todo CRUD':
  can user create a new todo with title: 'Buy groceries'
  expect it succeeds
  can user view all todos
  expect it succeeds
  can user delete a todo
  expect it succeeds

test 'validation':
  can user create a todo without a title
  expect it is rejected

test 'security':
  deleting a todo should require login

test 'agent works':
  can user ask agent 'Support' with message: 'hello'
  expect it succeeds
```

#### Nameless Tests (preferred — zero redundancy)

```clear
# The first body line becomes the test name automatically
test:
  can user create a new todo with title: 'Buy groceries'

test:
  deleting a todo should require login

# Multi-step — first line is the name, all lines execute
test:
  can user create a new todo with title: 'Buy groceries'
  does the todos list show 'Buy groceries'
```

The compiler maps intents to HTTP calls: `create` = POST, `view` = GET, `delete` = DELETE, `update` = PUT. It auto-discovers the right endpoints from your table and endpoint definitions.

### Available Assertions

```clear
# Exact status code
expect response status is 200

# Field existence
expect response body has 'field_name'
expect response has id

# Body content
expect response body length is greater than 0
expect response contains 'success'

# Semantic checks (for intent-based tests)
expect it succeeds                     # 2xx status
expect it fails                        # non-2xx status
expect it requires login               # 401
expect it is rejected                  # 400
expect it is not found                 # 404

# Variable checks
expect todos has 'Buy groceries'       # variable contains text
```

- Test blocks compile into the auto-generated E2E test file
- Run alongside auto-generated endpoint tests
- `call METHOD /path` supports `with field is value` for request body
- Intent-based tests and raw HTTP tests can be mixed in the same test block
- User-written tests appear after auto-generated tests in the test output
- Auto-generated tests now have English names: "Creating a new todo succeeds", "User can create a todo and see it in the list"

---

## Streaming AI Responses

Stream AI responses directly to the client as Server-Sent Events:

```clear
when user sends chat to /api/chat:
  stream ask claude 'Help the user' with chat's message
```

- Compiles to SSE endpoint with `Content-Type: text/event-stream`
- Uses `_askAIStream` async generator — sends each token as it arrives
- Client receives `data: {"text": "chunk"}` events
- Works with `ask claude` or `ask ai`
- Supports `with` context parameter

### Without context

```clear
when user sends request to /api/generate:
  stream ask ai 'Write a haiku about coding'
```

### Agents auto-stream by default

Agents with text responses (no `returning:` schema) already stream automatically — no `stream` keyword needed:

```clear
agent 'Chat' receives message:
  response = ask claude 'Help the user' with message
  send back response
# This agent streams token-by-token automatically
```

---

## Loading Overlay

```clear
# Show a full-page loading spinner
show loading

# Hide it when done
hide loading
```

Compiles to a centered overlay with a DaisyUI spinner. Useful for long-running operations like AI calls or file uploads.

## Toast / Alert / Notification

```clear
show toast 'Settings saved'
show alert 'Something went wrong'
show notification 'New message received'
```

All three are synonyms — they display a temporary notification message. Compiles to a DaisyUI toast that auto-dismisses after 3 seconds.

## Hide Element

```clear
# Hide a section or element by name
hide the sidebar
hide the details panel
```

Compiles to setting `display: none` on the target element.

## Clipboard Copy

```clear
# Copy a value to the clipboard
copy invite_link to clipboard
copy user's email to clipboard
```

Compiles to `navigator.clipboard.writeText(value)`.

## Download File

```clear
# Trigger a file download
download report as 'report.csv'
download data as 'export.json'
```

Compiles to creating a Blob URL and programmatically clicking a hidden `<a>` element.

## Display Formats

```clear
price = 29.99
rate = 0.15
count = 42
created = current time
data is an empty map

# Currency — uses toLocaleString with USD style
display price as dollars called 'Total'
display price as currency called 'Price'

# Percentage
display rate as percent called 'Growth'

# Date — uses toLocaleDateString
display created as date called 'Created'

# JSON — renders formatted JSON in a <pre> block
display data as json called 'Raw Data'

# Plain number (default)
display count called 'Items'
```

Format types: `dollars`/`currency`, `percent`, `date`, `json`, `number` (default).

## Video and Audio

```clear
# Embed a video player
show video 'https://example.com/demo.mp4'

# Embed an audio player
show audio 'https://example.com/podcast.mp3'
```

Video compiles to `<video controls>` with source. Audio compiles to `<audio controls>` with source. Both support standard web media formats.

## Deploying your app

Deployment is a Studio feature, not a language primitive — you don't write deploy instructions in `.clear` source, you click the **Deploy** button in Clear Studio. Behind the button:

1. Studio calls `packageBundle()` on your compiled app (the same logic `clear package` uses in the CLI).
2. The bundle (server.js, index.html, package.json, Dockerfile, runtime) is tarred and POSTed to the shared builder machine.
3. The builder runs `docker build` → `docker push registry.fly.io/<app>:<sha>` → `flyctl deploy` and returns a live URL.
4. You get back something like `https://clear-acme-todos-a7b3c9.fly.dev` in seconds.

**Secrets.** `requires login` triggers auto-generation of a random `JWT_SECRET`. Blocks like `use stripe` prompt for the matching API key in the Deploy modal.

**AI calls.** `ask claude` and `define agent` route through Clear's metered AI proxy in deployed apps — no need to paste an Anthropic key, and usage shows up in the plan badge `$spent/$credit`.

**Custom domain.** Type your domain in the Deploy modal — Studio calls `flyctl certs create` and returns the DNS records to point at Fly. Certs auto-renew.

**Rollback.** The Deploy History drawer lists the last 10 releases. Click Rollback on any of them.

**Re-deploys are automatic incremental updates (Cloudflare target).** When you click Publish on an app that's already live, Studio takes the fast path: it re-uploads only the new Worker bundle and records a new version against the existing tenant — no fresh D1 database, no domain reattach, no full secret reset. Wall clock drops from ~12s (fresh deploy) to ~2s (update). Schema changes — anything that changes a `migrations/*.sql` file or `wrangler.toml` — pause the update and ask for an explicit "apply migration + update" click, because SQLite has no atomic schema swap and in-flight requests would briefly see the new schema against old code. The Publish window also exposes a one-click rollback to any of the last 20 versions.

**Limits.** Pro plan: 25 apps, $10/mo of AI credits included, $99/mo. See `plans.js` for the source of truth.
