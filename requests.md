# Compiler & Runtime Requests

## 2026-06-04 — `refresh X from '/api/...'` did not re-render `display X` — DONE 2026-06-04

**Fixed this session.** `refresh msgs from '/api/messages'` was parsed as bare
`refresh`, which threw away everything after it and compiled to
`window.location.reload()` — a full page reload, not a targeted list update. The
parser now detects the `refresh X from URL` form and emits the same
fetch-into-reactive-variable node that `get X from URL` already uses, so the
bound `show X as list` re-renders in place. Bare `refresh` / `refresh page` /
`reload page` still reload the page. Regression test in `clear.test.js`; all 8
core templates compile clean. (Original report lived in the other worktree's
requests.md — Basic AI Agent Demo, "Send Message" button.)

## 2026-04-28 — Components silently drop nav-section / nav-item children — DONE 2026-04-28

**Fixed in commit (this session).** Components now compile their HTML-only children (NAV_SECTION, NAV_ITEM, PAGE_HEADER, STAT_STRIP, STAT_CARD, TAB_STRIP, etc.) by routing them through the same buildHTML walker pages use. The component function returns the full HTML string with all children rendered. SHOW and CONTENT children still use the existing inline path so dynamic interpolation (`show user_name`) keeps working. Verified end-to-end via the preview tools: deal-desk's `DealDeskSidebar` component now renders 11 nav links + 3 section labels on every sub-page (was: only the heading).

Original bug report below for history.

---

**App:** apps/deal-desk/main.clear (also affects any app trying to share a sidebar across pages).

**What I needed:** define a sidebar once via `define component DealDeskSidebar:` and reference it from every page so nav persists across routes without 10x duplication.

**Proposed syntax:** what I wrote works fine syntactically:
```clear
define component DealDeskSidebar:
  heading 'Deal Desk'
  nav section 'Approvals':
    nav item 'Pending' to '/' with icon 'inbox'
    nav item 'Approved today' to '/approved' with icon 'check-circle-2'
  ...
```

**What actually happened:** the compiled `DealDeskSidebar()` JavaScript function returned ONLY `_html += '<h1>Deal Desk</h1>';` — every nav-section and nav-item child was silently dropped during component compile.

**Workaround used:** inlined the entire sidebar block into each of 10 sub-pages of deal-desk. ~250 lines of duplication. Working but ugly.

**Error hit:** none — silent drop. Compile passed, page rendered, sidebar appeared as just a heading. Caught only by accessibility-tree inspection in the preview tools (preview_snapshot).

**Impact:** medium. Components are advertised as the way to share UI across pages. If common UI primitives (nav-section, nav-item, app-shell presets, page header, stat strip, tab strip, charts) silently drop inside components, components are useless for the use case they should solve. Either:
- (a) Make components support nested nav-section / nav-item / shell primitives
- (b) Hard-error when a component body contains unsupported nodes (so no silent drops)

**Verification of the bug:**
- compiled HTML at `id="comp_0"` mount point is empty
- compiled JS function body is just `_html += '<h1>Deal Desk</h1>'`
- accessibility snapshot of /approved shows sidebar with only "Deal Desk" heading, no nav

**Related:** the proper fix Codex built in his stash (shell-page router, stash@{0} compiler.js around lines 13140-13220) hoists the sidebar into a shell page so each route's content swaps into an outlet. That bypasses components entirely. Once the shell router lands, the inline-sidebar duplication can be deleted.

---

## Request: Multi-line JSON body in `call api ... sending { ... }` -- DONE 2026-05-12

**Fixed in this session.** `call api` now parses inline method, bearer token, and multi-line `sending { ... }` JSON bodies in both assigned calls and standalone calls. The same parser path runs inside endpoints and scheduled jobs, so the LinkedIn scheduler shape now compiles to real POST requests with `Authorization: Bearer ...` and a `JSON.stringify(...)` body. Regression coverage lives in `clear.test.js` under `call api: generic HTTP requests`.

Original bug report below for history.

**App:** LinkedIn Post Scheduler
**What I needed:** Send a structured multi-key JSON payload to an external REST API inside both a regular endpoint and a background job (`every N minutes:`).

**Proposed syntax:**
```clear
call api 'https://api.linkedin.com/v2/ugcPosts' with method 'POST' with bearer linkedin_token sending {
  author: linkedin_urn,
  lifecycleState: 'PUBLISHED',
  shareText: post_content
}
```

**What actually happened:** Compiler errors on the closing `}`:
```
Line 82: Clear doesn't understand "}" in this position.
Line 103: Clear doesn't understand "}" in this position.
```
Single-line `sending { key: value }` may work but multi-line braced objects with multiple keys fail to parse.

**Workaround used:** None viable. Can't serialize to a string and pass as raw body. Can't return a structured object from a `define function` either (same nested literal problem). App is stuck — the LinkedIn API requires this exact payload shape.

**Error hit:** `Clear doesn't understand "}" in this position`

**Impact:** high. Any app that needs to call a real-world REST API (Stripe, Slack, LinkedIn, GitHub, etc.) will hit this. Those APIs universally require multi-key JSON bodies. Without multi-line `sending {}` support, `call api` is only useful for GET requests or trivial single-field POSTs. This blocks the entire "connect to external services" use case.
