# Competition — Clear's Positioning

## The Short Version

Clear doesn't compete with AI platforms. It competes with "hire a developer" and "use a spreadsheet."

---

## Direct Competitors (same buyer)

### Retool / Enterprise AppGen (CLOSEST COMPETITOR)
**What they are:** Low-code platform + AI app generator for internal tools. Enterprise AppGen (April 2025) added "Assist" — an AI agent that builds Retool apps from natural language. Same pitch as us: "domain experts build production apps without engineers."
**Their pitch:** "AI creativity fused with enterprise systems, data, and safeguards."
**What they have that we don't (yet):** SSO/RBAC built in, 50+ database connectors, visual component library, Fortune 500 customer base, SOC 2 certification, established sales team, audit logging, CI/CD testing (beta).
**Our genuine advantages:**
1. **Readable source** — Retool generates proprietary component configs. Clear generates 40 lines of English. Compliance team reads Clear. Nobody reads Retool configs.
2. **Structural security** — Their security is "inherited from org policies" (gaps in policies = gaps in apps). Our compiler catches SQL injection, auth bypass, mass assignment regardless of policies. Their security is organizational. Ours is structural.
3. **No lock-in** — Retool apps only run on Retool. Clear compiles to standard Express. Customer owns the output.
4. **Bug fix propagation** — Retool fixes per-component on their timeline. We fix per-pattern and customer controls when to recompile.
5. **Agent guardrails** — `must not: delete Orders` as a compile-time check. Retool has no equivalent.
6. **Price** — Retool is $10-80/user/month ($24k-192k/year for 200 people). We can massively undercut.
**When we lose:** Customer wants visual drag-and-drop. Customer needs 50+ third-party integrations. Customer already uses Retool. Customer prioritizes speed over security guarantees.
**Positioning:** Don't compete head-on. "Retool is great for visual builders. Clear is for teams that need to prove their apps are secure." The compliance angle is the wedge — a bank can't deploy without security review. Our compiler guarantees shortcut that review.

### Zapier / Make / n8n (for agent workflows)
**What they are:** Workflow automation with AI steps.
**Their pitch:** "Connect your apps, automate your work."
**Our advantage:** Real agent intelligence (tool use, memory, RAG, guardrails), not just "call GPT in step 3." Compile-time guardrails vs. runtime hope. Readable source code vs. opaque workflow diagrams.
**Their advantage:** 5000+ integrations. Non-technical users already know Zapier.
**When we lose:** Customer needs simple "if email then Slack" automation, not AI agents.

### Bolt / Lovable / v0 (AI app builders)
**What they are:** AI generates full apps from prompts.
**Their pitch:** "Describe your app, we build it."
**Our advantage:** Readable source code (40 lines of English vs. 2000 lines of JS you can't verify). Compiler guarantees (they generate code and hope it's secure). Bug fix propagation (fix once, every app gets it — they fix per-app).
**Their advantage:** Prettier output, more frontend frameworks, bigger teams, more funding.
**When we lose:** Customer wants a consumer-facing app with custom design. Customer needs React/Next.js specifically.

---

## Adjacent (different buyer, might come up in conversations)

### Claude Managed Agents (Anthropic)
**What it is:** Hosted infrastructure for running Claude as an autonomous agent. Developer platform — developer still writes agent logic in Python/JS.
**Their pitch:** "We handle the infra, you handle the logic."
**Our advantage:**
- **No coding required** — 10 lines of Clear vs. 50+ lines of Python with LangChain
- **Compile-time guardrails** — `must not: delete Orders` is checked at compile time. Managed Agents relies on prompt-based guardrails (hope Claude listens)
- **Tool validation** — undefined tool = won't compile. Managed Agents discovers at runtime
- **Prompt injection defense** — `block arguments matching 'drop|truncate'` built into compiler. Managed Agents: developer's problem
- **No vendor lock-in** — compiled to standard Express, deploy anywhere. Managed Agents = Anthropic-only
- **Scheduled agents** — `runs every 1 hour:` works today. Managed Agents has no cron/scheduled triggers yet
**Their advantage:** Anthropic-hosted (no infra to manage), deeper Claude integration, backed by Anthropic's enterprise sales.
**When they win:** Customer has developers who want to build custom agents with full control. Customer is already in Anthropic's ecosystem.
**When we win:** Customer doesn't have developers. Customer needs compile-time safety guarantees for compliance. Customer wants to own their infrastructure.
**Could we run on top of them?** Yes. Future compiler target: Clear agent → Managed Agent session. Not competing, complementary.

### LangChain / CrewAI / AutoGen (agent frameworks)
**What they are:** Developer frameworks for building agent systems.
**Their pitch:** "Build agents with our library."
**Irrelevant because:** Our customer doesn't have developers. These are developer tools. If a company is evaluating LangChain, they have an engineering team and probably don't need us.
**But if it comes up:** Our compile-time guardrails can't be replicated in a library. They validate tools at runtime (agent crashes), we validate at compile time (app won't build). Their agents are code you have to maintain — ours are 10 lines of English that recompile.

### ChatGPT / Claude.ai / Gemini (direct AI chat)
**What they are:** Chat interfaces to AI models.
**Their pitch:** "Ask AI anything."
**Irrelevant because:** Chat is ephemeral. Our agents are deployed services with persistent memory, scheduled execution, and tool access. "Ask Claude to look up an order" in chat.ai is a one-shot. Our support agent remembers the conversation, tracks decisions, and runs 24/7.

---

## How to Handle "Why Not Just Use X?"

### "Why not just use ChatGPT/Claude to build our app?"
"You can. You'll get JavaScript you can't read, with no security guarantees, that you'll need a developer to debug when it breaks at 2am. Clear gives you 40 lines of English that say exactly what the app does, with SQL injection and auth bypass impossible by construction."

### "Why not use Retool?"
"Retool is great if you want drag-and-drop. They even have AI generation now. But there are two differences that matter for regulated industries. First: when the compliance team asks 'prove this app can't leak PII in error messages' — Retool can't answer that. Our compiler auto-redacts sensitive fields from every error response. It's structural, not a setting. Second: Retool apps only run on Retool. If they raise prices or go down, every app is hostage. Our apps compile to standard Node.js — you own the output forever."

### "Why not use Bolt/Lovable?"
"They generate code. We generate guaranteed-safe code. When Bolt ships an app, you're trusting the AI remembered to add auth checks. When Clear ships an app, auth bypass is a compile error — the app literally won't build without it."

### "Why not just hire a developer?"
"You could. They'll build one app in two weeks. We'll build it in a day. When you need the second app, you wait two more weeks. When we build the second app, every security fix from the first app is already in it. Your 10th app is more secure than your first, automatically."

### "Why not use Anthropic's Managed Agents?"
"Managed Agents is a developer platform — you still write Python or JavaScript to define what the agent does. We write 10 lines of English and the compiler handles the API calls, tool definitions, and guardrails. If you have developers who want full control, use Managed Agents. If you want an agent running in production by Thursday, use Clear."

---

## Positioning Summary

**We are not:** an AI platform, a low-code builder, a developer framework.
**We are:** a managed compiler service that turns English into secure, deployable business software.
**Our moat:** 27 bug classes eliminated at compile time. No one else has this.
**Our wedge:** agents with guardrails for regulated industries.
**Our expand:** internal tools platform (fix once, every app gets the fix).
