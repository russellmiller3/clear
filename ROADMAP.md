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

## What's Built (Phases 1-28, 30-46b, 47, 75-90 -- All Complete)

All features below are **implemented, tested, and compiling**.
1446 tests, all passing.

### Compiler Internal Refactor (Phase 47)
| Feature | Status | Description |
|---------|--------|-------------|
| Parser dispatch tables | Done | 63/97 branches in CANONICAL_DISPATCH + RAW_DISPATCH Maps |
| Normalized return types | Done | Removed isCrud wrapper, parseTarget returns { node } |
| Unified compilation paths | Done | HTTP_REQUEST + RAW_QUERY: one function, two call sites |
| Tokenizer preserves colons | Done | COLON token type, trailing stripped at token level |
| resolveCanonical foundation | Done | Zone-based synonym resolution infrastructure |

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
agent 'Lead Scorer' receives lead:
  check lead's company is not missing, otherwise error 'Company is required'
  set lead's score to ask ai 'Rate 1-10 for enterprise potential.' with lead's company
  send back lead

when user calls POST /api/score sending lead_data:
  set scored to call 'Lead Scorer' with lead_data
  set saved to save scored as new Lead
  send back saved with success message
```

- `agent 'Name' receives var:` -- named async function with guards and send back
- `ask ai 'prompt' with context` -- mid-flow LLM call, BYOK via CLEAR_AI_KEY
- `call 'Agent' with data` -- invoke an agent from an endpoint or another agent
- `check X, otherwise error 'msg'` -- explicit guard (throws in agents, 403 in endpoints)
- `missing` -- synonym for nothing/null

Deployed apps: lead-scorer, content-moderator, hiring-pipeline (3-agent chain), page-analyzer.
All live-tested with real Anthropic API calls. 18/18 E2E pass.

### Agent Roadmap

- ~~Agent-to-agent calls (agent A calling agent B inside its body)~~ DONE (session 9)
- ~~Structured AI output parsing (ask ai returning objects, not just strings)~~ DONE (session 9)
- ~~Tool use / function calling (`can use:`)~~ DONE (session 10)
- ~~Multi-turn conversations (`remember conversation context`)~~ DONE (session 10)
- ~~Agent memory (`remember user's preferences`)~~ DONE (session 10)
- ~~Pipelines (`pipeline 'Name' with var:`)~~ DONE (session 10)
- ~~Parallel execution (`do these at the same time:`)~~ DONE (session 10)
- ~~Agent observability (`track agent decisions`)~~ DONE (session 10)
- ~~Guardrails / safety (`must not:` block)~~ DONE (session 10)
- ~~Human-in-the-loop (`ask user to confirm`)~~ DONE (session 10)
- ~~Agent testing (`mock claude responding:`)~~ DONE (session 10)
- ~~RAG / knowledge base (`knows about:`)~~ DONE (session 10)
- ~~Skills / reusable tool bundles (`skill 'Name':`)~~ DONE (session 10)
- ~~Variable prompts / text blocks in agents~~ DONE (session 10)
- ~~Streaming AI responses (SSE from ask ai)~~ DONE (session 11) — JS already streamed, Python now streams via `_ask_ai_stream` async generator

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

### Nice to Have (developer experience)

| Feature | What it enables | Difficulty |
|---------|----------------|------------|
| **JSDoc typedefs + `@ts-check`** | IDE autocomplete, type checking without a build step. Add `@typedef` for AST nodes and `// @ts-check` to compiler files. 80% of TypeScript's benefits with 0% build complexity. | Easy |

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

---

## What's Built (Phase 29 -- Playground & Design System)

| Feature | Status | Notes |
|---------|--------|-------|
| Playground redesign (arctic theme) | Done | Syntax highlighting, line numbers, browser mockup preview |
| Interactive API tester | Done | Backend examples have live Send buttons, real responses |
| Browser server variable binding | Done | `receiving` var + `process.env` shim for auth |
| Design-system-v2 | Done | 5 themes (midnight/ivory/nova/arctic/moss), all component patterns |
| Compiler updated to v2 presets | Done | New preset classes, fieldset inputs, proper table/card/heading patterns |
| Compile animation | Done | Scan line + streaming code output on manual compile |
| DaisyUI v5 CDN fix | Done | Correct path (`/daisyui.css`), local CSS for iframe injection |
| Google Fonts + Tailwind v4 browser CDN | Done | Proper font loading in compiled output |

### What's Built (Phase 29.2 -- Session 7)

| Feature | Status | Notes |
|---------|--------|-------|
| `with delete` / `with edit` table actions | Done | Explicit opt-in, auto-wired to DELETE/PUT endpoints |
| ECharts chart syntax | Done | `chart 'Title' as line/bar/pie/area showing data` |
| Supabase adapter (JS + Python) | Done | `database is supabase` → SDK calls, both languages |
| Client validation + loading + error toasts | Done | Phase 30 complete: toast with icons, spinner, validation |
| Tailwind grid classes | Done | Column layouts use `grid-cols-N` instead of inline CSS |
| Multi-file `use everything from` fix | Done | Endpoints + pages now inlined from modules |
| AI proxy for playground | Done | Vercel serverless, 3 calls/IP rate limit |
| Full syntax guide in playground | Done | 30+ sections covering all features |
| Stripe-style landing page preset | Done | page_hero py-32, text-6xl font-extrabold, dark feature cards |
| Python Supabase + rate limiting | Done | supabase-py client, slowapi limiter |
| File TOCs for parser.js + compiler.js | Done | Mandatory TOC update rule in CLAUDE.md |

---

## Part 2: From Demo to Shippable

Every item has:
- **UNLOCKS**: What you can build once this works
- **TEST**: One-line spec that proves it's done

---

### Phase 30: Clear Apps Can Accept Input (The Big 4)

Without these, Clear's frontend is a display. It can show data but can't collect it.

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 1 | Form submit to endpoint | Signup forms, todo creation, contact pages, any write operation | **DONE.** Reactive compiler generates `fetch('/api/...', { method: 'POST', body: ... })` wired to button click. Tested: Contact Manager, Invoice Manager, Todo App all POST and render results. |
| 2 | Client-side validation before fetch | Instant "required" feedback without server round-trip | **DONE.** Buttons with POST/PUT auto-validate required fields. Shows toast on empty fields, returns before fetch. |
| 3 | Loading state during fetch | Users know the app is working, not frozen | **DONE.** DaisyUI loading spinner replaces button text during async ops. Button disabled until complete. |
| 4 | Display API errors in UI | "Email already taken" shown on screen instead of silently swallowed | **DONE.** Fetch checks `!response.ok`, parses error JSON, shows DaisyUI toast with slide-in animation + progress bar. |

**Phase 30: COMPLETE.** All 4 items done.

---

### Phase 31: Clear Apps Respond to What You're Doing

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 5 | Conditional fetch based on input | Search-as-you-type, filtered lists, dependent dropdowns | **DONE.** `when query changes: get results from '/api/search'` compiles to input event listener with async fetch. |
| 6 | Debounced input handler | Live search without hammering server per keystroke | **DONE.** `when query changes after 250ms:` compiles to `clearTimeout`/`setTimeout` wrapper. |

**Phase 31: COMPLETE.** Both items done.

---

### Phase 32: Clear Apps Can Accept More Than Text

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 7 | File upload compiles | Profile photos, CSV imports, document uploads | **DONE.** `'Photo' is a file input saved as photo` → `<input type="file">` with DaisyUI styling. Backend `accept file:` uses multer. |

---

### Phase 33: Clear Apps Look Like Apps

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 8 | Hover/focus/active states | Buttons look clickable, inputs highlight on focus | **DONE.** `hover_background is 'blue'` → `:hover` CSS rule. Auto-transition added. |
| 9 | CSS transitions | Smooth color changes, fading panels | **DONE.** `transition is 'background 0.2s'` or auto-added with hover/focus props. |
| 10 | Responsive breakpoints | Apps work on phones | **DONE.** `for_screen is 'small'` → `@media (max-width: 640px)`. |
| 11 | CSS animations | Loading spinners, attention pulses | **DONE.** `animation is 'spin 1s infinite'` compiles to CSS animation property. |

**Phase 33: COMPLETE.**

---

### Phase 34: Clear Apps Can Handle Real Data

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 12 | Pagination | Any list with 50+ items | **DONE.** `get all Items page 2, 25 per page` → array slice (local) or `.range()` (Supabase) |
| 13 | GROUP BY output | "Sales by region," dashboards, reports | **DONE.** `by_region = group by region in sales` compiles to object grouping. Phase 22. |
| 14 | Compound unique constraints | "One vote per user per poll" | **DONE.** `one per user_id and poll_id` → `UNIQUE(user_id, poll_id)`. Plain English, passes phone test. |
| 15 | Database transactions | E-commerce (order + stock), banking (debit + credit) | **DONE.** `as one operation:` → `BEGIN`/`COMMIT`/`ROLLBACK` wrapping. Plain English. |

**Phase 34: COMPLETE.** All 4 items done.

---

### Phase 35: Clear Apps Can Run a Business

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 16 | Background jobs | Reminder emails, stale token cleanup, daily reports | **DONE.** `background 'cleanup': runs every 1 hour` compiles to `setInterval` (JS) / `asyncio.create_task` (Python). Phase 20. |
| 17 | OAuth redirect + token exchange | "Sign in with Google/GitHub/Slack" | **DONE.** `oauth 'github':` compiles to redirect + callback routes. Phase 17. |
| 18 | Email sending | Welcome emails, password resets, notifications | **DONE.** `send email:` compiles to nodemailer (JS) / smtplib (Python). Phase 27. |

**Phase 35: COMPLETE.** All features implemented in earlier phases (17, 20, 27).

---

### Phase 36: Real-Time

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 19 | WebSocket runtime | Chat, multiplayer, collaborative editing, live notifications | **DONE.** `subscribe to 'chat':` compiles to WebSocket.Server (JS) / FastAPI websocket (Python). Phase 20. |
| 20 | SSE runtime | Live dashboards, progress bars, activity feeds | **DONE.** `stream:` compiles to text/event-stream with heartbeat. Phase 20. |

**Phase 36: COMPLETE.** All features implemented in Phase 20.

---

### Phase 37: The Compiler Gets Smarter

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 21 | Correct error line numbers | Debugging anything over 20 lines | Existing — all errors include line numbers |
| 22 | "Did you mean?" for fields | Beginners not stuck on typos | **DONE.** Levenshtein distance checks user variables + keywords. `emial` suggests `email`. |
| 23 | "Did you mean?" for endpoints | Route typos caught at compile time | **DONE.** Fetch URLs validated against declared endpoints. `/api/user` warns when `/api/users` exists. |
| 24 | Endpoint response validation | Every endpoint sends data back | **DONE.** Warns when endpoint has no `send back` statement. |
| 25 | FK inference opt-out | Tables with `Type`, `Status` fields that aren't FKs | **DONE.** `Status (text)` explicit type hint overrides FK inference. Already worked via `explicitType` guard. |

**Phase 37: COMPLETE.** All 5 items done.

---

### Phase 38: Ecosystem

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 26 | Python target end-to-end | Data science teams, ML engineers, Django shops | **DONE.** Python backend compiles with FastAPI, Supabase support, all CRUD. |
| 27 | Namespaced imports | Utility libraries without name collisions | **DONE.** `use 'helpers'` → `helpers's double(5)`. Phase 28. |
| 28 | Circular dependency detection | Safe refactoring into modules | **DONE.** A → B → A detected with helpful error. Phase 28. |
| 29 | E2E tests seed data | Tests prove app works, not just starts | **DONE.** `generateE2ETests()` creates payloads, seeds via POST, handles FK chains. |

**Phase 38: COMPLETE.**

---

### Phase 45: Desktop Apps via Tauri

Clear already compiles to a single HTML file with inline JS/CSS. Tauri wraps a single HTML file into a native desktop app (macOS, Windows, Linux) with a ~3MB binary.

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 57 | `build for desktop` target | Native desktop apps from Clear source | Compile todo app; `cargo tauri build` produces .exe/.app/.deb |
| 58 | System tray / menu bar | Desktop-native UX (tray icon, native menus) | Clear syntax for `tray icon:` and `menu bar:` compiles to Tauri config |
| 59 | File system access (native) | Desktop apps that read/write local files | `read file` / `write file` use Tauri fs API instead of browser shims |
| 60 | Auto-update | Ship updates without manual reinstall | `auto update from 'https://releases.myapp.com'` compiles to Tauri updater config |

**Phase 45 complete = `build for desktop` produces a native app. One Clear file → one binary.**

---

### Phase 40: Production Database Connectors

`database is local memory` works for dev. For production, swap one line:

```clear
database is supabase              # Supabase (Postgres) — DONE
database is planetscale           # PlanetScale (MySQL)
database is turso                 # Turso (SQLite edge)
```

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 34 | `database is supabase` | Production Postgres via Supabase JS | **DONE.** JS + Python, full CRUD, .range() pagination |
| 35 | `database is planetscale` | Production MySQL via PlanetScale SDK | Same app, PlanetScale backend |
| 36 | `database is turso` | Edge SQLite via Turso client | Same app, Turso backend |
| 37 | Connection string from env | `database is supabase with env('SUPABASE_URL')` | Config-driven, no hardcoded keys |

**Phase 40 status: item 34 done, 35-37 pending.**

---

### Phase 41: CLI Agent

The CLI is the product. The playground is a demo. Developers ship from the terminal.

```bash
clear build app.clear              # compile to build/
clear dev app.clear                # compile + watch + serve + live reload
clear test app.clear               # run auto-generated E2E tests
clear deploy app.clear             # compile + deploy to Clear Cloud
clear new crm                      # scaffold from template
clear new invoice-system           # scaffold from template
```

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 38 | `clear dev` — watch + serve + live reload | Real development workflow | Edit .clear, browser auto-refreshes |
| 39 | `clear deploy` — one-command deploy | Ship to production from terminal | `clear deploy` → live URL in 30 seconds |
| 40 | `clear new <template>` — project scaffolding | Instant start from proven patterns | `clear new crm` → working CRUD app |
| 41 | `clear doctor` — check environment | Debug setup issues | Reports: Node version, dependencies, config |

**Phase 41 complete = developers can build, test, and ship from the terminal.**

---

### Phase 42: Clear Cloud (The Business)

Clear Cloud is the Vercel of Clear. You compile and deploy, databases are pluggable.

| # | Feature | UNLOCKS | TEST |
|---|---------|---------|------|
| 42 | Hosted compilation service | Apps compile in the cloud, no local tooling needed | POST /api/compile with source → compiled output |
| 43 | One-click deploy | Compiled apps run on Clear's infrastructure | Deploy from playground or CLI, get a URL |
| 44 | Custom domains | Professional deployments | `clear domain add myapp.com` |
| 45 | Usage dashboard | Monitor apps, API calls, AI usage | Web dashboard with charts |
| 46 | Team accounts | Agencies manage multiple apps | Invite team members, shared billing |

**Pricing:**
| Tier | Price | What |
|------|-------|------|
| Starter | Free | 1 app, clear.dev subdomain |
| Pro | $49/mo | Unlimited apps, custom domains, priority support |
| Enterprise | Contact | On-premise, SSO, audit logs, SLA |

---

### Phase 43: Template Library (The Growth Engine) — DONE

Templates are pre-built Clear apps for the ICP (freelancers/agencies). Each template is a complete, tested, deployable app. All E2E tested with real HTTP requests.

| # | Template | Lines | Status | Features |
|---|----------|-------|--------|----------|
| 47 | CRM (`apps/crm/`) | 155 | **DONE** | Contacts + deals CRUD, seed data, midnight theme |
| 47b | CRM Pro (`apps/crm-pro/`) | 270 | **DONE** | 5 tables, pipeline chart, compound unique, debounce search |
| 47c | CRM SPA (`apps/crm-spa/`) | 4 files | **DONE** | Multi-file, components, tabs, modal, slide panel, SSE, chart |
| 48 | Invoice (`apps/invoice/`) | 175 | **DONE** | Clients + invoices + line items, full CRUD, edit/delete |
| 49 | Booking (`apps/booking/`) | 145 | **DONE** | Services + bookings, seed data, ivory theme |
| 50 | Client portal (projects, files, messages) | ~120 | Planned | Agencies |
| 51 | Admin dashboard (users, roles, audit log) | ~100 | Planned | SaaS founders |

**Also built and tested (33 total apps):** blog-api, cast-api, cast-editor, cast-evaluator, chat-backend, clear-landing, content-moderator, dashboard, dashboard-v2, ecommerce-api, full-saas, hiring-pipeline, interactive, invoice-engine, job-queue, landing-page, lead-scorer, live-dashboard, page-analyzer, product-landing, project-manager, saas-billing, team-dashboard, todo-api, todo-fullstack, todo-v2, url-shortener, webhook-relay.

### Phase 43b: Compiler Fixes from E2E Testing — DONE

Bugs found by deploying and testing all 33 apps:

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `save X as new Y` → `db.update('as')` | Parser only checked `to_connector` | Handle `as` connector + `new` keyword |
| PUT endpoints missing ID | No `req.params.id` injection | Inject `update_data.id = req.params.id` |
| `Activity → activitys` | Naive `+s` pluralization | `pluralizeName()` handles y→ies, ch→ches |
| Schema mismatch `ActivitySchema` | Singular/plural lookup incomplete | Try exact, +s, pluralize, -s, -ies→y |
| Multi-page routing broken | Pages not wrapped in `<div id="page_X">` | Splice wrappers after `walk()` |
| Sidebar layout crushed | `flex-direction: row` not detected | Add to `hasFullLayout` check |
| `use everything from` incomplete | Nodes only stored, not spliced | Splice into `ast.body` during resolution |
| App presets too wide | `p-8`, `w-64` too large | Tuned to `p-6/p-5`, `w-60`, `h-16` |

1265 tests passing. All 33 apps compile and deploy.

---

### Phase 44: Advanced Language Features

| # | Feature | Syntax | UNLOCKS |
|---|---------|--------|---------|
| 52 | Retry with backoff | `retry 3 times:` | **DONE.** Exponential backoff (JS + Python) |
| 53 | Timeout wrapper | `with timeout 5 seconds:` | **DONE.** Promise.race with reject timer |
| 54 | Race (first to finish) | `first to finish:` | **DONE.** Promise.race with concurrent tasks |
| 55 | Streaming iterators | `for each line in stream file 'big.csv':` | Process large files without loading all into memory |
| 56 | Cancellation | `cancel task` | User-initiated abort |

**Phase 44 status: items 52-54 done, 55-56 pending.**

---

### Phase 45: External API Calls & Service Integrations — DONE

| # | Feature | Syntax | Status |
|---|---------|--------|--------|
| 57 | Generic HTTP requests | `call api 'url':` + method/headers/body/timeout | **DONE.** fetch() with AbortController |
| 58 | Stripe preset | `charge via stripe:` + amount/currency/token | **DONE.** Charges API, form-encoded |
| 59 | SendGrid preset | `send email via sendgrid:` + to/from/subject/body | **DONE.** Mail Send v3 API |
| 60 | Twilio preset | `send sms via twilio:` + to/body | **DONE.** Messages API, Basic auth |
| 61 | ask claude (canonical AI) | `ask claude 'prompt' with data using 'model'` | **DONE.** ANTHROPIC_API_KEY, model selection |
| 62 | Natural webhooks | `when stripe notifies '/path':` | **DONE.** Replaces `webhook` jargon |
| 63 | needs login alias | `needs login` | **DONE.** Alias for `requires auth` |

1281 tests. `call api` handles arbitrary REST APIs. Service presets compile to correct API-specific formats (form-encoded for Stripe/Twilio, JSON for SendGrid).

---

### Phase 45: Desktop Apps via Tauri
| 36 | `database is turso` | Edge SQLite via Turso client | Same app, Turso backend |
| 37 | Connection string from env | `database is supabase with env('SUPABASE_URL')` | Config-driven, no hardcoded keys |

**Phase 40 complete = one-line database swap from dev to production.**

---

### Remaining Playground Work

| Feature | Status | Notes |
|---------|--------|-------|
| Chart syntax (`chart X as line/bar/pie/area`) | **Done** | ECharts integration with 4 chart types |
| Full syntax guide | **Done** | 30+ sections covering all features |
| AI proxy (3 calls/IP demo) | **Done** | Vercel serverless, rate-limited by IP |
| Marketing copy + how it works | **Done** | Sidebar bullets, 3-step process |
| Stripe-style landing page | **Done** | text-6xl hero, dark feature cards, stats row |
| Download compiled output as zip | Not started | JSZip, package.json, README |
| Mobile responsive playground | Not started | Sidebar collapses, editor/output stack vertically |
| Share button (URL hash encoding) | Not started | Encode source in URL for sharing |

---

### Phase 45b: Compiled Output Quality — DONE

| Feature | Status | Description |
|---------|--------|-------------|
| Source line comments | **Done** | `// clear:LINE` on every endpoint + CRUD operation |
| Error classification | **Done** | 400 = user message, 500 = "Something went wrong" |
| Console error logging | **Done** | `[METHOD /path] Error:` in every catch block |
| Seed endpoint guard | **Done** | Returns 403 when `NODE_ENV=production` |
| Frontend fetch context | **Done** | `[GET /path]` + response.ok check |
| Reactive model comments | **Done** | Explains _state, _recompute(), input/button flow |

### Phase 46: Runtime Error Translator — DONE

Implemented `plans/plan-error-translator-04-07-2026.md`. Runtime errors now map back to Clear source with hints + suggested fixes.
- `_clearTry` wraps CRUD/auth with source context (line, file, table, operation)
- `_clearError` formats errors based on CLEAR_DEBUG level (off/true/verbose)
- `_clearMap` embeds conditional source map (table schemas + endpoint info, zero production overhead)
- `suggested_fix` generates minimal diffs for fixable errors (missing field, missing auth)
- PII auto-redacted in verbose mode (password, token, secret, etc.)
- `_sourceFile` tagging tracks multi-file imports through resolveModules
- Frontend fetch errors log `[clear:LINE file.clear]` to browser console
- External API errors (Stripe/SendGrid/Twilio/call api) carry service-specific context
- Python first-class (CLEAR_DEBUG-aware error formatting in FastAPI endpoints)
- 50 blind-agent acceptance tests: 42/42 A or B grades. Agents fix bugs from error JSON alone.

### Phase 46b: Silent Bug Guards — DONE

Research-backed runtime protections (OWASP 2025, CWE Top 25, CodeRabbit AI study).
- **Type enforcement**: `enforceTypes()` in db.insert/update — coerces "45.50"→45.5, rejects "fifty"
- **Update-not-found**: db.update throws 404 when record doesn't exist (wrong status codes = 70% of API bugs)
- **FK reference check**: db.insert validates FK references exist in parent tables
- **Balance/stock subtraction warning**: validator warns on subtraction from watchlist fields without guard
- **Field mismatch warning**: validator warns when frontend field names don't match table schema
- **Capacity overflow warning**: validator warns on insert into child of capacity table without guard
- **Seed idempotency**: compiled seed endpoints use findOne-before-insert for unique fields
- 8 blind-agent acceptance tests: 8/8 A grades
- Agents also found 6 compiler bugs during hard-bug testing (Stripe IIFE syntax, PUT data loss, isReactiveApp, stale schema, mass assignment, missing _pick on update)

1337 tests. All 33 apps compile.

---

## What's Next — Road to General Purpose

Clear's goal: handle any app an AI agent would build for a non-technical user. Not systems programming — not drivers, game engines, or OS kernels — but any business/productivity/data application.

Organized by priority (highest impact first). Estimated effort based on velocity so far (~15 phases per day, ~300 tests per day).

### Tier 1: Production-Ready (Day 4-5)

These unlock real deployment. Without them, Clear apps are demos.

| Phase | Feature | Why It Matters | Effort |
|-------|---------|---------------|--------|
| 47 | **SQLite local database** | In-memory DB is ephemeral. SQLite gives persistence without a server. `database is local file` compiles to better-sqlite3. | 1 day |
| 48 | **Client portal + admin dashboard templates** | Most-requested app types. 2 template apps with auth, roles, file upload, audit log. | 0.5 day |
| 49 | **Deploy to Vercel/Railway** | `clear deploy` compiles + deploys. One command from .clear file to live URL. | 0.5 day |
| 50 | **Real-time / WebSocket** | Chat apps, live dashboards, notifications. `when data changes:` compiles to Socket.io. | 1 day |

### Tier 2: Complex Frontend (Day 5-6)

These make Clear competitive with React/Vue for real UIs.

| Phase | Feature | Why It Matters | Effort |
|-------|---------|---------------|--------|
| 51 | **Multi-page routing with shared state** | SPA with `/dashboard`, `/settings`, `/profile` sharing auth state. `navigate to '/settings'` with state preservation. | 1 day |
| 52 | **Component composition** | Reusable components with slots/children. `define Card receiving title, content:` used as `show Card('Title'):` with nested content. | 0.5 day |
| 53 | **Conditional rendering** | `show section if user's role is 'admin'` — hide/show UI elements based on state. Currently requires workarounds. | 0.5 day |
| 54 | **Lists with actions** | `for each item in items: show Card(item)` — render dynamic lists of components with per-item actions (edit, delete, reorder). | 0.5 day |
| 55 | **Animations + transitions** | `animate section sliding in` / `fade out on delete`. CSS transitions compiled from English. | 0.5 day |

### Tier 3: Data & Integration (Day 6-7)

These make Clear apps work with the real world.

| Phase | Feature | Why It Matters | Effort |
|-------|---------|---------------|--------|
| 56 | **PostgreSQL adapter** | Production database. `database is postgres` compiles to pg client with migrations. | 1 day |
| 57 | **File upload + storage** | `'Photo' is a file input` → upload to S3/local. Display images. PDF generation. | 0.5 day |
| 58 | **Email sending** | `send email to user's email:` with templates. Beyond the current Stripe/SendGrid presets — first-class email. | 0.5 day |
| 59 | **Scheduled tasks** | `every day at 9am:` compiles to cron. Send reports, clean up data, sync APIs. | 0.5 day |
| 60 | **Streaming / SSE** | `stream results to client` — server-sent events for long-running operations, AI responses. | 0.5 day |

### Tier 4: Advanced Patterns (Day 7-8)

These handle the 20% of apps that need more than CRUD.

| Phase | Feature | Why It Matters | Effort |
|-------|---------|---------------|--------|
| 61 | **State machines** | `order goes through: draft → submitted → approved → shipped`. Enforce valid transitions. | 0.5 day |
| 62 | **Workflows / multi-step** | `when order is approved: send email, create invoice, update inventory`. Chained operations with rollback. | 0.5 day |
| 63 | **Search + filtering** | `search contacts where name contains query` — compiled to SQL LIKE or full-text search. | 0.5 day |
| 64 | **Pagination** | `show 25 per page` — cursor-based pagination on lists and tables. | 0.25 day |
| 65 | **Audit log** | `track changes to orders` — automatic changelog. Who changed what, when. | 0.25 day |
| 66 | **Role-based UI** | `only admins see:` — sections that compile to role checks in the frontend. | 0.25 day |

### Tier 5: Platform (Day 8-10)

These make Clear a platform, not just a language.

| Phase | Feature | Why It Matters | Effort |
|-------|---------|---------------|--------|
| 67 | **Clear Cloud MVP** | Hosted compile + deploy. Write Clear in browser, get a URL. | 2 days |
| 68 | **Package registry** | `use 'auth-flow' from registry` — share reusable Clear modules. | 1 day |
| 69 | **Desktop via Tauri** | `build for desktop` wraps web output in native shell. One .clear file → one binary. | 1 day |
| 70 | **Mobile via Capacitor** | `build for mobile` wraps web output in native mobile shell. iOS + Android. | 1 day |

### Tier 6: Intelligence (Day 10-12)

These make Clear apps smarter than hand-coded equivalents.

| Phase | Feature | Why It Matters | Effort |
|-------|---------|---------------|--------|
| 71 | **Auto-generated admin panels** | `admin panel for Orders` — CRUD UI auto-generated from table schema. Zero Clear code needed. | 0.5 day |
| 72 | **Smart defaults** | Compiler infers validation rules from schema (email field → matches email, phone → matches phone). Less boilerplate. | 0.5 day |
| 73 | **Performance profiling** | `CLEAR_PROFILE=true` — compiled output includes timing for every CRUD operation. Identify slow queries. | 0.5 day |
| 74 | **AI-powered error recovery** | When an error is unrecoverable, the error translator calls Claude to suggest a patch. Fully autonomous fix loop. | 1 day |

### Tier 7: First-Class AI Agents (SHIPPED — Session 10)

All 10 phases + Skills implemented. 1407 tests passing. 70 new tests. GAN app: `apps/support-agent/main.clear` (80 lines → 300 lines JS).

**What's built:**
- `agent 'Name' receives data:` — define an agent function
- `ask claude 'prompt' with context` — single LLM call
- `ask claude 'prompt' with data returning JSON text:` — structured output (JSON schema)
- `call 'Agent' with data` — invoke agent from endpoint
- `agent 'Name' runs every 1 hour:` — scheduled agents (cron)
- `using 'claude-opus-4-6'` — model selection

**What's missing — 10 phases with exact syntax:**

---

#### Phase 75: Tool Use / Function Calling (1 day)

Agent declares which functions it can call. The compiler maps Clear functions and CRUD operations to Anthropic tool_use API tool definitions. Agent decides at runtime which tools to invoke.

```clear
agent 'Customer Support' receives message:
  can use: look_up_orders, check_status, send_email

  response = ask claude 'Help this customer resolve their issue' with message
  send back response

define function look_up_orders(customer_email):
  orders = look up all Orders where email is customer_email
  return orders

define function check_status(order_id):
  order = look up Order where id is order_id
  return order's status

define function send_email(to, subject, body):
  send email via sendgrid:
    to is to
    from is 'support@app.com'
    subject is subject
    body is body
```

Compiles to: `tools: [{ name: "look_up_orders", description: "...", input_schema: {...} }]` in the Anthropic API call. The agent's LLM response includes `tool_use` blocks which the runtime executes and feeds back.

---

#### Phase 76: Multi-Turn Conversation (1 day)

Agent maintains context across messages. Conversation history stored in DB, loaded on each turn. Supports both API-driven (chatbot endpoint) and page-driven (chat UI) patterns.

```clear
create a Conversations table:
  user_id, required
  messages, default '[]'
  created_at (timestamp), auto

agent 'Assistant' receives message:
  remember conversation context
  can use: look_up_contacts, create_task

  response = ask claude 'You are a helpful assistant' with message
  send back response

when user calls POST /api/chat sending message:
  needs login
  response = call 'Assistant' with message
  send back response

page 'Chat' at '/':
  section 'Chat' with style app_layout:
    section 'Messages' with style app_main:
      display messages as list
    'Message' is a text input saved as a message
    button 'Send':
      send message to '/api/chat'
```

Compiles to: conversation history loaded from DB on each call, appended after response, truncated to token limit. `remember conversation context` triggers the storage pattern.

---

#### Phase 77: Agent Chains / Pipelines (0.5 day)

Output of one agent feeds as input to the next. Error at any step stops the chain and reports which step failed. Useful for multi-stage processing.

```clear
agent 'Classifier' receives text:
  result = ask claude 'Classify this as sales, support, or billing' with text returning JSON text:
    category
    confidence (number)
  send back result

agent 'Scorer' receives lead:
  score = ask claude 'Score this lead 1-10' with lead returning JSON text:
    score (number)
    reason
  send back score

agent 'Router' receives scored_lead:
  if scored_lead's score is greater than 7:
    send back 'fast-track'
  otherwise:
    send back 'nurture'

pipeline 'Process Inbound' with text:
  classify with 'Classifier'
  score with 'Scorer'
  route with 'Router'

when user calls POST /api/inbound sending data:
  needs login
  result = run pipeline 'Process Inbound' with data's text
  send back result
```

Compiles to: sequential `await` calls with error propagation. Each step's output becomes the next step's input. Pipeline result is the final step's output.

---

#### Phase 78: RAG / Knowledge Base (1.5 days)

Agent automatically retrieves relevant context from specified tables before prompting. The compiler generates embedding + similarity search, then injects top results into the prompt context.

```clear
create a Documents table:
  title, required
  content, required
  category

agent 'Knowledge Bot' receives question:
  knows about: Documents, Products, FAQ
  using 'claude-sonnet-4-6'

  answer = ask claude 'Answer this question using the provided context' with question
  send back answer
```

Compiles to: (1) embed the question, (2) similarity search across Documents/Products/FAQ tables, (3) inject top-k results as context in the system prompt, (4) call LLM with enriched context. Requires an embedding model (Anthropic or OpenAI) and a vector similarity function (cosine distance on stored embeddings).

---

#### Phase 79: Agent Memory (0.5 day)

Per-user long-term memory. Agent remembers facts across sessions. Stored in DB, automatically loaded and injected into context on each call.

```clear
create a Memories table:
  user_id, required
  fact, required
  created_at (timestamp), auto

agent 'Personal Assistant' receives message:
  remember user's preferences
  can use: create_task, send_email, check_calendar

  response = ask claude 'Help the user. Use their preferences when relevant.' with message
  send back response
```

Compiles to: (1) on each call, load recent memories for this user from Memories table, (2) inject as system context: "User preferences: [facts]", (3) if the LLM response includes a `remember` action, store the new fact. The `remember user's preferences` line triggers memory loading + the memory-store tool.

---

#### Phase 80: Parallel Agent Execution (0.5 day)

Run multiple agent calls simultaneously. Useful for fan-out patterns (analyze from multiple angles, then merge).

```clear
agent 'Sentiment' receives text:
  result = ask claude 'Rate sentiment 1-10' with text returning JSON text:
    score (number)
  send back result

agent 'Topic' receives text:
  result = ask claude 'Identify the main topic' with text returning JSON text:
    topic
  send back result

agent 'Language' receives text:
  result = ask claude 'Detect the language' with text returning JSON text:
    language
  send back result

when user calls POST /api/analyze sending data:
  needs login
  run these at the same time:
    sentiment = call 'Sentiment' with data's text
    topic = call 'Topic' with data's text
    language = call 'Language' with data's text
  create result:
    sentiment is sentiment's score
    topic is topic's topic
    language is language's language
  send back result
```

Compiles to: `const [sentiment, topic, language] = await Promise.all([agent_sentiment(data.text), agent_topic(data.text), agent_language(data.text)]);`

---

#### Phase 81: Human-in-the-Loop (0.5 day)

Agent pauses for human approval on high-stakes actions. Creates an approval request, waits for response, then continues or aborts.

```clear
create a Approvals table:
  action, required
  details, required
  status, default 'pending'
  decided_by
  decided_at (timestamp)

agent 'Refund Processor' receives request:
  can use: look_up_order, process_refund

  order = look_up_order(request's order_id)
  if order's amount is greater than 100:
    ask user to confirm 'Process refund of $' + order's amount + ' for order ' + order's id + '?'

  process_refund(order)
  send back 'Refund processed'

when user calls POST /api/refund sending request:
  needs login
  result = call 'Refund Processor' with request
  send back result
```

Compiles to: (1) create Approvals record with status='pending', (2) send notification (webhook/email/WebSocket), (3) return 202 Accepted with approval_id, (4) when approval is granted (PUT /api/approvals/:id), resume the agent from where it paused.

---

#### Phase 82: Agent Observability (0.5 day)

Every LLM call, tool use, and decision is logged with input, output, latency, and token count. Queryable via API or viewable in a dashboard.

```clear
create a AgentLogs table:
  agent_name, required
  action, required
  input
  output
  tokens_used (number)
  latency_ms (number)
  created_at (timestamp), auto

agent 'Support Bot' receives message:
  log agent decisions
  can use: search_faq, escalate

  response = ask claude 'Help the customer' with message
  send back response

page 'Agent Dashboard' at '/admin/agents':
  on page load get logs from '/api/agent-logs'
  display logs as table showing agent_name, action, latency_ms, tokens_used, created_at
```

Compiles to: wrapper around every `_askAI` call that records timing, token count, input/output to the AgentLogs table. `log agent decisions` enables the wrapper.

---

#### Phase 83: Guardrails / Safety (0.5 day)

Compile-time constraints on what an agent can access. The compiler verifies that the agent's tool set does not include restricted tables or operations. Violations are compile errors, not runtime checks.

```clear
agent 'Public Bot' receives question:
  can use: search_products, check_availability
  must not: modify prices, delete records, access users

  response = ask claude 'Help the customer find products' with question
  send back response
```

Compiles to: compile-time validation that none of the functions in `can use` touch the restricted tables/operations in `must not`. If `search_products` internally does `delete the Product with this id`, the compiler rejects it:
```
Error: agent 'Public Bot' uses 'search_products' which deletes from Products,
  but the agent has 'must not: delete records'. Remove the restriction or
  change the tool.
```

This is a **compile-time guarantee**, not a runtime check. A runaway agent can't bypass it because the code literally doesn't compile.

---

#### Phase 84: Agent Testing (0.5 day)

Deterministic tests with mocked LLM responses. The test block specifies input and expected output. The compiler generates a test harness that intercepts `_askAI` calls and returns the mock.

```clear
test 'Classifier handles positive review':
  set input to 'This product is amazing, I love it!'
  mock claude responding:
    sentiment is 'positive'
    confidence = 0.95
  result = call 'Classifier' with input
  check result's sentiment is 'positive'
  check result's confidence is greater than 0.9

test 'Classifier handles negative review':
  set input to 'Terrible experience, want a refund'
  mock claude responding:
    sentiment is 'negative'
    confidence = 0.88
  result = call 'Classifier' with input
  check result's sentiment is 'negative'

test 'Support Bot escalates high-urgency':
  set input to 'My payment was charged twice, this is urgent!'
  mock claude responding:
    action is 'escalate'
    reason is 'duplicate charge — financial issue'
  result = call 'Customer Support' with input
  check result's action is 'escalate'
```

Compiles to: test functions that replace `_askAI` with a mock that returns the specified response. `clear test app.clear` runs all test blocks. Exit code 0 = all pass, 4 = failures. CI-friendly.

---

**What a complete Clear AI agent looks like after Tier 7:**

```clear
build for web and javascript backend
database is local memory

create a Conversations table:
  user_id, required
  messages, default '[]'

create a Memories table:
  user_id, required
  fact, required

create a AgentLogs table:
  agent_name, required
  action, required
  latency_ms (number)
  created_at (timestamp), auto

agent 'Customer Support' receives message:
  can use: look_up_orders, check_status, send_email, escalate
  must not: delete records, modify prices, access admin tables
  knows about: Products, Orders, FAQ
  remember conversation context
  remember user's preferences
  log agent decisions
  using 'claude-sonnet-4-6'

  response = ask claude 'Help this customer' with message
  if response's action is 'escalate':
    ask user to confirm 'Escalate to human agent?'
  send back response

when user calls POST /api/chat sending message:
  needs login
  response = call 'Customer Support' with message
  send back response

page 'Support' at '/':
  section 'Chat' with style app_layout:
    section 'Messages' with style app_main:
      display messages as list
    'Message' is a text input saved as a message
    button 'Send':
      send message to '/api/chat'

test 'handles product question':
  mock claude responding:
    answer is 'The Widget costs $29.99 and ships in 2 days'
    action is 'respond'
  result = call 'Customer Support' with 'How much does the Widget cost?'
  check result's action is 'respond'
```

That's ~45 lines for a complete customer support agent with: tool use, RAG, conversation memory, user preferences, guardrails, observability, human-in-the-loop escalation, a chat UI, and deterministic tests.

The LangChain equivalent is 500-800 lines across 6+ files.

---

## Effort Summary

| Tier | Phases | Days | What It Unlocks |
|------|--------|------|----------------|
| Done (1-46b, 75-90) | 62 phases | 5 days | Full-stack CRUD apps, error translator, silent bug guards, first-class AI agents, workflow engine |
| Tier 1: Production | 47-50 | 2 days | Real deployment, persistent DB, real-time |
| Tier 2: Complex Frontend | 51-55 | 3 days | Multi-page SPAs, components, animations |
| Tier 3: Data & Integration | 56-60 | 3 days | Postgres, file upload, email, cron, streaming |
| Tier 4: Advanced Patterns | 61-66 | 2 days | State machines, workflows, search, audit |
| Tier 5: Platform | 67-70 | 5 days | Cloud, packages, desktop, mobile |
| Tier 6: Intelligence | 71-74 | 2.5 days | Auto-admin, smart defaults, AI recovery |
| Tier 7: AI Agents | 75-84 | 7 days | Tool use, RAG, memory, pipelines, guardrails, testing |
| ~~Tier 8: Agent Workflows~~ | 85-90 | DONE | Stateful graphs, durable execution, cycles, routing |
| **TOTAL** | **90 phases** | **~31 days** | **General-purpose app + agent language** |

---

### Tier 8: Agent Workflows — LangGraph Parity (SHIPPED — Session 11)

All 6 phases implemented. 1446 tests passing. 24 new tests. GAN app: `apps/content-pipeline/main.clear` (90 lines → complete workflow with retry loops, parallel branches, DB checkpoints, observability).

**What's built:**
- Linear pipelines (`pipeline 'Name' with var:`)
- Parallel execution (`do these at the same time:`)
- Agent-to-agent calls (`call 'Agent' with data`)
- if/else inside agent bodies
- Database for persistent state

**What's missing — 6 phases with exact syntax:**

---

#### Phase 85: Workflow State (DONE)

Explicit shared state object that every step can read and modify. Unlike pipeline's linear pass-through, workflow state is a named, typed object.

```clear
workflow 'Support Ticket' with state:
  state has:
    message, required
    category
    priority
    resolution
    attempts (number), default 0
    status, default 'new'

  step 'Triage' with 'Triage Agent'
  step 'Resolve' with 'Resolution Agent'
```

Compiles to: a mutable state object (plain JS object) passed by reference through each step. Each agent receives AND returns the full state. The `state has:` block defines the shape with defaults — like a table schema but for workflow context.

---

#### Phase 86: Conditional Routing (DONE)

Route to different agents based on state. Declarative, not buried inside agent bodies.

```clear
workflow 'Support' with state:
  state has:
    message, required
    category
    priority

  step 'Triage' with 'Triage Agent'
  if state's category is 'software':
    step 'Software Fix' with 'Software Specialist'
  if state's category is 'hardware':
    step 'Hardware Fix' with 'Hardware Specialist'
  otherwise:
    step 'General' with 'General Agent'
  step 'Resolution' with 'Resolution Agent'
```

Compiles to: if/else chain between step calls. The routing is at the workflow level, visible in the Clear source — not hidden inside agent logic.

---

#### Phase 87: Cycles and Retry Loops (DONE)

Agents can loop back for retry, reflection, or re-evaluation. The loop has an explicit exit condition and max iterations (safety).

```clear
workflow 'Content Review' with state:
  state has:
    draft, required
    quality_score (number), default 0
    feedback
    attempts (number), default 0

  step 'Write' with 'Writer Agent'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer Agent'
    if state's quality_score is less than 8:
      step 'Revise' with 'Writer Agent'
  step 'Publish' with 'Publisher Agent'
```

Compiles to: a while loop with the exit condition + max iteration guard. Each iteration calls the agents in sequence. The `max N times` is mandatory — no infinite loops. The `attempts` counter increments automatically.

---

#### Phase 88: Durable Execution via Temporal (DONE)

Workflow state is checkpointed and resumed by Temporal.io — not a homebrew solution. Clear compiles `workflow` blocks to Temporal workflow definitions + activities. Temporal handles retries, timeouts, crash recovery, and distributed execution.

```clear
workflow 'Onboarding' with state:
  runs on temporal
  state has:
    user_id, required
    step_completed
    welcome_sent (boolean), default false
    profile_created (boolean), default false

  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
  step 'Tutorial' with 'Tutorial Agent'
```

`runs on temporal` sets the compile target. Each `step` compiles to a Temporal activity. The workflow function is a Temporal workflow.

Compiles to:
```js
import { proxyActivities } from '@temporalio/workflow';
const { agent_welcome, agent_profile, agent_tutorial } = proxyActivities({ startToCloseTimeout: '5m' });

export async function onboardingWorkflow(state) {
  state = await agent_welcome(state);
  state = await agent_profile(state);
  state = await agent_tutorial(state);
  return state;
}
```

Without `runs on temporal`, workflows use a simpler DB-backed checkpoint (for apps that don't need Temporal's infrastructure):
```clear
workflow 'Simple' with state:
  save progress to Workflows table
  step 'A' with 'Agent A'
```

This gives two tiers: DB checkpoint for simple apps, Temporal for production-grade durability.

---

#### Phase 89: Parallel Branches with Join (DONE)

Fan-out to multiple agents, then merge results back into state.

```clear
workflow 'Analysis' with state:
  state has:
    text, required
    sentiment
    topics
    language

  step 'Triage' with 'Triage Agent'
  at the same time:
    step 'Sentiment' with 'Sentiment Agent' saves to state's sentiment
    step 'Topics' with 'Topic Agent' saves to state's topics
    step 'Language' with 'Language Agent' saves to state's language
  step 'Report' with 'Report Agent'
```

Compiles to: `Promise.all` with results assigned to specific state fields. Unlike `do these at the same time:` which creates new variables, this writes directly to the workflow state.

---

#### Phase 90: Workflow Observability and Testing (DONE)

Every step transition is logged with state snapshots. Tests can verify the workflow path.

```clear
workflow 'Support' with state:
  track workflow progress
  state has:
    message, required
    category
    resolved (boolean), default false

  step 'Triage' with 'Triage Agent'
  step 'Resolve' with 'Resolution Agent'

test 'support workflow routes correctly':
  mock claude responding:
    category is 'software'
  mock claude responding:
    resolved is true
  run workflow 'Support' with message is 'My app crashed'
  expect state's category is 'software'
  expect state's resolved is true
```

Compiles to: state history array logged after each step. Test harness provides mock AI and validates the final state.

---

**What a complete Clear workflow looks like after Tier 8:**

```clear
workflow 'Content Pipeline' with state:
  save progress to Workflows table
  track workflow progress
  state has:
    topic, required
    draft
    quality_score (number), default 0
    feedback
    published (boolean), default false

  step 'Research' with 'Research Agent'
  step 'Write' with 'Writer Agent'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer Agent'
    if state's quality_score is less than 8:
      step 'Revise' with 'Writer Agent'
  step 'Publish' with 'Publisher Agent'

test 'pipeline produces quality content':
  mock claude responding:
    research is 'Key findings about AI'
  mock claude responding:
    draft is 'AI is transforming...'
  mock claude responding:
    quality_score = 9
    feedback is 'Excellent'
  run workflow 'Content Pipeline' with topic is 'AI trends'
  expect state's quality_score is greater than 8
  expect state's published is true
```

That's ~30 lines for a durable, retrying content pipeline with quality gates, checkpointing, and tests. The LangGraph equivalent is 200+ lines of Python with framework boilerplate.

**What's been built: 3 days, 46 phases, 1337 tests, 14k lines of compiler.**
**What remains: ~24 days for 38 phases.**

But the tiers aren't equal. Tiers 1-4 (production + frontend + data + patterns) are pure compiler work — **~10 days** at current velocity. Tier 5 (platform) is infrastructure — **~5 days**, slower because it's deploy tooling not compiler code. Tier 7 (AI agents) is the most ambitious — **~7 days** — but also the highest leverage because it makes Clear the best way to build AI-powered apps.

**Recommended order:**
1. Formal grammar + LSP (unlocks tooling ecosystem)
2. Type system (catches bugs before runtime)
3. Source maps (debuggable compiled output)
4. Deploy (one command to production)
5. Package manager (shareable Clear modules)
6. Incremental compilation (scales to large apps)
7. Everything else in priority order

---

### Tier 8: Compiler to Platform (turns Clear from a compiler into a language ecosystem)

The compiler itself is solid — 1413 tests, 42 apps, zero deps, professional error messages, security
validators. What's missing is the ecosystem around it. These features turn Clear from "a compiler
that works" into "a language developers adopt."

**Priority order is based on what creates the most leverage:**

| Priority | Feature | Why This Order | Effort |
|----------|---------|---------------|--------|
| 1 | **Formal grammar (PEG/EBNF)** | Everything else depends on having a formal spec. Syntax highlighting, LSP, formatter, linter — all need a grammar. Without it, every tool re-implements parsing from scratch. Also: a grammar IS the language spec. If someone asks "what can Clear do?", the grammar answers definitively. | 2 days |
| 2 | **LSP (Language Server Protocol)** | Autocomplete, hover docs, go-to-definition, real-time errors in VS Code / JetBrains. This is the #1 reason developers adopt or reject a language. Without LSP, writing Clear feels like writing in Notepad. With it, the editor knows every keyword, every table field, every function signature. Depends on formal grammar. | 3 days |
| 3 | **Type system** | Clear infers types for table fields but doesn't type-check variables, function args, or return values. `price = 'hello'` then `total = price * 1.08` compiles fine but crashes at runtime. A type system catches this at compile time. Doesn't need to be complex — even a basic system (number, text, boolean, list, record) with function signatures eliminates the #1 class of runtime bugs. | 3 days |
| 4 | **Source maps** | When a compiled Express server crashes at line 247 of server.js, you need to know which Clear line caused it. Source maps (`.map` files) let browser devtools and Node debuggers show Clear source instead of compiled JS. The `clear:LINE` comments exist but real source maps enable step-through debugging. | 1 day |
| 5 | **One-command deploy** | `clear deploy` compiles + deploys to Vercel/Railway/Fly.io. Currently: compile, copy build/, set up hosting, configure env vars — 10 manual steps. Should be: `clear deploy` → live URL. The compiler already generates Dockerfiles (`clear package`). Deploy closes the loop from .clear file to production. | 2 days |
| 6 | **Package manager + registry** | `use 'auth-flow' from registry` — share reusable Clear modules. Currently `use 'helpers'` works for local files but there's no ecosystem. A registry means: auth flows, payment integrations, email templates, dashboard layouts — all shareable. The package manager needs the formal grammar (for dependency resolution) and type system (for interface contracts). | 3 days |
| 7 | **Incremental compilation** | Recompile only what changed. Currently the compiler reprocesses everything on every build. Fine for 50-line apps, painful for 500+ line apps with multiple modules. Needs: file dependency graph, AST caching, change detection. Low priority because most Clear apps are small — but becomes essential as apps grow. | 2 days |
| 8 | **Formatter + linter** | `clear fmt` auto-formats Clear code to canonical style. `clear lint` catches style issues and suspicious patterns beyond what the validator catches. Both depend on formal grammar. Low priority because AI writes most Clear code (and AI already follows style conventions), but essential for human editing. | 1 day |

**Why formal grammar is #1:** It's the foundation for LSP, formatter, linter, and any future tooling.
Without it, every tool re-parses Clear from scratch using the same hand-written parser. With it,
you get a single source of truth that generates all downstream tools.

**Why type system is #3 (not #1):** Types are important but Clear's target audience is non-developers
reading AI-generated code. They won't write type annotations. The type system should be 100% inferred
— no syntax changes, just compile-time checks that catch `'hello' * 5` before it reaches production.

**Why deploy is #5 (not #1):** Deployment is a one-time setup problem. The compiler's job is to
generate correct code. Once the code is correct, deploying it is configuration — not a language
feature. But it's high-leverage because it eliminates the biggest gap between "I wrote an app" and
"my app is live."

**Total: ~17 days for 8 features.** Tiers 1-4 (grammar, LSP, types, source maps) are the critical
path — ~9 days. They turn Clear from "a compiler" into "a language with professional tooling."

