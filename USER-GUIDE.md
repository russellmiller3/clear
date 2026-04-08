# The Clear Language Guide

Welcome to Clear — a programming language designed for AI to write and humans to read.

This guide will take you from zero to building real applications. No programming
experience required. By the end, you'll understand every Clear program you encounter
and be able to modify them yourself.

---

## Chapter 1: Your First Program

Clear programs are plain English. Let's start with the simplest possible program:

```clear
show 'Hello, world!'
```

That's it. One line. It displays "Hello, world!" on the screen.

Let's make it do math:

```clear
price = 100
tax = price * 0.08
total = price + tax
show total
```

This creates three values and shows the result (108). Notice:
- **Numbers use `=`** for assignment
- **Each line does one thing** — no nesting, no chaining
- **You can read it out loud** and it makes sense

### Strings vs Numbers

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

The rule: `=` for numbers, `is` for everything else.

### Named Values

When you want to give a value a descriptive name:

```clear
define tax_rate as: 0.08
define full_name as: 'Alice Smith'
define total_cost as: price + (price * tax_rate)
```

`define X as:` is the canonical way to create a named value.

---

## Chapter 2: Making Decisions

### If/Then (one line)

```clear
if total is greater than 100 then show 'Big order!'
```

### If/Otherwise (block)

```clear
if age is at least 18:
  show 'Welcome'
  discount = 0
otherwise:
  show 'Sorry, adults only'
```

### Comparisons

Clear uses English words for comparisons:

```clear
if price is greater than 50 then show 'expensive'
if count is less than 10 then show 'low stock'
if name is 'Alice' then show 'hi Alice'
if status is not 'active' then show 'inactive'
if age is at least 21 then show 'can drink'
if score is at most 100 then show 'valid'
```

---

## Chapter 3: Lists and Loops

### Creating Lists

```clear
colors is an empty list
add 'red' to colors
add 'blue' to colors
add 'green' to colors
```

### Looping Through Items

```clear
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
# Get the total of a list of numbers
define total_price as: sum of prices
define average_score as: avg of scores
define highest as: max of scores
define item_count as: count of items

# Get specific items
define first_item as: first of items
define last_item as: last of items

# Transform lists
define all_names as: each user's name in users

# Sort
sort items by price
sort items by date descending
```

---

## Chapter 4: Functions

### One-Line Functions

```clear
double(x) = x * 2
tax(amount) = amount * 0.08
full_name(first, last) = first + ' ' + last
```

Use them:

```clear
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

## Chapter 5: Building a Calculator (Your First Web App)

Time to build something real. A tip calculator that runs in the browser:

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

**What just happened?** You wrote 11 lines of Clear. The compiler generated a complete
HTML page with inputs, reactive calculations, and formatted output. Change the bill
amount and the tip updates instantly.

### What Each Line Does

- `build for web` — tells the compiler to generate HTML + JavaScript
- `page 'Tip Calculator':` — creates a web page with this title
- `heading 'Tip Calculator'` — an `<h1>` heading
- `'Bill Amount' is a number input saved as a bill` — creates a labeled input that stores its value in `bill`
- `tip = bill * tip_percent / 100` — calculates the tip (reactively!)
- `display tip as dollars called 'Tip Amount'` — shows the tip formatted as currency

---

## Chapter 6: Building a Full-Stack Todo App

Now let's build a real application with a database and API:

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

**That's a full-stack app in 35 lines.** Database, API, validation, auth on delete,
and a reactive frontend. Let's break down each section.

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

```clear
  display todos as table showing task, completed with delete
```

Shows all todos in a table with a delete button on each row.

---

## Chapter 7: Building an Expense Tracker

Let's build something more complex — multiple input types, computed values, formatting:

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

## Chapter 8: Multi-Page Apps

Apps can have multiple pages with navigation:

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

## Chapter 9: Real-Time Features

### Streaming (Server-Sent Events)

Send live updates to the browser:

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

## Chapter 10: AI-Powered Apps

Clear has first-class support for AI agents:

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

## Chapter 11: Styling and Layout

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
display price as dollars
display rate as percent
display users as table showing name, email, role
display orders as table showing item, total with delete and edit
```

---

## Chapter 12: Security and Validation

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

### Creating Records

```clear
new_user = save user_data as new User
```

### Reading Records

```clear
all_users = get all Users
define active_users as: look up records in Users table where active is true
```

### Updating Records

```clear
save update_data to Users
```

### Deleting Records

```clear
delete the User with this id
```

### Environment Variables

```clear
api_key is env('API_KEY')
secret is env('STRIPE_SECRET')
```

---

## Chapter 14: Error Handling

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

## Chapter 15: Modules and Organization

### Splitting Code Across Files

**helpers.clear:**
```clear
double(x) = x * 2
tax(amount) = amount * 0.08
```

**main.clear:**
```clear
use 'helpers'
result = helpers's double(21)
```

### Importing Specific Functions

```clear
use double from 'helpers'
result = double(21)
```

### Importing Everything

```clear
use everything from 'backend'
```

---

## Chapter 16: Testing

```clear
test 'addition works':
  result = 2 + 2
  expect result is 4

test 'tax calculation':
  total = 100
  tax = total * 0.08
  expect tax is 8
```

Run tests:

```bash
clear test main.clear
```

---

## Chapter 17: Deploying Your App

### Build

```bash
clear build main.clear
```

This generates your `build/` directory with all compiled files.

### Run Locally

```bash
cd build
node server.js
```

Your app is at `http://localhost:3000`.

### Package for Deployment

```bash
clear package main.clear
```

This generates a Dockerfile for containerized deployment.

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

## What's Next?

You've learned enough Clear to build real applications. Here's what to explore:

1. **Read the example apps** in the `apps/` directory — 42 apps from simple to complex
2. **Read `SYNTAX.md`** for every feature with examples
3. **Read `AI-INSTRUCTIONS.md`** for how AI writes Clear code
4. **Build something** — the best way to learn is to write a real app

Clear is designed so you can read any program and understand what it does.
If you can't, that's a bug in the language — not in you.
