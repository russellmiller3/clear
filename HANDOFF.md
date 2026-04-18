# Handoff — 2026-04-18 (Session 38 — Live App Editing strategy)

## Current State
- **Branch:** `claude/ai-app-customization-YD518` (merged into main this session)
- **Working tree:** clean
- **Type:** strategy / roadmap session — no code changes

## What Was Done This Session

Captured the **Live App Editing** flagship feature as a fully-specified roadmap entry, backed by competitive research across 8 internal-tool builders and AI app generators.

The conversation started philosophical (per-user app forks — should they exist?) and converged on the actual product: **the app owner alone can modify a running prod app via chat with Meph, and nothing breaks.** Per-user forks were explicitly ruled out.

Live App Editing is now Clear's most strategically defensible feature on the roadmap. No competitor combines (a) conversational modification, (b) Retool's release-manager safety, and (c) Airtable's additive-by-construction guarantees. The slot is open for roughly 12-18 months before Retool likely bolts a real AI agent onto Release Manager.

### Files changed
- **`ROADMAP.md`** — Added two new sections to "What's Next":
  1. **Live App Editing (Flagship)** — Marcus user story, 10 numbered requirements (LAE-1 through LAE-10), 4-phase delivery plan, success metric, positioning ("never lose a user's form data when you change the app"), and competitive snapshot table across 8 competitors with source quotes.
  2. **Per-user app forks** added to "Not Building" with rationale.
- **`HANDOFF.md`** — this file.

### Why the positioning matters
Every competitor already claims "live editing" generically. The defensible promise is the specific one: *"never lose a user's form data when you change the app."* The technical commitment backing it is **additive-by-default with expand-and-contract migrations** — new column before old one drops, dual-write during transitions, old schema readable until every consumer moves over. Airtable-grade safety with Lovable-grade conversational interface.

### Competitive findings (full table in ROADMAP)
- **Lovable / Bolt / v0:** No live edit story. Their #1 complaint is destructive regeneration — Bolt has GitHub issue #9016 literally titled "Files Glitching as they are being rewritten." v0 explicitly errors *"Cannot edit a published generation."*
- **Retool:** Closest real answer — Release Manager has draft-vs-published + millisecond rollback. But developer-gated. Non-devs can't push schema changes; AI can't edit a live Retool app.
- **Superblocks Clark:** Modifies source, not running instances.
- **Airtable / Notion:** The prior art. Additive-only schema edits on running bases. API explicitly forbids creating tables/columns — schema edits are UI-only for safety.

## What's Next (priority order)

### 1. Build `landing/live-editing.html` (started this session, not finished)
Frame around Marcus's terror moment: CEO walks over and asks for a new field on the deal-desk approval app *after* 18 users are already submitting requests. Marcus is rightly afraid of: (1) breaking the app, (2) AI deleting other code, (3) losing in-flight user data, (4) no preview before pushing live. The page answers each fear directly, shows the in-browser Meph edit widget, demonstrates dry-run preview mode, and ends with the additive-by-default safety guarantee. Match `landing/marcus.html` style. Use Lucide SVG icons (no emoji per CLAUDE.md). Pull competitor quotes from the ROADMAP research.

### 2. Spike Phase A of Live App Editing (LAE-1, LAE-2, LAE-3 additive-only, LAE-7)
Owner-gated in-browser Meph widget that proposes additive changes (add field, add page, add endpoint) and ships them live with a diff preview. ~1 week of work. Proves the core loop without taking on the harder safety problems (live-reload contract, schema migration planner, snapshot/rollback) until the basic UX feels right.

### 3. Add "Retool + AI agent" to monthly competitive watch
Retool is the realistic threat to the Live App Editing positioning. If they ship a Clark-style AI on top of Release Manager, the window closes fast. Set a monthly grep of Retool changelog + LinkedIn announcements.

### 4. Phase 85a still blocking real Phase 85 deploys
From last session — the one-click deploy code shipped, but the infrastructure (Fly Trust Verified, Stripe signup, Anthropic org key, buildclear.dev domain) hasn't been provisioned. Until Russell does the account-setup pass, Deploy works in tests but has nowhere to deploy to.

## Key Decisions Made

- **Owner-only modification, not per-user forks.** Per-user app forks destroy the shared ontology that justified building a shared app, create audit/compliance nightmares, and aren't what Marcus actually wants. The right answer is owner-initiated changes that ship to everyone.
- **Position around data safety, not "live editing."** The defensible promise is *"never lose a user's form data when you change the app."*
- **Additive-by-default with expand-and-contract migrations.** New column before old one drops, dual-write during transition. Compiler-enforced, not opt-in. This is the technical moat.
- **Watch Retool, not Lovable.** Lovable can't structurally do this (regenerates whole files). Retool can — and probably will. They're the realistic threat.

## Resume Prompt

"We just merged Session 38 — the Live App Editing flagship is now fully specified in ROADMAP with user story, 10 requirements, 4 phases, competitive research, and positioning. The next move is building `landing/live-editing.html` framed around Marcus's terror moment (CEO asks for a new field on a running app, Marcus afraid of breaking it). Match `landing/marcus.html` style, no emoji, Lucide SVG icons. After that, spike Phase A of Live App Editing — additive-only edits via in-browser Meph widget — to prove the core loop in about a week. Tell me which one to start."
