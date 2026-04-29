# Deal Desk Demo — 30-Minute Walkthrough Script

**Recorded for:** Marcus — sales-ops manager at a 100-500-person B2B company
**Used for:** Cold-pitch DM on LinkedIn + email follow-up to prospects
**Asset built live:** `apps/deal-desk/main.clear` — discount approval workflow with AI-drafted CRO summaries
**Date:** 2026-04-25
**Fact-checked against `apps/deal-desk/main.clear`:** 2026-04-29 (453 lines, all script claims verified except minor seed drifts noted below)

---

## Pre-Recording Fact-Check (verified 2026-04-29 against current app)

| Script claim | App source | Status |
|---|---|---|
| Threshold at 20% — auto-approve below, queue above | `if deal's discount_percent is greater than 20:` (line 111) | ✅ matches |
| Fields: rep_name, customer, list_price, discount_percent | `Deals` table has all four + summary, recommendation, risk_score, term | ✅ matches |
| /cro page requires login | Multiple endpoints have `requires login` (lines 105, 120, 125) | ✅ matches |
| AI summary + risk score on Draft button | `draft_approval` agent uses `ask claude ... returning JSON` with summary + risk_score | ✅ matches |
| 3 seeded sample deals so queue isn't empty | Seed at line 137 creates Acme (28%), Globex (18%), Initech (35%) | ⚠️ see drift |

**Minor drifts to know about before recording:**

1. **Globex is seeded at 18% — UNDER threshold.** It auto-approves on seed and won't appear in the CRO queue. Script says "4 deals waiting on me" at 16:00 — actual count after Mike's submission will be **3** (Acme 28% seeded + Initech 35% seeded + Mike's 30% Acme submission). Either fix the script line ("3 deals" instead of "4") or change the seed to put Globex at 21%+ before recording.

2. **Mike's submission creates a SECOND Acme row.** The seed already has Acme at 28%; Mike submitting Acme at 30% adds a duplicate. On screen the queue will show two Acme rows — the script glosses over this. Either bump the seed customer to a different name, or swap Mike's submission to `Initech — expansion deal` and rewrite the 12:00-16:00 segment accordingly.

3. **Login credentials.** Script says `cro@demo.com` / `demo123`. Confirm these match the seeded user in the app's signup/seed flow before recording — `allow signup and login` is on (line 67) but the script doesn't say where the user is created. Pre-flight: visit /signup once, register `cro@demo.com` / `demo123`, then it works for the recording.

4. **The `ask claude ... returning JSON text:` shape on line 80** uses structured AI output (one of Clear's flagship features). Demo at 16:00-22:00 will show the AI's response streaming in — verify the model is set to Haiku 4.5 in Studio (the script says "fast" but doesn't specify) so the response is fast enough to not feel laggy on camera.

---

## Pre-Recording Checklist

Set this up BEFORE you hit record. Anything you fumble during the take will cost you 5 minutes per re-shoot.

### Browser
- [ ] Chrome with ONE clean window, ONE tab. Close everything else. Notifications off.
- [ ] Tab 1 (open at start): `http://localhost:3456` — Clear Studio, blank editor, Meph chat panel visible on the right.
- [ ] Tab 2 (closed; open mid-demo when prompted): the live published URL — **bookmarked but not loaded**, so the URL bar reveal is the punchline.
- [ ] Browser zoom: **125%**. Studio text reads cleanly at 1080p capture; bigger feels frantic.
- [ ] Hide bookmarks bar. Hide extensions. The viewer should see one dark chat panel and one editor.

### Studio state
- [ ] Theme: **midnight** (the dark one). Sales-ops people read this as "real software," not a toy.
- [ ] Editor: empty. No template loaded. Drop-down on "Untitled."
- [ ] Meph panel: cleared chat history. Model: Haiku 4.5 (fast). Tool calls visible.
- [ ] The publish button is wired and tested. Do a dry run end-to-end the morning of the recording.

### Sample data (have ready in a sticky note off-screen)
- Rep: `mike.l` / Customer: `Acme Health — 3-year renewal` / List: `240000` / Discount: `30`
- Login email: `cro@demo.com` / Password: `demo123`
- The exact Meph prompt you'll paste at 2:00 (see "Opening Meph Prompt" section below)

### Recording setup
- [ ] OBS or Loom, 1080p, 30fps, separate mic + system audio tracks.
- [ ] Webcam corner thumbnail: bottom-right, small. Russell's face on the build, not stealing it.
- [ ] Test the mic level. Two minutes of small talk into the recorder. Adjust gain.
- [ ] Phone on Do Not Disturb. Slack quit. Calendar blocked.

---

## Opening Meph Prompt (copy-paste at 2:00 mark)

This is the ONE message you'll paste into Meph. Paste it word for word. Do not improvise — this prompt was tuned to land in 20 minutes.

> Build a deal desk. Sales reps submit discount requests through a form on the home page. Anything 20 percent or less is auto-approved. Anything over 20 percent goes to a CRO queue at /cro that requires login. The CRO sees pending deals as cards, clicks "draft AI summary" on a deal, and gets back a one-paragraph recommendation plus a risk score from 1 to 10. Then approves or rejects in one click. Seed three sample deals so the queue isn't empty when I demo it.

---

## The 30-Minute Walkthrough

Each section: **Visual** (what's on screen) — **Talk track** (exactly what to say) — **Pacing** (where to slow, where to compress).

---

### 00:00 — 02:00 — Cold open, the promise

**Visual:** Russell's face, full screen. Studio behind him on a second monitor, blurred. Maybe a static title card briefly: "30 minutes. No code. Real app."

**Talk track:**
> "Hi, I'm Russell. The next 30 minutes, I'm going to build a deal desk from scratch. Discount requests, CRO approval queue, AI-drafted summaries, login, the whole thing. I'm not going to write any code. I'm going to talk to an AI in plain English, and at the end I'll click one button and it'll be live on a real URL you can hand to your team today.
>
> If you've ever had a deal desk in a Google Sheet, or you've filed a JIRA ticket for an internal tool and gotten back 'maybe Q3' — this is for you. Let's go."

**Pacing:** Tight. Two minutes max. No throat-clearing. No "imagine if." Lead with the promise, set the clock, move.

---

### 02:00 — 04:00 — Studio appears, Meph prompt goes in

**Visual:** Cut to full-screen Studio. Empty editor on the left. Meph chat panel on the right, blinking cursor.

**Talk track:**
> "This is Clear Studio. The big empty box is where the app gets written. The chat panel on the right is the AI assistant — I'll call it the assistant, it's the one doing the typing. I'm going to tell it what I want, in one paragraph, the way I'd describe it to a coworker."
>
> [Paste the Meph prompt. Read it aloud while pasting.]
>
> "That's the whole spec. Submit a request. Auto-approve under 20 percent. Anything bigger goes to a CRO queue with login. The CRO can ask the AI to draft a summary. One click to approve. That's it."

**Pacing:** Read the prompt aloud — DO NOT skip this. The viewer needs to hear that the spec is human English, not a wall of jargon. Hit Enter. Move on.

---

### 04:00 — 10:00 — Meph writes the app live

**Visual:** Editor on the left starts filling in line by line as Meph streams it. Russell points at sections as they appear.

**Talk track (narrate what's appearing, don't read every line):**
> "Watch the left side. The assistant is writing the app. I'll narrate as it goes — you don't need to read it, just look at the shape.
>
> [Pause when the database section appears.] That block at the top — those are the fields each deal stores. Rep name, customer, list price, discount percent, status, summary, risk score. Same fields you'd put in a spreadsheet, except the app actually enforces them.
>
> [Pause when the rule appears.] Right here — see that line? `if discount is greater than 20`. That's the rule. Over 20 percent, queue it for the CRO. Under 20, auto-approve. The whole policy is one sentence in plain English, and that one sentence becomes the rule the app actually runs.
>
> [Pause when the AI agent block appears.] And this part — this is the AI assistant inside the app. Not the one I'm talking to right now — a NEW one, built into the deal desk itself. Its job is: take a deal, write a one-paragraph summary for the CRO, give a risk score, recommend approve or reject.
>
> [When pages section appears.] Two pages. The home page where reps submit. The CRO page at /cro that requires login. That's it. The whole app."

**Pacing:** This is the longest stretch. Don't fill silence with filler. Let Meph type. When you talk, you're pointing at one block at a time. Resist the urge to explain syntax — sales-ops doesn't care about syntax.

**If Meph is slow:** edit out dead air in post. If you're recording live and Meph hits a 30-second pause, fill with: "While that's writing, here's what's wild — this same file is also the documentation. New CRO joins next month? They read the file. They understand the app. Try doing that with a Retool app."

**If Meph misfires:** stop the recording, fix it, restart from 02:00. Don't try to recover live. Re-shoots are cheap; a fumble in the cold pitch is fatal.

---

### 10:00 — 12:00 — Compile, the app builds itself

**Visual:** Russell clicks the Compile / Run button. Studio shows "building." Then a green check. Then a localhost URL appears.

**Talk track:**
> "Done writing. Now I click Run.
>
> [Click. Wait for the build.]
>
> Few seconds. The app builds itself — database, login, pages, the AI part, all of it. And there's the URL. That's the app, running on my laptop right now."

**Pacing:** Slow down here. The build is satisfying — let the viewer see the green check. Don't rush past it.

---

### 12:00 — 16:00 — Submit a deal as the rep

**Visual:** Click the localhost URL. The Deal Desk home page loads. Russell fills in the form: `mike.l`, `Acme Health — 3-year renewal`, `$240,000`, `30%`.

**Talk track:**
> "I'm Mike, a sales rep. Acme Health wants 30 percent off on a 3-year renewal. Big deal — 240 grand. I fill out the form.
>
> [Type each field, slowly enough to be readable on video.]
>
> Name. Customer. List price. Discount. Submit for approval.
>
> [Click Submit. Form clears.]
>
> Done. Submitted. Because I asked for 30 percent — over the 20 percent line — it went to the CRO queue. If I'd asked for 15 percent, it would've been auto-approved and the rep would already be moving to the next deal. No CRO involved. That's the whole point — the easy stuff handles itself, the CRO only sees what actually needs a human."

**Pacing:** Type the form fields at human speed. Don't do the demo voice. You're a rep submitting a real deal.

---

### 16:00 — 22:00 — Switch to the CRO, draft the AI summary, approve

**Visual:** Russell navigates to `/cro`. Login screen. He enters `cro@demo.com` / `demo123`. Then the queue page loads — 4 deals, including the one he just submitted plus the 3 seeded ones.

**Talk track:**
> "Now I'm the CRO. Different person, different view. I go to /cro.
>
> [Click the URL bar, type /cro, hit Enter.]
>
> Login. The app made me build login because the CRO page asked for it — one line in the spec said 'requires login,' and the app figured the rest out. Email, password.
>
> [Sign in.]
>
> Here's the queue. Four deals waiting on me. Acme — that's the one Mike just submitted. Plus three others from earlier today. Each one is over 20 percent, that's why I'm seeing them.
>
> I want a recommendation on Acme. I click Draft AI Summary.
>
> [Click. Wait 3-5 seconds for the response to stream in.]
>
> The AI just read the deal — customer, discount, list price — and wrote me a paragraph. It's looking at: why might the rep want this, what's the dollar impact, what's the strategic risk, approve or reject. Plus a risk score.
>
> [Read the response aloud, slowly. Whatever Meph generates, riff on it briefly.]
>
> Risk score 6. Recommends approve with a 3-year lock-in clause. That's a real recommendation. Not 'here are some things to consider' — an actual call. I can argue with it, but I don't have to start from a blank page.
>
> Click approve. Done. Mike gets notified, Acme gets the contract, I'm back to my day."

**Pacing:** This is the money shot. Slow down on the AI summary. Read it aloud. Let the viewer process that the AI did the analyst work that a human used to do.

**If the AI summary is bad:** that's fine, riff on it. "It's not perfect — but I get it in 5 seconds and I edit it instead of writing it from scratch. Better than starting blank."

---

### 22:00 — 26:00 — Publish. The "this is real" moment.

**Visual:** Russell goes back to Studio. Clicks the **Publish** button. Loading state. Then a real URL appears — `deals.acme.buildclear.dev` or similar.

**Talk track:**
> "Now the part that matters. This whole time, the app's been running on my laptop. Useless to your team. Watch this.
>
> [Back to Studio. Click Publish.]
>
> One button.
>
> [Wait for the URL to appear.]
>
> Done. That URL — right there — is real. Public internet. I can send it to anyone in my company right now and they can use the deal desk. Submit deals. Log in. Approve. Real database, real users, real app.
>
> [Click the URL. New tab opens, the live site loads. Submit a quick test deal to prove it.]
>
> That's the whole thing. Spec to live URL in 26 minutes. No engineering ticket, no Retool seat, no code review."

**Pacing:** The URL appearing is the punchline. Pause for it. Then click into it and prove it works on the public internet — that's the credibility moment.

---

### 26:00 — 30:00 — The pitch close

**Visual:** Russell back on camera, full screen. Maybe a simple side-by-side title card: "Engineering: 6 weeks. Retool: $50/seat. Lovable: rewrites your file. Clear: 30 minutes."

**Talk track:**
> "Let's compare.
>
> Filing this with engineering: 6 weeks, if you're lucky. More likely, it sits in the backlog for a quarter and you build a Google Sheet workaround that someone breaks by typing TBD in the discount column.
>
> Retool: needs a developer. $50 a seat for SSO. Eighteen people on your sales team — that's nine hundred bucks a month, plus the developer's time, plus you can't run automated tests on it.
>
> Lovable or Bolt: gets you 70 percent there, then burns credits trying to fix the same bug the AI insists it solved. And the code it writes — you can't read it. You can't change it. You're stuck.
>
> Clear: $99 a month for the team plan. One file, in English, that you wrote yourself with the assistant's help. Need a new field? Add a line. Need email notifications? Two more. Recompile, redeploy, done. No ticket. No vendor. Engineering doesn't have to touch it.
>
> If you want to see this with YOUR backlog item — your approval queue, your lead router, your onboarding tracker, whatever's been stuck for six months — email me at russell@buildclear.dev. I'll set up a 30-minute Zoom and we'll build it together, live, the same way I just built this. No slides. No proposal. We just build it.
>
> Try it free at buildclear.dev. Browser-based, no install, no card. Ship the first one this Friday."

**Pacing:** Tight close. Don't drift. Read the comparison cleanly. The CTA is the email — say it twice if you can fit it. End with the Friday line — it matches the landing page headline.

---

## Post-Recording: Edit Plan

### Cuts to make
1. **Trim every Meph pause longer than 4 seconds** during the 04:00-10:00 build. Smash-cut between sections appearing. The viewer doesn't need to watch typing.
2. **Cut any moment Russell says "uh," looks at notes, or fixes a typo.** Tight is everything.
3. **Hard cut the build button click at 10:00.** Click → green check → URL → no waiting. Make it feel instant.
4. **The publish button at 22:00:** keep the full wait. That suspense is the payoff.
5. **Final length target: 18-22 minutes** after cuts. The "30 minutes" in the open is the WALL CLOCK promise, not the runtime — and after editing it should feel like 15.

### Captions to overlay
| Timestamp | Caption | Style |
|---|---|---|
| 00:08 | "30 minutes. No code." | Bold, top-center, white on dark |
| 02:30 | "← One paragraph. That's the spec." | Pointing arrow at the Meph prompt |
| 04:30 | "← The whole policy. One sentence." | Pointing at `if discount > 20` line |
| 06:00 | "← The AI lives inside the app." | Pointing at the agent block |
| 10:30 | "App built. Running on his laptop." | Lower third |
| 17:30 | "← AI just wrote the analyst's job." | Pointing at the summary |
| 22:30 | "← Real URL. Real internet. Live." | Pointing at the published URL |
| 27:00 | "Retool: $900/mo. Clear: $99/mo." | Comparison title card |
| 29:30 | "russell@buildclear.dev" | Sticky bottom for the last 30 sec |

### B-roll to film separately and intercut
1. **Russell's hand on a trackpad** — for cuts during the Meph build, when you want to break up the "watching code appear" rhythm.
2. **Close-up of the published URL bar** — frame on the URL only, ~3 sec. Use at 23:00.
3. **A spreadsheet with `TBD` typed in a discount column, breaking a downstream formula** — 5-second insert at 27:30 when you mention the spreadsheet horror story. Optional but lands hard.
4. **A laptop screen showing a JIRA ticket with status "Backlog — Q3"** — 3-second insert at 26:30. Sales-ops viewers will feel this in their bones.

---

## 60-Second Teaser Cut (for LinkedIn post)

This is the post that goes on LinkedIn with the full video linked. Goal: get sales-ops people to click play.

**Hook (0:00-0:06):** Russell on camera, fast.
> "I built a discount approval system in 30 minutes. No code. Watch."

**Build montage (0:06-0:22):** Hyperspeed (3-4x) cuts of Meph writing the app. Caption: "This is the whole app being built." Music: low-key but propulsive — something like Tycho or a soft-edge house track.

**Submit a deal (0:22-0:30):** Real-time. Russell types in the form, hits submit, queue updates. Caption: "Sales rep submits a $240k deal, 30% off. It auto-routes to the CRO."

**The AI summary moment (0:30-0:42):** Real-time. Click "Draft AI Summary." Pan to the response. Caption: "The AI just wrote the analyst's first draft. Risk score 6. Recommends counter at 25%."

**Publish (0:42-0:50):** Click Publish, watch the URL appear, click it, live page loads. Caption: "One button. It's on the public internet."

**Close (0:50-0:60):** Russell back on camera.
> "30 minutes. No engineering ticket. No Retool license. Try it free at buildclear.dev — link below."

**LinkedIn caption to post with the teaser:**
> If your engineering team's backlog has "deal desk" or "approval queue" sitting in Q3 — watch this.
>
> I built a working discount-approval workflow in 30 minutes. No code. Database, login, AI-drafted CRO summaries, the whole thing. Then I clicked publish and it was live on a real URL.
>
> If your sales-ops team is hacking this together in Google Sheets and Slack threads, DM me. I'll build YOUR version live with you, free, in a 30-min Zoom.
>
> Full 18-min walkthrough below. Try it yourself at buildclear.dev — browser-based, no install.

---

## What success looks like

- **Click-through to the long video:** 8%+ of LinkedIn views.
- **DMs from sales-ops titles:** at least 5 in the first week from a 100-DM cold push.
- **Demo bookings from the email CTA:** 2-3 in the first week.
- **The video gets re-shared by one ops influencer** within 30 days. (Bonus, not required.)

If the long video gets watched and the DMs don't come, the close is wrong — re-cut the last 4 minutes with a sharper CTA. If the DMs come but the demos don't book, the email is too hard to find — put it on screen for the entire last minute, not just at the end.

## What NOT to do in the recording

- Don't say "compile," "endpoint," "agent," "function," "validator," "schema," "auth," "middleware," "JSON," or "deploy." Replace with: "build itself," "the part that talks to the database," "AI assistant inside the app," "a step the app does," "a check," "the storage shape," "login," "the layer in between," "structured response," "publish."
- Don't apologize for the AI taking 5 seconds. Five seconds is fast.
- Don't compare to ChatGPT. Marcus doesn't care about ChatGPT for this.
- Don't say "imagine" or "what if." You're showing them. They don't have to imagine.
- Don't pitch the compiler, the language, or the "thesis." Pitch the outcome.
- Don't show the .clear source code zoomed in for more than 3 seconds at a time. The shape matters; the syntax doesn't.
