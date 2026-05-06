# Meph Optimal Setup — Research-Based Recommendations

**Author:** Claude (research agent)
**Date:** 2026-05-06
**Scope:** Research only — no test runs, no API spend, no code edits.
**Question:** Is the current Meph setup optimal across (1) the system prompt, (2) reference docs reachable via `read_file`, (3) shape-search retrieval?

---

## TL;DR

- **The system prompt is too big.** ~18-20K tokens (1,555 lines). Anthropic's own Claude Code budgets ~2.5K for the prompt and ~14-17K for tools. Meph is putting reference content where Anthropic puts tools. Independent evidence (Chroma "Context Rot," Liu et al "Lost in the Middle") shows accuracy degrades sharply once the prompt grows past a few thousand tokens — sometimes 30%+ on information buried in the middle.
- **The biggest wins are structural, not stylistic.** Move ~70% of the system prompt content (the OWASP block, audit-trail section, the AI agent reference, styling presets, the SVG kitchen-sink, the long workflow / queue / route sections) OUT of the system prompt and INTO either retrievable reference docs or short on-demand tool descriptions. Keep the persona, the 12-rule cheat sheet, the tool list, the hint-tagging reflex, and TDD workflow in the prompt.
- **Add a shape-search teaser to the system prompt that doesn't currently mention it at all.** Right now Meph has no instruction about when to fire the shape-search tool, so retrieval underperforms. The current "What You Can Read" section names the docs but doesn't teach the trigger. Three lines fix this.
- **My #1 recommendation: chop the system prompt to ~5K tokens (the persona, the 12-rule cheat sheet, the tool list, hint-tagging reflex, TDD loop, file structure stub, "where to look up X" map).** Move OWASP details, AI-agent syntax, queue/route/policy reference, styling presets, and SVG examples to retrievable docs Meph reads on demand. Expected effect: 60-70% smaller prompt, sharper attention on the rules that fire every turn, faster cache reads, fewer "did Meph forget X" failures.

---

## Current state — what we have today

**The Meph system prompt (`studio/system-prompt.md`)** — 1,555 lines, 13,555 words, **~18-20K tokens** at typical 1.3-1.5 tokens/word. 71 second-level sections. 172 mentions of tool names. This is roughly **8x larger than Claude Code's own ~2.5K-token system prompt** and overlaps heavily with what Claude Code puts in tool definitions instead. Content covers seven distinct audiences mixed together:

- **Persona / role** (~50 lines): "You are Meph", role definition, what you can/can't write.
- **Security cheat sheet** (~150 lines): OWASP Top 10 primitives, audit trail, sensitive fields, rate limit, secrets linter — full reference, not a teaser.
- **12-rule canonical syntax cheat sheet** (~50 lines): the highest-leverage block — fires every turn.
- **Tool descriptions** (~150 lines): every Studio tool with usage, observation, and "fix this bug" workflow.
- **Workflow / TDD discipline** (~80 lines): red-green-refactor, full autonomous loop, hint-applied tag reflex.
- **Reference content** (~700 lines, the bulk): file structure, auth, tenant scope, per-row creator filter, concurrency, hidden fields, pagination, build targets, AI agents, multi-agent orchestration, evals, workflows, routing, approval queues, policies, styles preset reference, web tools, requests.md format, output formatting (incl. a kitchen-sink SVG example).
- **Auth + URL-param + variable-naming gotchas** (~150 lines): the auth-rule reminder, retrieval verbs, `this X`, tokenizer-collision word table.

Audience: instruction (telling Meph what to do) is mixed with reference (showing all the syntax) and example (canonical patterns). One file owns all three roles.

**Reference docs reachable via `read_file`:**
- **`SYNTAX.md`** (3,728 lines): complete syntax reference. Audience: reference. Pure example-driven. ~80+ second-level sections from Values & Variables to Streaming AI Responses.
- **`AI-INSTRUCTIONS.md`** (3,727 lines): how-to-write conventions. Audience: instruction + reference. Heavy overlap with the system prompt's reference sections (auth rule, OWASP block, queue/route reference all appear in both files).
- **`USER-GUIDE.md`** (4,486 lines): tutorial (Chapter 1–24). Audience: end-user / human reader, not Meph.
- **`FAQ.md`** (1,720 lines): "where does X live" / "why did we Z" — high-leverage for debugging.
- **`FEATURES.md`** (682 lines): forward-looking capability inventory.

Total reachable corpus: **~14,300 lines** that Meph CAN read but generally doesn't unless instructed.

**Shape-search retrieval:** semantic search over canonical Clear examples. **NOT mentioned in the current system prompt at all** — zero instructions on when to fire it, what it returns, or how to use the result. This is a gap.

The HINT_APPLIED tagging reflex IS in the prompt, but that fires on compile errors, not on shape search — different mechanism.

---

## Best-practice findings (with citations)

### Finding 1 — System prompts perform best when small and focused

**Anthropic's own guidance:** "Good context engineering means finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome." Two failure modes are explicitly named: hardcoding brittle complex logic, and being so vague the model has no signal. ([Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

**Confirmed empirically:** Claude Code itself splits content as ~2.5K system prompt + ~14-17K tool definitions. The system prompt is identity + workflow + safety + tone. Tool descriptions hold the heavyweight reference. ([How Claude Code Builds a System Prompt — Drew Breunig, 2026](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html); [Inside Claude Code's System Prompt](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt))

**Confidence: STRONG** (3 unrelated sources — Anthropic primary + two independent reverse-engineering analyses).

### Finding 2 — Lost-in-the-middle: information at positions 5-50% of a long prompt is recalled WORSE than information at start or end, sometimes by 30%+

**The original paper:** "performance is often highest when relevant information occurs at the beginning or end of the input context, and significantly degrades when models must access relevant information in the middle of long contexts, even for explicitly long-context models." ([Liu et al. 2023, "Lost in the Middle"](https://arxiv.org/abs/2307.03172); [TACL 2024 version](https://aclanthology.org/2024.tacl-1.9/))

**Confirmed in 2026 with Claude 4:** Chroma's Context Rot study tested 18 frontier models including Claude 4. Every model performed worse as input length increased. Some models held 95% accuracy and then nosedived to 60% past a length threshold. Position bias produced "30%+ lower accuracy for information in the middle." ([Chroma Research — Context Rot, 2026](https://www.trychroma.com/research/context-rot); [Understanding AI — Context Rot 2026](https://www.understandingai.org/p/context-rot-the-emerging-challenge))

**Confidence: STRONG** (3 unrelated sources — original peer-reviewed paper + Chroma technical report + independent journalism summary).

### Finding 3 — Anthropic's recommended placement: long content goes ABOVE the query, but a tight system prompt is still preferred over a fat one

**For Anthropic's own models** when long context IS needed (20K+ tokens), Anthropic recommends placing long-form data near the top of the prompt, structuring with XML tags, and asking the model to quote relevant passages first. Note: "Queries at the end can improve response quality by up to 30% in tests, especially with complex, multi-document inputs." ([Anthropic — Long context prompting tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))

**But the explicit preference is a smaller prompt with retrieval** — "Rather than pre-processing all relevant data up front, agents built with the 'just in time' approach maintain lightweight identifiers...and use these references to dynamically load data into context at runtime using tools." ([Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

**Confidence: STRONG** (Anthropic primary, two related guidance pages).

### Finding 4 — Tool-retrievable reference beats embedded reference for any content that doesn't fire every turn

**Anthropic's framing:** mirror how humans operate. "We don't memorize everything but introduce external organization and indexing systems like file systems, inboxes, and bookmarks to retrieve relevant information on demand." ([Anthropic — Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

**Aider's design choice:** Aider uses a structural repo map ranked by graph centrality, NOT the full code. The map is a structured index Meph would call shape-search-equivalent. This is the canonical reference for code agents that span large codebases. ([Aider Repository Map](https://aider.chat/docs/repomap.html); [Understanding Aider's Architecture](https://simranchawla.com/understanding-ai-coding-agents-through-aiders-architecture/))

**Cursor's evolution:** Cursor moved from a single `.cursorrules` file to a `.cursor/rules/` directory with ATTACHMENT-CONDITIONAL loading. Each rule has metadata that controls when it activates — "always", "auto-attached on file glob match", "on-demand by description". The single-file form is now legacy. ([Cursor Rules — Official Docs](https://docs.cursor.com/context/rules); [Cursor Under the Hood — Roman Imankulov](https://roman.pt/posts/cursor-under-the-hood/))

**Confidence: STRONG** (3 unrelated sources — Anthropic guidance, Aider primary docs + analysis, Cursor primary docs + analysis).

### Finding 5 — Prompt caching has hard size minimums and breakpoint rules that affect how the prompt should be structured

**Hard mins:** Claude Opus 4.7 / Haiku 4.5 require **4,096 tokens minimum** for a cacheable prefix. Sonnet 4.6 requires 2,048. Below that, the cache_control flag is silently ignored — no error. ([Anthropic — Prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching))

**Order is fixed:** "Cache prefixes are created in the following order: tools, system, then messages." Tools render first; system renders second. So tool definitions are part of the cached prefix even if cache_control sits on the system block. ([Same Anthropic source](https://platform.claude.com/docs/en/build-with-claude/prompt-caching))

**Implication for Meph's setup:** the system prompt at ~18K tokens easily clears the 4096 minimum, so caching IS happening. But every byte of the prompt costs 1.25x base on the first cache write and 0.1x on subsequent reads. A 70% smaller prompt with the same hit-rate cuts both write and read costs proportionally. The 5-minute TTL means a quiet user (no requests for 5 min) pays a fresh write — happens routinely in Studio.

**Volatile content rule:** anything dynamic (timestamps, user IDs, per-request data) must go AFTER the cache_control breakpoint. Mixing volatile content into the system prompt invalidates the entire prefix on every request. (Russell already documented this in `~/.claude/CLAUDE.md` Anthropic-Always-Use-Prompt-Caching rule.)

**Confidence: STRONG** (Anthropic primary + multiple corroborating guides).

### Finding 6 — Few-shot examples in the prompt help DSLs, but show diminishing returns past 3-5 examples

**The pattern:** "Few-shot prompting involves showing the LLM pairs of unstructured text and extracted information... Include 3–5 examples for best results." For DSL specifically: "The simplest way to teach your domain language to an LLM is by pasting one (one-shot) or a couple (few-shot) examples into the chat prompt." ([Anthropic — Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices); [Itemis — LLMs for DSL Generation](https://medium.com/itemis/large-language-models-for-domain-specific-language-generation-how-to-train-your-dragon-0b5360e8ed76))

**The structure:** wrap examples in `<example>` tags and group multiple in `<examples>`. XML structure outperforms unstructured concatenation. ([Anthropic — Multishot prompting docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))

**Diminishing returns:** "Research shows diminishing returns after two to three examples" — going from 3 to 10 examples often hurts more than it helps because of attention dilution. ([Itemis source above](https://medium.com/itemis/large-language-models-for-domain-specific-language-generation-how-to-train-your-dragon-0b5360e8ed76))

**Confidence: MEDIUM** (Anthropic primary on technique, single specialized DSL source on the diminishing-returns claim).

### Finding 7 — On-demand semantic retrieval improves agent code-search accuracy (RepoRift study), but only when the agent is explicitly trained to fire it

**The data:** RepoRift on CodeSearchNet "achieves a 78.2% success rate at Success@10 and a 34.6% success rate at Success@1" — beating prior baselines that don't use agentic retrieval. ([LLM Agents Improve Semantic Code Search — arXiv 2024](https://arxiv.org/abs/2408.11058))

**The catch:** retrieval helps only if the agent KNOWS to use it. Cursor's evolution to attachment-rules and Aider's repo-map are both engineered to make retrieval semi-automatic. Mere "you have a search tool" instructions in the prompt do not make Meph use it. The trigger has to be specific: "if the user asks for X, fire shape-search first."

**Confidence: MEDIUM** (one strong primary on accuracy gain, multiple secondary sources on the trigger-engineering requirement).

### Finding 8 — Claude Code's specific structural model: persona + workflow + tool catalog + minimal-rules, with the heavy reference inside tool descriptions

**Claude Code breakdown** (from the reverse-engineering analyses):
- Identity & security: ~100 tokens
- Executing actions with care: ~540 tokens
- Tool usage policy: ~550 tokens
- Output / tone: ~320 tokens
- **Total system prompt: ~2.5K tokens**
- Tool definitions: 14,000-17,600 tokens (e.g., the Bash tool ALONE is 1,558 tokens because it carries detailed git-commit / PR / pre-commit-hook instructions inside the tool description)

The lesson: Claude Code didn't put "how to do git commits" in the system prompt. They put it in the Bash tool's description, where it's only loaded when the Bash tool is even relevant to the conversation. ([Claude Code System Prompts — Piebald](https://github.com/Piebald-AI/claude-code-system-prompts); [Reverse-Engineering Claude Code — Indie Hackers](https://www.indiehackers.com/post/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-6e18d54294))

**Confidence: STRONG** (multiple independent reverse-engineering analyses arriving at the same numbers).

---

## Gap analysis — current vs best practice

| Aspect | Current Meph | Best practice | Gap |
|---|---|---|---|
| **System prompt size** | ~18-20K tokens | ~2.5-5K (Claude Code), or "smallest set of high-signal tokens" (Anthropic) | **HIGH — 4-8x oversized.** Any reference content past ~5K is at risk of attention dilution per Liu et al / Chroma. |
| **Reference content placement** | Inline in system prompt (OWASP, agents, queues, routes, policies, styles, SVG kitchen sink, evals, workflows) | Tool-retrievable on demand (Anthropic just-in-time, Aider repo-map, Cursor attachment-rules) | **HIGH — wrong layer.** ~70% of current system-prompt content fires only on specific tasks, not every turn. Belongs in `read_file` docs or tool descriptions, not always-loaded. |
| **Shape-search trigger** | Not mentioned in the system prompt at all | Explicit triggers documented (Cursor attachment-rules, Aider repo-map auto-loaded) | **MEDIUM — missing instruction.** Meph has the tool but no trigger; retrieval underperforms by definition. |
| **Cheat sheet vs full reference** | Both present; the 12-rule cheat sheet is correctly sized and placed near top | The cheat sheet IS the right pattern | **NONE — keep this. The cheat sheet is the highest-value block in the prompt.** |
| **Persona / role** | Clear and tight (~50 lines) | Anthropic recommends a clear role | **NONE — keep this.** |
| **Workflow / TDD / hint-tagging reflex** | Present and load-bearing | Anthropic emphasizes workflow guidance in the system prompt | **NONE — keep this.** These rules fire every turn. |
| **Lost-in-the-middle risk** | Critical content (OWASP, policy block) is at lines 100-200; concurrency / hidden-fields / file-structure middle content is at lines 700-900 | Critical content goes at the start or end | **HIGH — middle content is at risk of being recalled less reliably.** |
| **Few-shot examples** | Many scattered code blocks throughout | 3-5 well-chosen examples wrapped in `<example>` tags | **MEDIUM — too many ad-hoc examples; could be consolidated and XML-tagged.** |
| **Doc overlap** | The OWASP / queue / route / auth-rule sections appear in BOTH `studio/system-prompt.md` AND `AI-INSTRUCTIONS.md` AND `SYNTAX.md` | Single source of truth per concept; agent reads on demand | **MEDIUM — three-way duplication, drift risk.** |
| **Cache-friendliness** | Single ~18K block, cacheable but expensive on cold writes | Smaller prefix = cheaper writes, same hit rate | **MEDIUM — opportunity to halve cache-write costs.** |

---

## Obvious changes to make (ranked by leverage)

### 1. Cut the system prompt to ~5K tokens by moving reference-grade content out of it (HIGHEST LEVERAGE)

**What to keep in the system prompt** (target: ~3-5K tokens, ~300-500 lines):
- Persona ("You are Meph")
- The 12-rule canonical-syntax cheat sheet — verbatim, this is the highest-value block
- The tool list (compact form: name + 1-line description per tool, no expanded usage)
- Hint-tagging reflex (HINT_APPLIED) — fires every turn, must stay
- TDD red-green-refactor loop — load-bearing for the workflow
- File structure stub (build target → tables → backend → frontend, 10 lines)
- Auth-rule reminder (`requires login` first line of every mutation) — top compile error
- A NEW "Where to look up X" map — see recommendation #2
- A NEW "When to fire shape-search" trigger — see recommendation #3

**What to MOVE OUT into reference docs Meph reads on demand:**
- The full OWASP Top 10 block (currently lines 98-184) → already in `SYNTAX.md` and `AI-INSTRUCTIONS.md`. Replace in system prompt with a single line: "OWASP primitives (per-row access, SSRF allowlist, sensitive fields, login rate-limit, secrets linter) are documented in SYNTAX.md — read it when the user asks for security."
- AI Agents / Workflows / Queues / Routes / Policies (lines 884-1182) → all in `SYNTAX.md`. Replace with: "AI agents (`ask claude`, `agent X receives Y`), workflows, approval queues, route-by-field — all documented in SYNTAX.md."
- Style presets reference (lines 1183-1242) → move to a separate `STYLES.md` or keep in `SYNTAX.md`. Replace with: "App shell presets (`app_layout`, `app_sidebar`, `app_main`, `page_hero`) — read SYNTAX.md when building UI chrome."
- The kitchen-sink SVG example (lines 1342-1428) → move to a `SVG-EXAMPLES.md` file. The system prompt should just say "When explaining architecture, output a `<svg>` directly. See SVG-EXAMPLES.md for the canonical primitives."
- Output formatting / Memory / CLI-via-edit_file sections → all reference. Move to docs.

**Reasoning tied to evidence:** Anthropic's own context-engineering guide explicitly says "find the smallest set of high-signal tokens" and prefers just-in-time retrieval over front-loading. Claude Code's own implementation puts ~14K tokens of reference IN tool descriptions, not in the system prompt. Lost-in-the-middle / Context Rot data shows 30%+ accuracy drops in the middle of long contexts; cutting the prompt is the cheapest way to keep critical rules at high-recall positions.

**Expected effect:**
- 60-70% smaller system prompt = proportionally cheaper cache writes (1.25x base × N tokens, so cutting from 20K to 5K saves ~$0.05/cache-write at Haiku rates).
- The 12-rule cheat sheet, hint-tagging reflex, and TDD loop all rise to the top-third of the prompt where Liu et al show recall is highest.
- Same hit-rate on the smaller prefix; cache reads (0.1x base) drop in absolute terms.

### 2. Add a "Where to look up X" map to the system prompt (HIGH LEVERAGE)

A 30-line section near the top of the trimmed system prompt:

```markdown
## Where to look up X (read these via read_file BEFORE guessing)

| If the user asks for | Read |
|----------------------|------|
| Security / OWASP / auth / encryption | SYNTAX.md sections 1602+ + AI-INSTRUCTIONS.md "Auth Guards" |
| AI agents / workflows / pipelines | SYNTAX.md "AI Agents" + "Workflows" |
| Approval queues / routing / business rules | SYNTAX.md "Approval Queues" + "Named Business Rules" |
| Styling / UI / charts / layout | SYNTAX.md "Styles" + "Web Pages" |
| Tests + provable correctness | USER-GUIDE.md Chapter 17 + 23-24b |
| "Where does X live in the compiler" | FAQ.md (search-first) |
| "What can Clear DO today" capability list | FEATURES.md |
| A canonical .clear example for shape Y | shape-search tool |

If the user's question matches a row, read the doc BEFORE writing code. Don't guess at syntax.
```

**Reasoning:** the existing prompt mentions read_file in passing but doesn't tell Meph WHEN to fire it. Anthropic's just-in-time guidance is explicit: agents need bookmarks, not memorized facts. This map IS the bookmark layer.

**Expected effect:** Meph's "I'll guess at the syntax" failure mode drops because the prompt now has a forcing function to look it up.

### 3. Add a 3-line "When to fire shape-search" trigger (HIGH LEVERAGE — current gap)

The system prompt currently doesn't mention shape-search at all. Add this in the workflow section:

```markdown
## Shape-search — fire it BEFORE writing unfamiliar syntax

When the user asks you to build a thing you haven't built in the current
session — a queue, a route, a workflow, a chart, an agent with tools, a
data-shape with a relation — fire `shape_search` with a 3-5 word query
("approval queue with email", "dashboard chart aggregates"). The tool
returns 1-3 canonical Clear examples. Pattern-match the SHAPE — don't
copy-paste — and adapt to the user's data. This is faster and lower-error
than reading SYNTAX.md cover-to-cover.
```

**Reasoning:** Cursor's `.cursor/rules/` evolution and Aider's repo-map both prove that retrieval tools improve agent code-gen accuracy ONLY when the trigger is engineered into the prompt. RepoRift's 78.2% success rate is conditional on the agent firing retrieval; the same tool with no trigger underperforms. Meph already has the tool, just no trigger.

**Expected effect:** Higher first-pass syntax accuracy on unfamiliar shapes; fewer compile-error retries on routes / queues / workflows.

### 4. Move volatile content out of the cached prefix (MEDIUM LEVERAGE — cache hygiene)

Russell already has a global rule about prompt caching that flags this. Audit `studio/system-prompt.md` for any of:
- Timestamps (`Date.now()` injected at request time)
- Per-session UUIDs / user IDs
- Per-app dynamic data (current editor content, current open file)

If any of these get prepended to the system prompt at request time, they invalidate the entire cached prefix — fresh write every request. Verify with telemetry: `response.usage.cache_read_input_tokens > 0` across repeated same-user requests. If consistently zero, hunt the silent invalidator.

**Reasoning:** Anthropic's caching docs make explicit: "Place cache_control on the last block whose prefix is identical across requests." Volatile data after the breakpoint is fine; volatile data inside the breakpoint nukes the cache.

**Expected effect:** If the cache is currently being missed due to volatile content, fixing this is a 10x cost reduction on input tokens (0.1x cache-read vs full-rate fresh-input).

### 5. Consolidate ad-hoc code examples into 3-5 XML-tagged exemplars at the end of the trimmed prompt (MEDIUM LEVERAGE)

Anthropic's prompting best-practices recommend wrapping examples in `<example>` tags and grouping multiple in `<examples>`. Pick the most-load-bearing 3-5 patterns:

```xml
<examples>
<example name="Full-stack todo with auth">
... canonical 25-line example ...
</example>
<example name="Approval queue with audit">
... canonical 15-line example ...
</example>
<example name="AI agent with tools and RAG">
... canonical 20-line example ...
</example>
</examples>
```

Place at the END of the system prompt — Liu et al's "Lost in the Middle" shows end-of-prompt content is recalled at high accuracy alongside start-of-prompt content. This is the right position for examples Meph references constantly.

**Reasoning:** few-shot examples in DSL generation cap value at 3-5 per Itemis research; XML structure improves Claude's parsing of mixed instructions+examples per Anthropic.

**Expected effect:** Higher first-pass canonical-syntax accuracy on the three most common app shapes; less reliance on shape-search for the very-common patterns.

### 6. Eliminate doc duplication — system-prompt vs AI-INSTRUCTIONS vs SYNTAX (LOWER-MEDIUM LEVERAGE — drift hygiene)

The OWASP block, the auth rule, the queue/route/policy reference all appear in three places. When canonical syntax shifts (which it does in this codebase regularly), all three must be updated. Russell's project CLAUDE.md "Documentation Rule" already names 11 doc surfaces that must update on every feature; the system-prompt's reference duplication is a 12th that wasn't on that list.

**Reasoning:** single source of truth reduces drift; once the system prompt is trimmed (recommendation #1), this gap mostly closes naturally because the deleted system-prompt sections were the duplicates.

**Expected effect:** Lower drift risk, less maintenance burden, no behavior change for Meph (since the content lives in the doc he can read).

---

## Source table

| URL | What it told us | Confidence |
|---|---|---|
| [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Smallest-set-of-high-signal-tokens principle; just-in-time retrieval over front-loading; context as finite resource with diminishing returns | **PRIMARY (Anthropic)** |
| [Anthropic — Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | XML tags around examples; long content goes ABOVE query for the 30% gain; 3-5 few-shot examples; XML structure for mixed prompts | **PRIMARY (Anthropic)** |
| [Anthropic — Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | 4096-token min for Opus 4.7 / Haiku 4.5; tools-then-system-then-messages prefix order; cache_control on last stable block; volatile content after the breakpoint | **PRIMARY (Anthropic)** |
| [Liu et al. 2023 — "Lost in the Middle" (arXiv)](https://arxiv.org/abs/2307.03172) / [TACL 2024](https://aclanthology.org/2024.tacl-1.9/) | U-shaped attention curve; performance "significantly degrades" for middle-of-context information across all major LLMs | **PRIMARY (peer-reviewed)** |
| [Chroma Research — Context Rot 2026](https://www.trychroma.com/research/context-rot) | Replication on Claude 4 + 17 other 2025-2026 frontier models; 30%+ accuracy drop on middle content; some models nosedive from 95% → 60% past length thresholds | **PRIMARY (technical report)** |
| [Understanding AI — Context Rot 2026](https://www.understandingai.org/p/context-rot-the-emerging-challenge) | Independent journalism summary of the Chroma study; cross-references to Anthropic's attention-budget framing | **INDEPENDENT** |
| [How Claude Code Builds a System Prompt — Drew Breunig 2026](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) | Claude Code system prompt is modular / conditional; ~30+ components; tool definitions are the heavy layer | **INDEPENDENT (analysis)** |
| [Inside Claude Code's System Prompt — Claude Code Camp](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt) | Specific token counts: identity ~100, actions ~540, tool policy ~550, output ~320, system prompt total ~2.5K, tools 14-17K | **INDEPENDENT (reverse-engineering)** |
| [Claude Code System Prompts — Piebald (GitHub)](https://github.com/Piebald-AI/claude-code-system-prompts) | Full extracted system prompts + 24 tool descriptions; Bash tool alone is 1,558 tokens because it carries git/PR/hook reference inside the description | **PRIMARY (extracted artifacts)** |
| [Cursor — Rules official docs](https://docs.cursor.com/context/rules) | `.cursorrules` is now legacy; `.cursor/rules/` directory is current; rules have attachment metadata (always / glob / on-demand) | **PRIMARY (Cursor)** |
| [Cursor Under the Hood — Roman Imankulov](https://roman.pt/posts/cursor-under-the-hood/) | Cursor's first request structure: system + custom-instructions + user-prompt; rules play "advanced router" role | **INDEPENDENT (analysis)** |
| [Aider — Repository Map docs](https://aider.chat/docs/repomap.html) | Tree-sitter-built repo map; graph-rank algorithm to fit token budget; default 1k-token map | **PRIMARY (Aider)** |
| [Understanding Aider's Architecture — Simran Chawla](https://simranchawla.com/understanding-ai-coding-agents-through-aiders-architecture/) | Aider doesn't read full codebase; structural index + symbol extraction; coordinator pattern | **INDEPENDENT (analysis)** |
| [LLM Agents Improve Semantic Code Search — arXiv 2024](https://arxiv.org/abs/2408.11058) | RepoRift achieves 78.2% Success@10 / 34.6% Success@1 on CodeSearchNet; agentic retrieval beats static embedding | **PRIMARY (peer-reviewed)** |
| [Itemis — LLMs for DSL Generation](https://medium.com/itemis/large-language-models-for-domain-specific-language-generation-how-to-train-your-dragon-0b5360e8ed76) | Few-shot examples cap value at 2-3 for DSL generation; well-documented examples with comments outperform bare examples | **INDEPENDENT (specialized)** |
| [PromptHub — Few-Shot Prompting Guide](https://www.prompthub.us/blog/the-few-shot-prompting-guide) | Diminishing returns past 3-5 examples; XML wrapping increases parse accuracy | **INDEPENDENT** |
| [PromptHub — Top Cursor Rules](https://www.prompthub.us/blog/top-cursor-rules-for-coding-agents) | Common rule categories for coding agents (consistency, fail-fast, testing) | **INDEPENDENT** |
| [Indie Hackers — Reverse-Engineering Claude Code System Prompts](https://www.indiehackers.com/post/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-6e18d54294) | Detailed breakdown of Claude Code system-prompt structure; recommends modular conditional assembly | **INDEPENDENT (analysis)** |
| [MindStudio — LLM Wiki vs RAG](https://www.mindstudio.ai/blog/llm-wiki-vs-rag-markdown-knowledge-base-comparison) | Under 50K-100K tokens, LLM-wiki (in-prompt) wins on simplicity; above that, RAG; 95% token reduction in some configurations | **INDEPENDENT (vendor)** |
| [Anthropic — Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Subagent isolation increases capacity by ~90% in their research; condensed 1-2K-token returns | **PRIMARY (Anthropic)** |

---

## Confidence summary

- **Findings 1, 2, 3, 4, 5, 8 — STRONG confidence** (3+ unrelated sources, including primary Anthropic guidance and peer-reviewed research).
- **Findings 6, 7 — MEDIUM confidence** (1-2 strong sources each; field is less settled but evidence consistent).
- **All gap-analysis claims** about Meph specifically — **STRONG** (direct measurement of `studio/system-prompt.md`: 1,555 lines / 13,555 words / 71 sections / 172 tool mentions / 0 mentions of shape-search). The interpretation that this is "8x oversized" is THESIS-with-evidence, not THESIS — anchored against Anthropic's published Claude Code structure.
- **Recommendations 1-5** — strong evidence chain (cited above each recommendation). Recommendation 6 is hygiene, lower urgency.

---

## What I did NOT find evidence for

- **A specific optimal token count** for system prompts. Anthropic refuses to give a number; the principle is "smallest set of high-signal tokens." My ~5K target for Meph is a calibration against Claude Code's ~2.5K observed structure, scaled up because Meph has more domain to cover. THESIS, not evidence.
- **Whether Meph specifically benefits from XML-tagged examples in production.** Anthropic recommends it; no data exists for this exact agent. Recommendation #5 is THESIS-derived, low risk to try.
- **Whether shape-search currently fires often enough.** I have no telemetry. The "no trigger in the prompt" gap is structural; the "Meph rarely fires it" claim is THESIS — easily falsifiable by checking the shape-search-call rate in production logs.
- **Whether the cache is currently working as intended.** I did not look at the API call code. Russell's user-rule already mandates verifying with `response.usage.cache_read_input_tokens > 0`; if not done, recommendation #4 is the cheapest cost-reduction available.
