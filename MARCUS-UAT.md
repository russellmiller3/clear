# Marcus App UAT — feature-level walkthrough

This is the human-driven test plan for each of the five Marcus demo apps. The auto-generated browser UAT (`scripts/run-marcus-uat.mjs`) clicks every nav item, fills every form, and asserts the right URLs respond. **It does not assert that the SHIPPED FEATURES actually do what a customer expects.** That's what this doc is for.

For each app: a checklist of the features a buyer / Marcus would expect, plus a "Known gaps" section calling out the places the app falls short of that promise. Walk the checklist before any live demo.

How to run an app:
```
node cli/clear.js build apps/<app-name>/main.clear
node apps/<app-name>/server.js   # serves on a 4xxx port
# open localhost:<port> in a browser
```

Or run the whole sweep at once:
```
node scripts/run-marcus-uat.mjs
```

---

## deal-desk — CRO approval workbench

**Pitch:** discount requests over 20% queue for the CRO; the CRO can approve, reject, or counter. Three named business rules are math-proved on every push and runtime-verified by sending bad inputs at the live app.

**Features to test:**

- [ ] **Submit a new request.** Click "New deal" → fill rep name, customer, list price, discount % → Submit. The new deal appears on `/` ("Pending CRO approval"). Discounts > 20 % stay pending; ≤ 20 % auto-approve.
- [ ] **Approve a deal.** Pick a pending row → click "Approve" → row vanishes from `/` and reappears on `/approved`.
- [ ] **Reject a deal.** Pick a pending row → click "Reject" → row vanishes from `/` and reappears on `/rejected`.
- [ ] **Counter a deal.** Pick a pending row → click "Counter" → row moves to `/awaiting` (customer follow-up queue).
- [ ] **Draft an AI summary.** Pick a pending row → click "Draft AI summary" → terminal / chat shows a CRO-readable paragraph from Claude with summary + recommendation + risk score.
- [ ] **View all deals + reports.** Navigate `/all` (audit-trail style table) and `/reports` (pie chart by status + bar chart by segment).
- [ ] **Auth gate on mutations.** Without logging in, POST /api/deals returns 401. Same for the approve/reject/counter URLs.
- [ ] **Provable rules.** Run `node cli/clear.js prove apps/deal-desk/main.clear` — three rules (`discount-cap-thirty`, `price-floor-positive`, `risk-score-bounded`) all read PROVED in the output.
- [ ] **Runtime witness.** Run `node lib/prover/runtime-witness.test.js` — every PROVED rule sees 20 violating inputs and rejects each with the rule name on the response.
- [ ] **Audit PDF.** From Studio, click the "Prove" button and download the audit PDF. The "How it was proved formally" section reads in plain English.
- [ ] **State-change audit log.** Hit `GET /audit` (logged in) — every approve / reject / counter call appears as a row with method, path, status, user, tenant.
- [ ] **Audit CSV.** Hit `GET /audit.csv` — same data as a downloadable CSV.

**Known gaps (won't pass UAT today, real product work needed):**
- The **business rules are hardcoded in the source** (`rule discount-cap-thirty`, etc.). There's no UI to edit / add / disable a rule at runtime. A CRO who wants to change the cap from 30 % to 25 % needs the developer to recompile.
- The **counter-email to the customer** writes to an in-memory outbox by default. To actually send mail, the source needs `enable live email delivery via agentmail` (or equivalent provider) AND a configured AGENTMAIL_API_KEY. Demo-ready but not production-ready.

---

## lead-router — sales intake routing

**Pitch:** new leads come in, get routed to alice / bob / charlie based on company size, and land in a workbench for sales ops to drill in.

**Features to test:**

- [ ] **Submit a new lead.** On `/`, fill name + email + company + size + source → click "Add Lead" → row appears in the New Leads table. Required-field rules reject blank name and blank email with their named-rule message.
- [ ] **Routing happens.** A new lead with size "SMB" → assigned_to is `alice`. Mid-market → `bob`. Enterprise → `charlie`.
- [ ] **View routing rules.** Click "Routing rules" in the sidebar → URL changes to `/routing-rules` and the page explains the size-based assignment plus the named guard rules.
- [ ] **View owners.** Click "Owners" in the sidebar → URL changes to `/owners` and shows a stat strip with how many leads each owner has + a table grouped by `assigned_to`.
- [ ] **Detail panel.** Pick a lead in the table → the detail panel on the right shows name, company, source, assigned_to.
- [ ] **Auth gate.** POST /api/leads requires login; PUT /api/leads/:id requires login.
- [ ] **Provable rules.** Run `clear prove apps/lead-router/main.clear` — `lead-must-have-name` and `lead-must-have-email` read PROVED.

**Known gaps (Russell's UAT example, real product work needed):**
- ❌ **Edit and save routing rules.** Russell's stated UAT goal: *"that I can change and save lead routing rules."* Today the `route lead by size:` block is **hardcoded in the .clear source**. There is no DB-backed `RoutingRule` table, no admin UI to add a new size category, no way to change "SMB → alice" to "SMB → diana" at runtime. To support this UAT we need a real CRUD model: a `RoutingRules` table with rows like `{ size, owner }`, a form on `/routing-rules` to edit/add/delete, and the POST `/api/leads` handler must look up the table at runtime instead of consulting the hardcoded block. This is real product work, not a doc gap.
- ❌ **Edit owners.** alice / bob / charlie are hardcoded strings. No `Owners` table, no add-owner form, no remove-owner button. Same shape as the routing-rule gap.
- ⚠️ **Lead status transitions.** A lead has a `status` field (`new`, `qualified`, etc.) but the UI has no buttons to advance it. The current detail panel just displays it.

---

## approval-queue — operations request approvals

**Pitch:** anyone in the company can submit a request (budget, software, time off); approvers see it in a queue, click Approve or Reject.

**Features to test:**

- [ ] **Submit a request.** Form on `/` → fill title + description + amount + requester → Submit. New row appears in the pending queue.
- [ ] **Approve.** Pick pending → click Approve → status flips to `approved`. Row leaves the pending list, appears on `/all`.
- [ ] **Reject.** Pick pending → click Reject → status flips to `rejected`. Same routing.
- [ ] **View all.** Click "All requests" → URL changes to `/all` with stats (pending / approved / rejected counts) and the full table.
- [ ] **Auth gate.** Approve / reject require login.

**Known gaps:**
- No **role check** — any logged-in user can approve. A real demo would have an `Approvers` table or a `role` field on the user.
- No **approval threshold by amount** — every request goes to the same queue regardless of dollar value. A real version would route requests over $X to a CFO queue, under $X auto-approves.
- No **email notification** when status changes (the queue primitive supports this but isn't wired here).

---

## onboarding-tracker — customer success command center

**Pitch:** new customers go through onboarding steps; success managers track who's at what step and intervene when stuck.

**Features to test:**

- [ ] **Submit a new customer.** Form on `/` → fill name + company + email + account_manager → Add Customer.
- [ ] **Dashboard.** `/` shows stat cards (active customers, open steps, managers) + customer workbench.
- [ ] **Customers page.** Click "Customers" → URL changes to `/customers` with the full customer table including email + assigned manager.
- [ ] **Steps page.** Click "Steps" → URL changes to `/steps` with stats (open vs done) + the steps table.
- [ ] **Managers page.** Click "Managers" → URL changes to `/managers` with two stat cards (Sarah + Mike) showing how many customers each manages.
- [ ] **Mark Active / Escalate / Email.** From the customer detail panel on `/`, the three buttons flip the customer's status appropriately.

**Known gaps:**
- **No way to mark a step complete.** The Steps table just displays `completed: true/false`; there's no checkbox or button. A real customer success workflow needs that.
- **Hardcoded managers.** Sarah and Mike are literal strings in the source. No `Managers` table.
- **No timeline view** — can't see "step A completed at 2026-04-30, step B started 2026-05-01" for a single customer.
- **`account_manager` is a free-text field**, not a foreign key. Typos like "sara" vs "Sarah" silently break the manager-counts.

---

## internal-request-queue — employee help-desk intake

**Pitch:** employees submit IT / HR / Facilities / Finance requests; the right team owns each request and resolves it.

**Features to test:**

- [ ] **Submit a request.** Form on `/` → title + description + category dropdown + priority dropdown + your name → Submit.
- [ ] **Assign / Resolve buttons.** Pick pending → click Assign (status → `assigned`) or Resolve (status → `resolved`).
- [ ] **All requests.** Click "All requests" → URL changes to `/all` with full table + status breakdown stats.
- [ ] **IT team queue.** Click "IT" → URL changes to `/team/it`, shows only IT-category requests.
- [ ] **HR / Facilities / Finance queues.** Same shape on `/team/hr`, `/team/facilities`, `/team/finance`.
- [ ] **Auth gate.** Assign / Resolve require login.

**Known gaps:**
- **Same-page filtering, not real per-team views.** Each team page client-side filters all_requests by category. Larger datasets would need a server-side filter URL like `/api/requests?category=IT`.
- **No ticket assignment to a specific person.** Today "Assign" just flips status; there's no `assigned_to` field with an actual user.
- **No SLA tracking.** Priority is set on the form but nothing surfaces overdue tickets.

---

## How to extend this doc

When a feature ships that closes a gap above, replace the ❌ / ⚠️ row with a `[ ]` checklist item. When a new app or capability lands, add a new section using the same shape: pitch line, feature checklist, known gaps. Keep the doc honest — if a feature doesn't fully work, it goes in "Known gaps," not in the checklist.

The auto-generated `browser-uat.mjs` per app is the regression net for "the URLs exist and the buttons click." This doc is the regression net for "the app actually does the thing it promises." Both must pass before a Marcus demo.
