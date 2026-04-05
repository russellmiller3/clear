# Clear — AI Style Guide

This file tells Claude HOW to write Clear code. The compiler is permissive
(accepts aliases, both quote styles, etc.) but Claude should always write
the canonical form for maximum readability.

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

Visual hint for the human reader: `=` lines are formulas to check,
`is` lines are values to note. The compiler doesn't care.

## Design System

Clear compiles to **DaisyUI v5 + Tailwind CSS v4**. The compiler emits
DaisyUI semantic classes and Tailwind utilities -- never custom CSS for
standard components.

**Use built-in presets for sections.** Don't define custom styles for
things the presets already handle:
```
# GOOD: use the preset
section 'Hero' with style page_hero:
  heading 'Welcome'

# BAD: redefining what the preset already does
style my_hero:
  background is '#0f0f23'
  color is 'white'
  padding = 80
  text centered
section 'Hero' with style my_hero:
  heading 'Welcome'
```

**Available presets:** `page_hero`, `page_section`, `page_section_dark`,
`page_card`, `app_layout`, `app_sidebar`, `app_main`, `app_content`,
`app_header`, `app_card`, `hero`, `section_light`, `section_dark`,
`card`, `code_box`.

**Dashboard layout pattern** (use these presets together):
```
theme 'midnight'
page 'Dashboard' at '/':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      heading 'Menu'
    section 'Right' with style app_main:
      section 'Top' with style app_header:
        heading 'Dashboard'
      section 'Body' with style app_content:
        section 'Card' with style app_card:
          text 'Content here'
```

**Three themes:** Set with `theme 'name'` directive at the top of the file.
`ivory` (default, light), `midnight` (dark), `nova` (warm).
Full token spec in `design-system.md`. AI build rules in `ai-build-instructions.md`.

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
```

The label auto-generates from the variable name: `subtotal` -> "Subtotal",
`total_due` -> "Total Due". Only use `called` when the label differs.

## Endpoints

**Canonical: when user calls METHOD /path:**
```
when user calls GET /api/users:
  all_users = get all Users
  send back all_users

when user calls POST /api/users sending user_data:
  requires auth
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
  requires auth
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

**`with success message`** adds a `message` field and returns 201.
**`delete the X with this id`** removes the record matching the URL param.
**`requires auth`** is canonical (the `this endpoint` prefix is optional).

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
database is local memory                    # default: in-memory with JSON file backup
database is SQLite at 'todos.db'            # file-based
database is PostgreSQL at env('DATABASE_URL') # production
```

If no `database is` declaration is present, the compiler uses local memory.
This is fine for development but the reader should know that's what's happening.

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
  requires auth
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

The compiler will **refuse to compile** DELETE or PUT endpoints without `requires auth`.
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

When the AI should return an object (not just a string), use `returning:`
with an indented field block. Each field has an optional type: `(number)`,
`(boolean)`, `(list)`, or plain (defaults to text).

```
# GOOD: structured output -- result is an object with typed fields
set result to ask ai 'Analyze this lead for enterprise potential' with lead returning:
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
