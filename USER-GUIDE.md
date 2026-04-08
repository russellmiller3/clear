# The Clear Language Guide

*A friendly introduction for humans who want to understand what the AI just built.*

Welcome! You're about to learn Clear — a programming language that reads like English.

Here's the deal: when AI builds you an app, it writes Clear code. You open the file,
read it, and understand exactly what your app does. No JavaScript. No Python. No
mystery. Just plain sentences that say what they mean.

**You don't need to know how to program.** If you can read a recipe, you can read Clear.

(And if you CAN program, you'll appreciate how much less typing there is.)

Let's jump in.

---

## Chapter 1: Hello, World (The Easiest Chapter You'll Ever Read)

Every programming tutorial starts here. Tradition demands it:

```clear
show 'Hello, world!'
```

That's the whole program. One line. It shows "Hello, world!" on screen.

Not very useful yet, but congratulations — you're a programmer now.
Put it on your resume. We won't tell.

Let's make it do something real:

```clear
price = 100
tax = price * 0.08
total = price + tax
show total
```

This shows 108. Four lines, four operations. Each line does exactly one thing.
That's a rule in Clear: **one line, one job.** No sneaking three things onto
one line like some languages we won't name. (Looking at you, JavaScript.)
Notice how you can read each line out loud? "Price equals 100. Tax equals price
times 0.08." That's not an accident — Clear is designed to be read aloud without
sounding like a robot.

### Strings vs Numbers (The Only Slightly Tricky Part)

There's one rule you need to remember. Just one. Ready?

**Numbers use `=`. Everything else uses `is`.**

```clear
# Numbers use =
price = 9.99
count = 0

# Strings use "is"
name is 'Alice'
greeting is 'Hello there'

# Booleans use "is"
active is true
```

Why? Because "price is 9.99" sounds like a comparison ("is the price 9.99?"),
but "price = 9.99" is clearly setting a value. Clear wants to be unambiguous,
even if it means using a symbol for one thing.

### Named Values

When a value deserves a nice descriptive name (and honestly, they all do):

```clear
price = 100
tax_rate = 0.08
define full_name as: 'Alice Smith'
define total_cost as: price + (price * tax_rate)
```

`define X as:` is the canonical way to create a named value.

---

## Chapter 2: Making Decisions (Your App Gets an Opinion)

Programs that can't make decisions are just fancy calculators. Let's fix that.

### If/Then (one line)

```clear
if total is greater than 100 then show 'Big order!'
```

### If/Otherwise (block)

```clear
age = 20
if age is at least 18:
  show 'Welcome'
  discount = 0
otherwise:
  show 'Sorry, adults only'
```

### Comparisons (No Cryptic Symbols)

Other languages use `>=` and `!=`. Clear uses words a human would say:

```clear
price = 75
count = 3
name is 'Alice'
status is 'active'
age = 25
score = 88
if price is greater than 50 then show 'expensive'
if count is less than 10 then show 'low stock'
if name is 'Alice' then show 'hi Alice'
if status is not 'active' then show 'inactive'
if age is at least 21 then show 'can drink'
if score is at most 100 then show 'valid'
```

---

## Chapter 3: Lists and Loops (Doing Things More Than Once)

Computers are really, REALLY good at doing things over and over. That's basically
their whole job. Let's put them to work.

### Creating Lists

```clear
colors is an empty list
add 'red' to colors
add 'blue' to colors
add 'green' to colors
```

### Looping Through Items

```clear
colors is an empty list
add 'red' to colors
add 'blue' to colors
for each color in colors:
  show color
```

### Counting Loops

```clear
repeat 5 times:
  show 'hello'
```

### While Loops

```clear
count = 0
while count is less than 10:
  show count
  increase count by 1
```

### Working with Lists

```clear
prices is an empty list
add 10 to prices
add 20 to prices
items is an empty list
add 5 to items
add 15 to items

# Get the total of a list of numbers
define total_price as: sum of prices
define item_count as: count of items

# Get specific items
define first_item as: first of items
define last_item as: last of items

# Sort
sort items by price
```

---

## Chapter 4: Functions (Teaching Your Program New Tricks)

A function is a reusable recipe. You define it once, use it anywhere.
Think of it like saving a formula in a spreadsheet — except it has a name.

### One-Line Functions (The Fun Ones)

```clear
double(x) = x * 2
tax(amount) = amount * 0.08
full_name(first, last) = first + ' ' + last
```

Use them:

```clear
double(x) = x * 2
tax(amount) = amount * 0.08
full_name(first, last) = first + ' ' + last
result = double(21)
my_tax = tax(100)
name = full_name('Alice', 'Smith')
```

### Block Functions

```clear
define function calculate_total(price, quantity):
  subtotal = price * quantity
  tax = subtotal * 0.08
  total = subtotal + tax
  return total
```

---

## Chapter 5: Your First Web App (It's a Tip Calculator, Obviously)

OK, enough theory. Let's build something you can actually see in a browser.
Every programming tutorial builds a tip calculator at some point. It's the law.

Here's the entire app:

```clear
build for web

page 'Tip Calculator':
  heading 'Tip Calculator'

  'Bill Amount' is a number input saved as a bill
  'Tip Percentage' is a number input saved as a tip_percent

  tip = bill * tip_percent / 100
  total = bill + tip

  display tip as dollars called 'Tip Amount'
  display total as dollars called 'Total'
```

Run it:

```bash
clear build main.clear
# Open build/index.html in your browser
```

**Wait, that's it?** 11 lines? Yep. The compiler turns that into a complete HTML page
with styled inputs, reactive calculations, and formatted dollar amounts. Change the
bill amount and the tip updates instantly — no "submit" button needed.

In JavaScript, this would be about 80 lines. In React, maybe 40 plus a build system.
In Clear, it's 11 lines that a 14-year-old can read. (That's actually our design test.
If a curious teenager can't read it, we simplify.)

### What Each Line Does

- `build for web` — tells the compiler to generate HTML + JavaScript
- `page 'Tip Calculator':` — creates a web page with this title
- `heading 'Tip Calculator'` — an `<h1>` heading
- `'Bill Amount' is a number input saved as a bill` — creates a labeled input that stores its value in `bill`
- `tip = bill * tip_percent / 100` — calculates the tip (reactively!)
- `display tip as dollars called 'Tip Amount'` — shows the tip formatted as currency

---

## Chapter 6: The Full-Stack Todo App (The Real Deal)

This is the moment. We're going to build a real application with a database,
an API, validation, security, and a reactive frontend. In 35 lines.

If you've ever tried to build a web app from scratch, you know this normally
involves: a database, a server framework, routes, middleware, CORS headers,
input validation, HTML templates, CSS, JavaScript event handlers, and a
partridge in a pear tree. In Clear, it's one file:

```clear
build for web and javascript backend

# Database
database is local memory
create a Todos table:
  task, required
  completed, default false
  created_at, auto

# Backend
accept requests from any website
log every request

when user calls GET /api/todos:
  all_todos = get all Todos
  send back all_todos

when user calls POST /api/todos sending todo_data:
  validate todo_data:
    task is text, required, min 1, max 500
  new_todo = save todo_data as new Todo
  send back new_todo with success message

when user calls DELETE /api/todos/:id:
  requires auth
  delete the Todo with this id
  send back 'deleted' with success message

# Frontend
page 'Todo App':
  on page load get todos from '/api/todos'
  heading 'My Todos'

  'What needs to be done?' is a text input saved as a task
  button 'Add':
    send task as a new todo to '/api/todos'
    get todos from '/api/todos'
    task is ''

  display todos as table showing task, completed with delete
```

Run it:

```bash
clear build main.clear
cd build
node server.js
# Open http://localhost:3000
```

**35 lines. Full-stack app.** Database, REST API, input validation, auth on delete,
and a reactive frontend with DaisyUI styling. Your backend developer friends will
be either impressed or deeply concerned.

Let's break it down so you know exactly what every section does.

### The Database Section

```clear
database is local memory
create a Todos table:
  task, required
  completed, default false
  created_at, auto
```

- `database is local memory` — uses an in-memory database (great for development)
- `create a Todos table:` — defines a table with fields
- `task, required` — text field, must have a value
- `completed, default false` — boolean field, starts as false
- `created_at, auto` — timestamp, set automatically

### The Backend Section

```clear
when user calls GET /api/todos:
  all_todos = get all Todos
  send back all_todos
```

This creates an API endpoint. When someone visits `/api/todos`, it:
1. Gets all records from the Todos table
2. Sends them back as JSON

```clear
when user calls POST /api/todos sending todo_data:
  validate todo_data:
    task is text, required, min 1, max 500
  new_todo = save todo_data as new Todo
  send back new_todo with success message
```

This creates a POST endpoint that:
1. Receives data (named `todo_data`)
2. Validates it (task must be text, 1-500 characters)
3. Saves it to the Todos table
4. Sends back the new record with a success message

```clear
when user calls DELETE /api/todos/:id:
  requires auth
  delete the Todo with this id
  send back 'deleted' with success message
```

This creates a DELETE endpoint that:
1. Requires authentication (no anonymous deletes)
2. Deletes the record with the given ID
3. Sends back confirmation

### The Frontend Section

```clear
page 'Todo App':
  on page load get todos from '/api/todos'
```

Creates a page that fetches all todos when it loads.

```clear
  'What needs to be done?' is a text input saved as a task
  button 'Add':
    send task as a new todo to '/api/todos'
    get todos from '/api/todos'
    task is ''
```

An input field and a button. When clicked, the button:
1. Sends the task to the API
2. Refreshes the list
3. Clears the input

The line `display todos as table showing task, completed with delete`

Shows all todos in a table with a delete button on each row.

---

## Chapter 7: Expense Tracker (Now You're Cooking)

Let's level up. This app has dropdowns, computed totals, dollar formatting,
and sections with card styling. It's the kind of thing a freelancer might
actually use. (Or at least intend to use before going back to a spreadsheet.)

```clear
build for web and javascript backend

# Database
database is local memory
create a Expenses table:
  description, required
  amount (number), required
  category, default 'other'
  created_at, auto

# Backend
accept requests from any website
log every request

when user calls GET /api/expenses:
  all_expenses = get all Expenses
  send back all_expenses

when user calls POST /api/expenses sending expense_data:
  validate expense_data:
    description is text, required, min 1, max 200
    amount is number, required
    category is text
  new_expense = save expense_data as new Expense
  send back new_expense with success message

when user calls DELETE /api/expenses/:id:
  requires auth
  delete the Expense with this id
  send back 'deleted' with success message

# Frontend
page 'Expense Tracker':
  on page load get expenses from '/api/expenses'

  heading 'Expense Tracker'
  subheading 'Track your spending'

  section 'Add Expense' with style card:
    'Description' is a text input saved as a description
    'Amount' is a number input saved as a amount
    'Category' is a dropdown with ['Food', 'Transport', 'Entertainment', 'Bills', 'Other'] saved as a category
    button 'Add Expense':
      send description, amount and category as a new expense to '/api/expenses'
      get expenses from '/api/expenses'
      description is ''
      amount is 0

  section 'Summary':
    define total_spent as: sum of expenses
    display total_spent as dollars called 'Total Spent'

  section 'All Expenses':
    display expenses as table showing description, amount, category with delete
```

**New things in this app:**
- `section 'Name' with style card:` — groups content in a styled card
- `'Category' is a dropdown with [...]` — a dropdown menu with predefined options
- `define total_spent as: sum of expenses` — computes the sum of all expense amounts
- `display total_spent as dollars` — formats as currency ($123.45)

---

## Chapter 8: Multi-Page Apps (Because One Page Is Never Enough)

Real apps have multiple pages. A list page, an add page, a detail page.
Clear handles this with page declarations and the `go to` command:

```clear
build for web and javascript backend

database is local memory
create a Recipes table:
  title, required
  ingredients, required
  prep_time (number), default 0

# Backend (endpoints here...)

# Frontend
page 'Recipes' at '/':
  heading 'My Recipes'
  on page load get recipes from '/api/recipes'
  display recipes as table showing title, prep_time

page 'Add Recipe' at '/add':
  heading 'Add a Recipe'
  'Title' is a text input saved as a title
  'Ingredients' is a text area saved as a ingredients
  'Prep Time (minutes)' is a number input saved as a prep_time
  button 'Save':
    send title, ingredients and prep_time as a new recipe to '/api/recipes'
    go to '/'
```

**Key points:**
- `page 'Name' at '/route':` — defines a page at a specific URL
- `go to '/'` — navigates to another page
- Multiple pages share the same backend

---

## Chapter 9: Real-Time Features (Making Things Go Brrr)

Want a chat app? A live dashboard? Notifications? You need real-time features.
Clear makes these surprisingly easy.

### Streaming (Live Updates)

Push data to the browser as it happens:

```clear
stream:
  all_messages = get all Messages
  send back all_messages
```

This creates a `/stream` endpoint that pushes data to connected clients.

### Background Jobs

Run tasks on a schedule:

```clear
background 'cleanup':
  runs every 1 hour
```

### Webhooks

Receive notifications from external services:

```clear
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  new_event = save incoming as new Event
  send back new_event
```

This verifies the webhook signature using HMAC and processes the payload.

---

## Chapter 10: AI-Powered Apps (The Fun Part)

This is where Clear gets interesting. You can call AI models directly from
your Clear code — no API keys to manage, no HTTP requests to write, no
JSON to parse. Just ask a question and get an answer.

### Simple AI Call

```clear
response = ask claude 'Summarize this article' with article_text
```

### Structured Output

```clear
analysis = ask claude 'Analyze this feedback' with review returning:
  sentiment
  score (number)
  summary
```

The AI returns a structured object with exactly the fields you specify.

### AI Agents

```clear
define function look_up_orders(customer_id):
  return customer_id

define function check_status(order_id):
  return order_id

agent 'Customer Support' receiving message:
  can use: look_up_orders, check_status
  must not: share customer passwords, modify billing
  remember conversation context

  response = ask claude 'Help this customer' with message
  send back response
```

Agents can:
- **Use tools** — call functions and database operations
- **Have guardrails** — compile-time restrictions on what they can do
- **Remember context** — maintain conversation history
- **Run on a schedule** — `agent 'Report' runs every 1 day:`

---

## Chapter 11: Making It Pretty (Styling and Layout)

Clear apps automatically use DaisyUI and Tailwind CSS, so they look
professional out of the box. But you can customize the look with
sections, cards, and content elements.

### Sections and Cards

```clear
section 'User Info' with style card:
  heading 'Profile'
  text 'Welcome back!'
```

### Content Elements

```clear
heading 'Welcome'
subheading 'Get started'
text 'This is a paragraph'
bold text 'Important!'
italic text 'A side note'
small text 'Terms apply'
link 'Learn more' to '/about'
divider
```

### Input Types

```clear
'Name' is a text input saved as a name
'Age' is a number input saved as a age
'Bio' is a text area saved as a bio
'Country' is a dropdown with ['US', 'UK', 'Canada'] saved as a country
'Newsletter' is a checkbox
```

### Display Formatting

```clear
price = 29.99
rate = 0.15
display price as dollars
display rate as percent
```

---

## Chapter 12: Security (The Part You Can't Skip)

Clear takes security seriously. The compiler actually REFUSES to build your app
if it has obvious security holes. Try creating a DELETE endpoint without auth
and the compiler will politely but firmly say no.

(Most languages let you deploy insecure code and hope for the best. Clear
would rather hurt your feelings now than let hackers hurt your users later.)

### Input Validation

```clear
when user calls POST /api/users sending user_data:
  validate user_data:
    name is text, required, min 1, max 100
    email is text, required, matches email
    age is number, required
    role is text, one of ['reader', 'editor', 'admin']
```

### Authentication

```clear
when user calls DELETE /api/posts/:id:
  requires auth
  delete the Post with this id
  send back 'deleted' with success message
```

### Role-Based Access

```clear
when user calls PUT /api/settings/:id sending data:
  requires role 'admin'
  save data to Settings
  send back data with success message
```

### Guards

```clear
when user calls POST /api/orders sending order_data:
  requires auth
  guard stock is greater than 0 or 'Out of stock'
  new_order = save order_data as new Order
  send back new_order with success message
```

Guards check a condition and return an error if it fails.

---

## Chapter 13: Working with Data

All CRUD operations happen inside endpoint bodies. Here's the full pattern:

```clear
build for javascript backend
database is local memory
create a Users table:
  name, required
  email, required

when user calls POST /api/users sending user_data:
  new_user = save user_data as new User
  send back new_user with success message

when user calls GET /api/users:
  all_users = get all Users
  send back all_users

when user calls PUT /api/users/:id sending update_data:
  requires auth
  save update_data to Users
  send back update_data with success message

when user calls DELETE /api/users/:id:
  requires auth
  delete the User with this id
  send back 'deleted' with success message
```

### Environment Variables

```clear
api_key is env('API_KEY')
secret is env('STRIPE_SECRET')
```

---

## Chapter 14: Error Handling (Because Things Go Wrong)

The internet is unreliable. APIs go down. Databases hiccup. Users type nonsense
into every field. Clear gives you clean ways to handle all of it.

```clear
try:
  result = call api 'https://api.example.com/data'
  show result
if there's an error:
  show 'Something went wrong'
```

### Retry on Failure

```clear
retry 3 times:
  data = call api 'https://unreliable-api.com/data'
```

### Timeout

```clear
with timeout 5 seconds:
  result = call api 'https://slow-api.com/data'
```

---

## Chapter 15: Modules (When One File Isn't Enough)

Small apps live in one file. Bigger apps split into modules — a backend file,
a helpers file, a frontend file. Clear keeps it simple.

### Splitting Code Across Files

Create a **helpers.clear** file with shared functions:

```clear
double(x) = x * 2
tax(amount) = amount * 0.08
```

Then import it in **main.clear**:

```
use 'helpers'
result = helpers's double(21)
```

Or import specific functions:

```
use double from 'helpers'
result = double(21)
```

Or import everything:

```
use everything from 'backend'
```

(Module imports require multiple files, so these examples show the syntax
without the ` ```clear ` tag — they can't compile standalone.)

---

## Chapter 16: The Clear CLI (Your Toolbox)

Clear comes with a command-line tool that does everything: build, test, deploy,
lint, fix, and introspect. It's designed for both humans and AI agents — every
command supports `--json` for machine-readable output.

### Build

Compile a .clear file to JS/Python/HTML:

```bash
clear build main.clear
```

This generates a `build/` directory:
```
build/
  index.html         # Frontend (if web target)
  server.js          # Backend (if JS backend target)
  server.py          # Backend (if Python backend target)
  style.css          # Fallback styles
  clear-runtime/     # Database, auth, rate limiting
```

### Check (Validate Without Compiling)

Fast validation — parses and checks for errors without generating output:

```bash
clear check main.clear
```

Great for quick feedback while editing. Catches undefined variables,
missing fields, security issues, and typos.

### Run

Compile and immediately run a backend server:

```bash
clear run main.clear
```

### Serve

Compile and start a local development server with static file serving:

```bash
clear serve main.clear
```

Your app is at `http://localhost:3000`.

### Dev (Watch Mode)

Compile, serve, and auto-rebuild when files change:

```bash
clear dev main.clear
```

### Info (Introspect)

List all endpoints, tables, pages, and agents in a Clear file:

```bash
clear info main.clear
```

Output:
```
Tables: Todos (task, completed, created_at)
Endpoints: GET /api/todos, POST /api/todos, DELETE /api/todos/:id
Pages: Todo App (/)
```

### Lint (Security + Quality)

Check for security vulnerabilities and code quality issues:

```bash
clear lint main.clear
```

Catches: unauthenticated DELETE endpoints, missing validation, SQL injection
risks, open CORS without auth, and more.

### Fix (Auto-Patch)

Automatically fix patchable errors:

```bash
clear fix main.clear
```

### Package (Deploy Bundle)

Generate a Dockerfile and package.json for deployment:

```bash
clear package main.clear
```

### Init (New Project)

Scaffold a new Clear project:

```bash
clear init my-app
```

Creates `my-app/main.clear` with a starter template.

### Agent (List Agents)

List all agents with their tools, skills, and guardrails:

```bash
clear agent main.clear
```

### Global Flags

```bash
clear build main.clear --json      # Machine-readable JSON output
clear build main.clear --quiet     # Suppress non-essential output
clear build main.clear --no-test   # Skip test gate
clear build main.clear --auto-fix  # Auto-patch errors during build
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Compile error |
| 2 | Runtime error |
| 3 | File not found |
| 4 | Test failure |

---

## Chapter 17: Testing (Proving Your Code Works)

You know what's better than code that looks right? Code that you can PROVE
is right. Clear has built-in testing — write tests right alongside your code:

```clear
test 'addition works':
  result = 2 + 2
  expect result is 4

test 'tax calculation':
  total = 100
  tax = total * 0.08
  expect tax is 8
```

### Running Tests

```bash
clear test main.clear
```

Output:
```
✅ addition works
✅ tax calculation
2 passed, 0 failed
```

### What You Can Test

**Values:**
```clear
test 'string operations':
  name is 'Alice'
  expect name is 'Alice'

test 'math':
  price = 100
  tax = price * 0.08
  expect tax is 8
```

**Functions:**
```clear
double(x) = x * 2

test 'double works':
  result = double(5)
  expect result is 10
```

### Testing AI Agents

Use `mock claude responding:` to test agents without calling the real API:

```clear
agent 'Classifier' receiving feedback:
  analysis = ask claude 'Classify this feedback' with feedback returning:
    sentiment
    score (number)
  send back analysis

test 'classifier returns sentiment':
  mock claude responding:
    sentiment is 'positive'
    score = 9
  result = call 'Classifier' with 'Great product!'
  expect result's sentiment is 'positive'
```

### Running Agent Evals

For more thorough agent testing, use evals:

```bash
clear eval main.clear              # Schema checks (fast, no API calls)
clear eval main.clear --graded     # LLM-graded scorecard (calls Claude)
```

---

## Chapter 18: Going Live (Deploying Your App)

You built it. You tested it. Now let's put it on the internet where
people can actually use it.

### Step 1: Build

```bash
clear build main.clear
```

### Step 2: Run Locally

```bash
cd build
npm install express    # First time only
node server.js
```

Your app is at `http://localhost:3000`.

### Step 3: Package for Production

```bash
clear package main.clear
```

This generates:
- `Dockerfile` — containerized deployment
- `package.json` — Node.js dependencies

### Step 4: Deploy

**Option A: Docker**
```bash
cd build
docker build -t my-app .
docker run -p 3000:3000 my-app
```

**Option B: Any Node.js host**

Upload the `build/` directory to Vercel, Railway, Render, Fly.io, or any
Node.js hosting. The entry point is `server.js`.

### Environment Variables

If your app uses `env('API_KEY')`, set the environment variable on your host:

```bash
# Local
API_KEY=sk-xxx node server.js

# Docker
docker run -e API_KEY=sk-xxx -p 3000:3000 my-app
```

---

## Quick Reference

### Build Targets

```clear
build for web                              # Frontend only
build for javascript backend               # Backend only (Node.js)
build for python backend                   # Backend only (FastAPI)
build for web and javascript backend       # Full-stack (Node.js)
build for web and python backend           # Full-stack (Python)
```

### The Clear File Structure

Every Clear app follows this order:

```clear
build for web and javascript backend    # 1. What to build

# 2. Database
database is local memory
create a Users table:
  name, required
  email, required, unique

# 3. Backend
accept requests from any website
log every request

when user calls GET /api/users:
  all_users = get all Users
  send back all_users

# 4. Frontend
page 'My App':
  heading 'Hello'
```

Database first, then backend, then frontend. Always.

### Common Patterns

**CRUD app (the most common):**
```clear
# Create
when user calls POST /api/items sending item_data:
  validate item_data:
    name is text, required
  new_item = save item_data as new Item
  send back new_item with success message

# Read
when user calls GET /api/items:
  all_items = get all Items
  send back all_items

# Update
when user calls PUT /api/items/:id sending update_data:
  requires auth
  save update_data to Items
  send back update_data with success message

# Delete
when user calls DELETE /api/items/:id:
  requires auth
  delete the Item with this id
  send back 'deleted' with success message
```

**Frontend that talks to the backend:**
```clear
page 'My App':
  on page load get items from '/api/items'

  'Name' is a text input saved as a name
  button 'Add':
    send name as a new item to '/api/items'
    get items from '/api/items'
    name is ''

  display items as table showing name with delete
```

---

## What's Next? (You Did It!)

You just learned an entire programming language. Not bad for one sitting.

Here's where to go from here:

1. **Browse the example apps** in the `apps/` directory — 42 apps from simple to ambitious
2. **Read `SYNTAX.md`** — the complete reference for every feature
3. **Ask AI to build something** — describe what you want and let it write Clear code
4. **Read the output** — open `main.clear` and verify it does what you asked
5. **Tweak it** — change a label, adjust a number, add a field. You can do this now.

Here's the thing about Clear that makes it different from every other language:
**you're not supposed to write it from scratch.** AI writes it. You read it.
You verify it does the right thing. You make small edits when needed.

That's the whole deal. AI is the writer. You're the editor.

And if you ever read a Clear program and can't understand what it does?
That's a bug in the language — not in you. Seriously. File an issue. We'll fix it.

Happy building!
