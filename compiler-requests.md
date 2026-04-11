# Compiler Requests - Prioritized
P1=blocking P2=high friction P3=nice to have

---
## [P1-1] External HTTP Fetch
App: Daily HN News Digest Agent
Need: Fetch live data from external URL in endpoint or agent
Syntax: data = fetch from url
Workaround: None - blocked
Impact: HIGH - agents are blind without this. Every real agent needs external data.

---
## [P1-2] Call Agent from Endpoint
App: Daily HN News Digest Agent
Need: Invoke a named agent from inside a backend route
Syntax: result = ask AgentName with input
Workaround: None - compiler errors
Impact: HIGH - agents defined but unreachable from routes. Useless in isolation.

---
## [P1-3] Async Background Jobs + Scheduling
App: Daily HN News Digest Agent
Need: Run long AI task in background or on a daily schedule
Syntax: run in background / schedule daily at 8am
Workaround: None - HTTP timeout before Claude responds
Impact: HIGH - blocks all AI agent use cases. Agent with no schedule = just a button.

---
## [P2-1] Save Complex Nested Objects to Table
App: Daily HN News Digest Agent
Need: Save arbitrary JSON (e.g. Claude response) to a table
Syntax: save result to Digests
Workaround: None - fails on nested shapes
Impact: HIGH - AI responses are always rich objects not flat rows.

---
## [P2-2] fetch is a Reserved Word Collision
App: Daily HN News Digest Agent
Need: Use fetch as a variable name
Workaround: Renamed to hn_data, result etc.
Impact: MEDIUM - confusing for HTTP-heavy apps.

---
## [P2-3] write_file Tool Limited to .clear Only
App: Any app needing to write logs or markdown
Need: write_file should accept .md .json .txt etc
Workaround: node -e with fs.appendFileSync but multiline strings with quotes crash silently
Impact: MEDIUM - blocked gap logging, wasted many tool calls.

---
## [P3-1] run_command Multiline String Support
App: Any app requiring file writes
Need: Multiline strings with quotes in node -e without silent crashes
Workaround: Array join trick to avoid quote conflicts
Impact: LOW - painful but workable.
---
## [P1-4] Compiler Error Messages Are Confidently Wrong
**Priority:** P1
**App:** Any app using agents or advanced syntax
**Problem:** Compiler reinterprets unknown syntax as something else and reports confident but wrong errors.

Real examples from HN Digest build:

Line: call external url HN_URL
Error given: You used call on line 10 but it has not been created yet
Reality: valid syntax - parser failed silently and treated call as a variable

Line: ask HNDigestAgent with topic
Error given: Did you mean add? ask looks like a typo
Reality: agent invocation from endpoint - compiler had no idea, guessed wrong

**Why P1:**
Confidently wrong is worse than vague. Vague = you know youre lost. Confidently wrong = you debug the wrong thing for an hour. For Claude writing Clear this is catastrophic - cannot distinguish syntax error from unimplemented feature from runtime bug. Multiplies debug time 5x and defeats the 10x value prop.

**Good error format:**
- Line 10: unrecognized syntax near call - did you mean: call api URL?
- Line 20: ask AgentName from endpoint - not yet supported

**Proposed fix:**
1. Every spec construct gets a parser rule
2. No rule match = unrecognized syntax near X - not a confident misdiagnosis
3. Feature flag table: IMPLEMENTED / PARTIAL / PLANNED per construct
4. PARTIAL or PLANNED = error says so explicitly

**Workaround:** None. Trial and error guessing.
**Impact:** HIGH - tax on every debug session. Brutal for low-energy users.
