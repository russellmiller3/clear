# Clear GTM Plan — Quickest Path to $4k/mo Contracts

## The Product

**What you sell:** Managed AI agent + internal tool service for mid-market companies.
**What they get:** Custom business agents and internal apps, hosted on your infrastructure, with compile-time security guarantees.
**What they pay:** $4,000/month per deployment (includes hosting, maintenance, and compiler updates).
**What competes:** RPA (UiPath, Automation Anywhere, Power Automate) — $5k-25k/month, takes months to implement, breaks when UIs change, needs "RPA developers."

## Why $4k/mo Beats RPA

| | RPA (UiPath etc.) | Clear |
|---|---|---|
| Time to first automation | 6-12 weeks | 1-2 days |
| Implementation cost | $50-150k | $0 (you build it free) |
| Monthly cost | $5-25k | $4k |
| Breaks when | UI changes | Never (API-based, not screen-scraping) |
| Needs specialist? | "RPA developer" ($120k/yr) | No — you maintain it |
| AI capability | Bolted on, limited | Native (agents with guardrails) |
| Readable by ops team | No (robot scripts) | Yes (40 lines of English) |

The pitch: **"Everything your RPA does, but faster to build, cheaper to run, and it doesn't break when someone moves a button."**

---

## Phase 1: First Revenue (Weeks 1-4)

**Goal:** 3 signed $4k/mo contracts.

### Week 1: Build 3 Demo Apps

Build three vertical-specific demos you can show in a meeting. Each should be a real agent + dashboard that does something obviously useful in under 10 lines of Clear.

| Demo | Vertical | What It Does |
|------|----------|-------------|
| Claims Triage Agent | Insurance/FinServ | Reads claim description, classifies urgency, routes to right adjuster, creates ticket |
| Expense Approval Agent | Any mid-market | Reviews expense reports against policy, auto-approves under $500, flags anomalies, emails manager |
| Order Status Agent | Logistics/Ecom | Customer asks "where's my order?", agent looks up order, checks inventory, responds with status + ETA |

**Acceptance criteria:** Each demo runs on Railway with a live URL. You can show it in a browser in 30 seconds. The Clear source is < 30 lines.

### Week 2: Identify 15 Targets

**Where to find them:**

1. **Your Axial network.** You worked in financial services. Who do you know at mid-market firms (200-2000 employees) who manages operations, compliance, or internal tools?

2. **LinkedIn search.** Target titles:
   - "VP of Operations" at insurance/financial services companies
   - "Head of IT" at healthcare admin / logistics companies
   - "Director of Process Improvement" (these are the RPA buyers)
   - "Chief of Staff" at mid-market companies (they own internal tooling decisions)

3. **RPA buyer communities.** People who are actively frustrated with UiPath/Power Automate:
   - r/rpa on Reddit (lurk, find complaint threads, DM the posters)
   - UiPath Community Forum (find "breaking automation" threads)
   - LinkedIn posts complaining about RPA maintenance

**Qualification:** Company has 200-2000 employees AND uses (or has tried) RPA AND has a compliance/regulatory requirement. If 2 of 3, they're a target.

### Week 3: Outreach (15 emails)

**The email (keep it under 100 words):**

> Subject: Replacing your [UiPath/Power Automate] with something that doesn't break
>
> Hi [Name],
>
> I built a tool that does what RPA does — but ships in a day instead of 3 months, and doesn't break when someone moves a button.
>
> It's an AI agent platform where every app is guaranteed free of SQL injection, auth bypass, and 25 other bug classes — by the compiler, not by code review.
>
> I'll build your first automation for free. Takes me a day. If it works, we talk.
>
> Here's a 60-second demo: [link to Loom video]
>
> Russell

**Volume:** Send 15 emails. Expect 3-5 replies. Need 3 meetings.

### Week 4: Build Pilots

For each company that takes a meeting:

1. **Discovery call (30 min).** Ask: "What's the most annoying manual process your ops team does every day?" Don't pitch. Listen. Take notes.

2. **Build the pilot (1-2 days).** Build their specific workflow as a Clear app. Use their terminology, their field names, their business rules. Deploy to Railway. Send them the live URL.

3. **Demo call (30 min).** Show the running app. Show the Clear source ("this is everything — 35 lines"). Show the compiler guarantees list. Ask: "If this works for a month, is this worth $4k/month to keep running?"

---

## Phase 2: Close and Expand (Weeks 5-8)

### Closing the $4k/mo

**What $4k/month includes:**
- The agent/app, hosted and running 24/7
- Monitoring (you watch for errors, fix them)
- Compiler updates (security fixes propagate to their apps)
- 2 hours/month of modifications ("can you add a field?" "can you change the routing logic?")
- Additional agents/apps: $2k/month each after the first

**What it doesn't include:**
- Custom integrations (Salesforce, SAP, etc.) — scoped separately
- SSO/LDAP — available on enterprise tier
- On-prem deployment — $50k/year (if they ask)

**Contract structure:**
- Month-to-month (no annual commitment to start — reduces friction)
- 30-day notice to cancel
- They own their Clear source files (exit clause for legal comfort)
- Compiled output stays on your infrastructure

### Expanding Within Each Customer

Every company has 10-50 manual processes. You land with one agent. Then:

- Month 2: "That expense agent is working great. Should we automate [the other thing you mentioned]?"
- Month 3: "Your team keeps asking me about [X]. I could build a dashboard for that in a day."
- Month 6: You're running 5 agents + 3 dashboards. $16k/month. Annual contract discussion.

---

## Phase 3: Scale (Months 3-6)

### What You Need to Build (in order of what closes deals)

| Priority | Feature | Why | When |
|----------|---------|-----|------|
| 1 | Demo video (60s Loom) | Required for outreach email | Week 1 |
| 2 | Live Railway deploy of 3 demos | Required for meetings | Week 1 |
| 3 | Basic monitoring dashboard | Customer asks "is it running?" | Week 3 |
| 4 | Custom domain support | Customers want `agents.theircompany.com` | Month 2 |
| 5 | SSO integration | Enterprise deal blocker | Month 3 |
| 6 | Audit log export | Compliance requirement at regulated companies | Month 3 |
| 7 | Multi-tenant isolation | Running multiple customer apps safely | Month 4 |

### What You Don't Need to Build Yet

- Multi-agent orchestration
- Type system
- Python backend
- Visual builder
- Mobile support
- Self-serve signup
- Marketing website beyond landing page

---

## Revenue Model

| Milestone | Timeline | Revenue |
|-----------|----------|---------|
| First pilot running | Week 4 | $0 (free) |
| First paid contract | Week 6-8 | $4k/mo |
| 3 contracts signed | Month 3 | $12k/mo |
| Expand to 5 apps/customer avg | Month 6 | $30-40k/mo |
| 10 customers | Month 12 | $100k+/mo |

**Break-even math:** Railway hosting is ~$20-50/month per app. Your cost per customer is negligible. $4k/month is nearly 100% margin. 3 customers = $12k/month = Russell's salary covered.

---

## The 60-Second Demo Script

Record this on Loom. This is the thing that gets meetings.

**[0-10s]** "This is a claims triage agent. A customer describes their claim in plain English."
**[10-20s]** Type a claim. Agent classifies it, routes it, creates a ticket. Show the result.
**[20-35s]** "Here's the entire source code." Switch to Clear source. "30 lines of English. Not JavaScript — English."
**[35-50s]** "Every app we build is guaranteed free of SQL injection, auth bypass, and 25 other security bugs. Not by code review — by the compiler."
**[50-60s]** "I'll build your first automation for free. Takes me a day. If it works, we talk."

---

## What To Do Monday

1. Build the 3 demo apps (claims triage, expense approval, order status)
2. Deploy all 3 to Railway with live URLs
3. Record the 60-second Loom
4. Write 15 outreach emails
5. Send them

That's it. Everything else is a distraction until you have 3 meetings on the calendar.
