# Clear — Language Philosophy

## Purpose

Clear is a programming language designed for **AI to write** and **humans to read**.

When Claude builds a web app, data app, or backend service, it writes Clear code.
The human can open the source and understand what was built -- without knowing
JavaScript, Python, CSS, or SQL.

Clear is the readable contract between AI and human.

## Why Clear Exists

The problem Clear solves isn't "programming is hard." It's that **AI-written
code is unverifiable by the person who asked for it.**

Right now, when Claude writes JavaScript for you, you can't tell if it's correct
without running it. When it breaks, you can't tell if Claude wrote the wrong thing
or if the right thing has a subtle bug. You're dependent on the AI to debug its
own mistakes -- and AI is bad at that. It guesses at causes, fixes symptoms instead
of root causes, and can't run the code to check.

Clear changes this equation:

**You can read what was built.** Not JavaScript, not Python -- Clear. 30 lines
that say exactly what the app does. You can spot "that endpoint shouldn't be
public" without knowing Express.

**AI can't hide bugs in complexity.** One operation per line. If line 14 is
wrong, line 14 does one thing. No nested callbacks, no promise chains, no
framework magic obscuring what went wrong.

**Fixes compound.** When the compiler fixes a where-clause bug once, every app
that uses `where` gets the fix. When it fixes Stripe error handling once, every
checkout gets it. The compiler is a library of correct patterns that grows every
time we build something. Without Clear, every app starts from zero.

**The human can put AI in a loop.** Write Clear, compile, test, fix compiler,
repeat. No human needed for the mechanical parts. The compiler gets better
autonomously through adversarial use. Point AI at "build an ecom app" and come
back to working code, not a debugging session.

**AI debugs faster.** When Claude debugs JavaScript, it fights closures, implicit
state, framework magic, async race conditions, and CSS specificity -- entire
categories of bugs that require tracing invisible context. In Clear, every
variable is named on its own line, every operation is one line, there's no
hidden state, no nesting, no implicit behavior. The AI reads line 14, sees
exactly what line 14 does, and fixes it. No theorizing about what `this`
refers to or which middleware ran first. The debugging surface area shrinks
from "the entire JavaScript ecosystem" to "the 30 lines you wrote."

**The alternative is the status quo.** AI writes JavaScript that looks right.
Human trusts it works. Discovers at 2am it doesn't. Spends the next session
debugging instead of building. Clear breaks that cycle.

## The Source of Truth Rule

**Clear is the source code. The compiled JS/Python is build output. You never edit the output.**

This is the most important architectural decision in Clear. It changes everything:

### The workflow
1. Write or edit Clear (human can read it, AI can write it)
2. Compile to JS/Python (deterministic, inspectable compiler)
3. Deploy the compiled output
4. Bug in production? **Go back to Clear**, fix it there, recompile

### Why this matters
If the compiled output has a bug, there are only two possible causes:
- **Bug in your Clear code** -- fix the Clear, recompile
- **Bug in the compiler** -- fix the compiler case, recompile, and *every app gets the fix*

This is the key insight: **the compiler accumulates quality**. Every time we fix
the WEBHOOK compiler case to handle Stripe edge cases correctly, every app that
uses `webhook` gets that fix for free on next compile. The compiler is a shared
library of production-hardened patterns.

### What this demands from the compiler
The compiler must generate **production-grade code**, not scaffolding. Nobody is
going in after to patch the output. That means:
- Generated Express code needs proper error handling, not just happy path
- Stripe integrations need idempotency, retry handling, error responses
- OAuth needs token storage, refresh flow, session management
- WebSocket needs heartbeats, reconnection, cleanup
- Every edge case must be handled *in the compiler*

### The GAN model for compiler evolution
The compiler gets better through adversarial use. The process:
1. Build a real app in Clear (e.g., rebuild Cast itself, build an ecom app)
2. Hit an edge case the compiler doesn't handle
3. Fix the compiler case to handle it
4. Every future app benefits from that fix

Each real app is a stress test. The compiler evolves by building things with it
and fixing what breaks -- like a GAN where the app is the discriminator and the
compiler is the generator. The discriminator keeps finding flaws, the generator
keeps getting better, until the output is indistinguishable from hand-written code.

### Never debug the compiled output directly
When something goes wrong at runtime, the debugging workflow is:
1. Read the error from the deployed JS/Python
2. Map it back to the Clear source (which line produced this code?)
3. Fix the Clear code, or fix the compiler if the generated code is wrong
4. Recompile and redeploy

If you find yourself editing `build/server.js` directly, something is wrong.
Either the Clear syntax can't express what you need (add syntax) or the compiler
generates bad code for that syntax (fix the compiler).

### 1:1 mapping -- no magic, explicit over implicit
Every line of compiled output must trace back to exactly one line of Clear.
No "super commands" that silently generate 50 lines of boilerplate. If the
compiled code does something, there's a Clear line that asked for it.

**Why:** If something breaks in the output and you can't point to the Clear
line that caused it, the source-of-truth model breaks down. You can't fix
what you can't see.

**What this means in practice:**
- `requires auth` generates an auth check. One line in, one check out.
- `validate incoming:` with 3 field rules generates 3 validation checks.
  Each check maps to the field rule that requested it.
- `checkout 'Pro Plan':` with 4 config lines generates a Stripe endpoint
  with those 4 settings. Not a full billing system with customer portal,
  webhook handling, and subscription management -- just what you wrote.

**What this forbids:**
- No implicit middleware injection (logging, CORS, etc.) unless explicitly requested
- No auto-generated routes beyond what the Clear source declares
- No "smart" defaults that add behavior the user didn't ask for
- No bundling multiple concerns into one keyword

If you need logging, write `log every request`. If you need CORS, write
`allow server to accept requests from frontend`. Every behavior is visible in the Clear source.

## Design Rules

### 1. The 14-Year-Old Test
The readability bar, not the audience. If a curious 14-year-old can read a Clear
program and understand what it does, the syntax is good. If they can't, simplify.

### 2. One Canonical Way (Python Philosophy)
There is one obvious way to write something. Silent aliases exist for flexibility,
but docs, examples, and AI-generated code always use the canonical form.

### 3. One Operation Per Line
Every computation gets a named intermediate variable. No nesting. No chaining.
Verbosity beats cleverness. Each line does one thing.

### 4. Words for Structure, Symbols for Math
Arithmetic uses symbols everyone knows: `+`, `-`, `*`, `/`, `=`.
Everything else uses English words. No curly braces, semicolons, arrows,
decorators, or symbolic shorthand for control flow.

### 4b. Explicit Over Terse
When there are two ways to write something — one shorter but ambiguous,
one longer but unambiguous — always choose the longer one as canonical.
`look up key in scope` is better than `scope at key` or `scope[key]`.
`set key in scope to value` is better than `scope[key] = value`.
The reader should never have to guess what a symbol or shorthand means.
Terse forms can exist as aliases, but docs and examples always show
the explicit version first.

### 5. No Jargon, No Magic Variables
Avoid CS terms: no "state", "computed", "body", "instance", "parameter",
"callback". Use words a 14-year-old knows: "create", "define", "send back".

**No implicit variables.** Everything must be declared or received explicitly.
No `self`, no `this`, no `incoming` appearing from nowhere. If a function
or endpoint receives data, the syntax must name it.

**Bad:**
```clear
when user calls POST /api/posts:
  save incoming as Post              # where did "incoming" come from?
```

**Good:**
```clear
when user sends post_data to /api/posts:
  define new_post as: save post_data as record in Posts table
```

`post_data` is named right in the verb phrase — "sends post_data to."
Every variable on every line was either defined with `define` or received with `receiving`.

### 5b. Every Statement Needs a Subject
Don't write dangling verbs. Who requires auth? What are we validating?

**Bad:**
```clear
requires auth                        # who requires it?
validate incoming:                   # what are we validating?
```

**Good:**
```clear
this endpoint requires auth
this endpoint requires admin role
validate post_data:                  # post_data was named in "receiving"
```

`this endpoint` is the subject. The reader always knows what's being acted on.

### 6. Never Name Variables the Same as Table Names
Variables and tables must be visually distinct. If you have a `Posts` table,
don't name a variable `posts` -- it's impossible to tell which is which.

**Bad:**
```clear
posts = look up all Posts        # which "posts" is the variable?
send back posts                  # ...and which is the table?
```

**Good:**
```clear
define all_posts as look up all records in Posts table
send back all_posts
```

Rules:
- Table names are capitalized: `Users`, `Posts`, `Orders`
- Variable names are lowercase with underscores: `all_posts`, `active_users`
- Use `define X as` for assignments, not bare `X =`
- CRUD reads say `records in X table`, not just `X`

### 7. Errors Teach, Not Scold
Every error message follows the WHY-WHAT pattern:
- WHY: What went wrong (what's missing or broken)
- WHAT: What to do about it (with an example)

"Clear doesn't know how many times to repeat — add 'times' after the number.
Example: repeat 5 times"

Never: "Expected 'times' after count"

### 8. Possessive Access, Not Dot Notation
`person's name` not `person.name`. Dot notation is a silent alias.
No chaining — use intermediate variables. One access per line.

### 9. Self-Indexing Functions
Math-style functions where the call signature IS the definition:
`total_value(item) = item's price * item's quantity`
When you see `total_value(order)` later, you can mentally substitute.

### 10. Colons Signal "Here Comes the Rest"
Colons appear in two places:
1. **Block opener:** `try:`, `repeat 5 times:` -- indented code follows
2. **After `as`:** `define total as: price + tax` -- the expression follows

The colon always means "here comes the important part." It's a visual pause
that separates the name/label from the value/body.

```clear
define all_posts as: look up all records in Posts table
define total as: price + tax
create a Users table:
  name, required
```

### 11. Deterministic Compilation
Same input always produces the same output. No AI in the compile step.
The compiler is a pure function: source text in, code out.

### 12. Dual Target
Programs compile to JavaScript, Python, or both from the same source.
`build for web`, `build for backend`, `build for both`.

### 12b. Feature Completeness with Target Languages
Clear must be able to express anything JavaScript or Python can express.
If a working programmer needs async, promises, generators, decorators,
or any other language feature to build a real app -- Clear needs a way
to do it. The syntax should be friendlier than the target language, but
the capability must be there.

**What this means in practice:**
- **Async/await** -- Clear already handles this invisibly (all I/O is
  synchronous-looking, the compiler emits `await`). But power users may
  need explicit control: parallel execution (`do all:`), timeouts,
  cancellation.
- **Promises / futures** -- `do all:` compiles to `Promise.all`. If someone
  needs `Promise.race` or deferred resolution, Clear needs syntax for it.
- **Error recovery patterns** -- `try:` + `if there's an error:` covers
  basic cases. Retry loops, circuit breakers, and fallback chains are
  real patterns that production apps need.
- **Streaming / iterators** -- SSE streaming exists (`stream:`). But
  processing large datasets lazily (generator-style) doesn't have syntax yet.
- **Type assertions** -- Clear infers types, but sometimes you need to say
  "this is a number" to a value that came from JSON or user input.

**The rule:** if you can't build it in Clear without `script:`, it's a
missing feature. The `script:` escape hatch exists for edge cases and
third-party integrations, not as a crutch for missing language capabilities.
Every `script:` block in a Clear app is a signal that the language has a gap.

**The process:** when a `script:` block is needed for something that feels
like a core programming concept (not a third-party API), design Clear syntax
for it. Phone test it. Add it to the compiler. Remove the `script:` block.

### 13. Type Inference for Tables -- Don't Make Users Say the Obvious
Table field types are inferred from context. Only specify when ambiguous.

```clear
create a Users table:
  name, required                    # -> text (default)
  email, required, unique           # -> text (default)
  score (number), default 0         # -> number (explicit, not obvious from name)
  role, default 'reader'            # -> text (default is a string)
  created_at, auto                  # -> timestamp (*_at name + auto)
  author                            # -> foreign key (capitalized = reference)
```

**Inference rules (in priority order):**
1. Explicit type in parens: `score (number)` -> number. Always wins.
2. `auto` modifier or name ends in `_at` -> timestamp
3. Default is a number (`default 0`) -> number
4. Default is a string (`default 'reader'`) -> text
5. Name is capitalized (`Author`) -> foreign key to that table
6. Name contains `_id` -> foreign key reference
7. Everything else -> text

**When inference is wrong:** the compiler tells you what it guessed and how to override:
"Clear thinks 'count' is text. If it's a number, write: `count (number)`"

**Why:** A 14-year-old creating a users table doesn't know what "text" or "varchar" means.
They know names are words and ages are numbers. The compiler should know that too.

### 14. Collection Operations -- Named, Not Generic
Clear uses named operations instead of generic higher-order functions.
A 14-year-old knows "sum of all prices" but not `.reduce((acc, val) => acc + val, 0)`.

**Map (transform each item):**
```clear
# JS: const names = users.map(u => u.name)
define all_names as each user's name in active_users
```

**Filter:**
```clear
# JS: const adults = users.filter(u => u.age >= 18)
define adults as records in Users where age is at least 18
```

**Reduce (aggregate):**
```clear
# JS: const total = prices.reduce((sum, p) => sum + p, 0)
define total_price as sum of all_prices

# Other aggregates
define biggest as max of all_scores
define average_age as avg of all_ages
define how_many as count of active_users
```

**Spread / Combine:**
```clear
# JS: const merged = { ...defaults, ...overrides }
define merged as combine defaults with overrides
```

**Destructure / Unpack:**
```clear
# JS: const { name, email } = user
define name as user's name
define email as user's email

# Or use possessive access directly -- no destructuring needed
send back user's name
```

Clear doesn't need destructuring syntax because possessive access (`user's name`)
already gives you direct field access. If you want a shorter name, use `define X as`.
One line, one operation, no hidden variable creation.

**First / Last / Rest:**
```clear
define first_item as first of items
define last_item as last of items
define remaining as rest of items
```

**Why named operations:** `map`, `filter`, `reduce` are CS jargon. `each...in`,
`where`, `sum of` are English. The compiler generates the same code either way,
but the Clear source reads like instructions, not code.

### 15. The Compiler Tests Everything -- Users Don't Secure Themselves

If the compiler can think of a test, it generates it. Every endpoint gets a
happy-path test, a validation test, and an auth test. Every button, input, and
display gets a presence test. Every CRUD resource gets a create-then-view flow
test and a create-then-delete flow test. Every agent gets a smoke test, an auth
test, and a guardrail test.

**The user never writes security tests.** The compiler knows every endpoint,
every table, every validation rule, every auth guard, every agent restriction.
It generates tests for all of them automatically. If a DELETE endpoint requires
login, the compiler generates "Deleting a todo requires login" without being
asked. If an agent has `block arguments matching 'drop|truncate'`, the compiler
generates a guardrail test.

**Test names read like English.** Not `POST /api/todos returns 201` -- that's
HTTP, not English. `Creating a new todo succeeds` -- that's what a human would
say. The compiler translates HTTP methods to verbs (POST = "Creating", GET =
"Viewing", DELETE = "Deleting") and endpoint paths to resource names
(`/api/todos` = "todo").

**Users can write tests too, in the same English:**
```clear
test 'full todo workflow':
  can user create a new todo with title is 'Buy groceries'
  does the todos list show 'Buy groceries'
  does deleting a todo require login
  can user create a todo without a title
```

The user never mentions an API path, an HTTP method, or a status code. They
describe what should happen in plain English, and the compiler resolves the
intent to the right endpoint.

**Why this matters:** Security is not optional. It's not a feature you remember
to add. It's not a checkbox in a dashboard. When the compiler generates a test
that says "Deleting a todo requires login" and that test passes, the app is
secure. When it fails, the app won't ship. The user doesn't have to think about
security -- the compiler thinks about it for them.

### 16. Smart Compiler, Forgetful AI

The LLM will forget things. It will hallucinate syntax. It will omit auth
checks, skip validation, use wrong field names, forget to handle errors. This
is not a bug to fix in the AI -- it's a permanent condition to design around.

**The compiler and the AI instructions must be smart enough that the LLM can
be stupid and forgetful.**

Every safety net belongs in the compiler, not in the prompt:
- Auth on destructive endpoints? **Compiler error**, not "remember to add auth."
- Input validation? **Compiler generates it** from the schema, not "don't forget to validate."
- Test coverage? **Compiler writes the tests**, not "make sure you test this."
- SQL injection? **Impossible by construction**, not "use parameterized queries."
- Mass assignment? **Auto-filtered**, not "only allow known fields."

Every convention belongs in AI-INSTRUCTIONS.md, not in the AI's memory:
- `=` for numbers, `is` for strings? **Written in the instructions**, not learned from examples.
- Single quotes canonical? **In the instructions.**
- `should` not `does`? **In the instructions.**
- Colon for field values? **In the instructions.**

The LLM reads AI-INSTRUCTIONS.md fresh every time. It doesn't remember last
session. It doesn't learn from mistakes. So make the instructions exhaustive
and make the compiler catch everything the instructions miss.

**The bar:** if you replaced Claude with the dumbest LLM that can follow
written instructions, would the compiled output still be secure, correct,
and tested? If yes, the system is working. If no, something important is
living in the AI's head instead of in the compiler or the docs.

## Productive Disagreement

Claude should push back when a syntax suggestion has a readability or consistency
problem. Don't just implement what's asked — say "here's why that might not work"
first. The user wants a collaborator, not a yes-machine. Flag conflicts, propose
alternatives, explain trade-offs. Then implement what's decided.

## AI Style Guide

See `AI-INSTRUCTIONS.md` for the full guide Claude follows when writing Clear code.
Key rules: `=` for numbers, `is` for strings. Single quotes canonical. Numbers
get px in styles. Name elements what they are (text input, dropdown, heading).

## Compiler Architecture (for Claude working on Clear itself)

### Unified compiler: one switch, not five
Adding a new node type requires exactly **two places**:
1. `compileNode(node, ctx)` in `compiler.js` — handles all node types
2. `exprToCode(expr, ctx)` in `compiler.js` — handles all expression types

The context object `ctx = { lang, indent, declared, stateVars, mode }` carries
everything needed for language-specific output. When `ctx.lang === 'python'`,
you get Python. When `ctx.stateVars` is set, variable refs emit `_state.x`.

### Five top-level paths (all use compileNode)
| Path | Function | ctx.lang | ctx.stateVars |
|------|----------|----------|---------------|
| Non-reactive JS | `compileToJS()` | js | null |
| Reactive JS | `compileToReactiveJS()` | js | Set of input vars |
| Backend JS | `compileToJSBackend()` | js | null |
| Backend Python | `compileToPythonBackend()` | python | null |
| HTML scaffold | `buildHTML()` | n/a (reads `node.ui`) | n/a |

The reactive compiler's structural logic (flatten, categorize, emit `_recompute`,
emit listeners) stays in `compileToReactiveJS`. Only per-node compilation
goes through `compileNode`.

### Parser-provided UI metadata
UI nodes (`ASK_FOR`, `DISPLAY`, `BUTTON`, `SECTION`, `CONTENT`) carry a `node.ui`
property set by the parser with pre-computed HTML metadata (tag, htmlType, id,
label, cssClass, choices). The HTML scaffold reads `node.ui` directly.

### Validation is separate
`validator.js` exports `validate(ast)` with three passes:
`validateForwardReferences`, `validateTypes`, `validateConfig`.
`compileProgram()` calls `validate()` then `compile()`.
`compile()` itself does no validation — it just generates code.

### Synonym table controls parsing
`synonyms.js` drives the tokenizer's greedy matching (longest-first).
Multi-word synonyms can steal tokens from shorter matches. When adding
synonyms, test both the multi-word form AND the first word solo.
Bump `SYNONYM_VERSION` when you change entries.

### Reserved words
`a`, `an`, and `the` are reserved article keywords. They cannot be used as
variable names. This is intentional — single-letter names are bad practice
in Clear. Other reserved words: `in`, `on`, `to`, `by`, `as`, `at`.

### The `text` keyword
`text` is a keyword (canonical: `content_text`) but only acts as a content
element when followed by a string literal. `text 'Hello'` = content element.
`text is join(words)` = variable assignment. This is handled by a
string-follows check in `parseBlock`, not a heuristic.

### Test utils
`testUtils.js` supports: `toBe`, `toEqual`, `toHaveLength`, `toContain`,
`toBeDefined`, `toBeUndefined`, `toBeTruthy`, `toBeFalsy`, `toBeGreaterThan`,
`toBeLessThan`, `toMatch`, and `.not` variants (`.not.toBe`, `.not.toContain`,
etc.).

## How Clear Helps Humans Edit

Clear code is readable enough that non-developers can make simple edits directly:

**Anyone can change a value:**
```
# Change tax rate from 8% to 10%
tax_rate = 0.10
```

**Anyone can change a label:**
```
# Change what the user sees
display total as dollars called 'Amount Due'
```

**Anyone can tweak business logic:**
```
# Add a discount rule
if total is greater than 100 then discount = total * 0.10
```

**What still needs AI help:** Complex function definitions, API endpoint logic,
database schemas, auth rules. But the human can READ those parts and verify
they're correct — even if they don't edit them directly. That's the trust layer.

## How Clear Helps AI Debug

**One operation per line = the error points to exactly one thing.**
If line 14 fails, line 14 does exactly one thing. No nested expressions.

**Named intermediates = every value is inspectable.**
Instead of `res.json(calculateTax(getPrice(req.body.item) * 1.08))` where
you can't tell which part failed, Clear has:
```
price = incoming's price
tax = price * 0.08
total = price + tax
send back total
```
Log every intermediate. "price was 100, tax was 8, total was 108 — bug is next step."

**The AI wrote it, so it knows the intent.**
When Claude writes Clear and later debugs it, the code reads exactly like the
intent. No gap between "what I meant" and "what the code says."

**The debugging workflow:**
```
Human: 'The tax calculation is wrong'
AI: reads main.clear, finds: tax = price * 0.08
AI: 'Tax is 8% of price. Should it be different?'
Human: 'It should be 8.25% in California'
AI: edits one line: tax = price * 0.0825
AI: recompiles, tests pass
```

### What AI fights when debugging JS/Python vs Clear

| Problem | JavaScript/Python | Clear |
|---------|------------------|-------|
| Implicit state | Closures, `this`, prototype chains, hoisted vars — AI has to track what's in scope and what mutated when | Every variable is named and assigned on its own line. Nothing is hidden. |
| Framework magic | SvelteKit's `$effect`, `$derived`, file-based routing — half the behavior is invisible | Compiles to vanilla code. What you see is what runs. |
| Nested expressions | `items.filter(i => i.active).map(i => i.price).reduce((a,b) => a+b, 0)` — which step broke? | One operation per line. If line 14 is wrong, the bug is on line 14. |
| CSS specificity | "Why isn't this style applying?" — 15 possible reasons | Flat style declarations. `padding = 16`. No cascade. |
| Async confusion | Promises, race conditions, stale closures, effects firing out of order | Each line runs after the previous. Top-to-bottom, always. |
| Type coercion | `'5' + 3 = '53'`, `null == undefined`, `[] == false` | No silent coercion. Error tells you the types don't match. |
| Circular imports | File A imports B which imports C which imports A — breaks at runtime | Compiler catches cycles: "helpers uses utils, utils uses helpers — break one." |
| Dependency hell | `npm install` pulls 847 packages, one updates, something breaks | Zero external dependencies. Runtime is one bundled file. No node_modules. |
| Works locally, breaks in prod | Missing env vars, wrong Node version, CORS not configured | Compiler validates all config exists before building. Fails at compile, not at 2am. |
| Changed one thing, 5 things broke | CSS change breaks layout 3 components away. Renamed var misses one reference. | Changes are local. No cascade. Compiler checks every reference. |

Every class of bug that makes AI debugging slow in traditional languages
simply doesn't exist in Clear. Not because the problems are simpler — because
the surface area for bugs is smaller and every value is visible.

### When Clear pays for itself
If you're building one app, the overhead of maintaining a language isn't worth it.
If you're building ten apps over the next year with AI, it pays for itself fast.
Each hour spent on Clear's infrastructure saves many hours of future debugging.

## The Canonical Example

This is what a complete Clear program looks like. 37 lines, full-stack todo app.
Read it once -- you understand the entire application.

```clear
build for web and javascript backend

# Database
database is local memory
create a Todos table:
  todo, required
  completed, default false
  created_at_date, auto

# Backend

# Accept requests from the browser
allow server to accept requests from frontend

# Print every request to the console for debugging
log every request

when user requests data from /api/todos:
  all_todos = get all Todos
  send back all_todos

when user sends post_data to /api/todos:
  validate post_data:
    todo is text, required, min 1, max 500
  new_todo = save post_data as new Todo
  send back new_todo with success message

when user deletes todo at /api/todos/:id:
  requires auth
  delete the Todo with this id
  send back 'deleted' with success message

# Frontend
page 'Todo App':
  on page load get todos from '/api/todos'
  heading 'Todos'
  'What needs to be done?' is a text input saved as a todo
  button 'Add':
    send todo as a new todo to '/api/todos'
    get todos from '/api/todos'
    todo is ''
  button 'Refresh':
    get todos from '/api/todos'
  display todos as table showing todo, completed
```

This compiles to 4 files: `server.js` (Express), `index.html` (DaisyUI),
`style.css` (fallback), and `clear-runtime/` (DB + auth). Run with `node server.js`.

Every line earns its place. No magic variables. No hidden state. No ceremony.
The reader knows what data exists, what the API does, and what the user sees.

## Canonical Vocabulary

### Values & Logic
| Concept | Canonical Syntax |
|---------|-----------------|
| Value (string/bool) | `name is 'Alice'` |
| Value (number) | `price = 9.99` |
| Calculation | `total = price + tax` |
| Object | `create person:` + indented fields |
| Property | `person's name` |
| Empty list | `tasks is an empty list` |
| One-liner function | `total_value(item) = item's price * item's quantity` |
| Block function | `define function greet(name):` |
| Loop (count) | `repeat 5 times:` |
| Loop (each) | `for each item in items list:` |
| Loop (while) | `while count is less than 10:` |
| Counter | `increase count by 1` |
| Conditional (inline) | `if x is 5 then show 'yes'` |
| Conditional (block) | `if x is 5:` + indented body + `otherwise:` |
| Add to list | `add new_item to items` |
| Checkbox check | `if gift_wrap is checked then ...` |
| Error handling | `try:` / `if there's an error:` |
| Module | `use 'helpers'` |
| Assignment (named) | `define total as: price + tax` |
| Collection (sum) | `define total as: sum of prices` |
| Collection (count) | `define how_many as: count of items` |
| Collection (map) | `define names as: each user's name in users` |
| Collection (first) | `define first_item as: first of items` |
| Component | `define component Card receiving title:` |

### Web UI
| Concept | Canonical Syntax |
|---------|-----------------|
| Web page | `page 'My App':` |
| Page with route | `page 'Home' at '/':` |
| Section | `section 'Details':` |
| Styled section | `section 'Info' with style card:` |
| Text input | `'Name' is a text input saved as a name` |
| Number input | `'Price' is a number input saved as a price` |
| Checkbox | `'Gift Wrap' is a checkbox` |
| Text area | `'Notes' is a text area saved as a note` |
| Dropdown | `'Color' is a dropdown with ['Red', 'Green']` |
| Display (auto-label) | `display subtotal as dollars` |
| Display (custom label) | `display tax as dollars called 'Sales Tax'` |
| Display table | `display todos as table showing name, status` |
| Table with actions | `display todos as table showing name, status with delete` |
| Button | `button 'Click Me':` |
| Send data | `send todo as a new todo to '/api/todos'` |
| Named fetch | `get todos from '/api/todos'` |
| On page load | `on page load get todos from '/api/todos'` |

### Content Elements
| Concept | Canonical Syntax |
|---------|-----------------|
| Heading | `heading 'Welcome'` |
| Subheading | `subheading 'Products'` |
| Text paragraph | `text 'Hello world'` |
| Bold text | `bold text 'Important'` |
| Italic text | `italic text 'A note'` |
| Small text | `small text 'Terms apply'` |
| Inline formatting | `text 'Normal *bold* and _italic_ text'` |
| Link | `link 'Learn more' to '/about'` |
| Divider | `divider` |

### Styling
| Concept | Canonical Syntax |
|---------|-----------------|
| Style block | `style card:` + indented properties |
| px values | `padding = 16px` |
| String values | `width is '100%'` |
| Responsive | `for_screen is 'small'` |

### Backend & Data
| Concept | Canonical Syntax |
|---------|-----------------|
| API endpoint (GET) | `when user requests data from /api/health:` |
| Endpoint with data (POST) | `when user sends post_data to /api/todos:` |
| Update endpoint (PUT) | `when user updates data at /api/todos/:id:` |
| Delete endpoint | `when user deletes todo at /api/todos/:id:` |
| API response | `send back all_todos` |
| Success response | `send back new_todo with success message` |
| Database | `database is local memory` |
| Data table | `create a Users table:` + field modifiers |
| Save (create) | `new_user = save user_data as new User` |
| Save (update) | `save update_data to Users` |
| Get all | `all_users = get all Users` |
| Look up one | `define user as: look up records in Users table where id is 5` |
| Delete by id | `delete the User with this id` |
| Auth guard | `requires auth` |
| Role guard | `requires role 'admin'` |
| Custom guard | `guard stock is greater than 0 or 'Out of stock'` |
| Authenticated caller | `define user_id as: caller's id` (canonical; `current user's id` still works) |
| Validate | `validate post_data:` + field rules |
| Data fetch | `data is fetch_data('https://...')` |
| Environment var | `api_key is env('API_KEY')` |

### Build & Test
| Concept | Canonical Syntax |
|---------|-----------------|
| Build (web only) | `build for web` |
| Build (web + backend) | `build for web and javascript backend` |
| Build (backend only) | `build for javascript backend` |
| Test block | `test 'addition works':` + indented body |
| Assertion | `expect result is 5` |
| Request logging | `log every request` |
| CORS | `allow server to accept requests from frontend` |
| Webhook | `webhook '/stripe/events' signed with env('SECRET'):` |
| Background job | `background 'cleanup':` + `runs every 1 hour` |
| Rate limit | `rate limit 10 per minute` |
| Database migration | `update database:` + `in Users table:` + `add X field` |
| Full-stack app | `build for web and javascript backend` |

---

## Rule 15: Meph Has Access to Everything

Meph (the Studio AI agent) should have tool access to everything in Studio:
templates, docs, source maps, terminal, data, API testing, screenshots. The only
things Meph cannot touch are the dark mode button, "New" (clearing the editor),
and "Load" (loading a template) — those are user-initiated actions only.

If a feature exists in the IDE, Meph should be able to use it as a tool. If it
can't, that's a gap to fix.

## Rule 16: Error Messages Are First-Class

Error messages aren't afterthoughts — they're features. Every compiler error should:

1. **Say what's wrong** in plain English (no jargon, no AST node names)
2. **Say where** with a clickable Clear line number
3. **Say how to fix it** with a concrete example of correct syntax
4. **Link to docs** — point to the SYNTAX.md or USER-GUIDE.md section that explains the feature
5. **Be one-click fixable** in Studio when the fix is unambiguous

Meph should love error messages. When Meph gets an error, it should contain
enough information to fix the bug without reading the source. The error IS
the debugging tool.

Bad: `Error: Unexpected token at line 5`
Good: `Line 5: 'send back' needs a value to return. Example: send back result — see Syntax Reference > Endpoints`

## Rule 17: Safety Properties Are Cross-Target

Any safety property Clear promises — timeouts, retries, bounded loops, depth caps, input validation, auth enforcement — must hold **in every compiled target**. Node, Python FastAPI, Cloudflare Workers, browser, and any future target ship with the same guarantee or the promise is hollow.

An author writes a single Clear program. The compiler decides which backend it lands on. If `ask claude` retries transient failures on Node but silently gives up on Workers, the same program has two different reliability profiles — and the author has no way to know which one their deployment got. That's a foot-gun by target-routing. Worse: the author can't even test it because their dev machine hits one path and production hits another.

**When adding or changing a runtime safety property:**
- Update every target's emission in the same commit (search `compiler.js` for every `_askAI` / `_ask_ai` / `_clearError` / equivalent helper variant, plus the Workers twins and the browser-proxy twins).
- If a target *can't* support the property (e.g. Workers has no `/tmp`), either find a target-native equivalent or document the gap explicitly in `intent.md` and surface a compile-time warning when that target is selected.
- Never leave a target behind with "we'll add it to Python later" — that's how the promise drifts.
- Tests assert the property in every target's emission, not just the most-used one.

The 14-year-old reader doesn't know what target their program compiles to. They don't read about Workers vs Node. They read `ask claude 'hi'` and trust that it hangs-gracefully and retries-transient-errors everywhere. Clear's job is to make that trust correct.

## Rule 18: Total by Default, Effects by Label

Clear's pure core is provably terminating. Every loop is bounded, every recursion is depth-capped, every external call has a timeout. A program that hangs is a compiler bug, not an author bug.

**What that means concretely:**

- `while cond:` compiles to an iteration-counted loop. Default cap 100 — tight on purpose, so a hallucinated infinite loop fails in milliseconds, not seconds. Override with `, max N times` when you legitimately iterate more (pagination, state machines). Beyond the cap the loop throws with a copy-pasteable fix hint — it does not silently run forever.
- A function that calls itself is wrapped in a depth counter. Default cap 1000, override with `max depth N`. Stack overflow becomes "recursed more than 1000 levels" — a legible error, not a V8 trace.
- `send email` wraps the SMTP call in a 30-second timeout by default. A frozen mail server can't hang the request. Override via `with timeout N seconds`.
- `ask claude`, `call api`, websocket subscribes, timers — every construct that talks to the world has a bound or a timeout. If a construct needs a new one, it gets one; the answer is never "authors should remember to add it."

The constructs that look unbounded are unbounded *by design*: endpoints serve requests forever, `subscribe to` keeps connections alive, `every N seconds` fires on a schedule. Those are servers. Running forever is their job. The distinction — "accidentally non-total" vs "intentionally long-lived" — is what the compiler tracks for you.

**Compiler-as-capital-investment.** Prevention compounds. Every foot-gun the compiler closes is one the author (human or AI) will never hit, across every future program, forever. Compute is cheap compared to the time a single hang costs a debug session. When in doubt, emit the counter, emit the timeout, emit the try/race. The 14-year-old shouldn't need to know what "total" means — they just need the compiler to refuse to emit a program that can hang.

**Authors can still override.** Totality is a property the compiler maintains *on the author's behalf*. If an author genuinely wants a million iterations or a 10-minute SMTP timeout, they say so in the Clear source. The default is never "no bound at all" — it's "a bound generous enough for real work, loud enough to catch bugs."

## Rule 19: English Tooling Beats Code Tooling — for Humans AND AI

Code is written once and read hundreds of times. Tooling that operates on code in English — code review, security audits, debugging, spelunking, "what does this even do?", incident response, onboarding, AI agents adding features to existing code — gets a force multiplier when the source IS English.

**Concretely:**
- A code reviewer reading a Clear PR understands intent in seconds. The same diff in TypeScript with framework conventions takes minutes.
- A security audit (OWASP class) finds vulnerabilities by reading. English source surfaces "validates input, then writes to DB" patterns that are obvious; the same TS code is buried in middleware chains and decorators.
- An AI agent extending a 6-month-old codebase has to understand it first. The agent's own context budget pays for the parsing. Plain-English source = cheaper context = lower agent cost per change.
- A non-engineer (PM, designer, ops, compliance officer) can read a Clear PR and contribute meaningful comments. They cannot read TS.
- The original author returning after 3 months reads their own code at full speed. With dense JS, every return costs re-parsing.

**The lifetime-cost math:** writing happens once. Reading + maintaining + auditing + extending happens forever. If reading drops 30-50%, total cost-of-ownership drops massively even when writing speed is identical. This is the wedge for AI-written codebases specifically — the agent writes fast, the team REVIEWS forever. English review beats AST review every time.

**This applies even when Clear isn't the primary language.** A polyglot codebase (Clear for business logic + TypeScript for everything else) still wins on the lifecycle slice that's in Clear. The pitch isn't "rewrite your stack." It's "use English where the lifetime-read-cost matters most."

**Don't confuse this with "no code allowed."** Clear compiles to JavaScript or Python. The COMPILED OUTPUT is code; reading IT is exactly as hard as reading any JS/Python. The English advantage applies to the SOURCE — the file the human or AI authored, edits, reviews. That's where the leverage is.

## Rule 20: Pragmatic Dependencies — Minimal but Not Religious

The compiler is zero-deps because that's the right call for a compiler — small, deterministic, portable, no supply-chain surface. **The compiler is the special case, not the model for the whole repo.** Studio (`playground/`), runtime helpers, and Clear Cloud's tenant store have different constraints and have always carried real deps: `bcryptjs`, `better-sqlite3`, `express`, and now `pg` + `pg-mem`.

**The rule:** every dep should justify itself against the alternatives. Adding `pg` to the cloud-tenants layer is justified — it's the canonical Postgres client, mature pool, used by every Node-on-Postgres shop. Hand-rolling a Postgres wire-protocol client to "stay zero-dep" would be a 6-month detour for negative value.

**The anti-pattern this rule kills:** "we're zero-deps" used as an excuse to reject every package, even ones that solve real problems for a few lines of cost. That's religion, not engineering. Pragmatic engineering says: each dep gets weighed against (a) the work to build it ourselves, (b) the supply-chain risk it adds, (c) the maintenance tax it introduces. When the math says "yes, this saves us 6 weeks for a 1MB install of well-tested code," we add it.

**The compiler stays zero-deps.** That bar is non-negotiable because the compiler is the load-bearing piece every customer's app rides on. The infra layer (Studio, Clear Cloud, tooling) is held to "minimal and justified," not "zero." Different rules for different surfaces.

## Rule 21: Syntax States What It Does — No Guessing

Every directive in Clear must unambiguously name what it does. The reader (human or AI) should never have to guess what a phrase compiles to. If a phrase has two plausible meanings, the syntax is wrong.

**The anti-pattern this rule kills:** cute-sounding but lying syntax. `database is local memory` is the canonical example — it sounds like an in-memory database, but compiles to SQLite-on-disk. Two readers will guess two different things and one will be wrong. The fix is to say what it actually is: `database is sqlite` for the SQLite case, `database is in memory` for the genuinely ephemeral case.

**How to write a directive that passes the no-guessing test:**
- Name the THING, not the metaphor. `database is sqlite` beats `database is local memory`.
- Name the SHAPE, not the host. `database is sqlite` is portable; `database is d1` couples the source to one host. The host belongs in the build target, not the directive — same source ships to Node + Cloudflare + Python by changing the target, not the source.
- When in doubt, write the phrase out loud to a 14-year-old. If they ask "what does that mean?", the syntax is failing the test.

**When two readers would guess differently, change the syntax.** Don't add a comment explaining what it does — the comment proves the syntax is wrong. The fix is always at the syntax level, not the doc level.

**This rule applies retroactively.** When we find a directive in Clear that lies about what it does (`local memory` was one), we deprecate it with a warning steering authors to the precise form. We do NOT keep the lying form because "people are used to it" — that's the same religion the dependencies rule kills.

## Rule 22: One Thought Per Line — No Expression Chaining

Rule 3 (One Operation Per Line) bans nested expressions and chaining at the AST level. Rule 22 sharpens it at the reading level: even when a line technically expresses one operation, if it crams multiple mental concepts into one breath, split it.

**The anti-pattern this rule kills:** lines that pass the "one operation" check but read as compound thoughts. The trigger case (2026-04-26) was the AI-call form `reply is ask claude to answer message with prompt 'be concise'`. That's one operation (one assignment, one AI call), but it forces the reader to track:

1. Assignment to `reply`
2. Verb chain — "ask claude to answer"
3. Data — `message`
4. Constraint — `with prompt 'X'`

Four mental concepts at once. The eye has to hold all four to understand what the line does. That's compound prose, not source code a 14-year-old can read.

**The split:**

```clear
give claude message with prompt: 'be concise'
send back claude's reply
```

Two lines, each one thought:
- "Hand the message to Claude with these instructions."
- "Send back what Claude said."

Reader processes one beat at a time. Cognitive load per line stays below the 14-year-old test bar.

**How to spot the violation in your own code:**

- Read the line out loud. If it has two `to`s, two prepositions back-to-back, or you have to take a breath in the middle — split it.
- Count the mental concepts. Assignment, verb, data, constraint = four. Three or more is usually a sign of chaining; split.
- "But it's one expression" is not a defense. Rule 3 already passed; Rule 22 is the next bar.

**What this rule allows:**

- Possessive access on the result of a previous line (`claude's reply`, `caller's id`). That's not chaining — it's reading a name that earned its place by being explicit about its source.
- Single-arg verbs with a data token (`send back claude's reply`, `display all_users`, `save record as new User`). One verb, one object — that's one thought.
- Optional named result with `as <name>` when the result is reused. Adds one concept (the name) and earns its place by being referenced again later. Not chaining.

**What this rule forbids:**

- Verb chains in the same expression as the call (`ask claude to <verb> <data>`). The verb belongs in the prompt string or in the call's name — not threaded through the assignment.
- Inline assignments inside other expressions (`send back ask claude '...' with X`). Either name the result on its own line, or have the call be the whole right-hand side of `send back` — never both ceremonies stacked.
- Multi-clause prepositional chains (`call API with X using Y as Z within W`). If you find yourself reaching for three+ qualifier words in one line, you have a structured argument — make it a block.

**When in doubt, the test is:** can a 14-year-old read this line out loud in one breath and explain what it does? If they pause, split.
