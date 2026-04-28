# Deal Desk — Product Review and Build-or-Kill (2026-04-28)

> **Russell's prompt:** "decide what we actually need to work. (integrations? slack? probably!) and then either build or kill."
>
> **Format:** every feature in the current `apps/deal-desk/main.clear` gets a call — KEEP / KILL / BUILD. The bar is "would Marcus pay if this was missing?" or "would Marcus refuse to pay if this was present-but-broken?"
>
> **The customer:** Marcus, the CRO who reviews discount requests above the auto-approve threshold. Sales leader. Cares about velocity, audit trail, and not being the bottleneck. Currently doing this in spreadsheets + Slack + Salesforce.

---

## Verdict at a glance

| Feature | Verdict | Why |
|---|---|---|
| Pending queue + approve / reject / counter / awaiting customer | **KEEP** | The whole reason Marcus is here |
| Login-gated action URLs (`requires login`) | **KEEP** | Audit + accountability — non-negotiable for any real deal |
| Audit trail (`deal_decisions` table + URL) | **KEEP** | Marcus's CFO will ask "who approved that 35% discount" |
| Detail panel (summary, recommendation, risk score, term, health) | **KEEP** | Without context you're just clicking buttons in the dark |
| Stat strip (pending count, avg discount, value at stake, 7-day approvals) | **KEEP** | At-a-glance health — Marcus opens the page and immediately sees the day |
| Tab strip (Pending / My approvals / All) | **KEEP** | Cheap, useful, expected |
| AI summary drafter (`draft_approval` via Claude) | **KEEP** | The differentiator Marcus would brag about to peers |
| Auto-discount logic (>20% → pending, else approved) | **KEEP** | Marcus sets a threshold; below it auto-clears. Saves him hours/week |
| Triggered email on counter ("We countered your offer") | **KEEP** | But only after Phase B-1 ships — see below |
| Tables sort + filter (Codex chunk #5) | **KEEP** | Marcus has 50+ pending; sort/filter is table-stakes |
| Approved today page | **KEEP** | The "did I clear it" feedback loop |
| Rejected page | **KEEP** | Same — closure on the day |
| Awaiting customer page | **KEEP** | Where deals go to die unless followed up — visible queue is the fix |
| All deals page (with charts) | **KEEP** | Manager-of-managers view — scales beyond Marcus |
| Reports page (3 charts) | **KEEP** | Marcus's manager wants pipeline reporting; this is the doc |
| **Reps page** | **KILL — for v1** | Hand-coded numbers. No source of truth. Looks fake. Defer until CRM sync exists |
| **Accounts page** | **KILL — for v1** | Same problem. Fake data; misleads more than it helps |
| **Approval Rules page** | **KILL — for v1** | Read-only policy display. Adds nav noise without giving Marcus a button to click |
| **Integrations page** | **KILL — for v1** | Mock data showing "Salesforce / Slack / DocuSign Connected". This is a LIE until those integrations actually exist. Worse than absent |
| **Settings page** | **KILL — for v1** | Saves to local state, no backend. Fake feature; first time Marcus changes a number and refreshes, it vanishes |

---

## Things to BUILD before showing Marcus

| Build | Why | Rough size |
|---|---|---|
| **Phase B-1 — real email delivery** (deferred behind Russell's go) | Right now the counter button queues an email row but no email leaves the box. Marcus expects the customer to actually get the email. Plan exists at `plans/plan-triggered-email-primitive-04-27-2026.md` Phase B-1. Real provider sends with AgentMail / SendGrid / Resend / Postmark / Mailgun adapters | ~1-2 focused days |
| **Slack notifications when a deal lands in pending** | Russell hinted ("integrations? slack? probably!"). Marcus's mental model is Slack-first. Sees a pending deal in #deal-desk channel, clicks the link, lands on the detail panel. Big "this fits how I already work" moment | ~half day with a webhook approach (no real Slack OAuth dance — just incoming webhook URL in env) |
| **Salesforce two-way sync (or at least one-way pull)** | Marcus's deals live in Salesforce today. If our queue doesn't pull from Salesforce + push status back, every deal is double-entry data — instant kill. Use `Nango` or `Composio` connector lanes per the connector decision in `snapshots/marcus-market-evidence-04-27-2026.md` | ~1-2 days for one-way pull (deals appear in queue when SF status flips to "needs review"); two-way push back to SF is bigger |

---

## Per-feature rationale (longer)

### KEEP — the load-bearing core

**Pending queue + approval workflow.** This is THE app. Without it there's nothing to demo. The queue primitive auto-emits the audit table, the action URLs, the auth gates. Currently working end-to-end on local SQLite per the verified handoff. Don't touch.

**Login-gated action URLs.** Marcus's first question, after "does it work," will be "who has access." `requires login` on every PUT is the answer. CFO compliance baseline.

**Audit trail.** `GET /api/deal-decisions` returns the full history. When Marcus's exec asks "why did we approve a 35% discount on Initech," he can show the row with `decided_by`, `decided_at`, `decision_note`. This is the single thing that turns a tool into a system of record.

**Detail panel.** A row is just a customer name + amount. Without the recommendation, risk score, term, health signal, and precedent note, Marcus is approving blind. The panel is what makes a 30-second decision rigorous.

**Stat strip.** Four cards at the top: pending count, avg discount, value at stake, 7-day approvals with sparkline. Marcus opens the page → instantly knows the state of the day. This is cheap to keep and the kind of polish that makes the demo feel finished.

**Tab strip.** Pending / My approvals / All. Cheap nav, expected. No reason to remove.

**AI summary drafter.** `draft_approval` calls Claude with the deal data and gets back a CRO-ready paragraph + recommendation + risk score. This is the WOW feature — every other deal-desk tool makes Marcus write the summary. Clear writes it for him. Likely the #1 thing Marcus will mention to peers.

**Auto-discount logic.** `if discount > 20%: pending else: approved`. Saves Marcus hours per week. Tunable per customer (the Settings page would let you change the threshold — but kill the Settings page for now and hard-code per deployment).

**Triggered email on counter.** Already wired to queue an email row when status flips to 'awaiting'. Subject + body + provider + reply tracking all set. Just needs Phase B-1 (real send) to actually go out.

**Tables sort + filter.** Codex chunk #5 landed today. Real value once Marcus has 50+ pending — without sort/filter, a busy day is unscrollable.

**Approved / Rejected / Awaiting customer pages.** Each is a filtered view of the same Deals table. Cheap to provide, and the "did I clear it today" loop matters more than it sounds — Marcus needs closure on the day.

**All deals page + charts.** Manager-of-managers view. Marcus's boss wants pipeline reporting. Status mix + segment pressure are the obvious starts; this scales beyond Marcus to the next 5 deal-desk customers we'd land.

**Reports page.** Three charts: status mix, segment pressure, deal types. This is the doc Marcus shares to his manager during the QBR.

### KILL — the fake or noise features

**Reps page.** Six fields per rep: team, open_requests, approved_today, average_discount, value_at_stake, risk_flag. Every number is hand-coded into the seed data. No source of truth. The first time Marcus looks at it and asks "why does Sarah show 4 open requests when I just approved two of hers," and the answer is "because the seed file says 4," you've lost trust. **Bring this back AFTER Salesforce sync exists** — then the numbers are real.

**Accounts page.** Same problem. Customer / segment / owner / active_requests / total_value / last_decision / health_signal. All seeded. All static. The right version of this page reads from Salesforce. Until then, kill it.

**Approval Rules page.** Read-only display of policies. Marcus can't edit them, can't trigger them, can't see why a specific deal hit a specific rule. It's text on a page that doesn't reduce to action. Until it becomes a real rule editor (with save → backend → applied at next deal submission), kill it.

**Integrations page.** Mock data showing "Salesforce CRM / Slack notifications / DocuSign — Connected." NOTHING IS ACTUALLY CONNECTED. The first time Marcus clicks the row expecting integration health, he sees there's no detail. Worse, when he asks "where's the Slack channel I should connect to" and the answer is "this page is a placeholder," trust is shot. **This is the most dangerous lie of the bunch.** Kill until at least one real integration exists.

**Settings page.** Approval threshold, auto-approve limit, CRM sync toggle, email alerts toggle. Saves to local state only — refresh the page and it resets. Marcus changes the threshold from 20 to 25, refreshes the next day, sees 20, gets confused. **Kill or wire to real backend persistence.** The right v1 is no Settings page; the threshold is hard-coded per deployment until persistence exists.

### BUILD — what closes the demo gap

**Phase B-1 (real email send).** The counter button queues an email row but the email never goes out. For Marcus to trust the system, the customer he countered has to actually receive the email. Plan exists. ~1-2 days. After this lands, the deal-desk demo crosses from "looks like a product" to "is a product."

**Slack notification on pending.** Marcus is in Slack all day. A deal hits pending → bot posts to `#deal-desk` with customer + amount + discount + a link to the detail panel. He clicks, lands on the page, decides. **No OAuth dance** — just an incoming-webhook URL stored in env vars. Cheapest possible win that says "this fits how I work today."

**Salesforce one-way pull.** This is the harder one but the most strategically important. If deals don't appear in the queue automatically when a rep submits in Salesforce, Marcus has to remember to enter them in two places — instant churn risk. Use the connector lane decided in the market evidence doc (Nango, by default). Start with read-only pull from Salesforce → Clear; bidirectional sync (status push back to SF) is a follow-up.

---

## Recommended demo path

When you actually sit Marcus in front of the app:

1. **Open the pending queue.** "Here are your discount requests. There are 5 waiting."
2. **Click a row.** "The detail panel shows the summary, the recommendation, the risk score. The summary was drafted by Claude — you didn't write it."
3. **Counter the deal.** "When you counter, the customer gets an email automatically. Watch — there's the email row in the outbox table." (Once Phase B-1 ships, also: "and the email actually arrives in their inbox.")
4. **Show the audit trail.** "Every decision is logged. Here's who approved what, when, with what note."
5. **Show the reports page.** "Your manager wanted pipeline reporting. Here's status mix, segment pressure, deal types — re-runs every time."
6. **(After Slack ships)** "Notifications go to your team's Slack channel automatically when a deal lands in pending. You see it in Slack, click, decide, done."
7. **(After Salesforce ships)** "Deals come in from your existing Salesforce. You don't enter anything twice. Status pushes back automatically."

Steps 1-5 work today. Step 6 needs Slack. Step 7 needs Salesforce. Anything beyond those three (Phase B-1, Slack, Salesforce) is over-scoping the first paying customer demo.

---

## Sequencing

If you've got a week and want to land Marcus, here's the order:

1. **Today (already done):** ship the email primitive + queue F2/F4 + delete the kill-list pages. Demo path 1-5 works.
2. **Day 1-2:** Phase B-1 — real email sending. Demo path 3 actually puts mail in the customer's inbox.
3. **Day 3:** Slack incoming webhook. Demo path 6 works.
4. **Day 4-5:** Salesforce one-way pull (Nango lane). Demo path 7 works one-direction.
5. **Day 6:** practice the demo end-to-end. Time it. Cut what's still slow.
6. **Day 7:** Marcus conversation #1.

The kill-list pages should come out of `apps/deal-desk/main.clear` BEFORE the demo so Marcus doesn't see them and ask questions you don't want to answer.

---

## What I'd tell Russell

The current deal-desk app has 17 features. **5 of those features are KILL** (Reps, Accounts, Approval Rules, Integrations, Settings). Each one looks real, none of them work in any meaningful way. They make the app feel bigger than it is — which sounds good but actually creates an integrity gap that destroys trust the moment Marcus pokes at them.

**Pull them out before the demo.** The remaining 12 features (queue, detail panel, AI drafter, stat strip, charts, audit trail, etc.) tell a complete story. "This app does ONE thing and does it well" is a better pitch than "this app does 17 things and 5 of them are placeholders."

**Then build Phase B-1, Slack, Salesforce — in that order.** Each one closes a specific Marcus question. After all three, you have a defensible v1.

The rest — multi-stage approvals, settings persistence, real-time collaboration, in-app comments — those land when a SECOND deal-desk customer asks for them and tells you exactly what shape they want.

— Claude (loop iteration 2, 2026-04-28)
