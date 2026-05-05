# Canonical Worked Examples — Clear

> **STATUS: INITIAL DRAFT — needs Russell's curation pass.**
>
> This file is the Phase 2 deliverable from the **winner-harvest plan**
> (`plans/plan-winner-harvest-04-26-2026.md`). Examples below were picked
> *automatically* from the top of `snapshots/winner-rankings-04-26-2026.txt`
> by an overnight agent — diversity over an archetype × line-count grid, no
> hand-judgment yet. Each one is a real `test_pass=1` row from the Factor DB.
>
> **Russell's refinement path (when he wakes up):**
> - **Keep** — example reads as canonical, ship it as-is.
> - **Improve description** — code is good, blurb is too generic; sharpen it.
> - **Swap** — there's a better row in the rankings file at that line-count;
>   replace this row's id with the better one.
> - **Drop** — example doesn't pass the "yes, that's idiomatic Clear" eyeball
>   test; remove the section.
>
> Goal of the curated file: **5-10 examples** Meph can pattern-match off,
> covering at least 6 archetypes. The hard cap from Phase 4 of the plan is 15.
>
> **NOT yet wired into Meph.** Phase 4 of the plan (auto-promotion +
> retrieval) is what actually tells the system prompt to load these. Russell
> wires that manually after curating.

---

## Example 1 — Minimal echo with route parameter (api_service, 5 lines)

The smallest end-to-end Clear program: one `build for` line, one endpoint,
one response. Route parameter (`:name`) flows through `this name`. Good
opener for Meph — shows the irreducible shape of "Clear app."

*Factor DB id: 632 — score 1.8333, first-try clean.*

```clear
build for javascript backend

when user calls GET /api/greet/:name:
  send back { greeting: ('Hello, ' + this name + '!') }
```

---

## Example 2 — POST with body and echo back (api_service, 5 lines)

Same shape, but for write-side requests. Names the incoming payload
explicitly (`sending body`) and echoes it. Demonstrates the canonical
keyword for receiving request bodies — `sending <name>` — that has bitten
new sessions in the past.

*Factor DB id: 1367 — score 1.8333, first-try clean.*

```clear
build for javascript backend

when user calls POST /api/echo sending body:
  send back body
```

---

## Example 3 — Counter API with module-level state (api_service, 15 lines)

First example with **persistent state** between requests. `counter_value`
is declared once at the top, then read and written inside endpoints. Three
endpoints share it (read, increment, reset). Notable: no database needed —
module-level variables are fine for in-memory state.

*Factor DB id: 635 — score 1.6, first-try clean.*

```clear
build for javascript backend

counter_value = 0

when user calls GET /api/count:
  send back { count: counter_value }

when user calls POST /api/increment:
  counter_value = counter_value + 1
  send back { count: counter_value }

when user calls POST /api/reset:
  counter_value = 0
  send back { count: counter_value }
```

---

## Example 4 — Summarizer agent with structured JSON return (agent_workflow, 12 lines)

First contact with `agent` and `ask claude`. The agent is named, takes a
typed input (`text`), calls Claude with a system prompt, and returns
**structured JSON** with the `returning JSON` clause that names the
expected fields. The endpoint then calls the agent by name. Idiomatic
shape for any "AI-assisted feature" in a Clear app.

*Factor DB id: 686 — score 1.6111, first-try clean.*

```clear
build for javascript backend

agent 'Summarizer' receives text:
  response = ask claude 'Summarize the provided text concisely. Return a JSON object with "summary" (a brief summary of the text) and "key_points" (an array of the main points).' with text returning JSON text:
    summary
    key_points
  send back response

when user sends data to /api/summarize:
  result = call 'Summarizer' with data's text
  send back result
```

---

## Example 5 — Stripe-style webhook handler (webhook_handler, 14 lines)

Webhook intake pattern. Schema-first table with typed fields and an
`auto`-stamped date. The endpoint validates with the inline `check ... or
'<error>'` guard, builds an explicit record with field renames (note
`event_type: webhook's type` — source field name on the right, target on
the left), saves, and acks.

*Factor DB id: 1202 — score 1.5909, first-try clean.*

```clear
build for javascript backend

create a Events table:
  event_type, required
  amount (number), default 0
  customer_email
  received_at_date, auto

when user sends webhook to /webhook/stripe:
  check webhook has signature or 'Missing signature'
  event_data is { event_type: webhook's type, amount: webhook's amount, customer_email: webhook's customer_email }
  save event_data to Events
  send back { received: true }
```

---

## Example 6 — Session cleanup ETL with cron (etl_pipeline, 15 lines)

First example using `every day at '<time>'` for scheduled jobs.
Demonstrates `database is local memory`, a typed table with `auto` date,
and the **temporal predicate** `created_at_date is older than 7 days` —
canonical idiom for time-based filtering. Also shows the `count of` aggregate.

*Factor DB id: 1567 — score 1.5909, first-try clean.*

```clear
build for javascript backend
database is local memory

create a Sessions table:
  user_id, required
  token, required
  created_at_date, auto

every day at '03:00 AM':
  delete from Sessions where created_at_date is older than 7 days

when user calls GET /api/session-count:
  count = count of id from Sessions
  send back { count }
```

---

## Example 7 — CRUD contacts API with validation (api_service, 18 lines)

Canonical "CRUD over a typed table" shape. Table declares typed columns
with constraints (`required`, `unique`, `email`). Endpoint validates
incoming data with the `validate ... must not be empty` form, saves
explicitly, and returns with an explicit status code.

*Factor DB id: 655 — score 1.5714, first-try clean.*

```clear
build for javascript backend

create a Contacts table:
  name, required
  email, required, unique, email
  phone
  notes

when user sends contact_data to /api/contacts:
  validate contact_data:
    name must not be empty
    email must not be empty
  saved = save contact_data to Contacts
  send back saved with status 201

when user calls GET /api/contacts:
  send back all Contacts
```

---

## Example 8 — Calculator API with guard rails (api_service, 16 lines)

First example with `guard <condition> or '<error message>'` — the
canonical short-circuit pattern for input validation. Multiple `if`
branches dispatch on `operation`. Note: no `else` — Clear uses sequential
`if` blocks where each is mutually exclusive by domain.

*Factor DB id: 1739 — score 1.5714, first-try clean.*

```clear
build for javascript backend

when user sends data to /api/calculate:
  guard data's operation is 'add' or data's operation is 'subtract' or data's operation is 'multiply' or data's operation is 'divide' or 'Invalid operation'
  guard data's operation is not 'divide' or data's b is not 0 or 'Division by zero'
  result = 0
  if data's operation is 'add':
    result = data's a + data's b
  if data's operation is 'subtract':
    result = data's a - data's b
  if data's operation is 'multiply':
    result = data's a * data's b
  if data's operation is 'divide':
    result = data's a / data's b
  send back { result: result }
```

---

## Example 9 — KPI dashboard with aggregates (kpi, 46 lines)

First example showing **page-level aggregates** computed in `on page load`.
Three KPI cards each `display`-ing a computed scalar. Demonstrates
`sum of`, `count of`, `avg of` — Clear's three core aggregate forms — and
nested `section` for card layout. Also shows a `seed` endpoint pattern so
tests can populate data.

*Factor DB id: 1519 — score 1.5294, first-try clean.*

```clear
build for web and javascript backend

create a Sales table:
  amount (number), required
  region
  sold_at_date, auto

# Seed endpoint so tests have data:
when user sends seed to /api/seed:
  create s1:
    amount = 120
    region is 'West'
  save s1 as new Sale
  create s2:
    amount = 340
    region is 'East'
  save s2 as new Sale
  send back 'seeded'

# KPI Page
page 'KPIs' at '/':
  on page load:
    total_revenue = sum of amount from Sales
    order_count = count of id from Sales
    avg_order_size = avg of amount from Sales

  section 'Sales KPI Dashboard':
    heading 'Sales KPI Dashboard'

    section 'Stats':
      section 'Revenue Card':
        heading 'Total Revenue'
        display total_revenue as number

      section 'Order Count Card':
        heading 'Total Orders'
        display order_count as number

      section 'Avg Size Card':
        heading 'Average Order Size'
        display avg_order_size as number
```

---

## Example 10 — Lead router with assignment rules (routing_engine, 47 lines)

Frontend + backend in one file. Backend dispatches assigned owner from
incoming lead size. Frontend collects intake form values and `post`s them.
Shows: `allow signup and login`, `requires login` on protected endpoints,
`validate ... must not be empty`, `dropdown with ['list']`, and the
canonical `button '<label>': post to '/api/...' with field, field`.

*Factor DB id: 263 — score 1.5250, first-try clean.*

```clear
build for web and javascript backend
database is local memory

create a Leads table:
  name, required
  email, required
  company
  size, default 'SMB'
  assigned_to
  status, default 'new'

allow signup and login

when user calls POST /api/leads sending data:
  requires login
  validate data:
    name must not be empty
    email must not be empty
  if data's size is 'Enterprise':
    set data's assigned_to to 'charlie'
  if data's size is 'Mid-market':
    set data's assigned_to to 'bob'
  if data's size is 'SMB':
    set data's assigned_to to 'alice'
  saved = save data to Leads
  send back saved with status 201

when user calls GET /api/leads:
  requires login
  leads = get all Leads
  send back leads

when user calls GET /api/leads/new:
  requires login
  new_leads = get all Leads where status is 'new'
  send back new_leads

page 'Lead Intake' at '/':
  heading 'Submit a Lead'
  section 'Form':
    'Name' as text input
    'Email' as text input
    'Company' as text input
    'Size' as dropdown with ['SMB', 'Mid-market', 'Enterprise']
    button 'Submit Lead':
      post to '/api/leads' with name, email, company, size
```

---

## Example 11 — Live chat with WebSocket broadcast (realtime_app, ~75 lines)

Canonical real-time pattern: REST + WebSocket on the same backend, both
operating over the same table. The `subscribe to 'chat'` block defines a
WebSocket channel that broadcasts inbound messages to all connected
clients. Shows the full template shape with mandatory ASCII architecture
diagram, theming-by-default, JWT auth, and embedded test blocks.

*Factor DB id: 132 — score 1.5149. Cold-start template seed (live-chat).*

```clear
/*
Live Chat — real-time messaging with WebSocket broadcast

  ┌──────────┐   POST/GET/DELETE   ┌──────────┐   CRUD    ┌──────────┐
  │ Browser  │ ─────────────────►  │  Server  │ ────────► │ Messages │
  │ (page)   │ ◄─────────────────  │ (Express)│ ◄──────── │ (table)  │
  └──────────┘                     └─────┬────┘           └──────────┘
       ▲                                 │
       │         WebSocket 'chat'        │
       └─────────── broadcast ◄──────────┘
                  to all clients

  Auth (JWT) — signup + login, mutations require login
*/

build for web and javascript backend

# Database

database is local memory
create a Messages table:
  sender, required
  content, required
  room, default 'general'
  created_at, auto

# Backend

## Middleware

allow server to accept requests from frontend
allow signup and login
log every request

## Endpoints

when user requests data from /api/messages:
  send back all Messages

when user sends message_data to /api/messages:
  requires login
  validate message_data:
    sender is text, required, min 1, max 50
    content is text, required, min 1, max 1000
    room is text
  new_message = save message_data as new Message
  send back new_message with success message

when user deletes message at /api/messages/:id:
  requires login
  delete the Message with this id
  send back 'deleted' with success message

## WebSocket

subscribe to 'chat':
  broadcast to all message

# Frontend

page 'Live Chat' at '/':
  on page load get messages from '/api/messages'

  heading 'Live Chat'

  section 'Send Message' with style card:
    'Your Name' is a text input saved as a sender
    'Message' is a text input saved as a content
    button 'Send':
      send sender and content as a new message to '/api/messages'
      get messages from '/api/messages'
      content is ''

  section 'Messages':
    display messages as table showing sender, content, created_at

# Tests

test:
  can user view all messages

test:
  can user create a new message with sender is 'Alice' and content is 'Hello world'
  expect it succeeds
  expect response has id

test:
  can user create a message without a content

test:
  deleting a message should require login
```

---

## Example 12 — Room booking with `belongs to` and seed data (booking_app, ~140 lines)

Largest example in the draft. Shows: **two related tables** linked via
`bookings has many Bookings` / `room belongs to Rooms`, an end-to-end
intake page with multi-field forms, list/delete UI, and a full seed-data
endpoint that creates records using `create <var>:` blocks. Best example
of "everything together" in a manageable size.

*Factor DB id: 134 — score 1.5069. Cold-start template seed (booking).*

```clear
/*
Booking — room reservation system with multi-step workflow

  ┌──────────┐   GET/POST/DELETE   ┌──────────┐   CRUD    ┌─────────┐
  │ Browser  │ ─────────────────►  │  Server  │ ────────► │  Rooms  │
  │ (page)   │ ◄─────────────────  │ (Express)│           └─────────┘
  └──────────┘    JSON + HTML      │          │   CRUD    ┌──────────┐
       │                           │          │ ────────► │ Bookings │
       │ select room ──► pick      └──────────┘           └──────────┘
       │ date/time ──► book             │                      │
       │                           Validation             belongs to
       │                           Auth (JWT)             Rooms
       │                           Search
       └── workflow: room ► date ► time ► confirm
*/

build for web and javascript backend

# Database

database is local memory

create a Rooms table:
  name, required
  capacity (number)
  description
  bookings has many Bookings

create a Bookings table:
  guest_name, required
  date, required
  time, required
  notes
  created_at_date, auto
  room belongs to Rooms

# Backend

## Middleware

allow cross-origin requests
allow signup and login
log every request

## Seed Data

when user sends data to /api/seed:
  create r1:
    name is 'Conference A'
    capacity = 10
    description is 'Large meeting room with projector'
  save r1 as new Room
  create r2:
    name is 'Conference B'
    capacity = 6
    description is 'Small huddle room'
  save r2 as new Room
  create r3:
    name is 'Lounge'
    capacity = 20
    description is 'Open lounge area'
  save r3 as new Room
  create b1:
    guest_name is 'Alice Smith'
    date is '2026-04-14'
    time is '09:00'
    room_id = 1
  save b1 as new Booking
  send back 'seeded' with success message

## Endpoints

when user requests data from /api/rooms:
  send back all Rooms

when user sends room_data to /api/rooms:
  requires login
  validate room_data:
    name is text, required
    capacity is number
    description is text
  new_room = save room_data as new Room
  send back new_room with success message

when user deletes room at /api/rooms/:id:
  requires login
  delete the Room with this id
  send back 'deleted' with success message

when user requests data from /api/bookings:
  send back all Bookings

when user sends booking_data to /api/bookings:
  requires login
  validate booking_data:
    guest_name is text, required
    date is text, required
    time is text, required
    notes is text
  new_booking = save booking_data as new Booking
  send back new_booking with success message

when user deletes booking at /api/bookings/:id:
  requires login
  delete the Booking with this id
  send back 'deleted' with success message

# Frontend

page 'Room Booking' at '/':

  on page load:
    send nothing to '/api/seed'
    get rooms from '/api/rooms'
    get bookings from '/api/bookings'

  section 'Rooms' with style page_section:
    heading 'Rooms'
    display rooms as cards showing name, capacity, description

  section 'Book a Room' with style page_section:
    heading 'Book a Room'
    'Guest Name' is a text input saved as a guest_name
    'Date' is a text input saved as a date
    'Time' is a text input saved as a time
    'Room' is a dropdown with ['Conference A', 'Conference B', 'Lounge']
    'Notes' is a text area saved as a notes
    button 'Book Now':
      send guest_name and date and time and room and notes to '/api/bookings'
      get bookings from '/api/bookings'
      guest_name is ''
      notes is ''

  section 'Bookings' with style page_section:
    heading 'All Bookings'
    display bookings as table showing guest_name, date, time, room, notes with delete

# Tests

test:
  can user view all rooms

test:
  creating a room should require login

test:
  can user view all bookings

test:
  creating a booking should require login

test:
  deleting a room should require login
```

---

## Coverage summary (for the curation pass)

| Archetype          | Examples | Lines (smallest → largest) |
|--------------------|----------|----------------------------|
| api_service        | 4        | 5, 5, 15, 18               |
| agent_workflow     | 1        | 12                         |
| webhook_handler    | 1        | 14                         |
| etl_pipeline       | 1        | 15                         |
| general (calc)     | 1        | 16                         |
| kpi                | 1        | 46                         |
| routing_engine     | 1        | 47                         |
| realtime_app       | 1        | ~75                        |
| booking_app        | 1        | ~140                       |

**9 distinct archetypes covered out of the 16 the Factor DB tracks.** The
plan's definition-of-done is "at least 10 of 16" — one short. Likely
add-on candidates from the rankings file when curating: a `crud_app`
example (id 1026 covers project tracker but is heavy — id 854 todos is
30 lines and cleaner), and a `dashboard` example (id 1238 or 1695 are
good candidates around 27-33 lines).

If Russell wants to keep the **6 archetypes / 5-10 examples** target from
Phase 2, drop examples 9 (kpi) and 12 (booking) — keeps the file small
and lets Phase 3's A/B run with less prompt-token cost.
