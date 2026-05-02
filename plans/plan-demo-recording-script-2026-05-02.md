# Demo Recording Script — 2026-05-02

**Format:** 60–90 second screen recording with voice-over.
**Reference app:** Deal Desk (most polished of the canonical 5; has named rules + AI summary + audit trail).
**Target buyer:** Marcus (sales-ops, mid-market, has a deal-desk pain).
**Distribution:** LinkedIn DM + landing page hero. Per GTM.md "Asset 3: One Short Recording."

## What this recording proves

Per GTM.md (line 604–616): show the 5 beats, no product tour, no architecture lecture.

1. The ugly workflow they recognize.
2. The Clear app that replaces it.
3. The approval action.
4. The source in readable English.
5. The price.

That's it. Five beats. The buyer sees it and either replies or doesn't.

---

## Pre-recording setup (10 min)

**Browser tabs to have open in this order:**

1. **A real Slack / email screenshot** showing the ugly workflow — DM thread with "hey can we discount this?", "approved", "wait what's the cap?", "let me check with finance." Screenshot from anywhere. If there's no real one, mock it in 5 minutes — the messier-looking the better.
2. **Studio** at `localhost:3456` with `apps/deal-desk/main.clear` already loaded — **scroll the editor to the discount-cap rule** so the named rule is visible when we cut to it.
3. **The deployed deal-desk app** at `<slug>.buildclear.dev` (post-Cloudflare-wire-up). Pre-loaded with 3 pending deals, one over the 30% cap so the rule fires visibly. If Cloudflare isn't wired yet, run locally on `localhost:4400` and crop the URL bar in editing.
4. **A blank pricing slide** — `landing/marcus.html` pricing section, or just plain text on a slate background: "$5,000 setup + $5,000/month."

**Recording tool:** OBS or Loom. 1920×1080. Mouse cursor visible, a smaller webcam circle in the corner is optional (Loom default).

**Voice-over approach:** record the screen with no voice first, then voice-over a second pass while playing back. Let the visuals lead the words. Less stumble.

---

## The script (75 seconds, 6 beats)

### Beat 1 — The ugly workflow (0:00 – 0:12)

**On screen:** the Slack screenshot. Cursor highlights the "approved" message buried under three follow-ups.

**Voice-over (slow, slightly tired):**

> Every sales-ops team has this thread. Discount request, manager approval, finance double-check, audit nobody can find later. It's two hours of cognitive overhead per deal — and the discount cap policy lives in someone's head.

### Beat 2 — The Clear app (0:12 – 0:25)

**On screen:** cut to deal-desk running at `<slug>.buildclear.dev`. Wide shot of the queue page — list of pending deals on the left, one selected showing the AI-drafted summary on the right.

**Voice-over (snappier, lifted):**

> This is the same workflow as a Clear app. Pending queue, deal detail with the customer context, AI-drafted summary on every request over twenty percent. Routed to the CRO automatically.

### Beat 3 — The approval (0:25 – 0:40)

**On screen:** click "Approve" on the selected deal. Status badge flips from "pending" to "approved." Cursor moves down to the audit row that just appeared.

**Voice-over:**

> One click to approve. The status updates, the audit row writes itself with who, when, and why. The customer email goes out automatically. No spreadsheet. No Slack thread.

### Beat 4 — The discount-cap rule fires (0:40 – 0:52)

**On screen:** cut to a request OVER the 30% cap. The approve button is disabled with the rule's name shown — "discount-cap-thirty: discount cannot exceed 30%."

**Voice-over (pointed):**

> When a rep asks for forty-percent off, the policy fires before the request even leaves the form. The rule has a name. It's the same rule the CRO writes down — typed once, enforced everywhere.

### Beat 5 — The source in plain English (0:52 – 1:05)

**On screen:** cut to Studio editor showing the `rule discount-cap-thirty:` block. Five lines of plain English. Highlight them slowly with the cursor.

**Voice-over:**

> Here's the source. Five lines of plain English. Anyone on the team can read it. Anyone on the team can change it. No JavaScript. No Salesforce admin. No engineering ticket.

### Beat 6 — The price + CTA (1:05 – 1:15)

**On screen:** cut to the pricing slide. Five-thousand-dollar setup, five-thousand-dollar monthly. Email address visible.

**Voice-over (closer, direct):**

> Five thousand setup. Five thousand a month. One painful workflow gone, this week. Reply if your deal desk lives in Slack.

**End card:** logo, email, URL.

---

## Editing notes

- Cut every "um," "so," "let me." Re-do the take if a stumble lands in beats 1, 2, or 6 — those are the load-bearing beats.
- Pace: beats 1 + 5 are slower (let the buyer recognize the pain + the readability). Beats 2, 3, 4, 6 are punchier.
- No music. Voice-only. Music telegraphs "marketing video"; this should feel like a founder DM.
- Subtitles burned in (auto-generated from the script). Many LinkedIn views are sound-off.
- Vertical 9:16 cut for LinkedIn feed; horizontal 16:9 for the landing page hero. Same audio, two crops.

---

## Distribution plan

- **Day 0 (record day):** post horizontal cut at `landing/marcus.html` hero. Embed below "Stop buying platforms. Remove the workflow."
- **Day 1:** start DMing the first 5 Marcuses on LinkedIn. Open with the vertical cut + this line: "60 seconds. If your deal desk lives in Slack, this is what replaces it."
- **Day 1–7:** track replies in a 4-column spreadsheet — name, role, replied (Y/N), willing-to-talk (Y/N). Goal: one demo call by end of week.

---

## Recording prerequisites checklist

- [ ] All 5 Marcus apps still 74/74 green via `node scripts/run-marcus-uat.mjs`
- [ ] Cloudflare wire-up done — deal-desk hosted at `<slug>.buildclear.dev` (or fall back to localhost crop)
- [ ] 3 seed deals in deal-desk including one over the 30% cap
- [ ] Slack ugly-workflow screenshot saved or mocked
- [ ] Pricing slide rendered
- [ ] Recording tool tested (OBS / Loom) on a 30-second throwaway

When all 6 are checked, recording itself is ~30 min including retakes.

---

## Why this script (the rationale, in plain English)

- **Length.** 75 seconds matches what an actual buyer will sit through on LinkedIn. The first 12 seconds either land or they swipe; beats 1 and 2 carry that weight.
- **Order.** Pain first (recognition), product second (relief), proof third (the rule firing is the wow), readability fourth (the moat), price last (closes the loop).
- **The rule beat.** This is the line nobody else can show. Retool can't show a named business rule with a CRO-readable name. Lovable can't. Bubble can't. The rule is the differentiator — make sure it gets 12 seconds, not 4.
- **Plain English voice-over.** No jargon. No "framework." No "deploy." Marcus is a sales-ops VP, not an engineer. Talk like the founder DM that this is.
- **Price on screen.** Don't bury it. Per GTM.md ("If someone cannot pay $5k/month to remove the workflow, the workflow is not painful enough"), the price is qualifying.
