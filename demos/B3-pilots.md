# B3 — Interpretability Substrate: Pilot Outreach Plan

**Strategic frame:** `VISION.md` bet B3 says Clear is the only auditable-by-humans output format for agentic AI, and that as agentic AI moves into regulated domains, the market for "code a compliance officer can actually read" goes from zero to enormous. This file lists the specific industries, org profiles, and outreach patterns to turn that thesis into pilots.

**Status:** outreach planning. No conversations started yet.

**One-line pitch for every conversation:**

> *"Your domain is about to have AI agents writing code that touches your regulated systems. Today nobody can read what those agents produce. Clear is a language designed for that code to be auditable by a non-programmer. We're looking for one pilot partner in your industry to run against a real internal workflow."*

---

## The four target industries (ranked by readiness + fit)

### 1. Healthcare — **HIGH fit, MEDIUM readiness**

**Why it fits:** HIPAA audit trails already exist. Clinical protocols are naturally expressible as rules ("if patient's A1c > 7 and age > 65, recommend..."). Every rule-based clinical decision-support system today is either hand-coded by a developer or locked inside a proprietary vendor. Clear gives the clinician/compliance officer direct readability.

**Why readiness is medium:** procurement cycles are long. PHI handling needs a BAA. But pilot-scale internal tools (non-PHI at first) are achievable.

**Target org profile:**
- Mid-sized hospital system (500-2000 beds) with an internal informatics team
- Digital health company in Series B–C that already does ML/AI but has compliance drag
- Academic medical center with a clinical informatics research lab

**Named candidate pool (examples — contact research not started):**
- Epic's App Orchard ecosystem partners
- Abridge, Ambience, Nabla (ambient scribes already operating in regulated space)
- Academic medical centers: Stanford CDS Hub, Mayo Clinic AI Lab, Cleveland Clinic Digital Health

**Pilot shape:** a clinical rules engine. Clear program expresses a screening protocol ("flag patients for X if Y and Z"). Compliance officer reads the Clear source as the definitive spec; compiled output runs in EMR sandbox. Value prop: the protocol IS the audit artifact.

**Outreach channel:** informatics conferences (AMIA, HIMSS), warm intros through clinician advisors, LinkedIn on "clinical informatics lead" titles.

### 2. Financial services — **HIGH fit, HIGH readiness**

**Why it fits:** Every regulated financial firm already maintains "the rulebook" — AML flags, KYC thresholds, trade surveillance alerts, fair-lending compliance. Today these live in (a) Excel maintained by compliance, or (b) code nobody in compliance can read. Clear collapses the gap: the rulebook IS the code.

**Why readiness is high:** financial firms already buy RegTech. The language of pilots, POCs, and paid evaluations is native to the industry.

**Target org profile:**
- Mid-sized US bank ($10B–$100B AUM) with a RegTech/innovation team
- Quant hedge fund with systematic strategy docs that currently live in PDFs
- Fintech in compliance-heavy verticals (payments, lending, broker-dealer)

**Named candidate pool (examples):**
- Banking: Citizens, KeyBank, Fifth Third, First Republic-adjacent survivors
- Fintech: Mercury, Chime, Bluevine compliance teams
- Quant shops: Two Sigma, D. E. Shaw compliance + research interfaces
- RegTech-adjacent: ComplyAdvantage, Abrigo, Ascent customers

**Pilot shape:** a transaction-surveillance rule set. Compliance writes rules in Clear ("flag if transaction > $10k and country is on watch list and account age < 30 days"), audit team reads the Clear source directly, compiled output runs against the real transaction feed.

**Outreach channel:** RegTech conferences (Money20/20, FinTech Meetup), content marketing aimed at "Chief Compliance Officer" titles, direct to innovation-lab leads.

### 3. Government / public sector — **MEDIUM fit, LOW-MEDIUM readiness**

**Why it fits:** Government rulemaking is literally English. Benefits eligibility, tax rules, procurement criteria — all already written as prose, translated by contractors into code that no auditor can read. The federal AI executive order (and any successor) will require auditability. Clear fits that requirement natively.

**Why readiness is lower:** sales cycles measured in years. Requires FedRAMP-ish infrastructure eventually. But municipal/state pilots are faster.

**Target org profile:**
- State CIO / digital service teams (CA, CO, NY, MA have mature digital services)
- Federal digital services (USDS, 18F, DOD's DDS)
- Municipal innovation offices (NYC, SF, Boston)
- Adjacent: Code for America, Nava PBC, Ad Hoc

**Pilot shape:** a benefits-eligibility calculator. Clear expresses the eligibility rules ("if household income < X and family size >= Y and state is in Z..."), caseworker or policy analyst reads the Clear source as the spec, compiled output runs in the web app applicants use. When the rule changes, compliance/policy edits the Clear source directly — no contractor in the middle.

**Outreach channel:** Code for America Summit, warm intro through digital services alumni (plentiful on LinkedIn), RFI responses to state AI-auditability procurements.

### 4. Legal tech — **MEDIUM fit, HIGH readiness**

**Why it fits:** Law firms and corporate legal buy tools constantly. "AI that drafts X" is saturated; "AI that produces code a paralegal can verify" is empty. Contract-automation workflows, regulatory-change-tracking rules, discovery-review rubrics — all natural Clear fits.

**Why readiness is high:** legaltech procurement is fast when a partner champions it.

**Target org profile:**
- AmLaw 100 firm with an innovation/"legal ops" group
- In-house legal at mid-cap SaaS company (complex contract review)
- Legaltech incumbent looking for differentiation (Harvey, Ironclad, LinkSquares)

**Pilot shape:** contract-review rules. Legal ops writes review criteria in Clear ("flag clause if indemnification is uncapped OR limitation of liability is below 12 months revenue"), associates read the Clear source as the spec, compiled output runs on new contracts automatically. The Clear source IS the review checklist — no translation layer.

**Outreach channel:** legaltech conferences (Legalweek, ILTACON), direct to heads of legal operations, warm intros through legal-tech investors.

---

## The pilot template (what we're actually asking for)

Every pilot, regardless of industry, follows the same shape:

| Phase | What we do | What they do | Duration |
|-------|-----------|--------------|----------|
| 0. Scoping | 2 calls. Identify one real rules-heavy workflow they own. | Show us the current rulebook (Excel, PDF, proprietary code). | 2 weeks |
| 1. Translation | We translate the rulebook into Clear. They review for semantic accuracy. | Expert reviews the Clear source. Flags any rule that reads wrong. | 3-4 weeks |
| 2. Deployment | We compile, deploy to a sandbox (their environment or Clear Cloud, their choice). Runs on real data in read-only/shadow mode. | Runs alongside their existing system. | 4-6 weeks |
| 3. Audit test | An auditor or compliance officer — chosen by *them*, not us — reads the Clear source cold and tries to explain what it does. | Record the audit session. This is the primary data point. | 1 week |
| 4. Report | Joint write-up: "Can a non-programmer audit agentic code via Clear?" Published with their consent. | Approves the narrative. | 2 weeks |

**Total: ~12-14 weeks per pilot.**

**What we want out of each pilot (in priority order):**
1. **Recorded audit session** where a non-programmer reads Clear source and correctly explains the rules. This is the proof.
2. **Case study** (with their consent) for the Clear-bench / VISION.md public narrative.
3. **Testimonial** usable in sales.
4. **Paid conversion** — ideal, not required for the thesis.

**What they get:**
- Free translation of one real workflow
- Clear Cloud credits for the pilot environment
- Compiler improvements to fit their domain vocabulary (synonyms, node types)
- First-to-market case study in their industry — they own the category narrative alongside us

---

## Disqualification criteria

Don't take pilots that match these patterns:

| Red flag | Why it's a no |
|----------|---------------|
| "We want you to build our whole app" | We're testing the interpretability thesis, not taking custom-software work |
| "Our compliance team isn't involved" | The audit session IS the product — no compliance reviewer = no pilot |
| "We need this behind our VPN / on-prem only" | Fine eventually, not for v1 pilots. Blocks us from iterating. |
| "We want exclusivity in the industry" | The point is a multi-industry case-study set. No exclusivity. |
| "We'll pay for a POC but no case study rights" | We'd lose the narrative. Decline unless the $ is stupid big. |

---

## The ideal pilot partner (composite profile)

- 50-500 person org
- Has an existing, well-documented rules-heavy workflow that currently lives in code the compliance team cannot read
- Has a named person with title "Chief Compliance Officer," "Head of Legal Ops," "VP Risk," or "Chief Medical Informatics Officer" who will commit to the audit session
- Already uses SaaS vendors for their RegTech/compliance stack — meaning procurement paths exist
- Has public thought-leadership appetite — will say their name out loud when the pilot succeeds

**We want 5 such partners by end of 2026 — one each in healthcare, finance, government, legal, plus one wild card.**

---

## Outreach sequencing (proposed)

**Q3 2026 (after Clear-bench v1 lands):**
1. Warm intros via Russell's network — map everyone Russell knows who is ≤2 hops from a CCO/CMIO/legal-ops lead. Prioritize finance + legal (highest readiness).
2. Publish a single "What auditable agentic code looks like" essay on the Clear blog. Use it as the artifact every outreach email links to.
3. Speak at one conference per target industry (HIMSS, Money20/20, Legalweek, Code for America). Goal: one warm pilot conversation per talk.

**Q4 2026:**
4. Close 2 of the 5 target pilots. Begin phase 1 (translation) in parallel.
5. Publish pilot-in-progress updates — the narrative compounds as pilots accumulate.

**2027:**
6. Close the remaining 3 pilots.
7. Joint case studies published.
8. Start upsell motion: pilot → full Clear Cloud deployment with custom-domain + multi-tenant auth.

---

## Why B3 is the long-compounding bet

B2 (the MOAD plumber demo) wins near-term attention. B1 (Clear-bench) wins research-community attention. **B3 wins the durable enterprise narrative** — and it's the one nobody else is even attempting. Every other AI-coding company is pitching speed, productivity, or cost-reduction. None of them can pitch *"a compliance officer can read the code."* That's ours for the taking as long as we name it and pursue it deliberately.

---

## Cross-reference

- `VISION.md` — bet B3 strategic framing
- `PHILOSOPHY.md` — the design rules that make Clear readable (14-year-old test, 1:1 mapping, no jargon, one op per line) — these ARE the interpretability property
- `demos/MOAD-plumber.md` — the B2 companion doc (MOAD video brief)
- `ROADMAP.md` — RR-2 (retire 1:1-mapping violations) is the prerequisite technical debt that protects B3
