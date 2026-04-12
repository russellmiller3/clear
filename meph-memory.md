# Meph Memory

Persistent memory for Mephistopheles. One line per entry, tagged by category.
Categories: [pref] [quirk] [pattern] [fix] [gap] [context]

---

[context] Russell Miller, SF, laid off Dec 2025, job hunting. Wife Jess. Has Mito disease - low energy.
[pref] Russell likes systematic sweeps — test everything, file bugs as you go
[pref] Russell wants affordances (tooling wishlist) filed alongside bugs
[tool] edit_file now works with append/insert/replace/read/overwrite — USE THIS instead of read-reconstruct-overwrite
[tool] ALWAYS use edit_file append to add to requests.md — never overwrite the whole file
[tool] read requests.md with edit_file read before filing to avoid duplicates
[quirk] _revive is not defined — crashes ALL GET endpoints and login. P0 blocker. Already filed.
[quirk] Conditionals compile with empty JS bodies — already filed
[quirk] Preview panel renders blank — already filed
[quirk] show alert → console.log(alert) — broken, already filed
[quirk] text keyword broken inside for each loops — already filed
[quirk] display as list → stringified object, not actual list — already filed
[quirk] post to in button handler compiles to post_to (undefined) — already filed
[quirk] Agent returns empty {} — already filed
[quirk] Agent code leaks into frontend _recompute() — security issue, already filed
[quirk] Workflow output is black box — returns nothing meaningful, already filed
[quirk] Workflow leaks to frontend JS — already filed
[gap] Workflow step progress not visible — no way to inspect which step ran
[gap] Agent debug mode not implemented
[gap] Template scaffolding not implemented
[pattern] POST/PUT/DELETE all work fine. Only GET is broken (_revive crash).
[pattern] Server-side things (agents, workflows) leak into frontend _recompute() consistently
[quirk] Policy guards leak into frontend _recompute() — security hole, filed
[quirk] Policy guards re-registered on every _recompute() call — memory leak, filed
[quirk] protect tables blocks ALL ops including reads — unusable, filed
[pattern] Anything server-side (policies, agents, workflows) leaks into frontend _recompute() — systemic compiler bug
[quirk] app_layout uses h-screen overflow-hidden — page_hero and page_section placed after it get clipped silently. Don't mix them in the same page without care.
[pattern] styles compile correctly and produce valid Tailwind/DaisyUI classes — style system is one of the healthier parts of Clear

[quirk] PYTHON: DELETE endpoint ignores :id — deletes entire table. db.remove("tasks") with no filter. CRITICAL, filed.
[quirk] PYTHON: requires auth compiles to hasattr(request, 'user') — always False in FastAPI, 401 on every request. CRITICAL, filed.
[quirk] PYTHON: run_app tool doesn't support FastAPI/uvicorn — Python backend is untestable at runtime. HIGH, filed.
[pattern] PYTHON: GET works fine (no _revive issue). POST works. DELETE nukes table. Auth broken. Runtime untestable.
[pattern] JS vs Python: JS breaks on GET (_revive). Python breaks on DELETE (no filter) and auth (wrong check).
[quirk] PYTHON: workflow state dict uses unquoted keys — NameError at runtime. CRITICAL, filed.
[quirk] PYTHON: workflow passes entire state to agent instead of relevant field. CRITICAL, filed.
[quirk] PYTHON: agents compile as async generators but called with await — type mismatch. CRITICAL, filed.
[quirk] PYTHON: send back scalar (string/number) → raw return, not dict — FastAPI rejects it. HIGH, filed.
[gap] PYTHON: workflow not listed in architecture diagram comments — filed as LOW
[gap] Need streaming vs non-streaming toggle for agents — filed as affordance request
[pref] Russell wants priority tiers in requests.md — maintain TIER 1/2/3 summary table at top, update it with every new bug filed
[pattern] Priority tiers: TIER 1 = nothing works without fix, TIER 2 = major feature broken, TIER 3 = annoying but workable
[rule] Ross Perot rule: just fix it, tell Russell what you did and why, never ask permission for obvious next steps
[rule] Full audit rule: when verifying bug reports, COMPILE each test case fresh, capture EXACT output verbatim — never describe from memory
[rule] Failing test rule: every bug entry in requests.md must include a failing test block with exact Clear code to reproduce

[status] Full requests.md audit complete. All entries have real compiled output (not from memory). Tier table rebuilt: 15 TIER 1 blockers, 12 TIER 2 gaps, 10 TIER 3 QOL. File is 1482 lines.
[gap] Charts (both targets) — no library imported, compiles to empty canvas. Filed TIER 2.
[gap] DB relationships (both targets) — belongs to ignored, no JOIN. Filed TIER 2.
[gap] External APIs (both targets) — fetch from compiles to undefined. Filed TIER 2.
[gap] Python PUT — :id not extracted from URL. Filed TIER 1.
[gap] Workflow step agents never defined at runtime — ReferenceError. Filed TIER 1.
[rule] Ross Perot rule: just fix it, tell Russell what I did, don't ask permission.
[rule] Every bug entry needs: priority, failing test (compilable Clear), REAL compiled output (not from memory), expected output, exact error, workaround, impact.
[rule] After every new bug entry, update the tier table at top of requests.md.
[test] edit_file append works — confirmed in session after tool failure