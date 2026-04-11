# Compiler Requests - Prioritized
P1=blocking P2=high friction P3=nice to have

---
## [P1-1] External HTTP Fetch ✅ DONE (pre-existing)
App: Daily HN News Digest Agent
Need: Fetch live data from external URL in endpoint or agent
Syntax: data = fetch from url
Status: Already implemented as EXTERNAL_FETCH node. `data = fetch from 'url'` works.

---
## [P1-2] Call Agent from Endpoint ✅ DONE (pre-existing)
App: Daily HN News Digest Agent
Need: Invoke a named agent from inside a backend route
Syntax: result = ask AgentName with input
Status: Already implemented as RUN_AGENT node. `result = ask AgentName with input` works.

---
## [P1-3] Async Background Jobs + Scheduling ✅ DONE
App: Daily HN News Digest Agent
Need: Run long AI task in background or on a daily schedule
Syntax: run in background / schedule daily at 8am
Status: Implemented as CRON node. `every day at 8am:` and `every 5 minutes:` compile to setInterval/setTimeout schedulers. Both JS and Python backends.

---
## [P2-1] Save Complex Nested Objects to Table ✅ DONE
App: Daily HN News Digest Agent
Need: Save arbitrary JSON (e.g. Claude response) to a table
Syntax: save result to Digests
Status: `_pick` auto-serializes nested objects to JSON strings for SQLite. `_revive` auto-parses JSON strings back on retrieval.

---
## [P2-2] fetch is a Reserved Word Collision
App: Daily HN News Digest Agent
Need: Use fetch as a variable name
Workaround: Renamed to hn_data, result etc.
Impact: MEDIUM - confusing for HTTP-heavy apps.
Status: Open — low priority, workaround exists.

---
## [P2-3] write_file Tool Limited to .clear Only ✅ DONE
App: Any app needing to write logs or markdown
Need: write_file should accept .md .json .txt etc
Status: Playground `write_file` tool now accepts `.md`, `.json`, `.txt`, `.csv`, `.html`, `.css`, `.js`, `.py`.

---
## [P3-1] run_command Multiline String Support ✅ DONE
App: Any app requiring file writes
Need: Multiline strings with quotes in node -e without silent crashes
Status: `run command:` with indented block joins lines with ` && `. Also: `result = run command 'cmd'` captures stdout.

---
## [P1-4] Compiler Error Messages Are Confidently Wrong ✅ DONE
**Priority:** P1
**App:** Any app using agents or advanced syntax
**Problem:** Compiler reinterprets unknown syntax as something else and reports confident but wrong errors.
**Status:** Keyword guard before bare-expression fallback in parseBlock. Unrecognized keywords get helpful hints (`call` → "did you mean: call api 'URL'?", `ask` → "did you mean: ask ai 'prompt'?"). `EXPRESSION_SAFE_KEYWORDS` whitelist prevents false positives on valid content-type words.
