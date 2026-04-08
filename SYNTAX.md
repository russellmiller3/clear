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
# String interpolation with {variable}
greeting is 'Hello, {name}! You have {count} items.'

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
```

## Functions

```clear
# One-liner
double(x) = x * 2
tax(price, rate) = price * rate / 100

# Block function
define function greet(name):
  message = 'Hello, ' + name
  return message
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

# Each (with "list" keyword for clarity)
for each item in items list:
  show item

# While
while count is less than 10:
  increase count by 1
```

## Error Handling

```clear
try:
  risky_operation()
if there's an error:
  show 'Something went wrong'
```

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

page 'My App' at '/':
  heading 'Welcome'
  text 'Hello world'
  subheading 'Details'
  bold text 'Important'
  italic text 'A note'
  small text 'Fine print'
  link 'Learn more' to '/about'
  divider
  code block 'price = 100'
```

## Inputs

```clear
# Canonical form (v2)
'What needs to be done?' is a text input saved as a todo
'How much?' is a number input saved as a price
'Notes' is a text area saved as a note
'Gift Wrap' is a checkbox
'Color' is a dropdown with ['Red', 'Green', 'Blue']

# Articles (a, an, the) are optional but encouraged
'Name' is a text input saved as a name
'Name' is a text input saved as name          # also works

# Legacy form still works
'Name' is a text input that saves to name
```

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
# Line chart — auto-detects x (string field) and y (number fields)
chart 'Revenue' as line showing sales

# Bar chart
chart 'Sales by Region' as bar showing sales

# Area chart (line with fill)
chart 'Trend' as area showing monthly_data

# Pie chart — groups by field and counts
chart 'Status Breakdown' as pie showing tasks by status
```

Chart types: `line`, `bar`, `pie`, `area`. Data comes from a state variable (array of objects).
For line/bar/area, the compiler auto-detects x-axis (first string field) and y-axis (number fields).
For pie, use `by <field>` to group and count. ECharts CDN is only included when charts are used.

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

# Multi-page SPA
page 'Home' at '/':
  heading 'Home'
page 'About' at '/about':
  heading 'About'
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

### Built-in Presets

Clear ships with style presets that emit DaisyUI/Tailwind classes directly. No custom CSS needed:

```clear
# Landing page presets
section 'Hero' with style page_hero:             # dark bg, centered, big padding
  heading 'Welcome'
section 'Features' with style page_section:       # light bg, standard padding
  heading 'Features'
section 'CTA' with style section_dark:            # dark bg, white text
  heading 'Get Started'
section 'Pricing' with style card:                # card with border, rounded
  heading 'Plans'

# App/dashboard presets
section 'Nav' with style app_sidebar:             # DaisyUI menu, scrollable
  heading 'Menu'
section 'Main' with style app_content:            # flex-1, padded, scrollable
  heading 'Dashboard'
section 'Top' with style app_header:              # DaisyUI navbar, sticky
  heading 'Title'
section 'Widget' with style app_card:             # card with border
  heading 'Stats'
```

Override any preset by defining a `style` block with the same name in your file.
User-defined styles always take priority over built-in presets.

### Custom Styles

```clear
# Theme variables
primary is '#2563eb'
surface is '#f8fafc'

# Style block
style card:
  background is primary         # uses variable
  padding = 24
  rounded = 12
  shadow is 'medium'
  color is 'white'
  text_size is '1.25rem'
  bold is true

# Apply to section
section 'Info' with style card:
  heading 'Details'
```

## Layout Patterns

```clear
style header:
  sticky at top                 # position: sticky + z-index

style body:
  scrollable                    # overflow-y: auto
  fills remaining space         # flex: 1

style grid:
  two column layout             # CSS grid, 2 equal columns
  three column layout           # 3 columns
  two row layout                # 2 equal rows

style other:
  stacked                       # flex column
  no_shrink                     # flex-shrink: 0
  full_height                   # height: 100vh
  full_width                    # width: 100%
  centered                      # margin auto + max-width 800px
  text centered                 # text-align: center
  wraps                         # flex-wrap: wrap

style fixed_sidebar:
  fixed on left                 # position: fixed
  width is '250px'
```

## Responsive

```clear
style mobile:
  for_screen is 'small'         # @media (max-width: 640px)
  padding = 8
```

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
```

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

## Compound Unique Constraints

```clear
create a Votes table:
  user_id, required
  poll_id, required
  choice, required
  one per user_id and poll_id    # only one vote per user per poll
```

`one per field1 and field2` prevents duplicate combinations. Compiles to `UNIQUE(field1, field2)`.

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
when user calls GET /api/users:
  all_users = get all Users
  send back all_users

when user calls GET /api/users/:id:
  define user as: look up records in Users table where id is incoming's id
  if user is nothing then send back 'Not found' status 404
  send back user

when user calls POST /api/users sending user_data:
  requires auth
  validate user_data:
    name is text, required, min 1, max 100
    email is text, required, matches email
    age is number
  new_user = save user_data as new User
  send back new_user with success message

when user calls PUT /api/users/:id sending update_data:
  requires auth
  save update_data to Users
  send back 'updated'

when user calls DELETE /api/users/:id:
  requires auth
  requires role 'admin'
  delete the User with this id
  send back 'deleted' with success message
```

## Auth & Guards

```clear
requires auth
requires role 'admin'
guard product's stock is greater than 0 or 'Out of stock'

# Access current user
define user_id as: current user's id
define email as: current user's email
```

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
```

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
result = ask claude 'Analyze this lead' with lead_data returning:
  score (number)
  reasoning
  qualified (boolean)

# ask ai still works as an alias
answer = ask ai 'Summarize this' with data
```

Requires `ANTHROPIC_API_KEY` (falls back to `CLEAR_AI_KEY`).

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
requires auth
```

---

## AI Agents

### Basic Agent
```clear
agent 'Lead Scorer' receiving lead:
  check lead's company is not missing, otherwise error 'Company required'
  score = ask claude 'Rate 1-10 for enterprise potential' with lead's company
  send back score
```

### Agent with Tool Use
```clear
define function look_up_orders(customer_email):
  orders = look up all Orders where email is customer_email
  return orders

agent 'Support' receiving message:
  can use: look_up_orders
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

agent 'Support' receiving message:
  uses skills: 'Order Management'
  response = ask claude 'Help' with message
  send back response
```

### Guardrails
```clear
agent 'Public Bot' receiving question:
  can use: search_products
  must not:
    delete any records
    access Users table
    call more than 5 tools per request
  response = ask claude 'Help find products' with question
  send back response
```

### Multi-Turn Conversation
```clear
agent 'Chat' receiving message:
  remember conversation context
  response = ask claude 'You are a helpful assistant' with message
  send back response
```

### Agent Memory
```clear
agent 'PA' receiving message:
  remember user's preferences
  response = ask claude 'Help the user' with message
  send back response
```

### RAG / Knowledge Base
```clear
agent 'KnowledgeBot' receiving question:
  knows about: Documents, Products, FAQ
  answer = ask claude 'Answer using context' with question
  send back answer
```

### Observability
```clear
agent 'Bot' receiving message:
  track agent decisions
  response = ask claude 'Help' with message
  send back response
```

### Long Prompts (Text Blocks)
```clear
agent 'Bot' receiving message:
  today = format date current time as 'YYYY-MM-DD'
  prompt is text block:
    You are a support agent. Today is {today}.
    Be concise and professional.
  response = ask claude prompt with message
  send back response
```

### Pipelines
```clear
pipeline 'Process Inbound' with text:
  'Classifier'
  'Scorer'
  'Router'

result = call pipeline 'Process Inbound' with data
```

### Parallel Execution
```clear
do these at the same time:
  sentiment = call 'Sentiment' with text
  topic = call 'Topic' with text
  lang = call 'Language' with text
```

### Human-in-the-Loop
```clear
agent 'Refund' receiving request:
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

### Streaming (Default for Text Agents)
Text agents stream by default — token-by-token via SSE. No directive needed.
```clear
# Streams automatically (text response, no returning:)
agent 'Chat' receiving message:
  response = ask claude 'Help the user' with message
  send back response

# Auto non-streaming (structured output can't stream partial JSON)
agent 'Classifier' receiving text:
  result = ask claude 'Classify' with text returning:
    category
    confidence (number)
  send back result

# Explicit opt-out (pipeline step needs full response)
agent 'Summarizer' receiving text:
  do not stream
  summary = ask claude 'Summarize in one sentence' with text
  send back summary
```

### Scheduled Agents
```clear
agent 'Daily Report' runs every 1 day:
  leads = get all Leads where status is 'new'
  send back leads
```
