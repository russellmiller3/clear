# [ARCHIVE] Clear v1 — ROADMAP (frozen 2026-04-05)

> **Archived 2026-04-29.** Snapshot of the Clear roadmap as it stood in the `cast/clear/` folder at session 9 (April 5). Forked into the standalone `clear/` repo April 5+ where the roadmap has continued to evolve significantly. Historical record only — see current `clear/ROADMAP.md` for live priorities.
>
> Original location: `cast/clear/ROADMAP.md`

---

# Clear Language — Roadmap

## Purpose

Clear is a programming language designed for **AI to write** and **humans to read**.
When Claude builds an app, the human opens `main.clear` and understands what was
built — without knowing JavaScript, Python, CSS, or SQL.

## Project Structure (what the user sees)

```
my-app/
  main.clear            ← the human reads this
  build/
    index.html          ← compiled web app (auto-generated, don't edit)
    server.py           ← compiled backend (auto-generated, don't edit)
    runtime.js          ← Clear's web runtime (bundled automatically)
  clear.config          ← optional: port, database url, API keys
```

The user only reads `main.clear`. Everything in `build/` is generated output.


---

## What's Built (Phases 1-28 -- All Complete)

All features below are **implemented, tested, and compiling**.
854 tests, all passing.

### Core Language (Phase 1-3)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Number assignment | Done | `price = 9.99` |
| String/bool assignment | Done | `name is 'Alice'` |
| Objects | Done | `create person:` + indented fields |
| Possessive access | Done | `person's name` |
| Math-style functions | Done | `total_value(item) = item's price * item's quantity` |
| Block functions | Done | `define function greet(name):` |
| Repeat loop | Done | `repeat 5 times:` |
| For-each loop | Done | `for each item in items:` |
| While loop | Done | `while count is less than 10:` |
| Increment/decrement | Done | `increase count by 1` |
| If/then/otherwise | Done | `if x is 5 then show 'yes'` |
| Error handling | Done | `try:` / `if there's an error:` |
| Modules | Done | `use 'helpers'` |
| Comments | Done | `# this is a comment` |
| Empty list | Done | `tasks is an empty list` |

### Web App Features (Phase 4)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Page declaration | Done | `page 'My App':` |
| Input (text) | Done | `'Name' as text input` |
| Input (number) | Done | `'Price' as number input` |
| Input (checkbox) | Done | `'Gift Wrap' as checkbox` |
| Input (textarea) | Done | `'Notes' as text area` |
| Input (dropdown) | Done | `'Color' as dropdown with ['Red', 'Green']` |
| Custom variable | Done | `'Hourly Rate' as number input saves to rate` |
| Display output | Done | `display subtotal as dollars` (auto-label) |
| Display (custom label) | Done | `display tax as dollars called 'Sales Tax'` |
| Display as table | Done | `display users as table` |
| Button + action | Done | `button 'Click Me':` + indented body |
| Section layout | Done | `section 'Details':` + indented body |
| Checkbox state | Done | `if gift_wrap is checked then ...` |

### Content Elements (Phase 7)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Heading | Done | `heading 'Welcome'` |
| Subheading | Done | `subheading 'Products'` |
| Text paragraph | Done | `text 'Hello world'` |
| Bold text | Done | `bold text 'Important'` |
| Italic text | Done | `italic text 'A note'` |
| Small text | Done | `small text 'Terms apply'` |
| Link | Done | `link 'Learn more' to '/about'` |
| Divider | Done | `divider` |
| Inline bold | Done | `text 'Normal *bold* normal'` |
| Inline italic | Done | `text 'Normal _italic_ normal'` |

### Backend Features (Phase 5)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| API endpoint | Done | `when user calls GET /api/health:` |
| Send response | Done | `send back response` |
| Status codes | Done | `send back 'error' status 404` |

### Build Targets (Phase 6)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Web only | Done | `build for web` |
| JS backend only | Done | `build for javascript backend` |
| Python backend only | Done | `build for python backend` |
| Web + JS backend | Done | `build for web and javascript backend` |
| Web + Python backend | Done | `build for web and python backend` |
| Both (legacy) | Done | `build for both frontend and backend` |

### Runtime & Scaffold (Phase 6)
| Feature | Status | Description |
|---------|--------|------------|
| Declaration tracking | Done | `let` on first assignment, plain `=` on reassignment |
| HTML scaffold | Done | Complete `index.html` with DOM, CSS, runtime, compiled JS |
| Express scaffold | Done | Complete `server.js` with app setup, routes, listen |
| FastAPI scaffold | Done | Complete `server.py` with imports, routes, uvicorn |
| Reactive web apps | Done | State object, `_recompute()`, input listeners, display updates |
| Default CSS | Done | Clean typography, input/output/button/section/table styles |
| Runtime functions | Done | sum, avg, len, string ops, format, fetch embedded in HTML |

### Style Blocks & CSS (Phase 7)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Style block | Done | `style card:` + indented properties |
| Friendly CSS names | Done | `rounded = 8`, `shadow is 'small'`, `stack is 'vertical'` |
| Scoped CSS | Done | Generates `.clear-card` (no cascade, no specificity) |
| px rule | Done | Numbers always get px, strings are raw |
| CSS passthrough | Done | Unknown props: underscore -> hyphen |
| Section + style | Done | `section 'Info' with style card:` |
| Responsive | Done | `for_screen is 'small'` -> `@media (max-width: 640px)` |

### SPA Features (Phase 8)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Multi-page routing | Done | `page 'Home' at '/':` |
| Hash-based router | Done | Auto-generated from page routes |
| Reactive state | Done | State object + `_recompute()` from inputs/buttons |
| Data fetching | Done | `data is fetch_data('https://...')` |

### Data & ORM (Phase 9)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Data shapes | Done | `create data shape User:` + field types |
| Save | Done | `save new_user to Users` |
| Look up | Done | `all_users = look up all Users` |
| Look up where | Done | `active = look up Users where active is true` |
| Remove | Done | `remove from Users where age is less than 18` |

### Config & Testing (Phase 10-11)
| Feature | Status | Canonical Syntax |
|---------|--------|-----------------|
| Environment vars | Done | `api_key is env('API_KEY')` |
| Test blocks | Done | `test 'addition works':` + indented body |
| Expect assertions | Done | `expect result is 5` |

---

## Completed Phases (12-28)

### Phase 12: CLI, Distribution & Deployment -- DONE

**CLI Tool (`cli/clear.js`):**
```bash
clear build main.clear              # compile to JS/Python/HTML
clear build main.clear --stdout     # print to terminal
clear build main.clear --out dist/  # write to directory
clear test main.clear               # run test blocks
clear run main.clear                # compile + execute
clear init myproject/               # scaffold new project
clear dev main.clear                # watch + rebuild on change
```

**Deployment syntax:**
```
deploy to 'vercel'     # generates vercel.json
deploy to 'docker'     # generates Dockerfile
deploy to 'netlify'    # generates netlify.toml
```

10 CLI tests, 4 deploy tests. The CLI imports directly from `clear/index.js` -- no `$lib/` aliases, works with plain `node`.

---

### Phase 13: Auth & Roles -- DONE

```
# Auth guard (401 if no user)
requires auth

# Role guard (403 if wrong role)
requires role 'admin'

# Role definition with permissions
define role 'editor':
  can edit posts
  can view posts

# Expression-based guard (403 if false)
guard is_admin == true
```

4 node types: REQUIRES_AUTH, REQUIRES_ROLE, DEFINE_ROLE, GUARD.
All compile to JS (Express middleware) and Python (FastAPI decorators). 12 tests.

---

### Phase 14: Data Constraints & Relations -- DONE

```
create data shape User:
  name is text, required
  email is text, required, unique
  age is number, default 0
  role is text, default 'user'
  created_at is timestamp, auto
  updated_at is timestamp, auto
  org is Organization                  # Foreign key
```

Compiles to SQL with NOT NULL, UNIQUE, DEFAULT, TIMESTAMP DEFAULT NOW(),
REFERENCES. JS output includes schema metadata (required, type, ref).
13 tests including E2E that verifies complete SQL CREATE TABLE.

---

## Design Constraints (bugs that don't exist in Clear)

These are explicit architectural decisions. Each one eliminates an entire
class of bugs that plagues JavaScript/Python/CSS development.

### No hoisting
Execution is top-to-bottom, always. You cannot reference a variable before
the line that creates it. The compiler enforces this:
```
# This is an error:
total = price + tax       # ERROR: 'price' hasn't been created yet
price = 100
```
Error message: "You used 'price' on line 1 but it isn't created until line 2.
Move the creation above line 1."

### No CSS specificity or cascade
Style blocks are flat and non-cascading. Each element gets exactly the styles
you declare on it. No inheritance, no specificity wars, no `!important`.
If you want shared styles, name a style block and apply it explicitly.
The compiler generates scoped CSS (unique class names) so styles never leak.
```
style card:
  background is 'white'
  padding = 16
  rounded = 8

# Applied explicitly — no cascade, no surprise overrides
section 'Products' with style card:
  display product's name
```

### Synchronous by default (no async confusion)
When you call `fetch_data()`, the next line doesn't run until the data arrives.
The compiler handles async/await in the generated code. The Clear programmer
never sees promises, callbacks, race conditions, or stale closures.
```
weather = fetch_data('https://api.weather.com?city=' + city)
temperature = weather's temp
show temperature
# These three lines run in order. Always.
```

### No closures, no `this`
Functions get their inputs through explicit parameters. No hidden state captured
from surrounding scope. No "what does `this` refer to here?" confusion.
Every value a function uses is either a parameter or a named variable created
inside the function.

### No implicit state
Every variable is named and assigned on its own line. There are no hidden
variables, no scope chains to trace, no prototype lookups. If a value exists,
there's a line of Clear that created it.

### No circular dependencies
`use 'helpers'` is a flat import. The compiler builds a dependency graph and
rejects cycles with a clear error: "helpers uses utils, and utils uses helpers
— that's a circle. Break one of those connections."

### No type coercion
JavaScript: `'5' + 3 = '53'`. `null == undefined` is true. `[] == false` is true.
Clear: the compiler handles types sensibly. Adding a string to a number is an error,
not a silent conversion. The error tells you what happened and how to fix it:
"You're adding a number (3) to text ('5') on line 7 — convert one to match the other."

### No dependency hell
The compiled output has zero external dependencies. No `node_modules/`, no
`package.json`, no lockfile. `npm install` doesn't exist. The runtime is a single
file (~100 lines) bundled with the output. Nothing breaks because a package updated.

### No "works locally, breaks in production"
`clear.config` declares every environment variable the app needs. The compiler
validates all required config is present before building. If `API_KEY` is used
in the code but missing from config, the build fails — not the production server
at 2am.

### Changes are local, not cascading
One operation per line means changes don't ripple. Changing a style doesn't break
a layout three components away. Renaming a variable — the compiler catches every
reference. No hidden connections, no spooky action at a distance.

---

## Phases 13-20: Production Features -- ALL DONE

Production capabilities needed for the acid test (rebuilding Cast in Clear). Grouped by theme.

### Phase 13: Auth & Roles -- DONE
See above. Implemented with `requires auth`, `requires role`, `define role`, `guard`.

### Phase 14: Data Constraints & Relations -- DONE
See above. Implemented with field modifiers: `required`, `unique`, `default`, `auto`, FK references.

### Phase 15: Row-Level Security & Multi-Tenancy -- DONE

```
create data shape Document:
  title is text, required
  owner_id is text, required
  org_id is text
  published is boolean, default false
  anyone can read where published == true
  owner can read, update, delete
  role 'admin' can read, update, delete
  same org can read
```

RLS policies live inside data shape blocks. Compiles to SQL CREATE POLICY
with ENABLE ROW LEVEL SECURITY. 4 policy subjects: anyone, owner, role, same_org.
Conditional policies via `where` clause. 12 tests.

### Phase 16: Input Validation & Output Schemas -- DONE

```
when user calls POST /api/users:
  validate incoming:
    name is text, required, min 1, max 100
    email is text, required, matches email
    age is number, min 0, max 150
  rate limit 10 per minute
  send back user
  responds with:
    id is text
    name is text
    created_at is timestamp
```

4 node types: VALIDATE, FIELD_RULE, RESPONDS_WITH, RATE_LIMIT.
Compiles to per-field 400 checks (JS/Python), rate limiting middleware,
and response schema documentation. 19 tests.

### Phase 17: Webhooks & OAuth -- DONE

```
webhook '/stripe/events' signed with env('STRIPE_SECRET'):
  send back 'ok'

oauth 'github':
  client_id is env('GITHUB_CLIENT_ID')
  client_secret is env('GITHUB_CLIENT_SECRET')
  scopes are ['user:email']
  callback is '/auth/github/callback'
```

2 node types: WEBHOOK, OAUTH_CONFIG.
Webhook compiles to HMAC signature verification + endpoint.
OAuth generates redirect route + callback route with token exchange. 13 tests.

### Phase 18: Billing & Payments -- DONE

```
checkout 'Pro Plan':
  price is 'price_abc123'
  mode is 'subscription'
  success_url is '/success'
  cancel_url is '/pricing'

limit 'ai_generations':
  free allows 5 per month
  pro allows unlimited
```

2 node types: CHECKOUT, USAGE_LIMIT.
Checkout compiles to Stripe session endpoint. Usage limit generates
tier config object + checker function. 13 tests.

### Phase 19: File Uploads & External APIs -- DONE

```
accept file:
  max size is 10mb
  allowed types are ['image/png', 'application/pdf']

data from 'https://api.example.com/prices':
  timeout is 10 seconds
  cache for 5 minutes
  on error use default []
```

2 node types: ACCEPT_FILE, EXTERNAL_FETCH.
File upload compiles to multer (JS) / UploadFile (Python) with size/type checks.
External fetch compiles to AbortController/httpx with timeout and error fallback.
SSRF protection blocks localhost and private IPs at parse time. 15 tests.

### Phase 20: Advanced Features -- DONE

```
stream:
  send back 'event'
  wait 500ms

background 'send-emails':
  runs every 1 hour

subscribe to 'chat':
  show 'message received'

migration 'add-status':
  add column 'status' to Users as text, default 'active'
```

5 node types: STREAM, BACKGROUND, SUBSCRIBE, MIGRATION, WAIT.
Stream compiles to SSE/StreamingResponse. Background to setInterval/asyncio.
Subscribe to WebSocket. Migration to ALTER TABLE SQL. Wait to setTimeout/sleep.
23 tests.

---

## Compiler Evolution Roadmap

### The problem with the compiler today

The compiler generates **correct but naive code**. It produces the happy path
but skips production hardening. Each compiler case needs to evolve from
"scaffolding" to "code you'd actually ship."

### How the compiler gets better: the GAN model

The compiler improves through adversarial use -- building real apps with Clear
and fixing what breaks:

```
Build real app in Clear
        |
        v
Hit edge case compiler doesn't handle
        |
        v
Fix the compiler case
        |
        v
Every future app benefits from the fix
        |
        v
Build next app (repeat)
```

Each real app is a stress test (discriminator). The compiler is the generator.
The discriminator keeps finding flaws, the generator keeps improving, until
the output is indistinguishable from hand-written production code.

### Planned stress-test apps (progressive difficulty)

The apps are ordered so each one pushes the compiler past what the previous
one required. Early apps are simple backends. Later apps require real-time,
multi-service orchestration, and frontend compilation.

**Tier 0: Make the output actually run -- DONE**

| # | Task | Status |
|---|------|--------|
| 0a | **Build `db` runtime module** | DONE -- `clear/runtime/db.js` with JSON persistence, constraints |
| 0b | **Fix where-clause compilation** | DONE -- generates `{ field: value }` filter objects |
| 0c | **Add try/catch to endpoints** | DONE -- every endpoint wrapped |
| 0d | **Build auth runtime** | DONE -- `clear/runtime/auth.js` JWT + middleware |
| 0e | **Run todo-api end-to-end** | DONE -- starts, serves CRUD, persists data |

Also built: `clear/runtime/rateLimit.js`, production hardening (logging, CORS, graceful shutdown),
type validation, inline backend utilities, env()/fetch_data() native compilation.

**Tier 1: Backend CRUD -- DONE (all 3 E2E verified)**

| # | App | Status | What it proved |
|---|-----|--------|----------------|
| 1 | **Todo API v2** | E2E verified | CRUD, validation, auth, persistence, new syntax |
| 2 | **Blog with auth v2** | E2E verified | Auth guards, RBAC (reader vs admin), if/then 404, email validation |
| 3 | **URL shortener** | E2E verified | Rate limiting, unique constraints, 400/401 responses |

**Tier 2: Payments and external services -- DONE (3 apps compile, 2 E2E verified)**

| # | App | Status | What it proved |
|---|-----|--------|----------------|
| 4 | **Ecommerce API** | E2E verified | Stripe checkout config, webhook sig verify, auth, inventory |
| 5 | **SaaS billing service** | E2E verified | Subscription tiers, usage limit config, billing webhook |
| 6 | **Webhook relay** | E2E verified | Multi-provider webhooks, auth+RBAC, background job scheduling |

**Tier 3: Real-time and async -- DONE (3 apps compile, connection management added)**

| # | App | Status | What it proved |
|---|-----|--------|----------------|
| 7 | **Chat backend** | Compiles | WebSocket with ping/pong heartbeat, client tracking, cleanup |
| 8 | **Job queue** | Compiles | Background jobs (30s, 1hr), CRUD with auth+RBAC |
| 9 | **Live dashboard** | Compiles | SSE with heartbeat+cleanup, metric aggregation job |

**Tier 4: Full-stack apps -- DONE (3 apps compile)**

| # | App | Status | What it proved |
|---|-----|--------|----------------|
| 10 | **Cast API** | Compiles | 87 Clear -> 184 JS: health, models, chat, share, export |
| 11 | **Landing page + signup** | Compiles | 53 Clear -> 305 HTML: multi-page routing, forms, styles |
| 12 | **Full SaaS app** | Compiles | 120 Clear -> 679 output: frontend + backend + billing + auth |

**All 12 roadmap apps complete.** 854 tests. Next challenge: deploy a compiled app.

**General-Purpose Proof (Session 4) -- DONE**

| # | App | Status | What it proved |
|---|-----|--------|----------------|
| 13 | **Cast expression evaluator** | E2E verified | 610-line recursive tree-walking interpreter: tokenizer, recursive descent parser (operator precedence), evaluator (match/when dispatch), scope chain, 10 built-in functions, 16 tests all green |

This proved Clear can express algorithmic complexity beyond CRUD: recursive functions, dynamic dispatch via match/when, state machines, dynamic map access for scope chains. Also added `^` as power operator alias (tokenizer change, 3 new tests).

---

## Former Gaps (Now Resolved)

All gaps identified in earlier sessions have been closed by Phases 21-28:

| Former Gap | Resolution | Phase |
|------------|-----------|-------|
| Package ecosystem | Adapter system: `use 'data'`, `use 'email'`, etc. | 22-27 |
| File I/O | `read file`, `write file`, `append to file`, `file exists` | 21 |
| Module system | `use 'helpers'` resolves and inlines from `.clear` files | 28 |
| Async/Concurrency | `do all:` compiles to `Promise.all` / `asyncio.gather` | 28 |
| Regex | `find pattern`, `matches pattern`, `replace pattern` | 21 |
| Date/Time | `current time`, `format date`, `days between` | 21 |
| JSON serialization | `parse json`, `to json` | 21 |
| Multi-line strings | `text block:` / `text template:` with `{var}` interpolation | 28 |

---

## Phases 21-28: General-Purpose Features -- ALL DONE

### Architecture: Adapter System

Clear adapters wrap npm/pip packages in Clear-friendly syntax. The user
never writes `pandas.read_csv()` -- they write `load csv 'sales.csv'`.
Each adapter registers new keywords with the parser and compiler cases
that emit the right library calls.

Two levels:
- **`use 'data'`** -- curated adapter with Clear syntax (primary, shown in docs)
- **`use raw 'lodash'`** -- direct pass-through import (escape hatch, not default)

### Phase 21: Language Primitives (file I/O, JSON, regex, dates) -- DONE

Core language features that all adapters depend on.

**File I/O:**
```clear
contents = read file 'data.csv'
lines = split(contents, '\n')
write 'output.json' with results
append 'log.txt' with message
file_exists = exists('config.json')
```

**JSON:**
```clear
data = parse json response_text
output = to json results
```

**Regex:**
```clear
matches = find pattern '[0-9]+' in text
is_valid = text matches pattern '^[a-z]+$'
cleaned = replace pattern '\s+' in text with ' '
```

**Dates:**
```clear
now = current time
formatted = format date now as 'YYYY-MM-DD'
days = days between start_date and end_date
tomorrow = now plus 1 day
```

**What it requires:**
- Parser: `read file`, `write`, `append`, `parse json`, `to json`,
  `find pattern`, `matches pattern`, `replace pattern`,
  `current time`, `format date`, `days between`
- Compiler (JS): fs, JSON.parse/stringify, RegExp, Date
- Compiler (Python): open/pathlib, json, re, datetime

### Phase 22: Adapter Infrastructure + `use 'data'` -- DONE

```clear
use 'data'

# Load
sales = load csv 'sales.csv'
config = load json 'settings.json'

# Inspect
show sales's columns
show sales's row count

# Filter and transform
q4_sales = sales where quarter is 'Q4'
big_deals = sales where revenue is greater than 10000
sorted_sales = sort sales by revenue descending

# Aggregate
total = sum of sales's revenue
avg_price = avg of sales's price
by_region = group sales by region
region_totals = sum of by_region's revenue

# Compute
sales's margin = sales's revenue - sales's cost
sales's roi = sales's margin / sales's cost * 100

# Export
save sales to csv 'cleaned_sales.csv'
save results to json 'output.json'
```

**Underneath:** papaparse + lodash (JS), pandas (Python)

**What it requires:**
1. Adapter infrastructure: `use 'name'` loads adapter module,
   adapter registers keywords + compiler cases
2. Data adapter: LOAD_CSV, LOAD_JSON, DATA_WHERE, DATA_SORT,
   DATA_GROUP, DATA_AGG, SAVE_CSV, SAVE_JSON nodes
3. Column access via possessive: `sales's revenue` -> column array
4. Computed columns: `sales's margin = expr` -> new column

**Why it's first:** "I have a spreadsheet, do something with it" is the
#1 thing non-programmers want to automate. Every analyst, ops person,
finance team. This alone justifies Clear's existence.

### Phase 23: `use 'database'` -- DONE

```clear
use 'database'

connect to database:
  type is 'postgres'
  url is env('DATABASE_URL')

# Works with existing Clear CRUD syntax
all_users = look up all records in Users table
active = look up records in Users table where active is true

# Raw queries for complex needs
results = query 'select * from orders where total > :min' with min
run 'update users set last_login = now() where id = :id' with id
```

**Underneath:** pg (JS), psycopg2/asyncpg (Python)

**Why it's here:** Clear's in-memory DB is great for prototyping.
Every real deployment needs Postgres. The adapter maps existing
CRUD syntax (`look up`, `save`, `remove`) to real SQL queries,
so upgrading from prototype to production is changing one line
(`use 'database'` + `connect to database`).

### Phase 24: `use 'email'` -- DONE

```clear
use 'email'

configure email:
  service is 'gmail'
  user is env('EMAIL_USER')
  password is env('EMAIL_PASSWORD')

send email:
  to is customer's email
  subject is 'Your order has shipped'
  body is 'Tracking number: ' + tracking_id
```

**Underneath:** nodemailer (JS), smtplib (Python)

### Phase 25: `use 'web-scraper'` -- DONE

```clear
use 'web-scraper'

page = fetch page 'https://news.ycombinator.com'
stories = find all '.titleline a' in page
for each story in stories list:
  show story's text
  show story's href

# Download and save
html = fetch page 'https://example.com/pricing'
prices = find all '.price' in html
save prices to csv 'prices.csv'
```

**Underneath:** axios + cheerio (JS), requests + beautifulsoup (Python)

### Phase 26: `use 'pdf'` -- DONE

```clear
use 'pdf'

create pdf 'invoice.pdf':
  heading 'Invoice #' + invoice_id
  text 'Date: ' + today
  text 'Customer: ' + customer's name
  divider
  table from line_items
  divider
  bold text 'Total: $' + total
```

**Underneath:** pdfkit or puppeteer (JS), reportlab or weasyprint (Python)

**Why it's elegant:** Same content elements Clear already uses for web
pages (heading, text, table, divider). Different output target, same
vocabulary. A 14-year-old who learned to build a web page in Clear
already knows how to generate a PDF.

### Phase 27: `use 'ml'` -- DONE

```clear
use 'data'
use 'ml'

data = load csv 'customers.csv'

# Train
model = train model on data predicting churn
show model's accuracy
show model's important features

# Predict
new_customer = predict with model using signup_days and usage_hours
show new_customer's prediction

# Evaluate
show model's confusion matrix
show model's precision
show model's recall
```

**Underneath:** scikit-learn (Python), or REST call to Python service from JS

**Why it's last of the 6:** Most complex adapter surface area. Needs
the data adapter to exist first (for loading/preparing data). Python-only
for real ML (JS would call a Python service). Worth doing because this
is Cast's core use case — but the adapter needs to be carefully designed
so the syntax doesn't overpromise what ML can actually deliver.

### Phase 28: Advanced Language Features -- DONE

**Module system (multi-file):**
```clear
import helpers from './helpers.clear'
import UserCard from './components/UserCard.clear'
result = helpers.calculate(data)
```

**Async/concurrency:**
```clear
results = do all:
  fetch_users()
  fetch_orders()
  fetch_products()
```

**Multi-line strings:**
```clear
template is text:
  Hello {name},
  Your order {order_id} has shipped.
```

These are less urgent than the adapters. A single-file program that can
load CSVs, query Postgres, send emails, and generate PDFs covers most
real use cases even without multi-file support.

---

## Capability Matrix

All phases (1-28) are complete. Current capabilities:

| Task | Status |
|------|--------|
| CRUD web app | YES |
| REST API with auth | YES |
| Full-stack SPA | YES |
| Recursive algorithms | YES |
| Read/write files | YES (Phase 21) |
| Parse/emit JSON | YES (Phase 21) |
| Regex text matching | YES (Phase 21) |
| Date arithmetic | YES (Phase 21) |
| Analyze CSV data | YES (Phase 22) |
| Connect to Postgres | YES (Phase 23) |
| Send emails | YES (Phase 24) |
| Scrape web pages | YES (Phase 25) |
| Generate PDFs | YES (Phase 26) |
| Train ML models | YES (Phase 27) |
| Multi-file projects | YES (Phase 28) |
| Parallel execution | YES (Phase 28) |
| Replace Python scripts | YES |
| Replace JS/Svelte apps | YES |

### What "production-grade compiler output" means

For each compiler case, the generated code must handle:

| Concern | Example |
|---------|---------|
| Error responses | Stripe returns 402? Return a helpful JSON error, don't crash |
| Retry logic | Webhook delivery failed? Exponential backoff |
| Idempotency | Checkout session created twice? Same result |
| Cleanup | WebSocket disconnected? Remove from connection pool |
| Logging | Every request logs method, path, status, duration |
| Timeouts | External fetch hangs? Abort after N seconds |
| Validation | File upload 0 bytes? Specific error message |

The compiler cases get hardened one by one as real apps expose gaps.

---

## Architecture Decisions

### Why vanilla JS, not React/Svelte?
Clear programs are simple by design. One operation per line, no nesting, no component
lifecycle. The compiled output needs reactive state + DOM updates + event listeners.
That's ~50 lines of runtime, not a framework. Debugging: open index.html, open console.

### Why compile, not interpret?
Deterministic compilation means the output is inspectable, cacheable, and deployable
without Clear installed. The user gets a standard web app or Python server.

### Compiler architecture (unified compileNode)
The compiler uses a single `compileNode(node, ctx)` switch for all node types
and a single `exprToCode(expr, ctx)` for all expressions. The context object
`ctx = { lang, indent, declared, stateVars, mode }` determines the output.
Adding a new node type = one case in `compileNode`. The five top-level paths
(`compileToJS`, `compileToReactiveJS`, `compileToJSBackend`, `compileToPythonBackend`,
`buildHTML`) all call `compileNode` internally.

Plus 3 validation passes: `validateForwardReferences`, `validateTypes`,
`validateConfig`. New variable-introducing syntax needs updates here too.

### Why both JS and Python?
Frontend must be JS (browsers). Backend could be either. Some users deploy Python
(FastAPI), others Node (Express). Same Clear source, either target.

### Why possessive ('s) not dot notation?
"person's name" reads like English. "person.name" reads like code. Dot notation
stays as a silent alias. No chaining — use intermediate variables per one-op-per-line rule.

### Why = for numbers, is for strings?
Style convention, not compiler-enforced. When scanning code, = lines are formulas
to check, is lines are values to note. Visual hint for the human reader.

### Why single quotes?
Single quotes are canonical for strings (`'Alice'` not `"Alice"`). No shift key needed.
Double quotes still work as a silent alias.

### Why JS for the compiler?
The tokenizer, parser, and compiler are all JavaScript. The compiler *generates*
both JS and Python output, but the compiler itself only exists in JS. This was
the right call because:
- Clear's primary target is web apps (HTML + JS). The compiler runs in Node.js
  and can eventually run in the browser (playground, in-browser editor).
- The Cast codebase is JS/SvelteKit. Clear imports directly, no subprocess.
- One compiler, one language, no drift between implementations.

For distribution, the JS compiler will be bundled as a **standalone binary**
(using Bun or pkg). `clear build` works on any OS without installing Node.
Python developers don't need to know or care that the compiler is JS — they
just run the binary and get Python output.

What NOT to do: maintain a parallel Python compiler. Two implementations will
drift and produce different output. One source of truth, compiled to a binary.

### The Acid Test
Clear must be capable enough to rebuild Cast itself. If we can rewrite Cast's
frontend (SvelteKit app), backend (API routes), data layer (Supabase), and
ML pipeline in Clear and have it work — the language is complete. Every feature
in the roadmap should be evaluated against this bar: "Could this express what
Cast needs?"

---

## Strategic Pivot: From Language to Platform

### The Insight

Clear is more valuable as the invisible engine inside a hosted platform than as
a language developers learn. Nobody wakes up wanting to learn a new programming
language. Millions of people wake up wanting an app built.

### What Changes

**Before:** "Here's a language. Learn it. Build apps."
**After:** "Describe your app. Verify what you got. Ship it."

The language doesn't go away -- it's still the readable contract between human
and AI. But it stops being the product. The product is the loop:
intent -> Clear -> compiled app -> deploy. The language is the wire format.

### The Lovable/Bolt/v0 Comparison

Every AI app builder generates code the user can't read. When it breaks, the
user is stuck in a "please fix it" loop with the AI. Clear's advantage:

| | Lovable/Bolt/v0 | Clear Platform |
|--|------------------|----------------|
| Output | 2,400 lines of React/TypeScript | 37 lines of readable Clear |
| When it breaks | Ask AI, hope it works | Read the blueprint, see the problem |
| Small changes | Ask AI, hope it doesn't break | Edit one line yourself |
| Vendor lock-in | Supabase/Vercel/their editor | Export standard Node.js, host anywhere |
| Security | Hope the AI got it right | Compiler enforces it at build time |
| Testing | Manual | Auto-generated E2E from the blueprint |

### Template-First, Not Blank-Canvas

Other AI builders start from scratch every time. "Build me an invoice system"
generates 2,000 lines of fresh, untested code.

Clear starts from tested templates:
- Invoice Engine (226 lines, 27 E2E tests)
- Project Manager (253 lines, 36 E2E tests)
- Ecommerce (98 lines, 16 E2E tests)
- Blog with Admin (90 lines, 14 E2E tests)
- Chat Backend (58 lines, 12 E2E tests)
- SaaS Billing (66 lines, 6 E2E tests)
- Plus 7 more deployed and verified

Users pick a template and describe their customizations. They inherit months
of battle-tested logic instead of getting fresh bugs every time.

### Hosted Compiler Advantage

The compiler is never shipped to users. We host it. This means:
- We iterate the compiler daily. Every app benefits automatically.
- Every GAN cycle (bug found -> compiler fixed) improves all apps.
- No npm install, no CLI, no version management for users.
- We control the full stack: compilation, testing, deployment, hosting.

### The Stove Analogy

Most people want a stove in their kitchen even if they never cook. The ability
to open the Clear blueprint and read what your app does -- that's the stove.
You might never edit it yourself, but knowing you can is the difference between
renting your software and owning it.

### Agent Primitives (SHIPPED)

Three node types for AI agents, all implemented and tested (931 tests passing):

```clear
agent 'Lead Scorer' receiving lead:
  check lead's company is not missing, otherwise error 'Company is required'
  set lead's score to ask ai 'Rate 1-10 for enterprise potential.' with lead's company
  send back lead

when user calls POST /api/score sending lead_data:
  set scored to call 'Lead Scorer' with lead_data
  set saved to save scored as new Lead
  send back saved with success message
```

- `agent 'Name' receiving var:` -- named async function with guards and send back
- `ask ai 'prompt' with context` -- mid-flow LLM call, BYOK via CLEAR_AI_KEY
- `call 'Agent' with data` -- invoke an agent from an endpoint or another agent
- `check X, otherwise error 'msg'` -- explicit guard (throws in agents, 403 in endpoints)
- `missing` -- synonym for nothing/null

Deployed apps: lead-scorer, content-moderator, hiring-pipeline (3-agent chain), page-analyzer.
All live-tested with real Anthropic API calls. 18/18 E2E pass.

### Agent Roadmap

- ~~Agent-to-agent calls (agent A calling agent B inside its body)~~ DONE (session 9)
- ~~Structured AI output parsing (ask ai returning objects, not just strings)~~ DONE (session 9)
- Streaming AI responses (SSE from ask ai)
- Multi-turn conversations (ask ai with history)

---

## Phase 29: Gaps and Future Features

Features that Clear can't build yet, roughly prioritized by demand.

### High Demand (common in real apps)

| Feature | What it enables | Difficulty |
|---------|----------------|------------|
| ~~**Scheduled agents / cron**~~ | DONE -- `agent 'Name' runs every 1 hour:` compiles to setInterval | -- |
| ~~**localStorage / client state**~~ | DONE -- `store X` / `restore X` for localStorage persistence | -- |
| ~~**Playground / REPL**~~ | DONE -- `clear/playground/` with obfuscated compiler, live preview | -- |
| **Async / promises** | `do all:` exists (Promise.all), but need `race:` (first to finish), `wait for:` (explicit await), cancellation (`cancel task`). Real apps need to race timeouts against API calls, cancel in-flight requests, handle partial failures. | Medium |
| **Streaming / iterators** | Process large datasets lazily without loading everything into memory. `for each line in stream file 'big.csv':` should compile to readline/generator, not readFileSync. Also: chunked HTTP responses, streaming AI output token-by-token. | Medium |
| **Error recovery patterns** | `try:` exists but real apps need: `retry 3 times:` (exponential backoff), `with timeout 5 seconds:` (AbortController), `fallback:` (try A, if it fails try B). Circuit breakers for external APIs. | Medium |
| **Namespaced component calls in web target** | `ui's Card('Hello')` works in backend JS but crashes in HTML builder because `show` expects a string name, not a member-access expression. Need buildHTML to resolve namespace.component calls. | Easy-Medium |
| **Environment-based config** | Dev/staging/prod settings, feature flags | Easy -- `clear.config` with environment blocks |
| **Deployment target** | `clear deploy` to Railway/Render/Fly.io with one command | Medium -- generate Dockerfile + deploy config |

### Medium Demand (power users, specific verticals)

| Feature | What it enables | Difficulty |
|---------|----------------|------------|
| **WebSocket server push** | Real-time dashboards, chat, notifications (currently SSE only) | Medium -- upgrade subscribe syntax to full WS |
| **Multi-tenant org switching** | SaaS apps where users belong to organizations | Medium -- RLS exists, needs UI context + org middleware |
| **GraphQL endpoints** | Alternative to REST for frontend-heavy apps | Medium -- new endpoint syntax, schema generation |
| **Image/file processing** | Resize images, generate thumbnails, convert formats | Medium -- adapter for sharp/Pillow |
| **Temporal / durable workflows** | Multi-step processes that survive restarts (onboarding flows, approval chains) | Hard -- needs persistent state machine or Temporal build target |
| **Python structured AI** | `_ask_ai` with schema handling for FastAPI apps (JS version done) | Easy -- mirror JS implementation |

### Niche (specific use cases)

| Feature | What it enables | Difficulty |
|---------|----------------|------------|
| **Video/audio processing** | Transcription, format conversion | Hard -- ffmpeg bindings |
| **Native mobile** | Compile to React Native or Flutter | Very hard -- entirely new build target |
| **Blockchain / web3** | Smart contracts, wallet integration | Hard -- new paradigm |
| **Desktop apps** | Compile to Electron or Tauri | Medium-hard -- new build target |

### ICP and Go-to-Market

**Primary ICP: Freelancers and small agencies.**
They build the same 5 CRUD apps (CRM, portal, dashboard, booking, invoicing)
over and over. Clear's tested templates are literally their business model.
"Build a custom invoice system in 5 minutes, charge the client $5,000."

Why this ICP first:
- Easy to find (Twitter/X, indie hackers, Upwork, freelancer Discords)
- The pitch writes itself ("same 5 apps, faster, tested, charge more")
- Low friction to try (one person, one decision, no procurement)
- Revenue within weeks, not quarters

**Secondary ICP: Regulated industries (healthcare, finance, legal, government).**
They NEED auditable code, enforced security, and test evidence. A HIPAA-compliant
patient portal where the compiler guarantees no data leakage is worth $1,000/mo.
They currently pay $50k+ to developers and still worry about compliance. Requires
"talk to us" pricing and compliance certs (SOC2, HIPAA). Longer sales cycle.

**Tertiary ICP: Non-technical founders who got burned.**
Already tried Lovable/Bolt, the app broke, they spent $3k on a freelancer to fix
it. Not price-sensitive anymore -- they want it to WORK. "Bugs that don't exist"
is their exact aspiration. Find them in founder communities after failed launches.

### Design-First Styling (Next Technical Priority)

The compiler's design tokens were built for app dashboards, not marketing pages.
Built-in style presets (page_hero, page_section, app_sidebar, etc.) provide the
structure but need visual polish.

Planned approach:
1. Build 2-3 reference designs in plain HTML/CSS (landing page, dashboard, pricing)
2. Extract the exact typography, spacing, and color patterns
3. Port those patterns into the compiler's preset definitions
4. Rebuild the same pages in Clear and verify they match

### Pricing Model

| Tier | Price | What |
|------|-------|------|
| Starter | Free | One app, hosted, custom domain |
| Business | $49/month | Unlimited apps, priority support, export source |
| Enterprise | Contact | On-premise, SSO, audit logging, SLA |

### Success Metrics

The platform succeeds if:
- A non-developer can go from "I need an invoice system" to deployed app in under 10 minutes
- They can make a business rule change ("require approval over $5,000") without help
- They can read their app's blueprint and understand what it does
- When something breaks, they can describe the problem precisely because they can read the code
