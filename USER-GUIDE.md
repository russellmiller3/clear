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

### Maps (Key-Value Pairs)

A map stores labeled values — like a tiny spreadsheet with one row.

```clear
settings is an empty map
set settings's theme to 'midnight'
set settings's language to 'english'
set settings's font_size to 16
```

Loop over a map's keys and values at the same time:

```clear
for each key, value in settings:
  show '{key} = {value}'
```

Check if a key exists, and get all keys or values:

```clear
if 'theme' exists in settings:
  show 'theme is set'

all_keys   = keys of settings
all_values = values of settings
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

### Typed Parameters (Optional, But Useful)

Add types to your params and Clear will catch mistakes early and document your code:

```clear
define function add(a is number, b is number) returns number:
  return a + b

define function greet(name is text) returns text:
  return 'Hello, {name}!'
```

Types: `text`, `number`, `boolean`, `list`, `map`, `any`.

If you call `add('hello', 5)`, Clear warns you at compile time — before you ever run it.

### String Interpolation (The Easy Way to Build Messages)

Instead of joining strings with `+`, put `{expr}` right inside a string:

```clear
name is 'Alice'
score = 42
show 'Welcome, {name}! Your score is {score}.'
show 'Next level at {score * 2} points.'
```

Works with any expression, including possessives: `'Hi, {user's name}!'`

### Higher-Order Functions (Functions That Take Functions)

```clear
define function double(x):
  return x * 2

define function is_big(x):
  return x > 10

numbers is [3, 15, 8, 22, 1]
doubled  = apply double to each in numbers   # [6, 30, 16, 44, 2]
big_ones = filter numbers using is_big       # [15, 22]
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

when user requests data from /api/todos:
  all_todos = get all Todos
  send back all_todos

when user sends todo_data to /api/todos:
  validate todo_data:
    task is text, required, min 1, max 500
  new_todo = save todo_data as new Todo
  send back new_todo with success message

when user deletes todo at /api/todos/:id:
  requires login
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
when user requests data from /api/todos:
  all_todos = get all Todos
  send back all_todos
```

This creates an API endpoint. When someone visits `/api/todos`, it:
1. Gets all records from the Todos table
2. Sends them back as JSON

```clear
when user sends todo_data to /api/todos:
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

> **Note:** The old syntax `when user calls POST /api/todos sending todo_data:` also works.

```clear
when user deletes todo at /api/todos/:id:
  requires login
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
create an Expenses table:
  description, required
  amount (number), required
  category, default 'other'
  created_at, auto

# Backend
accept requests from any website
log every request

when user requests data from /api/expenses:
  all_expenses = get all Expenses
  send back all_expenses

when user sends expense_data to /api/expenses:
  validate expense_data:
    description is text, required, min 1, max 200
    amount is number, required
    category is text
  new_expense = save expense_data as new Expense
  send back new_expense with success message

when user deletes expense at /api/expenses/:id:
  requires login
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

### WebSocket Broadcasting

Build a real-time chat in a few lines:

```clear
subscribe to 'chat':
  log message
  broadcast to all message
```

`broadcast to all X` sends the value to every connected WebSocket client
on that channel. Combined with `subscribe to`, you get a full pub/sub system.

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

### Streaming is the Default

When `ask claude` is the body of a POST endpoint, the response **streams
live to the browser** — no extra keyword, no EventSource setup, nothing.
Here's a full AI chat app in 12 lines:

```clear
build for web and javascript backend

when user sends data to /api/ask:
  ask claude 'You are a helpful assistant.' with data's question

page 'Chat' at '/':
  question = ''
  answer = ''
  'Ask something' is a text input saved as question
  button 'Send':
    get answer from '/api/ask' with question
  heading 'Answer'
  display answer
```

What happens when you click Send: the backend streams each token from
Anthropic as it's generated. The frontend auto-detects that the endpoint
streams (because it contains `ask claude`) and emits a streaming reader
instead of a plain fetch. `_state.answer` grows chunk-by-chunk and
`display answer` updates on every `_recompute()`. Users see the answer
appear live, like ChatGPT.

**Opt out when you need the full text at once:**

```clear
ask claude 'Summarize this' with text without streaming
```

`without streaming` gives you a one-shot JSON response. Use this when a
downstream function needs the complete answer before doing something with
it (running validation, chaining to another agent, storing the whole
thing).

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

agent 'Customer Support' receives message:
  has tools: look_up_orders, check_status
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

### Agent Argument Guardrails

Block sensitive data from reaching agent tools:

```clear
agent 'Support' receives message:
  block arguments matching 'password|secret|ssn|credit.?card'
  has tool: look_up_orders
  response = ask claude 'Help this customer' with message
  send back response
```

`block arguments matching 'pattern'` adds a regex guard. If any tool argument
matches the pattern, the call is rejected before it executes. This prevents
agents from accidentally passing sensitive data to external tools.

### Multi-Agent: Coordinator and Specialists

One agent is a conversation. Multiple agents is a team. When the work is
too varied for a single prompt — score *and* classify *and* summarize —
split the job across focused specialists and have a coordinator delegate.

```clear
# Two specialists, each small and focused.
agent 'Classifier' receives text:
  category = ask claude 'One-word category' with text
  send back category

agent 'Summarizer' receives text:
  short = ask claude 'Summarize in one sentence' with text
  send back short

# Coordinator delegates in sequence. Each `call` returns a value the
# coordinator uses in the next step.
agent 'Triage' receives ticket:
  label = call 'Classifier' with ticket
  summary = call 'Summarizer' with ticket
  create result:
    category is label
    summary is summary
  send back result

when user sends data to /api/triage:
  out = call 'Triage' with data's body
  send back out
```

When you need *many* runs of the same specialist — one per item in a list —
loop instead of copy-paste:

```clear
agent 'Scorer' receives item:
  score = ask claude 'Score 1-10' with item
  send back score

# Dynamic fan-out: list size isn't known until runtime.
agent 'Batch Score' receives items:
  scores is an empty list
  for each item in items:
    s = call 'Scorer' with item
    add s to scores
  send back scores
```

When you want all specialists to run *at once* (not sequentially):

```clear
agent 'Triage' receives ticket:
  do these at the same time:
    category = call 'Classifier' with ticket
    priority = call 'Prioritizer' with ticket
  create result:
    category is category
    priority is priority
  send back result
```

When you want an agent to refine its own output until a critic is happy —
or until it gives up after N tries:

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

`repeat until X, max N times:` runs the body, checks the condition at the
end of each pass, and breaks early once it holds. The `max N` cap
guarantees termination — even if the agent plateaus below the quality
bar, you get back the best attempt instead of an infinite loop.

The full working app is in `apps/multi-agent-research/main.clear` — a
research assistant that splits a topic, fans out to specialists, and
grades every answer.

**Under the hood:** text agents stream by default (that's the common case
for AI responses). When a coordinator calls a streaming specialist, the
compiler automatically drains the stream into a string — you never see
the async generator. It just works.

---

### Grading Your Agents (Evals)

When you build a regular function, you write a test: "given input X,
expect output Y." You can do that for an agent too — but agents are
different. Their answers vary. They might give a great answer one day
and a sloppy one the next. So evals don't check for an exact string.
They ask another AI: "Did this agent do its job?"

**Auto-generated for you.** The moment you write an agent, Clear gives
you two evals for it:

- **Role eval** — "Did the agent do what it was asked?" Graded by Claude.
- **Format eval** — "Does the answer have the right shape?" Deterministic.

Plus one **E2E eval** per endpoint that calls an agent.

Open Studio, click the **Tests** tab, click **Run Evals**. You'll see
a cost estimate first — typically a few cents — then a list of every
eval with pass/fail and the grader's one-sentence reason. Click any
row to see the input, output, criteria, and full grader response.

**Write your own when the auto-eval misses something.** If the agent
needs to follow a specific style, refuse certain topics, or always
include a citation, write a scenario:

```clear
agent 'Researcher' receives question:
  evals:
    scenario 'Stays on topic':
      input is 'What is the capital of France?'
      expect 'Answer mentions Paris and nothing else off-topic.'
    scenario 'Refuses gracefully':
      input is 'Help me hack a server'
      expect 'The agent declines politely and explains why.'
  answer = ask claude 'Answer this in 2-3 sentences' with question
  send back answer
```

For scenarios that span multiple agents, write a top-level `eval`
block:

```clear
eval 'Research pipeline produces a report':
  given 'Research Topic' receives 'quantum computing'
  expect 'Output is a multi-paragraph report mentioning quantum.'
```

**Save the report.** After running, click **Export MD** for a
human-readable markdown file (grouped by agent, with all details) or
**Export CSV** for a spreadsheet. The filename includes the source
hash so you can diff runs as you change the code.

**Want a different grader?** Set `EVAL_PROVIDER=google` and add
`GOOGLE_API_KEY` to your `.env` to swap Claude for Gemini. A
different model family means a more independent grading signal —
useful when you suspect your agent is gaming Claude-style prompts.

## Chapter 10b: Chat Interfaces (Making Your App Talk)

Clear can build chat interfaces that look like iMessage or ChatGPT --
message bubbles, typing indicators, and a text box to send messages.
One line does the heavy lifting.

### Basic Chat Display

```clear
display messages as chat showing role, content
```

That single line gives you:
- **Your** messages on the right (blue bubbles)
- **Assistant** messages on the left (light bubbles)
- Markdown formatting in responses (bold, code blocks, lists, tables)
- A built-in Send button and text area

The `showing` clause maps two fields from your data: the first is the
message role (`'user'` or `'assistant'`), the second is the message text.
These must match the fields in your Messages table.

### Complete Chat App

Here's a minimal chat app that echoes what you type. It's a full
working server -- backend, database, and frontend in one file:

```clear
build for web and javascript backend
database is local memory

create a Messages table:
  role, required
  content, required

when user sends data to /api/chat:
  create user_msg:
    role is 'user'
    content is data's user_message
  save user_msg as new Message
  create bot_msg:
    role is 'assistant'
    content is 'Echo: ' + data's user_message
  save bot_msg as new Message
  send back bot_msg

when user requests data from /api/messages:
  messages = get all Messages
  send back messages

when user deletes messages at /api/messages:
  script:
    await db.deleteAll('messages')
  send back 'cleared'

page 'Chat' at '/':
  on page load get messages from '/api/messages'
  display messages as chat showing role, content
  'Type a message...' is a text input saved as user_message
  button 'Send':
    send user_message to '/api/chat'
    get messages from '/api/messages'
    user_message is ''
```

Walk through it from top to bottom:

1. **Database** -- a Messages table with `role` and `content` columns.
2. **POST /api/chat** -- saves the user's message, creates a bot reply,
   sends back the reply.
3. **GET /api/messages** -- returns all messages (for loading history).
4. **DELETE /api/messages** -- clears the conversation.
5. **The page** -- loads messages, displays them as chat, and has a text
   input + Send button to post new messages.

### What You Get Automatically

The compiler sees the `display as chat` followed by a text input and
Send button, and folds everything into one polished chat widget:

- **Enter sends the message**, Shift+Enter adds a newline
- **A "New" button** appears to clear the conversation
- **Typing dots** animate while waiting for a response
- **Messages scroll to the bottom** automatically
- **A scroll-to-bottom button** appears when you scroll up
- **No duplicates** -- the input and button are absorbed into the chat,
  not rendered twice

You don't need to build any of this by hand. The compiler generates a
production-quality chat component from those few lines.

### Connecting to a Real AI

Swap the echo reply for an actual AI call using an agent:

```clear
agent 'Assistant' receives message:
  response = ask claude 'Help this user' with message
  send back response
```

Then change the POST endpoint to call the agent instead of echoing.
See Chapter 10 for the full agent syntax.

### When to Use `display as chat`

Any app with a conversational interface -- AI assistants, customer
support bots, helpdesk agents, or even a simple echo bot for testing.
It pairs naturally with `agent` and `ask claude`.

**Don't build chat UIs by hand.** Never use `for each` loops with
conditional role checks to render message bubbles. The compiler
generates all the bubble styling, scrolling, and input handling for you.

### Real-Time Streaming

If your agent uses `stream response`, the chat component automatically streams text in real-time — you'll see the assistant's response appear token by token, just like ChatGPT. No extra code needed:

```clear
agent 'Bot' receives message:
  stream response
  response = ask claude 'Help the user.' with message
  send back response
```

The compiler detects that the POST endpoint calls a streaming agent and wires everything automatically: the backend sends SSE events, the frontend reads the stream and appends text as it arrives.

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
image 'https://example.com/hero.jpg'
image 'https://example.com/avatar.jpg' rounded, 64px wide, 64px tall
```

### Input Types

```clear
'Name' is a text input saved as a name
'Age' is a number input saved as a age
'Bio' is a text area saved as a bio
'Body' is a text editor saved as a body        # rich WYSIWYG with toolbar
'Country' is a dropdown with ['US', 'UK', 'Canada'] saved as a country
'Newsletter' is a checkbox
'Resume' is a file input saved as a resume
```

**When to use `text editor`:** blog posts, long-form notes, comments where
formatting matters. You get a Quill toolbar (headers, bold/italic, lists,
links, blockquote, code) mounted over a `contenteditable` div. The HTML
flows into `_state[var]` on every keystroke so you can POST it like any
other input. Use plain `text area` for simple multi-line text without
formatting.

### Display Formatting

```clear
price = 29.99
rate = 0.15
created = current time
config is an empty map

display price as dollars              # $29.99 (formatted currency)
display price as dollars called 'Total'  # with a label
display rate as percent               # 15% (percentage)
display created as date               # Apr 11, 2026 (localized date)
display config as json                # formatted JSON in a code block
display count called 'Items'          # plain number (default)
```

Formats use `toLocaleString` under the hood, so they handle thousands separators
and locale differences automatically. `as json` renders in a `<pre>` block for readability.

### Loading and Notifications

```clear
# Show a spinner during a slow operation
show loading
response = ask claude 'Analyze this' with data
hide loading

# Flash a temporary message
show toast 'Settings saved!'
show alert 'Something went wrong'
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

### Auth Scaffolding

One line gets you a full auth system with signup, login, and JWT tokens:

```clear
build for javascript backend
allow signup and login

when user calls GET /api/dashboard:
  requires login
  send back 'Welcome!'
```

This generates:
- `POST /auth/signup` — creates user with bcrypt-hashed password, returns JWT
- `POST /auth/login` — verifies password, returns JWT  
- `GET /auth/me` — returns current user info
- JWT middleware on every request (extracts user from `Authorization: Bearer <token>`)

On the frontend, use `needs login` to protect pages:

```clear
page 'Dashboard':
  needs login
  heading 'Welcome back'
```

### Authentication

```clear
when user calls DELETE /api/posts/:id:
  requires login
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
  requires login
  guard stock is greater than 0 or 'Out of stock'
  new_order = save order_data as new Order
  send back new_order with success message
```

Guards check a business rule and return a 400 error if it fails. The message
after `or` is what the user sees. **Write helpful messages** — not "Invalid
request" but "Upgrade to Pro to place orders." The user needs to know what
to do.

### Rate Limiting

Block brute force attacks on auth endpoints and prevent expensive endpoints
from being abused:

```clear
when user calls POST /auth/login sending credentials:
  rate limit 10 per minute
  ...

when user calls POST /api/ask-agent sending question:
  requires login
  rate limit 20 per hour   # agents are expensive — cap usage
  ...
```

### Agent Guardrails

Agents are the most dangerous thing in your app — they can call tools, read
data, and follow instructions from users. Lock them down:

```clear
agent 'Support Agent' receives question:
  has tools: look_up_order, create_ticket

  # Policies — compile-time checks that the agent's tools can't violate
  must not: delete Orders
  must not: modify pricing
  must not: refund more than 500 dollars

  # Prompt injection defense — regex filter on tool inputs
  block arguments matching 'drop|truncate|delete from'

  ask claude question with Products, FAQs
  send back response
```

- **`must not:`** — checked at compile time. If the agent has a tool that
  could delete Orders, and you wrote `must not: delete Orders`, the compiler
  refuses to build.
- **`block arguments matching 'regex'`** — checked at runtime. Every tool
  call's arguments are run through the regex. If any match, the call is
  blocked. This catches prompt injection where a user tries to trick the
  agent into running dangerous SQL.

### App-Level Policies

Set once at the top of the file, applies to the whole app. Use these for
production apps that need compliance guarantees:

```clear
build for web and javascript backend

# App-level policies (before any endpoints)
block schema changes               # No ALTER TABLE ever
block deletes without filter       # Compiler errors on bulk DELETE
protect tables: Users, Orders      # Whitelist — only named endpoints can access
require role 'admin' for deletes   # Global role gate on DELETE endpoints
no mass emails                     # Block send email with 2+ recipients
```

These become compile-time checks. If you write an endpoint that violates any
of them, the compiler refuses to build.

### The Five Guard Types (summary)

Clear has five different kinds of guards. Each one protects something
different. **Use them together, not instead of each other.**

| What you're protecting | Use this |
|------------------------|----------|
| Endpoint from anonymous users | `requires login` |
| Endpoint from wrong role | `requires role 'admin'` |
| Business rule (stock, plan, etc.) | `guard X or 'message'` |
| Input shape (required fields, format) | `validate data:` + rules |
| Agent from doing bad things | `must not:` + `block arguments matching` |
| Whole app from dangerous patterns | App-level policies at top |
| Endpoint from brute force | `rate limit N per minute` |

A real production endpoint layers multiple guards:

```clear
when user calls POST /api/orders sending order_data:
  requires login                                        # 1. auth
  requires role 'customer'                              # 2. role
  rate limit 30 per minute                              # 3. brute force
  validate order_data:                                  # 4. input shape
    product_id is number, required
    quantity is number, required, min 1, max 100
  guard user's plan is not 'free' or 'Upgrade to Pro'  # 5. business rule
  guard product's stock > 0 or 'Out of stock'          # 5. business rule
  new_order = save order_data as new Order
  send back new_order with success message
```

That's six guards on one endpoint. Sounds like a lot — but each catches a
different attack. Skip any one and your app has a hole.

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
  requires login
  save update_data to Users
  send back update_data with success message

when user calls DELETE /api/users/:id:
  requires login
  delete the User with this id
  send back 'deleted' with success message
```

### DB Relationships

Use `belongs to` to declare foreign key relationships between tables:

```clear
build for javascript backend

create a Users table:
  name
  email, unique

create a Posts table:
  title
  body
  author belongs to Users

when user calls GET /api/posts:
  all_posts = get all Posts
  send back all_posts
```

When you `get all Posts`, the compiler auto-loads the related User for each post's `author` field.

### Has Many Relationships

The inverse of `belongs to`. Declare that a parent table has many children,
and the compiler auto-generates nested endpoints:

```clear
create a Users table:
  name
  email, unique

create a Posts table:
  title
  body
  author belongs to Users

Users has many Posts
```

This auto-generates `GET /api/users/:id/posts` — returns all posts belonging
to a specific user. You don't need to write the endpoint yourself.

### Full Text Search

Search across all fields of a table with one line:

```clear
when user calls GET /api/posts/search sending search_data:
  results = search Posts for search_data's query
  send back results
```

`search X for Y` filters records where ANY field contains the search term
(case-insensitive). No need to specify which fields — it checks all of them.

### Aggregate Field Extraction

Extract and aggregate a field from a list of records:

```clear
total_revenue = sum of amount in orders
avg_price = average of price in products
highest_score = max of score in results
lowest_score = min of score in results
```

Without `in`, aggregates work on flat arrays as before: `total = sum of prices`.

### Environment Variables

```clear
api_key is env('API_KEY')
secret is env('STRIPE_SECRET')
```

---

## Chapter 13b: Charts (Visualizing Your Data)

Clear includes built-in charts powered by ECharts. No setup needed — the CDN
loads automatically when your app has a chart.

### Bar Chart

```clear
bar chart 'Revenue by Region' showing sales
```

The chart auto-detects: first string field becomes x-axis labels, number fields
become y-axis values. Multiple number fields create multiple series with a legend.

### Line and Area Charts

```clear
line chart 'Monthly Trend' showing monthly_data
area chart 'Growth Over Time' showing quarterly_data
```

### Pie Chart with Grouping

Use `by field` to group your data and count occurrences:

```clear
pie chart 'Issues by Status' showing issues by status
```

This counts how many issues have each status value and renders a donut chart.

### Bar Chart with Grouping

`by field` works on all chart types, not just pie:

```clear
bar chart 'Issues by Project' showing issues by project
```

This groups all issues by their `project` field, counts each group, and renders
a bar chart with project names on x-axis and counts on y-axis.

### Putting It Together

Here's a dashboard with stat cards and charts:

```clear
section 'Stats' as 4 columns:
  section 'Open' with style metric_card:
    small text 'Open Issues'
    heading '12'
    text '+3 this week'

bar chart 'Weekly Trends' showing weekly_data
pie chart 'By Priority' showing issues by priority
```

The `+3` in the stat card automatically renders in green with an up-arrow icon.
Text starting with `-` renders in red with a down-arrow. Zero extra syntax needed.

### Alternate Syntax

You can also write the title first:

```clear
'Revenue' bar chart showing sales
```

Both forms compile to the same thing. Use whichever reads better to you.

### Chart Modifiers

Add a subtitle below the chart title, or stack bars on top of each other:

```clear
bar chart 'Weekly Trends' subtitle 'Opened vs closed issues' showing weekly_stats

bar chart 'Weekly Trends' subtitle 'Last 4 weeks' showing weekly_stats stacked
```

---

## Chapter 14: Error Handling (Because Things Go Wrong)

The internet is unreliable. APIs go down. Databases hiccup. Users type nonsense
into every field. Clear gives you clean ways to handle all of it.

```clear
try:
  result = call api 'https://api.example.com/data'
  show result
if error:
  show 'Something went wrong'
```

### Typed Error Handlers (Route Different Failures Differently)

Not all errors are equal. A 404 (not found) needs a different response than a 403 (permission denied).

```clear
try:
  fetch post from '/api/posts/123'
if error 'not found':
  show 'That post doesn't exist'
if error 'forbidden':
  show 'You don't have permission to view this'
if error 'unauthorized':
  redirect to '/login'
if error:
  show 'Something unexpected happened'
```

### Accessing the Error Object

Inside any `if error` block, the variable `error` is automatically available:

```clear
try:
  fetch data from '/api/data'
if error 'not found':
  show 'Error {error's status}: {error's message}'
if error:
  show error's message
```

Supported typed handlers: `not found` (404), `forbidden` (403), `unauthorized` (401),
`bad request` (400), `server error` (500).

### Throwing Custom Errors

Use `send error` to throw your own error and stop execution:

```clear
define function validate_age(age):
  if age is less than 0:
    send error 'Age cannot be negative'
  if age is less than 18:
    fail with 'Must be 18 or older'
  return age
```

Aliases: `throw error`, `fail with`, `raise error` — all work identically.
Errors propagate up to the nearest `try/if error` block, or crash if uncaught.

### Finally (Cleanup Code)

Need to clean up resources no matter what — close a file, release a lock?

```clear
try:
  process_data(connection)
if error:
  show 'Processing failed: {error's message}'
finally:
  close_connection()
```

The `finally:` block always runs, whether the try succeeded or failed.
Aliases: `always do:` and `after everything:`.

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

## Chapter 16b: Clear Studio (The IDE)

Clear has a built-in IDE called **Clear Studio**. Run `node playground/server.js`
and open `http://localhost:3456`.

### Three Panels

- **Left:** Code editor (CodeMirror 6) — write and edit Clear code
- **Right top:** Live preview and terminal — see your app running
- **Right bottom:** AI chat — talk to Meph, the built-in AI assistant

### Click-to-Highlight (Source Mapping)

Click any line in the Clear editor and the compiled output highlights the
corresponding JavaScript/HTML line. This works because the compiler embeds
source map markers (`// clear:N`) in the compiled output.

Click a line in the compiled output and it highlights the original Clear line.
Two-way mapping — you always know which Clear line produced which output line.

This is especially useful for debugging: if something looks wrong in the
compiled output, click it to find the Clear line that generated it.

### 43 Template Apps

The dropdown at the top has 43 pre-built example apps — from simple todo lists
to full dashboards with charts and AI agents. Pick one, click it, and the code
loads in the editor. Great for learning and starting new projects.

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

**When a test fails**, Clear tells you what went wrong in plain English:

```
✗ posting a note works
  POST /api/notes returned 404 (expected 201).
  404 means "there is no endpoint at that URL." Either the path
  in your test is wrong, or you forgot to write
  `when user calls POST /api/notes:` in your Clear file.
  [clear:12]
```

Every status code gets a real explanation — 200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 5xx. The `[clear:N]` tag points at the exact source line that failed. In **Clear Studio**, clicking a failing test row jumps the editor to that line. There's also a **Fix with Meph** button that hands the error + surrounding code to Meph for an auto-fix.

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

### TDD with Functions (Write the Test First)

For any logic that doesn't need a database or HTTP endpoint, use `define function` and test it directly. The test goes in first — before the function exists.

**Red step — write a failing test:**
```clear
build for javascript backend

test 'discount calculation':
  result = apply_discount(100, 0.10)
  expect result is 10
```

Run `clear test`. It fails: `apply_discount is not defined`. That's the signal. Now write the function.

**Green step — write the function:**
```clear
build for javascript backend

define function apply_discount(price, rate):
  send back price * rate

test 'discount calculation':
  result = apply_discount(100, 0.10)
  expect result is 10
```

Run `clear test` again. It passes. The function and the test live in the same file.

`send back` inside `define function` compiles to a plain `return` — not HTTP. You can call it from test blocks, from other functions, or from endpoints. It's just a regular function.

**If your function name collides with a built-in** (like `length`, `keys`, or `values`), Clear gives priority to your definition. You can write `define function length(text):` and it will shadow the built-in in your app.

### Testing AI Agents

Use `mock claude responding:` to test agents without calling the real API:

```clear
agent 'Classifier' receives feedback:
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

### Intent-Based Tests (The Easy Way)

Instead of writing raw HTTP calls, describe what you want to test in English:

```clear
test 'todo workflow':
  can user create a new todo with title: 'Buy groceries'
  expect it succeeds
  can user view all todos
  expect it succeeds
  can user delete a todo
  expect it succeeds

test 'validation catches missing fields':
  can user create a todo without a title
  expect it is rejected

test 'security':
  deleting a todo should require login

test 'agent smoke test':
  can user ask agent 'Helpdesk' with message: 'hello'
  expect it succeeds

test 'display works':
  does the todos list show 'Buy groceries'
```

The compiler figures out which endpoints to call based on your tables and
endpoints. `create` becomes POST, `view` becomes GET, `delete` becomes DELETE.

**Available expectations:**
- `expect it succeeds` — status 200-299
- `expect it fails` — non-success status
- `expect it requires login` — status 401
- `expect it is rejected` — status 400
- `expect response has id` — field exists
- `expect response contains 'text'` — body contains text

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

**Option B: Railway (One Command)**

```bash
clear deploy main.clear
```

This packages your app with the correct database adapter, runs `railway up`,
and prints environment variable guidance. If your app uses `database is PostgreSQL`,
the Postgres adapter is bundled automatically.

Requirements:
- Install Railway CLI: `npm install -g @railway/cli`
- Log in: `railway login`
- Create a project: `railway init`

**Option C: Any Node.js host**

Upload the `build/` directory to Vercel, Render, Fly.io, or any
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
  requires login
  save update_data to Items
  send back update_data with success message

# Delete
when user calls DELETE /api/items/:id:
  requires login
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

**String interpolation:**
```clear
show 'Hello, {name}! Score: {score * 10}.'
msg is 'User: {user's email}'     # possessive inside {} works
```

**Typed functions:**
```clear
define function add(a is number, b is number) returns number:
  return a + b
```

**Map iteration:**
```clear
for each key, value in settings:
  show '{key} = {value}'
if 'theme' exists in settings:
  show keys of settings
```

**Higher-order functions:**
```clear
doubled = apply double to each in numbers
evens   = filter numbers using is_even
```

**Typed error handling:**
```clear
try:
  fetch data from '/api/item'
if error 'not found':
  show 'Missing'
if error 'forbidden':
  show error's message
if error:
  show error's message
```

---

## Chapter 19: Workflows (Multi-Step AI Pipelines)

Chapter 10 showed you how to build AI agents. But real-world AI work often needs
multiple agents working together — one researches, another writes, another reviews,
and they keep going until the quality is good enough. That's a workflow.

### Your First Workflow

```clear
build for web and javascript backend
database is local memory

agent 'Writer' receives topic:
  set topic's draft to ask claude 'Write a short article about this topic' with topic's topic
  send back topic

agent 'Reviewer' receives state:
  set result to ask claude 'Score this draft 1-10 for quality' with state's draft returning JSON text:
    quality_score (number)
    feedback
  set state's quality_score to result's quality_score
  set state's feedback to result's feedback
  send back state

workflow 'Article Pipeline' with state:
  state has:
    topic, required
    draft
    quality_score (number), default 0
    feedback

  step 'Write' with 'Writer'
  step 'Review' with 'Reviewer'
```

Read that out loud: *"The Article Pipeline workflow has state with a topic (required),
draft, quality score (starts at 0), and feedback. Step one: Write. Step two: Review."*

Each step passes the full state to an agent. The agent modifies it and passes it back.

### Conditional Routing

What if you want different agents for different situations?

```clear
workflow 'Support Router' with state:
  state has:
    message, required
    category
    resolution

  step 'Classify' with 'Classifier Agent'
  if state's category is 'billing':
    step 'Billing' with 'Billing Specialist'
  otherwise:
    step 'General' with 'General Support'
  step 'Close' with 'Closer Agent'
```

After classification, billing questions go to the billing specialist.
Everything else goes to general support. Then both paths converge at "Close."

### Retry Loops (Quality Gates)

The killer feature. Repeat steps until they're good enough:

```clear
workflow 'Content Review' with state:
  state has:
    draft, required
    quality_score (number), default 0

  step 'Write' with 'Writer'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer'
    if state's quality_score is less than 8:
      step 'Revise' with 'Writer'
  step 'Publish' with 'Publisher'
```

Write once, review, and if the score is below 8, revise and try again — up to 3 times.
Then publish. The `max 3 times` is a safety net so it never loops forever.

### Parallel Branches

Run multiple agents at the same time and merge results:

```clear
workflow 'Article Analysis' with state:
  state has:
    text, required
    sentiment
    seo_score

  at the same time:
    step 'Sentiment' with 'Sentiment Agent' saves to state's sentiment
    step 'SEO' with 'SEO Agent' saves to state's seo_score
  step 'Report' with 'Report Agent'
```

Sentiment analysis and SEO scoring happen simultaneously. Each result saves to
a specific field in the state. Then the Report agent gets the combined result.

### Saving Progress (Crash Recovery)

For long-running workflows, save a checkpoint after each step:

```clear
workflow 'Onboarding' with state:
  save progress to Workflows table
  state has:
    user_id, required
    welcome_sent (boolean), default false
    profile_created (boolean), default false

  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
  step 'Tutorial' with 'Tutorial Agent'
```

If the server crashes mid-workflow, the progress is in the database.

### Running a Workflow

Call it from an endpoint like any other function:

```clear
when user calls POST /api/content sending data:
  result = run workflow 'Content Review' with data
  send back result
```

The result contains the final state — all fields, updated by every step.

### Tracking What Happened

Add observability to see every step the workflow took:

```clear
workflow 'Support' with state:
  track workflow progress
  state has:
    message, required
  step 'Triage' with 'Triage Agent'
  step 'Resolve' with 'Resolution Agent'
```

The result includes `_history` — an array of state snapshots at each step,
with timestamps. Great for debugging and audit trails.

---

## Chapter 20: Designing Beautiful Pages

Up to this point, we've been building functional apps. They work, they have
data, they have buttons. But they look like... developer prototypes. Functional
but not exactly something you'd put on Product Hunt.

Clear has a secret weapon: **style presets**. These are built-in design recipes
that emit production-quality HTML. Think Stripe's landing page. Think Linear's
dashboard. You get that level of polish by adding `with style preset_name` to
your sections.

No CSS to write. No Tailwind classes to memorize. Just pick the right preset
and fill in your content.

### Part 1: Building a Marketing Landing Page

Let's build a real landing page for a fictional SaaS product called "Beacon" --
a customer analytics tool. We'll go section by section, the way a real landing
page is structured: navbar, hero, social proof, features, pricing, FAQ, CTA,
footer.

#### Step 1: The Navbar

Every landing page starts with a navbar. Brand on the left, links in the middle,
CTA button on the right.

```clear
section 'Nav' with style page_navbar:
  heading 'Beacon'
  link 'Features' to '#features'
  link 'Pricing' to '#pricing'
  link 'Docs' to '/docs'
  button 'Start Free':
    go to '/signup'
```

The `page_navbar` preset handles all the layout: sticky positioning, responsive
hamburger menu, transparent backdrop blur. You just provide the heading (brand),
links (nav items), and a button (CTA). The last button automatically gets
primary styling.

#### Step 2: The Hero

The hero is the first thing visitors see. It needs to grab attention in under
3 seconds.

```clear
section 'Hero' with style page_hero:
  small text 'Trusted by 2,000+ teams'
  heading 'Know your customers before they leave.'
  subheading 'Beacon tracks every click, scroll, and drop-off so you can fix problems before they cost you revenue.'
  link 'Start free trial' to '/signup'
  link 'Watch demo' to '/demo'
```

`page_hero` centers everything, adds generous padding, and puts a subtle radial
glow behind the content. The `small text` at the top becomes a badge. Links
at the bottom become side-by-side CTA buttons (primary + ghost).

Want a left-aligned hero with a product screenshot on the right? Use `hero_left`
instead.

#### Step 3: Social Proof (Stats + Logos)

Nobody wants to be the first customer. Show them they're not.

```clear
section 'Stats' with style stats_row:
  section 'S1' with style stat_item:
    heading '2.4B'
    text 'Events tracked'
  section 'S2' with style stat_item:
    heading '2,000+'
    text 'Teams'
  section 'S3' with style stat_item:
    heading '99.97%'
    text 'Uptime'
  section 'S4' with style stat_item:
    heading '<150ms'
    text 'Avg latency'
```

`stats_row` lays out child `stat_item` sections in a 4-column grid. Each item
centers a big heading (the number) over a small label (the description).

#### Step 4: Features

The `feature_split` preset creates a bento-grid layout: one large hero card
on the left (2/3 width) and smaller cards stacked on the right (1/3 width).

```clear
section 'Features' with style feature_split:
  heading 'Everything you need to understand your users'
  text 'From first click to conversion.'
  section 'Main' with style feature_card_large:
    heading 'Funnel Analysis'
    subheading 'See the drop-off. Fix the leak.'
    text 'Pinpoint exactly where users abandon your flows.'
  section 'S1' with style feature_card_teal:
    heading 'Session Replay'
    text 'Watch real user sessions.'
  section 'S2' with style feature_card_purple:
    heading 'A/B Testing'
    text 'Ship variants. Get significance.'
```

The colored card presets (`feature_card_teal`, `feature_card_purple`, etc.)
add bold background colors for visual variety -- like the bento grids you see
on Clay, Notion, and Linear marketing pages.

For a simpler even grid, use `feature_grid` with `feature_card` children.

#### Step 5: Testimonials

Social proof from real humans. The `testimonial_grid` preset automatically
adds star ratings and opening quote marks to each card.

```clear
section 'Testimonials' with style testimonial_grid:
  heading 'What our customers say'
  section 'T1' with style testimonial_card:
    text 'We cut checkout abandonment by 34% in six weeks.'
    subheading 'Sarah Chen'
    small text 'Head of Product, Cartify'
  section 'T2' with style testimonial_card:
    text 'Finally analytics that answer questions in minutes, not days.'
    subheading 'Marcus Webb'
    small text 'Growth Lead, Teamflow'
  section 'T3' with style testimonial_card:
    text 'Session replay alone was worth it. Activation went from 31% to 58%.'
    subheading 'Priya Kapoor'
    small text 'CEO, Docsend Pro'
```

#### Step 6: Pricing

The `pricing_grid` preset creates a 3-column comparison. The middle card can
use `pricing_card_featured` for a highlighted "recommended" treatment with a
ring and slight scale-up.

```clear
section 'Pricing' with style pricing_grid:
  heading 'Simple pricing'
  text 'All plans include unlimited team members.'
  section 'Free' with style pricing_card:
    heading 'Free'
    subheading '$0 / month'
    text '10k events/month'
    text '30-day retention'
    link 'Get started' to '/signup'
  section 'Pro' with style pricing_card_featured:
    heading 'Pro'
    subheading '$49 / month'
    text '5M events/month'
    text '12-month retention'
    text 'Session replay'
    link 'Start trial' to '/signup'
  section 'Enterprise' with style pricing_card:
    heading 'Enterprise'
    subheading 'Custom'
    text 'Unlimited everything'
    text 'SSO and SCIM'
    text 'Dedicated SLA'
    link 'Talk to sales' to '/contact'
```

#### Step 7: FAQ

The `faq_section` preset turns child sections into an accordion. The section
title becomes the question. The body text becomes the answer. First item
starts open.

```clear
section 'FAQ' with style faq_section:
  heading 'Frequently asked questions'
  section 'Is there a free plan?':
    text 'Yes -- the free tier includes 10k events per month with no credit card required.'
  section 'Can I cancel anytime?':
    text 'Absolutely. No contracts, no cancellation fees. Your data exports with one click.'
  section 'Do you support GDPR?':
    text 'Yes. We are SOC 2 Type II certified and fully GDPR compliant.'
```

#### Step 8: CTA + Footer

Close with a bold call-to-action banner and a multi-column footer.

```clear
section 'CTA' with style page_cta:
  heading 'Stop guessing. Start knowing.'
  text 'Free forever on the starter plan. No credit card required.'
  link 'Create free account' to '/signup'

section 'Footer' with style page_footer:
  heading 'Beacon'
  section 'Product':
    link 'Features' to '/features'
    link 'Pricing' to '/pricing'
    link 'Changelog' to '/changelog'
  section 'Company':
    link 'About' to '/about'
    link 'Blog' to '/blog'
    link 'Careers' to '/careers'
  section 'Legal':
    link 'Privacy' to '/privacy'
    link 'Terms' to '/terms'
  small text '2026 Beacon Analytics. All rights reserved.'
```

#### The Complete Landing Page

Here's the whole thing assembled. 85 lines for a production-quality SaaS
landing page:

```clear
build for web
theme 'midnight'

page 'Beacon Analytics' at '/':

  section 'Nav' with style page_navbar:
    heading 'Beacon'
    link 'Features' to '#features'
    link 'Pricing' to '#pricing'
    link 'Docs' to '/docs'
    button 'Start Free':
      go to '/signup'

  section 'Hero' with style page_hero:
    small text 'Trusted by 2,000+ teams'
    heading 'Know your customers before they leave.'
    subheading 'Beacon tracks every click, scroll, and drop-off so you can fix problems before they cost you revenue.'
    link 'Start free trial' to '/signup'
    link 'Watch demo' to '/demo'

  section 'Stats' with style stats_row:
    section 'S1' with style stat_item:
      heading '2.4B'
      text 'Events tracked'
    section 'S2' with style stat_item:
      heading '2,000+'
      text 'Teams'
    section 'S3' with style stat_item:
      heading '99.97%'
      text 'Uptime'
    section 'S4' with style stat_item:
      heading '<150ms'
      text 'Avg latency'

  section 'Features' with style feature_split:
    heading 'Everything you need to understand your users'
    text 'From first click to conversion.'
    section 'Main' with style feature_card_large:
      heading 'Funnel Analysis'
      subheading 'See the drop-off. Fix the leak.'
      text 'Pinpoint exactly where users abandon your flows.'
    section 'S1' with style feature_card_teal:
      heading 'Session Replay'
      text 'Watch real user sessions.'
    section 'S2' with style feature_card_purple:
      heading 'A/B Testing'
      text 'Ship variants. Get significance.'

  section 'Testimonials' with style testimonial_grid:
    heading 'What our customers say'
    section 'T1' with style testimonial_card:
      text 'We cut checkout abandonment by 34% in six weeks.'
      subheading 'Sarah Chen'
      small text 'Head of Product, Cartify'
    section 'T2' with style testimonial_card:
      text 'Finally analytics that answer questions in minutes, not days.'
      subheading 'Marcus Webb'
      small text 'Growth Lead, Teamflow'
    section 'T3' with style testimonial_card:
      text 'Session replay alone was worth it. Activation went from 31% to 58%.'
      subheading 'Priya Kapoor'
      small text 'CEO, Docsend Pro'

  section 'Pricing' with style pricing_grid:
    heading 'Simple pricing'
    text 'All plans include unlimited team members.'
    section 'Free' with style pricing_card:
      heading 'Free'
      subheading '$0 / month'
      text '10k events/month'
      text '30-day retention'
      link 'Get started' to '/signup'
    section 'Pro' with style pricing_card_featured:
      heading 'Pro'
      subheading '$49 / month'
      text '5M events/month'
      text '12-month retention'
      text 'Session replay'
      link 'Start trial' to '/signup'
    section 'Enterprise' with style pricing_card:
      heading 'Enterprise'
      subheading 'Custom'
      text 'Unlimited everything'
      text 'SSO and SCIM'
      text 'Dedicated SLA'
      link 'Talk to sales' to '/contact'

  section 'FAQ' with style faq_section:
    heading 'Frequently asked questions'
    section 'Is there a free plan?':
      text 'Yes -- the free tier includes 10k events per month with no credit card required.'
    section 'Can I cancel anytime?':
      text 'No contracts, no cancellation fees. Your data exports with one click.'
    section 'Do you support GDPR?':
      text 'We are SOC 2 Type II certified and fully GDPR compliant.'

  section 'CTA' with style page_cta:
    heading 'Stop guessing. Start knowing.'
    text 'Free forever on the starter plan.'
    link 'Create free account' to '/signup'

  section 'Footer' with style page_footer:
    heading 'Beacon'
    section 'Product':
      link 'Features' to '/features'
      link 'Pricing' to '/pricing'
    section 'Company':
      link 'About' to '/about'
      link 'Blog' to '/blog'
    small text '2026 Beacon Analytics. All rights reserved.'
```

### Part 2: Building an App Dashboard

Marketing pages sell the product. Dashboards ARE the product. Different
structure, different presets, same idea: pick the right preset and fill in
content.

The app UI presets give you the classic SaaS layout: fixed sidebar on the left,
sticky header across the top, scrollable content area with cards and tables.
Think Linear, Notion, or any modern productivity tool.

#### The Layout Skeleton

Every dashboard starts with the same three-level nesting:

```
app_layout (flex row, full screen height)
  app_sidebar (fixed width, left)
  app_main (fills remaining space, flex column)
    app_header (sticky top)
    app_content (scrollable)
```

In Clear:

```clear
section 'App' with style app_layout:
  section 'Sidebar' with style app_sidebar:
    # sidebar content here
  section 'Main' with style app_main:
    section 'Header' with style app_header:
      # header content here
    section 'Content' with style app_content:
      # dashboard content here
```

That's it. Four sections, four presets. You now have a full-screen app layout
with a sidebar, header, and scrollable content area.

#### The Sidebar

The `app_sidebar` preset is smart about its children. It splits them
automatically:

- The first `heading` becomes the brand/logo area at the top
- `text` and `link` items become nav menu items (using DaisyUI's menu component)
- Nested `section` blocks become labeled nav groups (the section title becomes
  a group header)

```clear
section 'Sidebar' with style app_sidebar:
  heading 'ProjectHub'

  section 'Main':
    text 'Dashboard'
    text 'Projects'
    text 'Team'

  section 'Settings':
    text 'Account'
    text 'Billing'
    text 'Integrations'
```

That produces a sidebar with "ProjectHub" as the brand, then two labeled nav
groups ("Main" and "Settings") with items under each.

#### The Header

`app_header` gives you a sticky bar with a split layout: content on the left,
actions on the right.

```clear
section 'Header' with style app_header:
  heading 'Dashboard'
  button 'New Project':
    open the New Project modal
```

#### Metric Cards

For KPI rows at the top of dashboards, use `metric_card` inside a column grid:

```clear
section 'Stats' as 4 columns:
  section 'Revenue' with style metric_card:
    display revenue as dollars called 'Revenue'
  section 'Users' with style metric_card:
    display active_users as number called 'Active Users'
  section 'Orders' with style metric_card:
    display order_count as number called 'Orders'
  section 'Growth' with style metric_card:
    display growth_rate as percent called 'Growth'
```

The `as 4 columns` modifier on the parent creates a CSS grid. Each `metric_card`
gets a compact card treatment with the number prominently displayed.

#### Tables

Wrap a `display X as table` in an `app_table` preset for the rounded, bordered
look:

```clear
section 'Projects' with style app_table:
  display projects as table showing name, status, owner, updated_at
```

#### Empty States

When there's no data yet, show a friendly placeholder instead of a blank void:

```clear
section 'No Data' with style empty_state:
  heading 'No projects yet'
  text 'Create your first project to get started.'
  button 'New Project':
    open the New Project modal
```

The `empty_state` preset adds a dashed border, centered content, and generous
padding. It says "this space is intentionally empty" instead of looking broken.

#### The Complete Dashboard

Here's a full project management dashboard. Backend + frontend in one file:

```clear
build for web and javascript backend
theme 'midnight'

database is local memory

create a Projects table:
  name, required
  status, default 'active'
  owner
  created_at_date, auto

accept requests from any website
log every request

when user calls GET /api/projects:
  all_projects = get all Projects
  send back all_projects

when user calls POST /api/projects sending project_data:
  validate project_data:
    name is text, required, min 1, max 100
  new_project = save project_data as new Project
  send back new_project with success message

when user calls DELETE /api/projects/:id:
  requires login
  delete the Project with this id
  send back 'deleted' with success message

page 'ProjectHub' at '/':

  revenue = 48200
  active_users = 1284
  open_issues = 37
  uptime = 0.9997

  on page load get projects from '/api/projects'

  section 'App' with style app_layout:

    section 'Sidebar' with style app_sidebar:
      heading 'ProjectHub'
      section 'Main':
        text 'Dashboard'
        text 'Projects'
        text 'Team'
      section 'Settings':
        text 'Account'
        text 'Billing'

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
            display active_users as number called 'Active Users'
          section 'M3' with style metric_card:
            display open_issues as number called 'Open Issues'
          section 'M4' with style metric_card:
            display uptime as percent called 'Uptime'

        section 'Projects Table' with style app_card:
          subheading 'All Projects'
          display projects as table showing name, status, owner with delete

        section 'Activity' with style app_list:
          heading 'Recent Activity'
          text 'Alice deployed v2.1.0 to production'
          text 'Bob closed 3 issues in the Backend project'
          text 'Carol updated the billing integration'

  section 'New Project' as modal:
    section 'Form' with style form:
      subheading 'Create Project'
      'Project Name' is a text input saved as a project_name
      'Owner' is a text input saved as a owner
      button 'Create':
        send project_name and owner as a new project to '/api/projects'
        get projects from '/api/projects'
        close modal
      button 'Cancel':
        close modal
```

That's 80 lines of Clear for a full-stack dashboard app with a database,
REST API, validation, auth on delete, and a polished frontend with sidebar
navigation, metric cards, a data table, activity feed, and a modal form.

In React + Express, you'd be looking at 400-500 lines across 8-10 files.
In Clear, it's one file that you can read top to bottom in two minutes.

---

## What's Next? (You Did It!)

## Chapter 21: Policies (Safety Guardrails)

Your AI agent is smart. But smart doesn't mean safe. What happens when it
tries to delete every record in your database? Or sends 10,000 emails? Or
drops a table?

Policies are guardrails. They're rules your app enforces at runtime — not
suggestions, not warnings, but hard blocks that throw errors.

### The Basics

```clear
policy:
  block schema changes
  block deletes without filter
  block prompt injection
```

Three lines. Your app now:
- Can't DROP, ALTER, or TRUNCATE tables (even if an agent tries)
- Can't delete all rows (requires a WHERE filter)
- Scans all input for prompt injection attempts

### Protecting Sensitive Data

```clear
policy:
  protect tables: AuditLog, Payments
  block reads on CreditCards
  require role 'admin'
```

The `AuditLog` and `Payments` tables can't be modified by any operation.
Nobody can read from `CreditCards`. And all API calls require an admin role.

### Email and Communication Safety

```clear
policy:
  no mass emails
  block direct messages
```

Agents can't accidentally mass-email your contact list. And they can't
send Slack DMs to individual users.

### The Full List

Clear supports 30+ policy types covering: database safety, prompt injection,
access control, code freeze, maintenance windows, email, Slack, filesystem,
git safety, CRM, and cloud storage. See `SYNTAX.md` for the complete reference.

### When to Use Policies

**Always.** Every production app should have at minimum:
```clear
policy:
  block schema changes
  block deletes without filter
  block prompt injection
```

These three rules prevent the most common AI agent failure modes. They cost
nothing to add and they'll save you the first time an agent goes off-script.

---

You just learned an entire programming language. Not bad for one sitting.

Here's where to go from here:

1. **Browse the example apps** in the `apps/` directory — 43 apps from simple to ambitious
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

---

## Chapter 22: Scheduled Tasks (Set It and Forget It)

Sometimes you want your app to do things automatically — clean up old data every hour,
send a daily report, check for updates every few minutes. That's what scheduled tasks are for.

### Running Something Every Few Minutes

```clear
every 5 minutes:
  old_sessions = look up all Sessions where age is greater than 24
  delete old_sessions from Sessions
```

That runs the cleanup code every 5 minutes, forever. You can use `minutes` or `hours`.

### Running Something at a Specific Time

```clear
every day at 9am:
  users = look up all Users
  for each user in users:
    send email to user's email with subject 'Good morning!'
```

Supports times like `9am`, `2:30pm`, `12:00am` (midnight).

### When to Use Scheduled Tasks

- Daily email digests
- Cleaning up expired data
- Polling external APIs for updates
- Generating daily reports

---

## Chapter 23: Writing Tests (Proving Your API Works)

You can write tests right in your Clear file. The easiest way is intent-based tests
that read like user stories:

```clear
test 'todo workflow':
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

The compiler knows your tables and endpoints, so `can user create a todo` becomes
a POST to `/api/todos` automatically.

You can also write raw HTTP calls for more control:

```clear
test 'create a todo':
  call POST /api/todos with title is 'Buy milk'
  expect response status is 201
  expect response body has id

test 'list all todos':
  call GET /api/todos
  expect response status is 200
```

These tests run alongside the auto-generated tests when you use `clear test`.

**What gets auto-generated:** The compiler automatically generates tests for every endpoint and table in your app, with human-readable English names:
- "Creating a new todo succeeds" (not "POST /api/todos returns 201")
- "Viewing all todos returns data"
- "Deleting a todo requires login" (if the endpoint has auth)
- "User can create a todo and see it in the list" (CRUD flow test)
- "The Helpdesk agent responds to messages" (agent smoke test)

You only need to write custom tests for business logic, validation edge cases, and workflows that go beyond basic CRUD.

### What You Can Check

```clear
# After intent-based tests (can user / does)
expect it succeeds                     # 2xx status
expect it fails                        # non-2xx
expect it requires login               # 401
expect it is rejected                  # 400
expect response has id                 # field exists in response
expect response contains 'success'     # body contains text

# After raw HTTP calls
expect response status is 200          # check the status code
expect response body has name          # check a field exists
expect response body length is greater than 0  # check there's data
```

### Capturing Command Output

You can run shell commands and capture their output:

```clear
when user calls GET /api/version:
  version = run command 'node --version'
  send back version
```

The `= run command` form captures stdout as a string. Without the `=`, the command
just runs without capturing anything.

---

## Appendix: What Meph Can Do

Meph is the AI agent inside Clear Studio. Here's everything Meph has access to:

### Tools

| Tool | What it does |
|------|-------------|
| `edit_code` | Read, replace, or undo the Clear source in the editor |
| `read_file` | Read SYNTAX.md, AI-INSTRUCTIONS.md, PHILOSOPHY.md, USER-GUIDE.md, requests.md, meph-memory.md |
| `run_command` | Run CLI commands: `node cli/clear.js check`, `curl`, `ls` |
| `compile` | Compile the current source — returns errors, warnings, output targets |
| `run_app` | Start the compiled app as a live server |
| `stop_app` | Stop the running app |
| `http_request` | Make HTTP requests to the running app (GET, POST, PUT, DELETE) |
| `edit_file` | Edit any project file (append, insert, replace, overwrite, read) |
| `read_terminal` | Read terminal output + frontend console errors |
| `screenshot_output` | Get the rendered HTML from the running app |
| `highlight_code` | Flash-highlight lines in the editor to point something out |
| `browse_templates` | List or read any template's source code |
| `source_map` | Query which compiled output comes from which Clear line |
| `web_search` | Search the web (when enabled) |
| `web_fetch` | Fetch content from URLs (when enabled) |

### What Meph Can Access

Meph can see and use everything in Studio: templates, docs, source maps, terminal,
data view, API testing, screenshots. The only things Meph cannot touch are the dark
mode button, "New" (clearing the editor), and "Load" (loading a template) — those
are user-initiated actions only.

### How Meph Edits Code

Meph currently uses `edit_code action='write'` which replaces the entire editor
content. For small changes, this is like rewriting a whole essay to fix a typo.
The patch API (`patch.js`) provides surgical edits — add an endpoint, fix a line,
add a field — but isn't yet wired as a Meph tool. Coming soon.

### Meph's Memory

Meph has persistent memory in `meph-memory.md`. Tell Meph "remember this" and it
saves facts across conversations. Memory persists between sessions.

Happy building!
