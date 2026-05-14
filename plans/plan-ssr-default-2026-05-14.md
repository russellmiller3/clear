# Plan — SSR by Default

**Date:** 2026-05-14
**Scope:** Make server-side data rendering the default behavior for Clear apps. Fix all 8 core templates. Add `fetch this data in the browser, not from the server` opt-out for genuinely client-only data.

---

## Problem statement (plain English)

When a Clear app loads today, the first thing the user sees is "0" in every stat card, blank tables, and empty charts. Then ~500ms later the JavaScript catches up, fetches the data, and the real values pop in. This is the "0 flash."

Russell saw it on Lenat-clear's Today page: stat cards show "0 logs in the last week" for half a second before the real `energy_logs.length` arrives. It looks broken even though it isn't.

The fix is **SSR by default**: the server runs the page's data queries BEFORE sending HTML, bakes the results into the response, and the user sees real data on first paint. Everywhere data flow goes through `define X as: look up records in Y`, the server pre-fetches and embeds.

For genuinely client-only data (browser geolocation, IndexedDB, real-time sockets, time zone), an opt-out directive keeps the current CSR behavior:

```
define current_position as: ask the browser for geolocation
  fetch this data in the browser, not from the server
```

---

## Current state (verified 2026-05-14)

Clear is **CSR-only**. The server registers `app.get('/route', (req, res) => res.sendFile('index.html'))` for every route. Same static index.html every time. The page's `define` blocks compile to `_state.X = await fetch(...)` in the reactive runtime and fill template placeholders on `_recompute()`.

`compiler.js:15119` confirms: *"data already fetched by the global `on page load:` block."*

The current behavior is documented and intentional but visibly costs UX on first paint.

---

## Design — Phase 1: Minimum viable SSR

**Goal:** Server bakes initial state into HTML at request time. Reactive runtime hydrates from the baked state instead of fetching on load.

### 1. Parser — opt-out directive

`fetch this data in the browser, not from the server` parses as a modifier on a `CRUD` node (or `LOOK_UP` more broadly). Three accepted forms:

```clear
# Single-line trailing modifier
define X as: look up records in Y, fetch this data in the browser, not from the server

# Next-line marker (indented under the define)
define X as: look up records in Y
  fetch this data in the browser, not from the server

# Block form for multiple defines (later, if useful)
fetch in browser only:
  define X as: look up records in Y
  define Z as: look up records in W
```

Parser sets `node.clientOnly = true` on the affected CRUD/define. Validator rejects if the modifier appears outside an app/page/pane context.

### 2. Compiler — server-side fetch in route handler

For each `app`/`page`/`pane` that contains `define` blocks (CRUD or look-up shape), the compiled Express route handler now does:

```js
app.get('/route', async (req, res) => {
  const initialState = {};
  initialState.energy_logs = await db.findAll('records', { concept_id: 'ENERGY_LOG' });
  initialState.mood_logs = await db.findAll('records', { concept_id: 'MOOD_LOG' });
  // Skip defines marked clientOnly
  const html = await renderShell(initialState);
  res.send(html);
});
```

The fetcher is generated from the same AST that compiles to the client-side `_state.X = await fetch(...)` today. They share their query, but the server form goes directly to `db.findAll` while the client form goes to `/api/...`.

### 3. HTML emit — template substitution + initial-state script

Two strategies, picking the second:

**(a) Template substitution.** Walk the HTML, find every `data-clear-tpl="{expr}"`, evaluate `expr` against `initialState` on the server, replace placeholder content. **Pros:** zero flash, even before JS runs. **Cons:** server reimplements the template engine; complex expressions (`X.length`, `X.field`, `X.filter(...)`) need a sandbox.

**(b) Initial state preload.** Server injects `<script>window.__CLEAR_INITIAL_STATE__ = {...};</script>` at the top of `<body>`. Runtime checks for it on init, uses it instead of fetching, fills templates synchronously before the browser paints content. **Pros:** simple, no new expression evaluator. **Cons:** there's still a sub-frame flash if the browser paints the HTML before the inline script runs (browsers may skip this in practice for scripts that come before content).

**Decision:** Phase 1 ships strategy (b). Strategy (a) is a Phase 2 polish if the flash is still visible in practice.

### 4. Runtime — hydration check

The reactive runtime's `_initialFetch` step checks `window.__CLEAR_INITIAL_STATE__` before firing any fetches. If present, copies into `_state`, fires one `_recompute()` synchronously, then transitions to live-update mode. If absent (e.g. on a route the server didn't SSR), falls back to current behavior.

### 5. Opt-out behavior

A define marked `clientOnly: true`:
- Skipped in the server-side fetcher (no `initialState.X = await db.findAll(...)`)
- Compiled to its current client-side fetch (no change)
- Runtime still fetches it on init

This preserves real-time data, browser-state data, and anything that can't be server-fetched safely.

---

## Phase 2: Verify 8 core templates

Each template gets:
1. Compile cleanly (no new errors/warnings)
2. Run `clear serve` and verify HTML response contains baked-in data
3. Run end-to-end browser smoke (data on first paint, no flash)
4. Run the template's existing test if it has one

**Templates (per CLAUDE.md):**
1. `todo-fullstack` — CRUD, expect baked todo list on /
2. `crm-pro` — multi-table dashboard, expect baked metrics + charts
3. `blog-fullstack` — `belongs to`, expect baked posts
4. `live-chat` — WebSocket-driven; opt-out chat history (real-time data)
5. `helpdesk-agent` — agent-driven; opt-out conversations
6. `booking` — workflow + relationships, expect baked schedule
7. `expense-tracker` — CRUD + charts, expect baked totals
8. `ecom-agent` — RAG products list — bake products, opt-out chat

For each template that breaks, fix at the compiler level (not at the template level). The compiler-accumulates-quality principle: one fix benefits every future app.

---

## Phase 3: Doc cascade

11-surface cascade per CLAUDE.md:
- `intent.md` — new modifier on CRUD nodes (`clientOnly` flag) + server-fetch emit spec
- `SYNTAX.md` — `fetch this data in the browser, not from the server` reference
- `AI-INSTRUCTIONS.md` — guidance: when to use opt-out (real-time, browser state, auth-scoped fetches)
- `USER-GUIDE.md` — section on data fetching, opt-out example
- `ROADMAP.md` — mark SSR-default phase complete
- `landing/*.html` — update any code examples that imply CSR-only
- `playground/system-prompt.md` — Meph should know about the opt-out directive
- `FAQ.md` — "Why does my data show 0 for a moment?" → "It doesn't anymore; SSR fixed it" / "How do I keep client-only behavior?"
- `RESEARCH.md` — flywheel implications (first-paint metrics matter for the regulated-tier pitch)
- `FEATURES.md` — "Data renders on first paint by default" entry
- `CHANGELOG.md` — session entry

---

## Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Server-side fetch needs auth context | HIGH | Use `req` session/cookies to scope the fetch — same way endpoints already do |
| Template `data-clear-tpl` expressions can't be evaluated server-side | MEDIUM | Phase 1 ships strategy (b) which doesn't evaluate templates server-side; only state preload |
| Multi-tenant apps must scope per request | HIGH | Use existing tenant-filter pattern in server fetch; defense-in-depth via RLS already exists |
| WebSocket-driven apps can't SSR everything | MEDIUM | Opt-out directive covers this exact case |
| Performance regression on big tables | MEDIUM | Server-side fetch is one DB hit per route load; same as before but on the server. Add pagination limit if it's >50 rows |
| Cache poisoning (per-user data baked into shared cache) | HIGH | All SSR responses include `Cache-Control: private`. Server already does this for auth'd responses |

---

## Phase order (load-bearing)

| Phase | What | Gate |
|---|---|---|
| 1 | Parser opt-out directive | New unit tests pass |
| 2 | Compiler server-side fetcher | Lenat-clear renders data on first paint, no flash |
| 3 | HTML emit + initial-state script | Browser smoke confirms `window.__CLEAR_INITIAL_STATE__` populated |
| 4 | Runtime hydration | Runtime uses initial state, no double-fetch on load |
| 5 | Template verification (todo, crm, blog) | Each compiles + serves data on first paint |
| 6 | Template verification (live-chat, helpdesk, ecom) | Real-time tracks behave correctly (opt-out where needed) |
| 7 | Template verification (booking, expense-tracker) | Final 2 templates clean |
| 8 | Doc cascade | All 11 surfaces updated |
| 9 | Pre-push test gate + ship | Full Playwright + Meph eval green |

---

## Time estimate (AI-time, per ~/.claude/CLAUDE.md calibration table)

| Phase | LOC | AI-time |
|---|---|---|
| 1 | 50-100 | 1-2 min |
| 2 | 250-400 | 5-10 min |
| 3 | 100-150 | 2-4 min |
| 4 | 80-120 | 2-3 min |
| 5-7 | 50-150 per template × 8 | ~15-30 min total (most templates need 0 LOC) |
| 8 | 100-200 (docs) | 5-10 min |
| 9 | 0 | 3-5 min (pre-push gate) |

**Total: 35-65 minutes of focused work, ONE session.** Higher than a "small fix"; this is a structural compiler change. Per the Hardest-First rule, Phase 1 sets the structure for all downstream work — if it's wrong, everything else is wrong.

---

## When to do this

**NOT in the current session** (2026-05-14 late): Russell is in his 3rd hour of focused work; this is a session-sized chunk that deserves a fresh start.

**Next session's #1 priority.** Cut a fresh branch off main (which is already 73 commits ahead of origin including the sidebar primitive), follow the phase order above, ship.
