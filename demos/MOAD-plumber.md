# Mother of All Demos — The Plumber

**Purpose:** The single 3-minute unedited video that shifts what "software" means. Engelbart 1968 for small-business software.

**Ships as part of:** Bet B2 in `VISION.md` (Mother of All Demos). Prerequisite to Clear Cloud launch.

**Status:** Script — pre-production. Nothing filmed yet.

---

## The rules (Engelbart bar)

1. **One continuous take.** No cuts. No speedups. No "..." text overlays covering gaps. If it's not fast enough in real-time, the compiler isn't fast enough — fix the compiler, don't edit the tape.
2. **The person on camera is not a programmer.** Full stop. Real plumber, real business, real problem. Not an actor reading a script. Not a founder pretending.
3. **The app is real at the end.** Deployed URL, accessible from his phone, data persists. He uses it on the next real job the next day. That's the closing shot.
4. **No props, no staged data.** He types (or speaks) the description live. Meph writes the app live. It runs on the real cloud on a real domain.
5. **If it fails on camera, we ship the failure reel and fix it and re-shoot.** The failures are where the research happens.

---

## The subject

**Name:** Any small-business trade with job-site, photo, and invoice needs.
Default pick: plumbing. Alternates: electrical, landscaping, HVAC.

**Why plumbing works:**
- Universal comprehension (everyone knows what a plumber does)
- Three people is the typical shop — small enough that custom software is absurdly expensive today, big enough that shared tracking actually matters
- Photos at jobs is a perfect proof-of-concept for file upload + mobile + auth
- Invoices at the end wire in CRUD + aggregate + export + email

**Casting criteria:** owner-operator of a 2-5 person shop. Has a Google Sheet or WhatsApp group as their current "system." Has been quoted >$8k for a custom app and declined. Will sign a release. Available for a follow-up shoot in 30 days showing real usage.

---

## The 3-minute script

**[0:00-0:15] — Cold open. No narration.**
- Static shot of the plumber's truck, his Google Sheet, the WhatsApp group with photos. Caption on screen: **"This is how Mike runs his business today."**
- Beat. He says on camera: *"I've been quoted twelve grand for an app. Twice. I couldn't do it."*

**[0:15-0:30] — The prompt.**
- Cut to laptop screen (screen recording) with Mike visible in the corner (webcam). buildclear.dev homepage.
- Mike types (or speaks via voice — both versions tested):
  > *"I need to track jobs for my three guys. Every job has an address, the customer, what they called about, and photos from the site. When a job is done we send an invoice."*
- He hits enter. Timer starts on screen.

**[0:30-1:15] — Meph builds. Screen-record only, no narration.**
- Meph streams code. We see:
  - `receive customer with name text and phone text`
  - `receive job with address text and customer as link and description text and photos as many files and status as 'open' or 'done'`
  - `receive invoice with job as link and amount number and sent_at date`
  - A login page. A job list page. A job detail with photo upload. An invoice generator.
- Preview pane fills in in real time. The compiler ticks through phases: parsed, validated, compiled, running.
- **Total time on clock: under 60 seconds.** If the compiler can't hit that, the compiler is the bug — not the script.

**[1:15-1:45] — Publish.**
- Mike hits **Publish**. Dialog: "What do you want to call it?" He types `mikes-plumbing`.
- Ten seconds pass. On-screen status: `building → provisioning → DNS → live`.
- URL appears: `mikes-plumbing.clear.run`.

**[1:45-2:30] — He uses it.**
- Mike picks up his phone. Types the URL. Logs in (account was created by Publish).
- Adds a customer: "Dolores Kaminski." Adds a job at her address. Takes a photo on his phone of a fake clogged sink in the studio. Uploads. Saves.
- The job appears. The photo appears. It's his business, on his phone.

**[2:30-3:00] — Close.**
- Cut back to Mike's face. He says (unscripted, real take):
  > *"That's... that's what I've been trying to get for six years."*
- Caption: **"Clear Cloud. Custom software in 60 seconds. $49/month."**
- End card: `buildclear.dev`.

---

## What has to be true before we can shoot

| # | Requirement | Status |
|---|-------------|--------|
| **D-1** | Meph reliably builds "plumbing CRM" from that exact sentence in under 60 seconds, 9/10 runs | **Not verified** — needs a scenario added to `eval-fullloop-suite.js` |
| **D-2** | Compiler produces an app that handles file upload (photos) and mobile viewport without manual intervention | **Partial** — file upload syntax exists (`as many files`); mobile viewport is the default but needs a real-phone check |
| **D-3** | Clear Cloud `Publish` button exists and provisions a live subdomain in under 15 seconds | **Blocked on CC-1, CC-4** (see ROADMAP) |
| **D-4** | Custom domain flow works for `*.clear.run` subdomains | **Blocked on CC-1 + CC-5** |
| **D-5** | Login works on the published app without the user configuring anything | **Blocked on auth defaults in Clear Cloud** |
| **D-6** | Stripe billing is live so "$49/month" is a real offer | **Blocked on CC-3** |
| **D-7** | Real plumber signed release, available for shoot | **Not started** |

**Reading the table honestly:** none of the technical blockers are mysteries. They're all items on the Clear Cloud P0 track. The demo ships when P0 ships. Don't attempt to shoot before D-1 through D-6 are all green — a partial demo is worse than no demo.

---

## The follow-up (30 days later)

Second video. ~90 seconds. Mike on the job in month two.

- Shows him on a real job, taking real photos, the real app.
- Dollar amount on screen: actual invoices generated through the app.
- Stat: hours-per-week saved vs. Google Sheets. Self-reported, not ours.
- Close: *"I still don't know how it works. I don't need to."*

That second video is what turns "cool demo" into "product people believe in." Plan the shoot at the same time as the first one.

---

## Why this is the right demo (vs alternatives)

Alternatives considered and rejected:

| Candidate | Rejected because |
|-----------|------------------|
| A founder builds an internal tool | Viewer assumes they're already technical. No Overton-window shift. |
| A non-profit / school gradebook | Honorable but not sympathetic in the VC/tech narrative we need. |
| An e-commerce store | Shopify exists. Viewer already has a reference point that dilutes the shock. |
| A data dashboard for a hedge fund | Retool exists. Same dilution. |
| An AI chatbot / wrapper | Every other demo on Twitter is this. No novelty. |

**The plumber demo works because it's the category where custom software DOES NOT EXIST today for economic reasons.** There's no Shopify for plumbers. There's no Retool for the 3-person HVAC shop. The market isn't "underserved" — it's unserved. That's where Overton-window shifts happen.

---

## Production notes

- **Camera:** two angles minimum (laptop screen + Mike's face). One shot of him using the phone at the end. Keep it unpolished — the demo loses power if it looks produced.
- **Location:** his actual shop or his actual truck. Not a studio. Not a co-working space.
- **Audio:** lavalier mic on Mike, screen audio from laptop. Mix in post but do not cut anything out.
- **Release:** standard appearance release + a 12-month usage-rights clause so we can keep running it.
- **Distribution (day of launch):** HN front page attempt, Twitter/X with full clip embedded (not linked), LinkedIn (Russell's network + Marcus-persona targets), email to the waitlist.

---

## The brutal test

If this video doesn't make a Sequoia partner forward it to three people within 10 minutes, we shot the wrong thing. Re-shoot.

If it doesn't make a working plumber sign up on the spot, we priced it wrong. Re-price.

If we can't shoot it at all because the blockers keep slipping, **we're not building what we said we were building.** That's the real signal — the demo is the forcing function for the P0 roadmap. If Q2 ends and we can't shoot this in one take, stop everything else and fix the compiler + Clear Cloud until we can.

---

*The value of the demo is not the demo. The value of the demo is that preparing to shoot it exposes every gap between what we've built and what we claim. Treat the script as a test suite for the whole company.*
