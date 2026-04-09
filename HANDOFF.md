# Handoff — 2026-04-09

## Current State
- **Branch:** main
- **Last commit:** `976c1bc` Switch web tools to Anthropic native server tools
- **Working tree:** Clean (untracked scratch files only)

## What Was Done This Session
- Fixed `owner` parser bug — field named `owner` silently dropped from data_shape by RLS check. Fix: only treat as RLS if `can` keyword also present.
- Curated 7 featured playground templates (server allowlist), all compile 0 errors.
- Added web search + fetch via Anthropic native server tools (`web_search_20250305`, `web_fetch_20250910`) — no Brave key needed. Toggle in chat header (being moved below chat box).
- Validator narrowed: bare `owner` no longer triggers "needs auth" warning.
- 1489 compiler tests passing.

## What's In Progress
**GAN UI quality pass — not started.** Compiled app output looks amateurish. Design gap analysis complete; fixes identified but not implemented.

## Key Decisions Made
- **GAN method is mandatory** (per CLAUDE.md): fetch reference → static HTML mock → update compiler until output matches → screenshot to compare.
- **No arbitrary CSS in Clear language.** Fix is better presets, not more syntax.
- **Anthropic native server tools** replace any custom fetch/search. No external API keys.
- **Chat history**: No for now. Add when there are real users.

## The 5 CSS Gaps to Fix (in priority order)

| # | Element | Current | Target |
|---|---------|---------|--------|
| 1 | **Tables** | No zebra, no header bg, harsh borders | `bg-base-200` thead, `bg-base-300/5` odd rows, `border-base-300/20` |
| 2 | **Cards** | `border-base-300` harsh, no shadow | `border-base-300/40 shadow-sm` |
| 3 | **Buttons** | Every button `btn-primary` (all yelling) | Primary CTA only; secondary → `btn-outline`; dismiss → `btn-ghost` |
| 4 | **Hero type** | `font-extrabold` weight 900 | `font-bold` 700, `text-5xl` not `text-6xl` |
| 5 | **Sidebar** | `w-60` 240px — legacy SAP feel | `w-52` 208px, tighter item padding |

## GAN Workflow (repeat for each gap)
1. `WebFetch` a reference (linear.app, vercel.com, stripe.com/docs/dashboard)
2. Build static HTML mock in `apps/gan-mocks/[element].html`
3. Screenshot the mock
4. Edit `compiler.js` to produce matching output
5. Compile `team-dashboard`, screenshot, compare
6. `node clear.test.js` — must stay 1489 ✅
7. `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js`
8. Commit each fix

## Key File Locations
| File | What's there |
|------|-------------|
| `compiler.js` | `BUILTIN_PRESET_CLASSES` ~line 6560; table HTML ~5472; button class ~5501; hero ~5532 |
| `design-system.md` | Color tokens, shadow tokens, spacing |
| `apps/team-dashboard/main.clear` | Reference template to compile+screenshot during GAN |
| `apps/gan-mocks/` | Write static HTML mocks here |
| `playground/server.js` | WEB_TOOLS lines 459-470; SSE parser for server_tool_use lines 680-690 |
| `playground/system-prompt.md` | Needs section added about when to use web_search / web_fetch |

## Resume Prompt
> Read HANDOFF.md and continue the GAN UI quality pass. Goal: make Clear's compiled app output look as professional as Linear, Vercel, and Stripe. Design gap analysis is done — 5 fixes in the handoff. Use GAN method: WebFetch reference → static HTML mock → update compiler.js → screenshot both to verify. Start with tables (biggest impact), then cards, buttons, hero, sidebar. `node clear.test.js` must stay 1489 after every change. Rebuild bundle after compiler changes. Commit each fix. Playground runs at localhost:3456.
