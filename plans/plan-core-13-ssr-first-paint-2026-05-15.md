# Plan: Core 13 First-Paint Data

## Phase Order

1. **Shared first-paint data fill for same-app reads.** This is the load-bearing piece. The 13 canonical apps mostly load their lists through `on page load get X from '/api/...'`, while the current first-paint path only covers direct table lookups in page bodies.
2. **Core 13 proof.** Add a regression test that checks every canonical app with same-app page-load reads gets first-paint state in the generated server.
3. **Main-suite wiring.** Make the first-paint tests run with the normal compiler test command, not as an orphan file.
4. **Docs and roadmap cleanup.** If this closes the roadmap SSR row, remove it from ROADMAP and make the current capability clear in FEATURES/FAQ.

## Scope

- Cover the 8 core templates and 5 Marcus templates named in project guidance.
- Keep the fix in the compiler, not in 13 app files.
- Prefetch only safe same-app `GET /api/...` reads with a named target.
- Skip browser-state URLs such as `/api/search?q={query}`.
- Keep the existing direct table lookup first-paint behavior.

## Red Team

- **Auth risk:** first-paint reads may need the visitor's session. Forward cookie and authorization headers from the incoming page request.
- **Failure risk:** if the same-app read fails, serve the page anyway. The existing browser load path still refreshes the data.
- **Recursion risk:** only prefetch `/api/...` URLs, never page routes.
- **Browser-state risk:** skip URLs with interpolation, because the server does not know browser state.
- **Double-load risk:** acceptable for this phase. First paint matters more than avoiding the follow-up refresh. A later pass can skip already-filled browser reads.

## Test Plan

- Add a failing fixture where a page loads records from a same-app read and prove the generated page route injects that target before first paint.
- Add the 13-app regression: each canonical app's static same-app page-load reads must appear in the first-paint fill.
- Import the SSR tests into the main compiler suite.
- Run:
  - `node ssr-default.test.js`
  - `node core-13-ssr-first-paint.test.js`
  - `node clear.test.js`
  - `node scripts\marcus-smoke.mjs`
  - `node scripts\cross-target-smoke.mjs --target=node`
