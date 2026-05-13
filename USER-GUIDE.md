# The Clear Language Guide

*A friendly introduction for humans who want to understand what the AI just built.*

Welcome! You're about to learn Clear — a programming language that reads like English.

Here's the deal: when AI builds you an app, it writes Clear code. You open the file,
read it, and understand exactly what your app does. No JavaScript. No Python. No
mystery. Just plain sentences that say what they mean.

**You don't need to know how to program.** If you can read a recipe, you can read Clear.

(And if you CAN program, you'll appreciate how much less typing there is.)

Let's jump in.

---

## Table of Contents

**Foundations — your first day with Clear**
- [Chapter 1: Your First Deal](#chapter-1-your-first-deal-reading-code-aloud)
- [Chapter 2: Approve or Reject](#chapter-2-approve-or-reject-when-the-app-decides-for-you)
- [Chapter 3: A Queue of Deals](#chapter-3-a-queue-of-deals-when-one-isnt-enough)
- [Chapter 4: A Reusable Recipe](#chapter-4-a-reusable-recipe-functions)
- [Chapter 5: Your First Web URL](#chapter-5-your-first-web-url-from-script-to-server)

**Full-stack basics — apps with a database and a real backend**
- [Chapter 6: Save Deals to a Database](#chapter-6-save-deals-to-a-database-make-it-stick)
- [Chapter 7: The Deal Desk Page](#chapter-7-the-deal-desk-page-from-curl-to-browser)
- [Chapter 8: Logging In and Owning Your Deals](#chapter-8-logging-in-and-owning-your-deals-the-wall-between-users)
- [Chapter 13: Working with Data](#chapter-13-working-with-data)
- [Chapter 15: Modules](#chapter-15-modules-when-one-file-isnt-enough)

**Making it pretty — visual layer**
- [Chapter 13b: Charts (Visualizing Your Data)](#chapter-13b-charts-visualizing-your-data)
- [Chapter 20: Designing Beautiful Pages](#chapter-20-designing-beautiful-pages)

**Workflow apps — when humans approve, reject, and decide**
- [Chapter 9: The CRO Approval Queue](#chapter-9-the-cro-approval-queue-from-crud-app-to-workflow-app)

**Triggered emails and AI — when your app needs to reach out or think**
- [Chapter 10: Email the Rep When Approved](#chapter-10-email-the-rep-when-approved-from-outbox-row-to-real-email)
- [Chapter 11: The AI Drafter (Claude Writes the Deal Summary)](#chapter-11-the-ai-drafter-claude-writes-the-deal-summary)
- [Chapter 11b: Building Real Agents (Tools, Memory, Schedules, Multi-Agent)](#chapter-11b-building-real-agents-tools-memory-schedules-multi-agent)

**Provable correctness — closing the tutorial track**
- [Chapter 12: Provable Business Rules (Math, Not Just Tests)](#chapter-12-provable-business-rules-math-not-just-tests)
- [Chapter 12b: Provable Agent Bounds (Math for Agents Too)](#chapter-12b-provable-agent-bounds-math-for-agents-too)

**Reference — chat, workflows, Marcus primitives**
- [Chapter 10b: Chat Interfaces](#chapter-10b-chat-interfaces-making-your-app-talk)
- [Chapter 19: Workflows (Multi-Step AI Pipelines)](#chapter-19-workflows-multi-step-ai-pipelines)

**Marcus apps — work-management primitives**
- [Chapter 19b: Approval Queues (The Deal Desk in 10 Lines)](#chapter-19b-approval-queues-the-deal-desk-in-10-lines)
- [Chapter 19c: Triggered Emails](#chapter-19c-triggered-emails-send-the-customer-a-real-reply)
- [Chapter 22: Scheduled Tasks](#chapter-22-scheduled-tasks-set-it-and-forget-it)

**Production concerns — security, errors, policies**
- [Chapter 25: Security](#chapter-25-security-the-part-you-cant-skip)
- [Chapter 14: Error Handling](#chapter-14-error-handling-because-things-go-wrong)
- [Chapter 21: Policies (Safety Guardrails)](#chapter-21-policies-safety-guardrails)

**Testing and provable correctness**
- [Chapter 17: Testing](#chapter-17-testing-proving-your-code-works)
- [Chapter 23: Writing Tests](#chapter-23-writing-tests-proving-your-api-works)
- [Chapter 24: Writing Business Rules (Provable Policies)](#chapter-24-writing-business-rules-provable-policies)
- [Chapter 24b: Audit Reports](#chapter-24b-audit-reports-hand-a-compliance-buyer-a-pdf)

**Tooling and shipping**
- [Chapter 16: The Clear CLI](#chapter-16-the-clear-cli-your-toolbox)
- [Chapter 16b: Clear Studio](#chapter-16b-clear-studio-the-ide)
- [Chapter 18: Going Live (Deploying Your App)](#chapter-18-going-live-deploying-your-app)

**Reference**
- [Quick Reference](#quick-reference)
- [You Did It](#you-did-it)

---

## Chapter 1: Your First Deal (Reading Code Aloud)

Welcome. Take a breath. By the end of this chapter you'll have a real program running on your computer that prints out a sales deal — not a toy, an actual deal, like the kind a salesperson at a software company sends to a customer. We'll add to this same deal across the next eleven chapters until it grows into a full app called **deal-desk** that real companies use to approve discounts.

If you've never written code before, you're in the right place. Clear was designed so a curious 14-year-old can read it. We'll explain every word as it comes up.

### What is a program, anyway?

A program is a list of instructions for the computer. You write them in a file. You tell the computer "run this file." The computer reads each line in order and does what it says.

That's it. There's no magic. It's a recipe for a machine.

In Clear, every instruction reads like a sentence. That's the whole point — you should be able to look at any line and know what it does without anyone explaining it.

### Make a file

Open up your text editor (any editor — Notepad works, VS Code works, Studio works) and make a new file called `deal.clear`. The `.clear` ending tells your computer "this is Clear code."

Type this in:

```clear
rep_name is 'Sarah'
customer is 'Acme Corp'
list_price = 50000
discount_percent = 18
```

Four lines. Each one **gives a name to a value**. We're saying:

- The salesperson is named Sarah.
- The customer is Acme Corp.
- The list price (the sticker price before any discount) is 50,000 dollars.
- The discount Sarah is offering is 18 percent.

Each of these four names is called a **variable**. A variable is just a label you give to a value so you can refer to it later. You'll see them all over your code. Get comfortable with the word.

### Why two different ways to give a value?

Look closely at the four lines. Two of them use the word `is`. Two of them use `=`.

That's not a typo. It's a deliberate rule:

> **Numbers use `=`. Everything else uses `is`.**

Why? Because of how each line reads aloud.

Read the first line out loud: "rep name is Sarah." Sounds right. "Rep name equals Sarah" sounds wrong — equals what? The name isn't a calculation, it just IS Sarah.

Now read the third line: "list price equals 50,000." Sounds right too. Numbers can be calculated, compared, totaled. "Equals" tells the reader: this is the result of something, even if today it's just a fixed value.

Saying "list price IS 50000" would parse as a question — *Is* the list price 50000? (Hmm, let me check.) Clear refuses to be ambiguous, so it gives strings (text) the word `is` and numbers the symbol `=`. Once you internalize this, you'll never mix them up.

### Doing some math

Add two more lines below your four:

```clear
discount_amount = list_price * (discount_percent / 100)
final_price = list_price - discount_amount
```

Two more variables. Both are numbers — look, they use `=`. Each one is the result of a calculation:

- `discount_amount` is `list_price` multiplied by `discount_percent` divided by 100. The parentheses make sure the division happens first. With our numbers: 50000 × (18 / 100) = 9000.
- `final_price` is `list_price` minus `discount_amount`. So 50000 − 9000 = 41000.

Notice we're using `discount_amount` on the SECOND new line, even though we just defined it on the FIRST new line. Order matters. Clear runs lines top to bottom. By the time the program reaches `final_price`, `discount_amount` is already known.

This is the **one operation per line** rule. Other languages would let you cram both calculations into one line. Clear says no — each line gets one job, so you can read it without unpacking.

### Show it on screen

So far we've calculated everything but haven't seen anything. The program is silent.

Add this to the bottom:

```clear
show 'Deal: {customer} ({rep_name})'
show 'List price: ${list_price}'
show 'Discount: {discount_percent}% off'
show 'Final: ${final_price}'
```

`show` is the word that puts something on screen. Other languages call it "print" or "log" — Clear calls it `show` because that's what it does for the human watching.

The curly braces `{}` mean: **drop the value of this variable into the sentence here**. So `'Deal: {customer} ({rep_name})'` reads as one finished sentence with the customer's name and the rep's name plugged in. This trick is called **string interpolation**, and it's the cleanest way to mix words and values in Clear.

The `$` in front is just a literal dollar sign — Clear leaves regular characters alone and only swaps in values where it sees the `{}` braces.

### Run it

Open a terminal in the same folder as your `deal.clear` file. Type:

```bash
clear run deal.clear
```

You should see:

```
Deal: Acme Corp (Sarah)
List price: $50000
Discount: 18% off
Final: $41000
```

That's your first program. Six variables, two calculations, four lines of output. You can read every line of the source and understand what it does without anyone translating.

### Why this matters

What you just wrote is the heart of every deal in **deal-desk** — the app you'll build over the next eleven chapters. Every deal in the system has a rep, a customer, a list price, and a discount. By Chapter 12 there'll be hundreds of deals stored in a database, a CRO approving them on a live web page, an AI drafting summaries, and an audit trail proving no rule was bent. But it all starts with the same four pieces of information you just wrote down.

### Try it yourself

1. Change `rep_name` to your own name and `customer` to a company you know. Re-run. Your name should appear in the output.
2. Change `list_price` to 100000 and `discount_percent` to 25. What's the final price? Run it and check by hand.
3. Add a fifth `show` line at the bottom: `show 'Discount amount: ${discount_amount}'`. Run it. Confirm the number matches what you'd compute on a calculator.

### What's next

In Chapter 2 we'll teach the program to **decide** something. Right now it just calculates and prints. Real apps care about whether a discount is too big — and that's where `if` comes in.

---

## Chapter 2: Approve or Reject (When the App Decides for You)

In Chapter 1, the program just printed numbers. Whether the discount was 5% or 50%, the program ran the same way and showed the same shape of output. That's fine for a calculator. It's not fine for a real business app.

Real apps care about *the kind of value*. A 5% discount is routine. A 50% discount is suspicious — somebody up the chain probably needs to sign off. Your app should be able to tell the difference and act differently.

That's what this chapter teaches: how to make Clear **make decisions**.

### What's a decision in code?

A decision is a moment in your program where the next step depends on what some value IS.

In English: "If it's raining, take an umbrella."

In Clear: `if it_is_raining then take_an_umbrella`.

Same shape. The keyword `if` introduces the question. The keyword `then` introduces the action. The action only happens if the answer is yes.

### Add a decision to the deal

Open `deal.clear` from Chapter 1 and add this line below the four `show` lines:

```clear
if discount_percent is greater than 30 then show 'NEEDS VP APPROVAL'
```

Save the file and run it again:

```bash
clear run deal.clear
```

Your `discount_percent` is 18, which is NOT greater than 30. So the `if` doesn't fire. The output is exactly what you saw in Chapter 1 — no new line.

Now change `discount_percent` to 35 (a much bigger discount) and run again. You'll see one extra line at the bottom:

```
NEEDS VP APPROVAL
```

That's a decision. The program looked at a value, asked a question, and acted based on the answer.

### Comparisons in Clear — words, not symbols

Most languages use cryptic symbols like `>=` and `!=`. Clear uses words because that's how a human talks:

```clear
if discount_percent is greater than 30 then show 'too big'
if discount_percent is less than 5 then show 'too small'
if discount_percent is at least 20 then show 'large discount'
if discount_percent is at most 10 then show 'small discount'
if rep_name is 'Sarah' then show 'hi Sarah'
if rep_name is not 'Sarah' then show 'who is this?'
```

Read each one out loud. Each one sounds like English. That's not a coincidence — it's the entire design.

The six most useful comparisons:

| What you say | What it means |
|---|---|
| `is greater than` | strictly more |
| `is less than` | strictly less |
| `is at least` | more or equal — useful when the boundary counts |
| `is at most` | less or equal — useful when the boundary counts |
| `is` | exactly equal (for strings, numbers, true/false) |
| `is not` | not equal |

You'll use these constantly. They cover almost every business question your code will ever ask.

### When the answer might be either yes or no — the `otherwise` block

Sometimes you want the program to do one thing if the answer is yes AND something different if it's no. That's where you spread the `if` across multiple lines and add `otherwise`.

Replace your one-liner with this:

```clear
if discount_percent is greater than 30:
  show 'NEEDS VP APPROVAL'
  show 'Reason: discount over 30%'
otherwise:
  show 'AUTO-APPROVED'
  show 'Reason: discount under 30%'
```

Notice the colons (`:`) at the end of `if` and `otherwise`. The colon means "what follows, indented underneath, is the body of this block." Clear uses indentation to show what belongs to what — same idea as outlining a paper. The two indented lines under `if` only run if the answer is yes; the two under `otherwise` only run if it's no.

Run the program with `discount_percent = 18`:

```
Deal: Acme Corp (Sarah)
List price: $50000
Discount: 18% off
Final: $41000
AUTO-APPROVED
Reason: discount under 30%
```

Now change to `discount_percent = 35` and run again:

```
Deal: Acme Corp (Sarah)
List price: $50000
Discount: 35% off
Final: $32500
NEEDS VP APPROVAL
Reason: discount over 30%
```

Same program, different value, different output. The decision is real.

### Why this matters

What you just built — "discounts over 30% need VP approval" — is the **seed of a real business rule**. By Chapter 12 we'll teach Clear to *prove* that this rule can never be bypassed by any user, on any deal, at any time. That's the kind of guarantee a CRO will pay for. But the foundation is what you wrote today: a program that looks at a value, asks a question, and acts on the answer.

Almost every line of business code in the world is some version of this. "If the order is over $10,000, ask for a manager's approval." "If the customer's plan is enterprise, charge a different rate." "If the deal closed this quarter, count it toward the team's quota." Same shape, different specifics. Once you can write `if`, you can write the heart of any policy.

### Try it yourself

1. Change the threshold from 30 to 25. Re-run with `discount_percent = 28`. What does it say now?
2. What if you want a third tier — a "warning" branch for discounts between 20 and 30? Hint: nest a second `if` inside the `otherwise` block.
3. Add a comparison on `final_price` instead of `discount_percent`. Show 'BIG DEAL' if the final price is at least $40,000.

### What's next

In Chapter 3 you'll learn about **lists** — when the app needs to track many deals at once, not just one. That's the step that turns a calculator into the start of a real database app.

---

## Chapter 3: A Queue of Deals (When One Isn't Enough)

In Chapters 1 and 2 you wrote a program with ONE deal. That's a useful start, but it's not how a real sales team works. The CRO has a *queue* of pending deals — sometimes ten, sometimes fifty, sometimes empty. The program has to handle "many deals" not "one deal."

This chapter teaches you about **lists** (a way to hold many values under one name) and **loops** (a way to do the same thing for every value without writing it out repeatedly).

### What is a list?

A list is a sequence of values, in order. Real-world examples:

- Your shopping list (eggs, milk, bread)
- A queue of customers waiting to be served at the deli counter
- The pending deals on the CRO's screen this morning

In all three cases you have many values that share a kind. You can count them, look at the first one, add new ones, take old ones off. That's a list.

### Make a list of pending deals

Open `deal.clear` and replace your single deal's contents with this:

```clear
pending_deals is an empty list
add 'Acme Corp ($50000, 18% off)' to pending_deals
add 'BlueBird ($25000, 8% off)' to pending_deals
add 'Northwind ($120000, 35% off)' to pending_deals
```

`pending_deals is an empty list` makes a new empty list and gives it a name. Notice the `is` — a list is a thing, not a number, so it gets `is` (same rule as Chapter 1). `add X to pending_deals` puts a value at the end. After three `add` lines, the list holds three strings — one per deal awaiting CRO review.

### Loop through every deal

Now we want to print every deal. We could write three `show` lines, but that doesn't scale to fifty deals. Use a loop:

```clear
for each deal in pending_deals:
  show deal
```

`for each X in <list>:` is Clear's loop. The colon means a block follows. The indented line under the loop runs ONCE for every value in the list. Each time through, the variable `deal` holds the current value.

This is the **don't repeat yourself** rule in action. The same logic, written once, runs for every item — whether the list has 3 entries or 3,000.

Clear also understands natural selector phrases like `first pending deal of deals`
or `last pending deal of deals`. Use the shorter `first of deals` when the
noun is already obvious.

Run it:

```bash
clear run deal.clear
```

You should see:

```
Acme Corp ($50000, 18% off)
BlueBird ($25000, 8% off)
Northwind ($120000, 35% off)
```

Three lines of output for three values in the list. Add a fourth `add` line, re-run, get four output lines. The code didn't change — only the data did.

### Count, total, average

Now upgrade your list so each entry is a *number* — the discount percent — instead of a description string. We can do real math on it:

```clear
discounts is an empty list
add 18 to discounts
add 8 to discounts
add 35 to discounts
add 12 to discounts

how_many = count of discounts
biggest = max of discounts
average = avg of discounts

show '{how_many} pending deals'
show 'Biggest discount asked: {biggest}%'
show 'Average discount asked: {average}%'
```

`count of`, `max of`, `avg of` are built-in operations Clear gives you for any list of numbers. There are more — `sum of`, `min of`, `first of`, `last of`. Use them whenever you need ONE summary value out of a whole list.

Run it:

```
4 pending deals
Biggest discount asked: 35%
Average discount asked: 18.25
```

That's real information about a queue of deals, computed by four lines of code. The same lines work for 4 discounts or 4,000 — the list size doesn't matter, the operations do the right thing for any size.

### Combining a loop with a decision

Remember the `if` from Chapter 2? Now combine it with the loop. For every deal in the list, decide whether it needs VP approval:

```clear
for each d in discounts:
  if d is greater than 30:
    show '{d}% — NEEDS VP APPROVAL'
  otherwise:
    show '{d}% — auto-approved'
```

Notice the indentation: `if` is indented under `for each` because it's inside the loop body. `show` is indented further because it's inside the `if` body. Two levels of nesting. Clear uses indentation to show what belongs to what — same as outlining a paper.

Run it:

```
18% — auto-approved
8% — auto-approved
35% — NEEDS VP APPROVAL
12% — auto-approved
```

One CRO-routable list, four lines of plain output, zero ambiguity about which deals need attention. That's the start of a real triage system.

### A safety net for loops you can't count in advance

`for each` is great when the list size is known up front. But sometimes you don't know how many times to repeat — maybe you're paginating through a server that returns deals 50 at a time until there are no more. For that you use `while`:

```clear
count = 0
while count is less than 5:
  show 'Counting: {count}'
  increase count by 1
```

`while` keeps repeating the body as long as the question stays true. This loop runs five times — when `count` reaches 5, the condition fails and the loop stops.

**Clear automatically caps every `while` loop at 100 iterations.** Why? Because if you forget to increase `count`, the loop would run forever and lock up your program. The cap makes the program error out instead of hanging. If you legitimately need more than 100 iterations, declare it:

```clear
while has_more_pages, max 1000 times:
  page = fetch_next_page()
```

When the cap is hit, you get a clear error message instead of a frozen process. The compiler picks safe defaults so you never silently hang. (Same idea protects recursive functions and email sends — defaults that catch mistakes before they become bugs in production.)

### Why this matters

The deal-desk app you'll build has hundreds of deals at once — pending, approved, rejected, awaiting customer. Every page that shows a queue is a list, looped through with `for each`. Every dashboard stat ("12 deals pending", "average discount 18%") is a `count of` or an `avg of`. Every "needs approval" badge is the `if` inside a loop. The few lines you wrote today are the entire shape of how the app handles many records. Future chapters will swap your in-memory lists for a real database, but the loop and aggregate patterns stay exactly the same.

### Try it yourself

1. Add a fifth value to `discounts` (try `add 22 to discounts`). Re-run. Confirm `count` says 5 and the average shifts.
2. Change the threshold in the loop from 30 to 25. Which deals now need VP approval?
3. Add a new aggregate: `total_discount = sum of discounts` and show it. What does the number mean in business terms? (Hint: it's not a dollar amount — it's the sum of percentages.)

### What's next

In Chapter 4 you'll learn about **functions** — a way to wrap a piece of logic (like "compute the discount amount from list price and percent") and give it a name, so you can reuse it many times without copying the math. That's the last building block before Chapter 5, where deal-desk becomes a real web app.

---

## Chapter 4: A Reusable Recipe (Functions)

In Chapter 1 you wrote `discount_amount = list_price * (discount_percent / 100)` for ONE deal. In Chapter 3 you put four discounts in a list. What happens when you want to compute the discount amount for every deal in the queue?

You COULD copy the math line into the loop body. That works for now. But the moment you want to do the same calculation in a SECOND place — say, on a deal-detail page later — you'll copy the line again. Now the same math lives in two spots. If the formula ever changes (you decide to round to cents, or apply a loyalty bonus), you have to update BOTH copies. Miss one, and the two places start disagreeing — a bug that's almost impossible to spot because the code "looks right."

The fix is a **function**: a piece of logic that has a name and lives in exactly one place.

### What is a function?

A function is a recipe with:

- a **name** (like `compute_discount_amount`)
- a list of **inputs** (the ingredients — list price, discount percent)
- a **body** (the steps the recipe does)
- a **result** (what it gives you back)

You write the recipe once. Anywhere you need it, you call it BY NAME and pass the ingredients. The recipe runs, hands back the result. If the recipe ever needs to change, you change it in one place — every caller picks up the new version automatically.

Think of a function the way you think of a formula in a spreadsheet — except it has a name, lives outside the cell, and you can use it from anywhere.

### Your first function — one-line form

For simple math, Clear has a one-liner shape:

```clear
discount_amount(list_price, percent) = list_price * (percent / 100)
```

That's the whole function. Read it left to right: "Discount amount, given a list price and a percent, equals list price times percent divided by 100."

Use it:

```clear
discount_amount(list_price, percent) = list_price * (percent / 100)

acme = discount_amount(50000, 18)
bluebird = discount_amount(25000, 8)
northwind = discount_amount(120000, 35)

show 'Acme discount: ${acme}'
show 'BlueBird discount: ${bluebird}'
show 'Northwind discount: ${northwind}'
```

Run it:

```bash
clear run deal.clear
```

```
Acme discount: $9000
BlueBird discount: $2000
Northwind discount: $42000
```

The math lives in ONE line. Three different deals, three different results, zero copy-paste. If sales policy ever decides discounts should round up to the nearest hundred dollars, you change the function once and every caller picks up the new behavior.

### Block functions — for multi-step logic

The one-liner form works when the recipe is a single expression. When the recipe has multiple steps, use the block form:

```clear
define function compute_discount_cap(tier):
  if tier is 'enterprise':
    return 50
  if tier is 'mid_market':
    return 30
  if tier is 'standard':
    return 15
  return 0
```

`define function NAME(parameters):` opens a block. The body uses `return` to hand a value back. Each line is one step — `if/then` to look at the tier, `return` the cap that matches.

Use it:

```clear
acme_cap = compute_discount_cap('enterprise')
bluebird_cap = compute_discount_cap('standard')

show 'Acme can discount up to {acme_cap}%'
show 'BlueBird can discount up to {bluebird_cap}%'
```

Run:

```
Acme can discount up to 50%
BlueBird can discount up to 15%
```

Two callers, two results, one rule that lives in one place. If sales policy changes — say, mid-market jumps to 35% — you change it once in the function body and every caller sees the new cap on the next run.

### Why two forms?

Both shapes exist for the same reason a hammer and a sledgehammer both exist: pick the one that fits the job.

- **One-liner** (`name(args) = expr`) — for math you can write in one breath. Clean, and visually distinct from regular variables because of the parentheses.
- **Block** (`define function name(args):`) — for anything that needs `if`, multiple steps, or temporary variables. Uses `return` to send the answer back.

You'll see both in real Clear apps. Most calculation helpers fit the one-liner. Anything with a decision tree or a loop wants the block.

### Catch mistakes early — typed parameters

When you write a function, you can label what KIND of value each parameter is. Clear will then warn you if you call the function with the wrong kind.

```clear
define function discount_amount(list_price is number, percent is number) returns number:
  return list_price * (percent / 100)
```

`is number` after each parameter says "this should be a number, not a string." `returns number` says "this function gives back a number."

Now if you slip up and write `discount_amount('50000', 18)` (with the price as a string), Clear catches it BEFORE the program runs and points at the line. Without types, the program would still run but might give you a baffling result like `"5000018"` (string concatenation instead of math).

Types are **optional**. Functions without types still work fine. Adding types to your important business functions is cheap insurance — they document what the function expects AND catch caller bugs early. The available types: `text`, `number`, `boolean`, `list`, `map`, `any`.

### Why this matters

Look back at `compute_discount_cap`. You just wrote a small business rule: "enterprise customers can discount up to 50%, mid-market up to 30%, standard up to 15%."

In Chapter 12 we'll teach Clear to **prove** that no compiled deal-desk endpoint can EVER let a discount through that exceeds this cap. Not "we'll write tests that probably catch it" — *prove*. Provable rules are what makes deal-desk a regulated-tier app a CRO will pay for. And the foundation for that proof is what you wrote today: a function with a clear input-to-output mapping.

Functions also make tests trivial. In Chapter 17 you'll write `expect compute_discount_cap('enterprise') is 50` as a one-liner test — and Clear can mathematically prove that line is true for every possible call.

### Try it yourself

1. Add a fourth tier to `compute_discount_cap`: `'partner'` returns 60. Call it with a partner deal and confirm the cap shows 60.
2. Write a one-liner function `final_price(list_price, percent)` that gives back the price after the discount. Use it on the three deals from earlier and show the results.
3. Combine functions and a loop: for each pending deal in a list, compute the final price using your new function. (Hint: you'll need records to make this clean — that's Chapter 6. For now hard-code three deals as separate variables.)

### What's next

Chapter 5 is the **leveling-up moment**: deal-desk becomes a real web app. Instead of `clear run` printing to your terminal, you'll spin up a server with `clear serve`, point your browser at a URL, and get the deal data back. Same Clear primitives — variables, ifs, loops, functions — wrapped in a couple of lines that say "this should be reachable at /api/deals over the web."

---

## Chapter 5: Your First Web URL (From Script to Server)

So far every program in this guide has been a *script*. You ran `clear run deal.clear`, the program printed something to your terminal, and it exited. That's a useful shape — a recipe that runs from top to bottom and stops — but it's not what people usually mean when they say "an app."

The deal-desk app a sales team actually uses isn't a script. It's a *server*: a program that stays running and answers requests from web browsers. When the CRO opens deal-desk on her laptop and the pending-deals queue appears, she's not running a script — her browser asked your program for the queue, and your program sent it back. By the end of this chapter you'll have written that program. You'll start it with `clear serve`, hit it from another terminal with `curl`, and see your list of deals come back as a web response.

This is the moment deal-desk levels up from "thing on your laptop" to "thing on the web."

### What is an URL, really?

An URL — `https://deal-desk.example.com/api/deals` — is just an *address*. When someone types that address into their browser (or when JavaScript on a page calls it in the background), the browser sends a small message across the internet asking for whatever lives at that address. Somewhere, a program receives that message and decides what to send back.

URLs aren't magic. They're addresses your program answers. The first half (`https://deal-desk.example.com`) tells the internet *which machine* to talk to. The second half (`/api/deals`) tells the program on that machine *which thing you want*. Two different addresses on the same machine can serve completely different things — `/api/deals` returns the queue, `/api/deals/approved` returns approved deals, `/api/users` returns users. Same server, different addresses, different answers.

For the rest of this chapter we're only going to care about the second half — the path. Your machine answers as `localhost`, which means "this computer." So when you start the server and visit `http://localhost:3000/api/deals`, your browser is asking your laptop "what lives at /api/deals?"

### What does a server do?

A server is just a program that doesn't exit. It starts up, opens a port (think of a port as a door numbered 3000 on your computer), and sits there waiting. When a request arrives at that door, the server reads it, decides what to send back, and sends it. Then it goes back to waiting for the next request. Forever — or until you press Ctrl+C.

That's the big shift from chapters 1–4. A script runs and ends. A server runs and *keeps running*. The CRO can hit it once, hit it again ten minutes later, hit it from her phone — same server, same answers, no restart needed.

You don't have to write any of the listening, port-opening, request-parsing machinery. The Clear compiler emits all of that for you. What you write is the part that's specific to your app: what addresses you answer, and what you send back.

### What is an URL handler?

An **URL handler** is the rule that says "when *this* address gets asked for, do *this*." Pages have URL handlers. APIs have URL handlers. Every running web app is, underneath, a list of handlers — one per address.

A handler has two parts:
- which address it answers (e.g. `/api/deals`)
- what it sends back when someone asks (e.g. the list of pending deals)

In Clear you write that as one block of code. Concept first; we'll show the syntax in a moment. Read the concept twice if you've never built a server before — once you have it, the syntax is almost mechanical.

### Your first handler

Open `deal.clear` and replace its contents with this:

```clear
build for javascript backend

discounts is an empty list
add 18 to discounts
add 8 to discounts
add 35 to discounts
add 12 to discounts

when user requests data from /api/deals:
  send back discounts
```

That's the entire program. Eight lines, and it's a real web server. Let's walk it.

`build for javascript backend` is a one-line instruction to the compiler: "this program is going to be a backend server." Without that line Clear wouldn't know whether to generate a script (chapters 1–4) or a server (this chapter). The four `discounts` lines are exactly the list you built in Chapter 3 — the same percentages, the same shape — except now they live inside a server program instead of a one-shot script.

The new piece is the last two lines.

`when user requests data from /api/deals:` is the URL handler. Read it aloud: *"when a user requests data from /api/deals."* It says "if anyone — a browser, a curl command, another program — asks for the address `/api/deals`, run the indented block." The colon at the end opens a block, the same way `if`, `for each`, and `define function` opened blocks in the earlier chapters. Indentation tells Clear what's inside the handler.

`send back discounts` is the body. When the request arrives, the server packages up the `discounts` list and sends it to whoever asked. That's it. No HTML templates, no setting headers, no handling JSON encoding — `send back X` does the right thing. Clear ships your list back to the caller as JSON (more on what that means in a second).

> **Synonym:** `when user calls GET /api/deals:` works too — both forms parse to the same handler. The plain-English `when user requests data from` is canonical because it reads aloud the way a manager would describe what's happening. Use it.

### Now run this

Save `deal.clear`. In your terminal, from the directory where the file lives, run:

```bash
clear serve deal.clear
```

You'll see output like this:

```
Server running on http://localhost:3000
```

That's your server. It's now listening on port 3000 of your machine, waiting for requests. Don't close that terminal — the server runs as long as that command keeps running. (When you want to stop it, hit Ctrl+C in that terminal.)

Now open a *second* terminal — leave the server running in the first one — and ask the server for `/api/deals`:

```bash
curl http://localhost:3000/api/deals
```

`curl` is a small command-line tool that sends a request to a URL and prints whatever comes back. (If you don't have curl, paste the URL into your browser instead — same result.) You should see:

```
[18,8,35,12]
```

That's your discounts list, served back as a web response. Square brackets, comma-separated values — that's JSON, which we'll cover in a second. Your program just answered its first web request.

### What is JSON?

JSON is the standard way servers and browsers exchange data. It's the same idea as Python lists or JavaScript arrays — square brackets for lists, curly braces for records, commas between items, quotes around strings. Almost every API on the web speaks JSON. When Clear's `send back` ships your list, it converts it to JSON automatically. When you call an API later (Chapter 6), Clear will turn JSON it receives back into Clear values for you. You don't have to think about JSON beyond knowing that's what those `[ ]` brackets are.

If your `discounts` list were empty, the server would have answered with:

```
[]
```

That's an empty JSON list — zero items. Same shape, no contents. We'll see that exact output when we start with a real database in Chapter 6 (no rows yet → `[]` comes back).

### Add a second handler

A real app answers many addresses, not just one. Let's add a second handler that returns just the deals over the cap.

```clear
build for javascript backend

discounts is an empty list
add 18 to discounts
add 8 to discounts
add 35 to discounts
add 12 to discounts

when user requests data from /api/deals:
  send back discounts

when user requests data from /api/deals/over-cap:
  big_ones is an empty list
  for each d in discounts:
    if d is greater than 30:
      add d to big_ones
  send back big_ones
```

Two handlers, two addresses. The second one walks the discounts list, picks out the ones over 30, and sends those back. Notice how *everything* you learned in chapters 1–4 — lists, `for each`, `if`, comparisons — works the same inside a handler body. A handler body is just a Clear block. The new ingredient isn't a new way to write logic; it's a new way to *expose* logic over the web.

Stop the running server (Ctrl+C in the first terminal), then start it again with the new file:

```bash
clear serve deal.clear
```

Hit both addresses:

```bash
curl http://localhost:3000/api/deals
curl http://localhost:3000/api/deals/over-cap
```

You should see:

```
[18,8,35,12]
[35]
```

The first address returned everything. The second returned only the discount that exceeds the 30% cap. Same data, two different views, two different addresses.

### Why this matters

Every full-stack app you've ever used works this way under the hood. Gmail's "show me my inbox" is an URL handler. Stripe's "charge this card" is an URL handler. The deal-desk app from `apps/deal-desk/main.clear` (the canonical reference Marcus app) has roughly a dozen handlers — `/api/deals/pending`, `/api/deals/approved`, `/api/deals/rejected`, one per slice of the queue. They're all the exact shape you just wrote: `when user requests data from /api/X:` followed by `send back something`.

For the experienced developer skimming: notice what you *didn't* write. No Express boilerplate. No router definition. No `app.listen(3000)`. No JSON serialization. No CORS middleware. The compiler emitted all of it. What's in your file is exactly the part that's specific to your business — the addresses you answer and the data you return — and nothing else. That's the whole pitch: Clear's verbs map 1:1 to the parts a human cares about, and the framework noise lives in the compiled output where you don't have to read it.

For the newcomer: you just built a real web server. It's eight lines. It runs. It answers requests. The thing you've been clicking on every website for years — your program now does that.

### Try it yourself

1. **Add a `/api/deals/count` handler** that sends back the count of discounts. (Hint: `count of discounts` from Chapter 3 gives you the number; you can `send back` it directly without storing it in a variable.) Restart the server, hit it with curl, confirm you get `4`.
2. **Make the `/api/deals/over-cap` threshold configurable.** Define a function `is_over_cap(percent)` that returns true when the percent exceeds 30. Use it inside the loop instead of the inline `if`. Pulled the comparison into one named place — same idea as Chapter 4.
3. **Open the URL in your browser** instead of using curl. Visit `http://localhost:3000/api/deals` in Chrome or Firefox. The browser will display the same JSON. (If your browser tries to download the file instead of showing it, that's fine — the response is still correct, your browser just doesn't know it's safe to display.)

### What's next

Right now your discounts list is hard-coded into the program. Restart the server and the list resets. Type four `add` lines in your editor; that's the only way new deals enter the queue. That's not a real app — a real app *remembers* deals across restarts and lets users add new ones from a form.

In Chapter 6 we'll swap your in-memory list for a real **database**. You'll declare a `Deals` table with named fields (rep, customer, list price, discount), and your handler will query the database instead of an in-memory list. Then we'll add a *second* handler — a POST endpoint — that lets a caller send a new deal to the server and saves it to the table. Restart the server, the deals are still there. That's persistence: data that survives across runs. The line you wrote today (`when user requests data from /api/deals: send back discounts`) is going to evolve into one line: `send back all Deals`. Same shape, real data underneath.

---

## Chapter 6: Save Deals to a Database (Make It Stick)

By the end of this chapter, every deal you submit will survive a server restart. The CRO can post a deal in the morning, kick the box at lunch, and the deal is still there in the afternoon. That's the line between a *demo* and a *product* — and it takes about ten lines of Clear to cross it.

In Chapter 5 you wired up your first URL handler — `/api/deals` returned a hard-coded list. That was a great first step, but the list lived in the program's memory. Stop the server, start it again, and the list is empty. This chapter swaps that in-memory list for a real database. Same shape from the outside; durable underneath.

### What is a database, really?

A database is a place where data lives **between** page reloads, browser refreshes, and server restarts. Without one, every keystroke is goldfish memory — the moment the program ends, it's gone. With one, your app can remember what users typed last Tuesday at 4pm.

You've used databases your whole life without calling them that. A spreadsheet on your laptop is a tiny database. The contact list in your phone is one. The library card catalog is one. They all share the same trick: information stays *put* on disk, so you can come back tomorrow and find it where you left it.

Clear apps get a database for free. You don't install Postgres or learn SQL. You write four lines that say "here's a table called Deals, here are its fields," and Clear takes care of the file on disk, the queries, and the round-trip from your endpoint to that file and back.

### What is a table?

A **table** is a list of records that all have the same shape. Picture a spreadsheet:

```
| id | rep_name | customer    | list_price | discount_percent | status   |
|----|----------|-------------|------------|------------------|----------|
| 1  | Sarah    | Acme Corp   | 50000      | 18               | pending  |
| 2  | Sarah    | BlueBird    | 25000      | 8                | approved |
| 3  | Marcus   | Northwind   | 120000     | 35               | pending  |
```

Each **row** is one deal. Each **column** is a field that every deal has. The shape stays consistent — every row has a customer, a list price, a discount percent, a status. New deals get added as new rows. The shape is set once when you create the table.

This is exactly the same idea as the list of pending deals you wrote in Chapter 3 — just persistent and with named fields instead of free-form strings. Remember `add 'Acme Corp ($50000, 18% off)' to pending_deals`? That single string had to mash four pieces of information together. A table breaks them apart, gives each one a name, and writes them down where the next program run can find them.

### Make the Deals table

Open `deal.clear` (the file you've been growing across the last five chapters) and add this near the top, right after `build for web and javascript backend`:

```clear
build for web and javascript backend
database is local file

create a Deals table:
  rep_name, required
  customer, required
  list_price (number), default 0
  discount_percent (number), default 0
  status, default 'pending'
  created_at, auto
```

Two new ideas in those eight lines. Take them one at a time.

**`database is local file`** tells Clear to keep the data in a file on disk (`clear-db.sqlite`, sitting next to your `.clear` file) instead of just in memory. That's the whole "make it stick" switch. If you wrote `database is local memory` instead, the server would still work — but every restart would empty the table. We'll use the disk version for the rest of the tutorial.

**`create a Deals table:`** declares the shape. The block underneath is one field per indented line. Read it top to bottom:

- `rep_name, required` — a text field that every deal must have. The compiler will reject any save that's missing it.
- `customer, required` — same idea, but for the customer name.
- `list_price (number), default 0` — a numeric field. The `(number)` tag tells Clear "store this as a number, not a string." `default 0` means if the caller forgets to send a price, we record zero rather than crash.
- `discount_percent (number), default 0` — same pattern: numeric, with a sensible default.
- `status, default 'pending'` — a text field that starts as `'pending'` for every new deal. Once a CRO approves or rejects (Chapter 9), you'll change it to `'approved'` or `'rejected'`.
- `created_at, auto` — a timestamp Clear sets automatically the moment the row is saved. You never write to it; the runtime does.

Notice the small grammar of field types. Plain text needs no annotation (text is the default). Anything that should be stored as a number gets `(number)` after the field name. Booleans and timestamps work the same way; we'll see them in later chapters. The full list of field modifiers is in Chapter 6.5 — read it once and skim back when you need a reminder.

**A side note on sensitive data.** Real apps eventually store fields you don't want sitting in plaintext on disk — Social Security numbers, credit card last-fours, medical notes. Clear has a one-word answer: tag the field `sensitive` (e.g. `ssn is text, sensitive`) and the compiler encrypts it before it touches the database, decrypts it on read, and strips it from the API response by default. The `Deals` table here doesn't need it — a list price isn't sensitive. But the moment you build a table with a payment method or a personal identifier, reach for `sensitive`. Chapter 6.5 has the full picture; the design rule is *"if your CTO would lose sleep if it leaked, tag it sensitive."*

### Why "create a Deals table" and not "create a Deal table"?

Clear leans on plain English: a table holds *many* deals, so it gets a plural name. The compiler also uses the plural to figure out the singular form when you save one record at a time — `save deal as new Deal`. Singular **Deal** for one row, plural **Deals** for the table. This matches how you'd say it out loud.

### Save a deal — the POST endpoint

Now wire up an endpoint that *writes* to the table. Add this below the table declaration:

```clear
when user sends deal to /api/deals:
  requires login
  validate deal:
    rep_name is text, required, min 1, max 100
    customer is text, required, min 1, max 200
    list_price is number, min 0
    discount_percent is number, min 0, max 100
  new_deal = save deal as new Deal
  send back new_deal with success message
```

This is the densest seven lines you've written so far. Walk through them slowly.

**`when user sends deal to /api/deals:`** opens an endpoint that accepts incoming data. The word `deal` is the **receiving variable** — a name the rest of the body uses to talk about whatever the caller posted. We pick `deal` because the data IS one deal; that's the convention (singular entity name), and it makes the lines below read like English. (You'll see other receiving names like `signup`, `member`, `request` — always singular, always describing what arrived.)

**`requires login`** is the first line of every endpoint that *changes* data — POSTs, PUTs, DELETEs. It's the locked door. If the caller doesn't have a valid session, the request is rejected with HTTP 401 *before* any of the body runs. Without that line, anyone in the world could write deals into your table — including bots scanning the open internet.

A small wrinkle: in this chapter we haven't taught the app what login *is* yet. Chapter 8 introduces `allow signup and login` and the full auth scaffold. For right now Clear will accept the `requires login` line and skip the live auth check (because there are no users in the system yet) — but it's already in your source so the wall lands the moment Chapter 8 turns it on. Plant the seed early; never write a mutation endpoint without `requires login` as line one.

**`validate deal:`** opens a small block that says what the incoming data has to look like. Each indented line names a field, its type, and its limits. `min 1, max 100` means "the rep_name has to be between 1 and 100 characters." `min 0, max 100` on `discount_percent` blocks the kinds of mistakes that cost real money — a typo'd 200% discount, a negative price. The validator runs *before* the save; if any line fails, the caller gets a clean 400 with a message saying which field was wrong.

**`new_deal = save deal as new Deal`** is the magic line. Read it left to right: "new_deal equals save *this incoming deal* as a new *Deal* record." `save X as new T` is Clear's verb for "insert a row into the T table." It returns the saved record back — including the auto-generated `id` and `created_at` — which is why we capture it as `new_deal`. We use `=` because `save` returns a record value, the same way `total = price + tax` returns a number.

**`send back new_deal with success message`** sends the saved row back to the caller as JSON, plus a tidy `{success: true, message: '...'}` wrapper. The caller now knows the save worked and gets back the canonical version of the row (with id and timestamp filled in).

### Read the deals — the GET endpoint

In Chapter 5 your GET endpoint sent back a hard-coded list. Now point it at the database. Replace the Chapter 5 version with this:

```clear
when user requests data from /api/deals:
  all_deals = get all Deals
  send back all_deals
```

`get all Deals` is the read counterpart to `save … as new Deal`. It pulls every row out of the Deals table and gives you a list. We capture it as `all_deals` and `send back` is the same verb you used in Chapter 5 — JSON in, JSON out. The shape from the caller's view didn't change at all. The data source did.

Notice the verb is `get all`, not `find` — Clear's retrieval verbs are `get all X` and `look up X with this id`. The word `find` is reserved for searching strings ("find pattern X in text") and the compiler will flag it as a typo if you use it for tables.

### Now run this

Save the file. From the same folder, start the server:

```bash
clear serve deal.clear
```

You'll see something like:

```
Compiling deal.clear...
Compiled cleanly. Starting server.
Listening on http://localhost:3000
```

Leave that terminal running. Open a *second* terminal — the first one is busy hosting the server — and post a deal:

```bash
curl -X POST http://localhost:3000/api/deals \
  -H 'Content-Type: application/json' \
  -d '{"rep_name":"Sarah","customer":"Acme Corp","list_price":50000,"discount_percent":18}'
```

You should see something like this come back:

```json
{
  "success": true,
  "message": "Deal saved",
  "data": {
    "id": 1,
    "rep_name": "Sarah",
    "customer": "Acme Corp",
    "list_price": 50000,
    "discount_percent": 18,
    "status": "pending",
    "created_at": "2026-05-06T14:32:08.114Z"
  }
}
```

Look at what happened. You sent four fields; you got back seven. The `id`, the `status` (defaulted to `'pending'`), and `created_at` (set automatically) all came along for free. That's the table schema doing its job — every saved row has the full shape, regardless of what the caller forgot to include.

Now read it back:

```bash
curl http://localhost:3000/api/deals
```

```json
[
  {
    "id": 1,
    "rep_name": "Sarah",
    "customer": "Acme Corp",
    "list_price": 50000,
    "discount_percent": 18,
    "status": "pending",
    "created_at": "2026-05-06T14:32:08.114Z"
  }
]
```

The same deal, fetched fresh from the database. **Now do the test that proves persistence works.** Stop the server (`Ctrl+C` in the first terminal). Start it again with `clear serve deal.clear`. Run that GET curl one more time. The deal is still there. The data outlived the server.

That's the moment your app graduated from a demo to a product. Everything you've written in Chapters 1 through 5 — variables, ifs, loops, functions, URL handlers — now operates on data that *stays put*. The CRO can close her laptop, drive home, and her queue is still waiting in the morning.

### Why we used `local file` and not "a real database"

Clear apps in development run against a SQLite file (`clear-db.sqlite`) sitting next to your source. SQLite is a real database — Apple ships it inside iOS, every browser uses it, your phone has dozens of SQLite files on it right now — it just lives in one file instead of needing a separate server process. For a tutorial, a small Marcus deployment, even production apps with under a million rows, SQLite is enough.

When you eventually need a remote database (multiple servers reading the same data, dozens of users at once, automatic backups), you change *one line* — `database is local file` becomes `database is postgres at process_env('DATABASE_URL')` — and Clear emits Postgres-flavored queries instead of SQLite ones. Same `save … as new`, same `get all`, same everything else. We'll cover that in the deployment chapter (Chapter 18). For now, lean on the file.

### Why this matters

You crossed the line from "the program prints things" to "the program *remembers* things." Every chapter from here on assumes that the Deals table exists and persists. Chapter 7 puts a real HTML page on top of it so the CRO can see the queue in a browser instead of curl. Chapter 8 adds the login wall the `requires login` line is waiting for. Chapter 9 introduces the queue primitive that lets the CRO approve or reject deals. Each of those chapters reads from and writes to the same Deals table you set up today.

The other thing you just touched — without anyone calling it out — is **CRUD**. Four operations every database app does: **C**reate (the POST you just wrote), **R**ead (the GET), and later, **U**pdate (Chapter 9, when the CRO approves a deal) and **D**elete. Real apps do all four; this chapter shipped two. The remaining two follow exactly the same shape — same `when user … to /api/…:`, same receiving variable convention, same `requires login` line.

### Try it yourself

1. Post a second deal with curl — different rep, different customer, bigger discount. Run the GET. You should see two rows. The `id` on the second deal will be `2` — Clear auto-numbers them.
2. Try a POST with an *invalid* discount: `"discount_percent": 200`. The validator should reject it with a 400 and a message about `max 100`. (The math is fine — the rule isn't.) Read the response, fix the value, re-post.
3. Try a POST that's missing `rep_name`. You'll get a `required` error from the validator before any save runs. That's the wall doing its job — the table can't even *try* to insert a row that's missing a required field.

### What's next

Chapter 7 takes the URL handlers you built today and puts a real **page** on top of them. Same backend, same Deals table, same endpoints — but now the CRO opens her browser instead of typing curl. You'll learn about `page 'X' at '/X':`, `heading`, table widgets, and how Clear stitches the frontend to the backend so a button click on a web page lands in your `when user sends deal to …` handler.

---

## Chapter 6.5: Tables — Every Modifier, In Plain English

You've seen `task, required` and `completed, default false`. That's the
shape: the field name, then a comma-separated list of modifiers. This
chapter walks every modifier the table syntax accepts. Read it once;
keep it open as a reference.

### The 30-second mental model

```clear
create a Deals table:
  customer is text, required
  amount is number, required
  status is text, default 'pending'
  reviewer_id (number)
  created_at, auto
  the deal's creator can read, change, or delete
```

Every line is either a field declaration or an access rule. Field
declarations have a name, an optional type, and zero or more modifiers
separated by commas. Access rules sit anywhere in the body and describe
who can do what to each row.

### Field types

You usually don't need to declare types — Clear infers from the field name.

| Type | When you'd write it | What it stores |
|---|---|---|
| `text` (default) | `name is text` or just `name` | Strings up to ~64 KB |
| `number` | `amount is number` or `amount (number)` | Floating-point numbers |
| `boolean` | `completed is boolean` or `completed, default false` | True/false |
| `timestamp` | `created_at, auto` (auto-inferred) | ISO 8601 date string |
| Foreign key | `customer (Customer)` or `customer_id` | Integer reference to another table |

Naming conventions that auto-infer the type:
- Field ending in `_at` → timestamp
- Field ending in `_id` → foreign key (integer)
- Capitalized field name (e.g. `Customer`) → foreign key to that table

### Required, optional, unique

```clear
create a Users table:
  email is text, required, unique
  name is text, required
  bio is text                       # optional — empty allowed
```

- `required` — the field must have a value at insert time. Empty string and null both rejected.
- `unique` — no two rows can share this value. Compiler emits a UNIQUE constraint and the runtime checks before insert.

### Defaults and auto-set fields

```clear
create a Tasks table:
  title is text, required
  completed is boolean, default false
  priority is number, default 1
  status is text, default 'open'
  created_at, auto                  # set to current time on insert
  updated_at, auto                  # set on insert AND every update
```

- `default <value>` — value used when the caller doesn't supply one.
- `auto` — the runtime sets a timestamp automatically. With `_at` field name, it's inferred as a timestamp.

### Relationships

```clear
create a Customers table:
  name is text, required
  email is text, required, unique
  has many Deals                    # one customer, many deals

create a Deals table:
  customer (Customer)               # belongs to one Customer (capitalized name = foreign key)
  amount is number, required
  status is text, default 'pending'
```

Two ways to declare a relationship:
- `has many <PluralTableName>` — one-to-many on the parent side.
- `<field> (<SingularTableName>)` or `<field>_id` — many-to-one on the child side.

The compiler emits foreign-key constraints + auto-joins on lookups.

### Hiding a field instead of deleting it

```clear
create a Users table:
  name
  email, unique
  notes, hidden                     # column stays; data preserved; not shown anywhere
```

Hidden fields are in the database but invisible to API responses and UI
renderers. Un-hiding is a one-line change — remove the `, hidden`. Use
this for "remove a field" — never destroy customer data.

For renames, keep the old field around (hidden) AND add the new one:

```clear
create a Users table:
  name
  notes, hidden, renamed to reason  # old field — data preserved, copied to new field on read
  reason                            # new field
```

### Sensitive — encrypted at rest

Tag a field `sensitive` and the compiler encrypts it with AES-256-GCM
before it touches the database, decrypts on read, and strips it from
API responses by default.

```clear
create a Patients table:
  name is text, required
  ssn is text, required, sensitive  # encrypted on disk, decrypted on read
  diagnosis is text, sensitive
  the patient's creator can read, change, or delete
```

A stolen database dump reveals nothing without the key. Set the key
once via the `SENSITIVE_KEY` environment variable (16+ random
characters, recommended 32+). If the key is missing, inserts on
sensitive fields fail closed — Clear refuses to write plaintext to
disk.

To opt into returning sensitive fields from a specific endpoint:

```clear
when user requests data from /api/patients/full:
  requires login
  can return sensitive data         # endpoint-level opt-in
  patients = look up all Patients
  send back patients
```

Without that line, sensitive fields are stripped from the response.

### Per-row access rules — who can read, change, delete

Every table that holds user data should declare access rules. The
compiler auto-injects ownership checks on every read, write, update,
and delete. A stolen session token can't read another user's records.

```clear
create a Deals table:
  customer is text, required
  amount is number, required
  the deal's creator can read, change, or delete   # only the row's creator
  any admin can read                                # admins can also read
```

The plain-English forms the parser accepts:

| Rule | What it means |
|---|---|
| `the deal's creator can read, change, or delete` | Only whoever inserted the row. The compiler stamps `user_id` on insert and filters by it on every other operation. |
| `the deal's reviewer can read or change` | Whoever's id is in the `reviewer_id` field on the row. Requires that field to exist on the table. |
| `any admin can read` | Anyone whose `users.role = 'admin'`. Same shape for any role. |
| `anyone logged in can read` | Any authenticated user (no per-row gate). |
| `anyone can read` | Public. No login required. Use for catalogs, blog posts, etc. |

The verbs `read`, `change`, `delete` (or `update`) can appear in any
combination. `change` is canonical; `update` works as an alias.

In a file with security context (auth scaffold, tenant scope, a
`rule` keyword, or any other table with policies), declaring a table
without ANY access rule is a compile error. Toy single-table fixtures
without security context still get a warning. The diagnostic always
suggests three concrete fixes.

### The full example

```clear
build for javascript backend

allow signup and login

create a Users table:
  email is text, required, unique
  password_hash is text, hidden
  role is text, default 'user'
  anyone can read, change, or delete

create a Patients table:
  name is text, required
  email is text, required, unique
  ssn is text, required, sensitive
  diagnosis is text, sensitive
  primary_doctor (User)
  created_at, auto
  the patient's creator can read, change, or delete
  any admin can read

create a Visits table:
  patient (Patient)
  notes is text
  visit_date is timestamp, required
  the visit's creator can read, change, or delete
```

Six modifiers (`required`, `unique`, `hidden`, `sensitive`, `default`,
`auto`), three field shapes (typed, foreign key, capitalized FK
shorthand), three rules (creator, role, anyone). Everything you need
for a real CRUD app fits on one page.

### Three more security primitives (outside the table body)

The other three OWASP defenses sit outside the `create a … table:` block.
Two are top-of-file declarations; the third is invisible (the compiler
just does it).

**Outgoing requests allowlist (SSRF defense).** When your app calls
external HTTP, name every host at the top of the file. Variable URLs
won't compile; literal URLs outside the list won't compile.

```clear
allow outgoing requests to: 'api.stripe.com', 'api.openai.com'

when user sends payment to /api/charge:
  requires login
  result = call api 'https://api.stripe.com/v1/charges' with method 'POST' with bearer env('STRIPE_SECRET_KEY') sending {
    amount: payment's amount,
    source: payment's token
  }
  send back result
```

A malicious caller cannot redirect the request — the URL has to be
hardcoded AND in the allowlist. Without the declaration, only
private-network URLs are blocked (no `localhost`, `127.0.0.1`, etc.).

**Login rate-limit (automatic).** When you write `allow signup and login`,
the compiler auto-wires rate-limit middleware on the auto-generated
`POST /auth/login` route — 10 attempts per minute per IP. You don't
declare it; you can't accidentally forget it. Brute-force password
guessing is throttled by default.

**Hardcoded API keys: build error.** If you paste a recognizable API
key into source — Stripe (`sk_live_…`), AWS (`AKIA…`), GitHub (`ghp_…`),
Anthropic (`sk-ant-…`), OpenAI (`sk-…`) — the build fails with a
plain-English error suggesting the matching env var. Read keys from
the environment instead:

```clear
api_key is process_env('STRIPE_SECRET_KEY')
```

This catches the "I accidentally pushed live keys to a public repo at
3am" mistake at compile time.

---

## Chapter 7: The Deal Desk Page (From curl to Browser)

By the end of this chapter, the deal-desk app finally has a *human face*. You'll open a browser, type `http://localhost:3000` into the address bar, and see the queue rendered as a real web page — sidebar on the left, workbench on the right, an empty table waiting for its first row. No curl. No JSON. Just a page that looks like an app you'd actually pay for.

In Chapter 6 you taught your server how to *remember* deals — the Deals table is on disk, the POST endpoint validates and saves, the GET endpoint reads them back. Everything works, but only if you speak curl. A CRO doesn't speak curl. She opens her browser, looks at a queue, clicks Approve. This chapter wires up the part she sees.

### What is a web page, really?

A **web page** is text + structure + styling, served by your program when the browser asks for it. Every site you've ever visited works this way. The browser sends a request to an URL. Your program decides what to send back. If it sends back JSON (like Chapter 5 and 6 did), the browser sees raw data. If it sends back HTML, the browser turns that HTML into the visual page you actually see — headings, tables, buttons, the whole thing.

The "structure" part is the load-bearing word. A page isn't a wall of text — it has *parts*. A title at the top. A list of links on the side. A table in the middle. A form at the bottom. The browser learns the parts from special tags in the HTML — `<h1>` for a heading, `<table>` for a table, `<button>` for a button. The styling — colors, fonts, spacing, the way the sidebar sits next to the main column — comes from CSS. Together, structure + styling = a real page.

You don't write any of that. Clear writes it for you. What you write is the *intent*: "this page has a heading, a table of pending deals, and a sidebar with a Pending counter." The compiler turns your intent into the right HTML and CSS. You think about the queue; Clear thinks about the tags.

### What does a `page` declaration do?

Compare two lines you've seen so far:

```clear
when user requests data from /api/deals:
  send back all_deals
```

That's the URL handler from Chapter 5 — when *code* asks for `/api/deals`, the server sends back JSON. Now read this:

```clear
page 'Deal Desk' at '/':
  heading 'Pending CRO approval'
  display pending as table showing customer, list_price, discount_percent
```

Same shape — an address followed by an indented body — but with one big difference. `when user calls` returns JSON for code. `page` returns *HTML for humans*. When a real person opens `http://localhost:3000/` in their browser, the server sends back a styled page with a heading and a table. Same server, same database underneath, two different audiences.

This is the leveling-up beat for full-stack apps. Chapter 5 made the server reachable. Chapter 6 made the data persistent. Chapter 7 makes the data *visible* — to someone who's never heard of curl.

### What is a widget?

You'll write one line — `display pending as table showing customer, list_price, discount_percent` — and the browser will render an actual `<table>` element with a header row, a body row per deal, alternating row colors, and some friendly styling. That single line is a **widget**: a high-level building block the compiler turns into the right HTML. You named the data, you named the columns; Clear figured out the rest.

Widgets are how Clear keeps the file short. Without them you'd write twenty-plus lines of HTML for one table — `<table>`, `<thead>`, `<tr>`, `<th>` for every column, `<tbody>`, `<tr>` for every row, `<td>` for every cell. With widgets you write one line per *intent* and the compiler handles the rest. Same idea as the table declaration in Chapter 6: you said "here's the shape," not "here's the SQL."

There are widgets for tables, charts, headings, buttons, forms, navigation, stat cards. We'll meet a few in this chapter; the rest live in later chapters as you need them.

### What are app-shell presets?

Most business apps look the same on the outside. Sidebar on the left with the navigation. Workbench in the middle with the main thing you're doing. Header bar across the top. A footer line at the bottom. The deal desk has that shape. The approval queue has that shape. Internal request queues, lead routers, onboarding trackers — all that shape.

Rather than make you rebuild the shell every time, Clear ships **presets** — pre-styled section types you can ask for by name. Five of them carry the full app shell:

- `app_layout` — the outermost wrapper. "This page is a full-screen app, not a marketing page."
- `app_sidebar` — the 240-pixel left rail. "This holds navigation."
- `app_main` — everything to the right of the sidebar. "This is the workbench."
- `app_header` — the 56-pixel sticky top bar. "Brand goes here. Breadcrumbs too."
- `app_content` — the scrollable main area inside `app_main`. "This is where the table goes."

You ask for them with `section 'Anything' with style app_layout:`. The first word in quotes is your label (it ends up as a comment in the compiled HTML — pick anything readable). The `with style …` part is the load-bearing bit: it tells the compiler which preset to apply. The compiler emits the `<aside>`, the `<main>`, the right CSS classes, the responsive rules, the hairline borders, the slate-on-ivory chrome — all of it. You write three lines; you'd otherwise write fifty.

If you skip the presets and just write `page 'Deal Desk' at '/':` with a bare heading and table, you'd get a working page — but it'd look like a Geocities reject. The presets are the difference between "renders" and "looks professional."

### The deal-desk page

Open `deal.clear` (the file you've been growing across Chapters 1–6) and add this section at the bottom, right after the last endpoint:

```clear
# Frontend

page 'Deal Desk' at '/':
  on page load:
    get pending from '/api/deals'

  pending_count = count of pending

  section 'App' with style app_layout:
    section 'Sidebar' with style app_sidebar:
      heading 'Deal Desk'

      nav section 'Approvals':
        nav item 'Pending' to '/' with count pending_count with icon 'inbox'

    section 'Main' with style app_main:
      section 'Header' with style app_header:
        heading 'Clear'
        text 'Workspace / Deal Desk / Pending Queue'

      section 'Content' with style app_content:
        page header 'Pending CRO approval':
          subtitle '{pending_count} deals waiting on you.'

        section 'Pending Queue' with style app_table:
          display pending as table showing customer, rep_name, list_price, discount_percent, status
```

That's a complete page. Twenty lines, give or take. Walk it from top to bottom.

**`page 'Deal Desk' at '/':`** declares the page. The string is the title (it ends up in the browser tab). The `at '/'` part says "this page lives at the root URL." When someone opens `http://localhost:3000/`, this is what they get. Skip the `at '/'` part and Clear auto-routes from the title — `'Deal Desk'` becomes `/deal-desk`. We want the deal desk to be the homepage, so we say so.

**`on page load:`** opens a small block that runs the moment the browser shows the page. The one line inside (`get pending from '/api/deals'`) is the same `get` verb you used in the form chapter — it hits your `/api/deals` endpoint, parses the JSON response, and stores it in a state variable called `pending`. That variable is now available everywhere on the page. Without `on page load`, the page would render with `pending` undefined (nothing in the table) and the CRO would see an empty queue.

**`pending_count = count of pending`** is a computed line — same `count of` you used in Chapter 3. The result is a number that the sidebar can display. Notice the `=` (we're computing a number) instead of `is` (which would be for a string).

**`section 'App' with style app_layout:`** opens the outermost shell. Everything inside this block — sidebar, header, content area — is part of the deal desk's chrome. Without `app_layout` the compiler defaults to a centered marketing-page layout (great for landing pages, wrong for an app).

**`section 'Sidebar' with style app_sidebar:`** opens the 240-pixel left rail. The `heading 'Deal Desk'` becomes the brand text at the top of the sidebar. The `nav section 'Approvals':` block underneath is a labeled group of navigation links. Inside it, `nav item 'Pending' to '/' with count pending_count with icon 'inbox'` is one link in the rail — it shows the word "Pending," the inbox icon, the live count, and clicking it goes to `/`. (We only have one nav item right now. In later chapters we'll add Approved, Rejected, Awaiting customer.)

**`section 'Main' with style app_main:`** opens the workbench column — the big right-side area that fills the rest of the screen. Inside it:

- `section 'Header' with style app_header:` becomes the 56-pixel sticky top bar. The `heading 'Clear'` lands in the brand slot on the left; the `text` line lands in the breadcrumb slot in the middle.
- `section 'Content' with style app_content:` opens the scrollable main area where the queue actually lives.

**`page header 'Pending CRO approval':`** is a workbench-page widget — the big title row at the top of the content area. The `subtitle '{pending_count} deals waiting on you.'` underneath shows the live count. The `{pending_count}` syntax is the same string interpolation from Chapter 1: whatever's in the curly braces gets substituted into the string at render time.

**`section 'Pending Queue' with style app_table:`** wraps the table in a styled container — rounded corners, light border, subtle shadow. Inside it, `display pending as table showing customer, rep_name, list_price, discount_percent, status` is the table widget. The compiler reads the column list, looks at the rows in `pending`, and emits a real HTML table with a header row and one body row per deal.

### Now run this

Save the file. From the same folder, start the server:

```bash
clear serve deal.clear
```

You'll see something like:

```
Compiling deal.clear...
Compiled cleanly. Starting server.
Listening on http://localhost:3000
```

Now — and this is the moment of truth — open your browser. Any browser. Type `http://localhost:3000` into the address bar and hit Enter.

You should see a real, styled page. A 240-pixel sidebar runs down the left side with "Deal Desk" at the top and a Pending row showing the inbox icon and the count `0`. The big right column has "Clear" in the top bar, "Workspace / Deal Desk / Pending Queue" as a breadcrumb, the title "Pending CRO approval" below that, and the subtitle "0 deals waiting on you." Underneath is a table with column headers (Customer, Rep name, List price, Discount percent, Status) and one body row that just says *No rows yet.* in italics, centered, slightly muted.

That last line — *No rows yet.* — is Clear being friendly. Empty tables used to render as a column-header row with a flat empty body, which looks broken. The compiler now drops in an italic placeholder row whenever the data is empty so the page doesn't look half-loaded. The moment you save your first deal through the form (Chapter 9), the placeholder vanishes and the deal appears.

For the experienced developer skimming: notice what you didn't write. No `<html>`, no `<head>`, no `<body>`, no `<aside>`, no Tailwind classes, no media queries, no fetch-on-mount lifecycle hook, no JSX, no router config. Twenty lines of Clear gave you a fully styled, fully responsive single-page app that fetches its data on load. The compiled HTML is ~600 lines. You read 20.

For the newcomer: you just built a real app. The CRO can open her browser, type the address, and see the queue. The page she sees is the same shape every full-stack app has — sidebar, workbench, table. Yours just happens to be empty until someone saves a deal.

### Why presets matter (a small detour)

A reasonable thing to wonder: "why bother with `app_layout`, `app_sidebar`, etc.? Couldn't I just use raw `section` blocks?" You can. But then *you* have to decide how wide the sidebar is, what color it sits on, where the hairline border goes, how the header sticks to the top, how the content area scrolls inside the main column without scrolling the sidebar, how it all falls back on a phone. That's a few hundred lines of CSS done correctly — and getting any one of them wrong makes the whole page feel cheap.

Presets bake in the answer. The 240-pixel sidebar width matches what Linear and Notion use. The hairline borders match the Marcus design target. The sticky header behaves the same way in Chrome and Safari. The content area scrolls *inside* the main column without losing the header — a detail that's easy to break if you're rolling your own.

You can also opt out and write raw styles when you need to (Chapter 11 covers it). For an internal-tools app with a sidebar and a workbench, the presets are exactly the right answer almost always. Reach for them first; only compose your own when you've outgrown what they offer.

### What about the other status pages?

The actual `apps/deal-desk/main.clear` reference app has five pages — Pending, Approved today, Rejected, Awaiting customer, All deals — each at its own URL, each backed by a different status filter. We're keeping it to one page in this chapter because the goal is to teach the *shape*, not the full app. The other four pages are exactly the same template — `page 'X' at '/X':`, fetch on load, same shell, different data variable. Once you've internalized the pattern, adding the other four is mechanical.

We'll add them in Chapter 9 when the queue primitive shows up — that's the right moment, because the queue is what fills the other tabs with real data.

### Why this matters

You crossed the line from "the program answers requests" to "a human can use the program." Every chapter from here on assumes the deal desk has a visible page. Chapter 8 puts a login wall in front of it so each user sees only their own deals. Chapter 9 introduces the queue primitive that gives the table real action buttons (Approve, Reject, Counter). Chapter 10 wires up email notifications when a deal flips state. Chapter 11 adds the AI drafter to the right detail panel. Chapter 12 makes the discount cap a *provable* business rule. Each of those chapters reads from and writes to the page you just built.

The other thing you just touched — without anyone calling it out — is **separation of concerns**. The same `/api/deals` URL serves two audiences: code (the JSON from Chapter 5 and 6) and humans (this page). If a third audience shows up later — a mobile app, an integration, a Slack bot — they can hit the JSON endpoint without rewriting anything. The page is one consumer. Adding more is free.

### Try it yourself

1. **Add a heading above the table.** Inside `section 'Pending Queue' …:`, before the `display pending as table …` line, add `heading 'Pending deals'`. Save, refresh the browser. The table now has its own internal title — useful when you've got multiple sections on the same page.
2. **Change the page title.** Edit the first line from `page 'Deal Desk' at '/':` to `page 'CRO Approval Console' at '/':`. Save, refresh, look at the browser tab. The title in the tab updates to match. (The page itself doesn't change — the title is what shows up in the tab and in search-engine results.)
3. **Show the count in the breadcrumb.** Change the header `text` line from `'Workspace / Deal Desk / Pending Queue'` to `'Workspace / Deal Desk / Pending Queue ({pending_count})'`. Save, refresh. The breadcrumb now reflects the live count — the same `{}` interpolation you used in Chapter 1, working anywhere a string can go.

### What's next

Right now anyone in the world who knows the URL can open your page and see your deals. Chapter 8 puts up the login wall — `allow signup and login` plus `the deal's creator can read, change, or delete` — so each user sees only the deals *they* saved. The page from this chapter doesn't change one bit. The compiler reads the access rules and threads the user-id filter through every read for you. Same `display pending as table …` line, dramatically different behavior underneath. That's how Clear handles security: declarative at the table, invisible at the call site.

---

## Chapter 8: Logging In and Owning Your Deals (The Wall Between Users)

By the end of this chapter, two different people can sign up for the deal desk and each one will see only the deals *they* saved. Alice signs up, saves a deal, and sees one row in her queue. Bob signs up, saves a different deal, and sees one row in his — none of Alice's. Same app, same database, same page. The wall between them comes from two short lines you'll add to `deal.clear`.

This is the moment deal-desk becomes a real multi-user product. Chapters 5 through 7 left the doors wide open — anyone who knew the URL could read every deal, save a new deal, or wipe the whole queue. That's fine for a demo on your laptop. It's a non-starter the moment you put the app on the public internet.

### Why every real app needs login

Without login, your app has no idea who's on the other end of the request. A POST to `/api/deals` is just a POST. The server takes the body, saves it, and replies — same answer no matter who sent it. That's the model from Chapter 5 and 6. Fine for a script, broken for a product.

The moment two people use the same app, "who sent this?" becomes the load-bearing question. The CRO at Acme Corp shouldn't see the deals at Globex Industries. The rep on the East Coast team shouldn't see the rep on the West Coast team's discount asks. A stolen session token shouldn't be able to read every deal in the database — just the ones belonging to the user it was issued for.

**Login is the wall between users.** Each person signs up with an email and a password. After they sign in, every request they make carries a tiny invisible badge — a token — that says "I am Alice." The server reads that badge on every request and uses it to decide what Alice is allowed to see and change. No badge, no access. Wrong badge, no access. Right badge, you see *your* data and nobody else's.

That's the concept. Now the syntax.

### One line turns auth on

At the top of `deal.clear`, near where you put `database is local memory` back in Chapter 6, add this single line:

```clear
allow signup and login
```

That's it. Save the file, recompile, and your app now has a complete login system. The compiler reads that line and quietly emits a small pile of machinery you don't have to write:

- A `Users` table to hold accounts (email, hashed password, role).
- A `POST /auth/signup` endpoint where new users register.
- A `POST /auth/login` endpoint that hands back a token after checking the password.
- A `GET /auth/me` endpoint that tells the caller "here's who you are."
- A check on every request that reads the token, looks up the user, and stashes the answer somewhere your endpoints can find it.

Passwords are never stored in plain text — the runtime hashes them with bcrypt before they touch the database. The token is signed with a secret (`JWT_SECRET` env var, auto-generated in dev) so a bad actor can't forge one. And the `/auth/login` endpoint is automatically rate-limited to 10 tries per minute per IP, so nobody can brute-force a password by guessing.

You wrote four words. The compiler did the rest. **This is the bargain Clear keeps over and over: you declare the intent, the compiler writes the safe code for you.**

### Locking the mutation endpoints

Adding `allow signup and login` turns the system on, but it doesn't yet *force* anyone to sign in. The POST and PUT endpoints from Chapter 6 still accept anonymous requests — the door is now lockable, but the lock isn't engaged.

To engage the lock, add `requires login` as the first line inside every endpoint that changes data:

```clear
when user sends deal to /api/deals:
  requires login
  validate deal:
    rep_name is text, required, min 1, max 100
    customer is text, required, min 1, max 200
    list_price is number, min 0
    discount_percent is number, min 0, max 100
  if deal's discount_percent is greater than 20:
    deal's status is 'pending'
  otherwise:
    deal's status is 'approved'
  new_deal = save deal as new Deal
  send back new_deal with success message
```

`requires login` goes on **the first line of the body**, above everything else. There's a reason: when every protected endpoint puts the guard on line one, you can scan the file in three seconds and instantly see which endpoints are gated. If you scatter the guard mid-body, the file becomes a hunt.

Add `requires login` to the POST `/api/deals` handler. Add it to the PUT handler at `/api/deals/:id`. If a request hits one of those without a valid token, the server replies `401 Unauthorized` before your validation or save code ever runs. Anonymous writes are now refused.

What about GET `/api/deals`? You can require login there too, and you should — but for a different reason than the mutation endpoints. The mutation endpoints need the guard so anonymous attackers can't trash your data. The GET endpoint needs the guard so anonymous attackers can't *read* everyone's data. Add `requires login` to both.

### The concept that matters most: ownership

Login by itself only solves half the problem. After you add `requires login`, both Alice and Bob have to sign in before they can do anything — but if Alice's GET `/api/deals` returns *every deal in the database*, she still sees Bob's deals and Bob still sees hers. The wall is up; the rooms aren't separated.

**Ownership is the rule that says "every deal has a creator, and only the creator can read, change, or delete it."** When Alice saves a deal, the deal becomes hers. When Bob saves one, it becomes his. When either of them queries the table, the database returns only the rows that belong to them. Same database, same query in your source, completely different answers depending on who's asking.

This is the headline OWASP primitive — the security industry calls it "broken object-level authorization," and it's the single most common bug in real-world apps. A user signs in legitimately, then changes the URL from `/api/deals/42` (their deal) to `/api/deals/43` (someone else's deal) and the server hands it over because nobody told the server to check. Painful breach, expensive lawsuit, easy to ship by accident.

Clear's job is to make that bug impossible to ship by accident. You declare ownership at the table level — one line — and the compiler weaves a per-user filter into every CRUD operation that touches the table. You don't write `user_id` in your source. You don't write the WHERE clause. You don't even see it. The compiler does it for you, on every read, every update, every delete, forever.

### One line turns ownership on

Open the `Deals` table block from Chapter 6 and add a single rule line at the bottom:

```clear
create a Deals table:
  rep_name, required
  customer, required
  list_price (number), default 0
  discount_percent (number), default 0
  status, default 'pending'
  the deal's creator can read, change, or delete
```

Read that last line out loud: *"the deal's creator can read, change, or delete."* That's the rule, in plain English, and it says exactly what the compiler will enforce. Whoever first inserted the row is the creator; only the creator can touch it from then on.

Notice you didn't add a `user_id` field. You don't have to. The runtime auto-adds a `user_id` column to every SQLite table — same way it auto-adds the `id` and `created_at` fields you've been using since Chapter 6. When Alice's POST hits `save deal as new Deal`, the runtime quietly stamps the new row with her user-id. When her GET hits `send back all Deals`, the compiler quietly threads a "rows where user-id matches the caller's id" filter into the SQL. Your source stays focused on the business logic; the security plumbing is invisible.

This is the pitch beat to remember: **a stolen session token cannot read another user's deals.** Even if an attacker steals Alice's token, the most they can do is impersonate Alice — and Alice can only see Alice's data. They can't pivot to Bob's queue, can't enumerate every deal in the database, can't hit `/api/deals/43` and walk away with someone else's pricing strategy. The wall holds at the row level, not just the page level.

### Reading the caller in your code

Sometimes you need to know who the caller is from inside an endpoint — for logging, for stamping a record with a name, for a custom check. Clear gives you a one-word handle: `caller`.

```clear
when user requests data from /api/me:
  requires login
  send back caller
```

Inside any endpoint with `requires login`, `caller` is the authenticated user's record. Read fields off it the same way you read fields off any other record:

- `caller's id` — the user's numeric id (this is what the ownership rule auto-checks against).
- `caller's email` — the user's email.
- `caller's name` — the display name they signed up with.
- `caller's role` — `'user'` for normal accounts, `'admin'` for elevated ones.

You won't reach for `caller` often; the ownership rule already does the matching work for free. But when you do need it — say, stamping a deal's `last_edited_by` field with the editor's email — it's right there.

### Now run this

Save the file. From the same folder, restart the server:

```bash
clear serve deal.clear
```

You should see:

```
Compiling deal.clear...
Compiled cleanly. Starting server.
Listening on http://localhost:3000
```

Now we'll drive two users through the wall. Open a terminal — or two side-by-side, one for Alice and one for Bob.

**Sign Alice up:**

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@acme.com","password":"alice-pw-12345","name":"Alice"}'
```

The response includes a token — a long opaque string. Copy it. You'll send it back on every Alice request:

```
{"token":"eyJhbGciOi...","user":{"id":1,"email":"alice@acme.com","role":"user"}}
```

**Save a deal as Alice** (paste her token after `Bearer`):

```bash
curl -X POST http://localhost:3000/api/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -d '{"rep_name":"Alice","customer":"Acme Corp","list_price":50000,"discount_percent":15}'
```

Server replies with the saved deal — id 1, owned by Alice.

**Sign Bob up** in the second terminal:

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@globex.com","password":"bob-pw-12345","name":"Bob"}'
```

Bob gets his own token back. **Save a deal as Bob:**

```bash
curl -X POST http://localhost:3000/api/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <bob-token>" \
  -d '{"rep_name":"Bob","customer":"Globex","list_price":80000,"discount_percent":22}'
```

Bob's deal saves as id 2, owned by Bob.

**Now the moment of truth.** Ask the server "who can see what?" first as Alice:

```bash
curl http://localhost:3000/api/deals \
  -H "Authorization: Bearer <alice-token>"
```

You see exactly one row — the Acme deal, list price 50000. Alice does not see Bob's Globex deal. Now run the same query as Bob:

```bash
curl http://localhost:3000/api/deals \
  -H "Authorization: Bearer <bob-token>"
```

You see exactly one row — the Globex deal, list price 80000. Bob does not see Alice's Acme deal. **Same endpoint. Same database. Two different answers, decided entirely by which token came in on the request.**

For good measure, try the GET with no token at all:

```bash
curl http://localhost:3000/api/deals
```

The server replies `401 Unauthorized`. The wall is up.

### What you didn't write

For the experienced developer skimming: count the things you didn't write. No bcrypt hashing calls. No JWT signing logic. No middleware function that reads `Authorization` headers and verifies tokens. No per-user WHERE clauses on your queries. No user-id parameter shuffling on inserts. No 401 / 403 response codes. No rate-limiter on the login endpoint. No login attempt counter. No password-policy validator. No audit log table.

You wrote `allow signup and login` plus `the deal's creator can read, change, or delete` plus `requires login` on three endpoint bodies. The rest is generated. If you change the source to add a second table — `Notes` or `Attachments` — and put the same `the X's creator can read, change, or delete` rule on it, the same protection applies to *that* table on the next compile. Recompile, ship, done.

For the newcomer: you just shipped a feature that takes most teams weeks. A real authentication system, hashed passwords, signed tokens, automatic per-row access control, automatic rate-limiting on login, automatic audit logging — all of it from two short rules in your source. Most security bugs in the real world come from one of these layers being wired up by hand, by a tired developer, on a Friday afternoon. Clear's bet is that if the compiler writes the safe code, the safe code is what ships.

### One more thing you got for free — the audit log

You wrote `allow signup and login` and got login plus password hashing plus rate-limiting. You also got an **audit log** — a real database table named `audit_log` that the runtime quietly fills, one row per state-changing request, every time someone POSTs, PUTs, PATCHes, or DELETEs against your app. We'll dig into it properly in Chapter 12 (and again in Chapter 24b for the deeper coverage), but it's already running. Two URLs surface it: `GET /audit` returns the rows as JSON, `GET /audit.csv` returns a downloadable spreadsheet for compliance buyers. Both require a logged-in caller. The fields stored — *who, what, when, status* — are the four questions an auditor asks.

The audit log is the receipt the CRO consults when a rep asks *"why did my deal get rejected?"* Every rejection lands in a row, named with the rule that fired, sanitized of anything sensitive (`password`, `token`, `secret` are redacted before the body summary gets stored). You don't write any code for this. The runtime fills it whether you ask or not. **The compliance buyer's question — *show me a record of every state change in your app* — is already answered the moment you turn on login.**

### What about admins?

The rule `the deal's creator can read, change, or delete` says ONLY the creator. What if you want a CRO or compliance officer to be able to see every deal? Add a second rule line:

```clear
the deal's creator can read, change, or delete
any admin can read, change, or delete
```

`any admin` matches against the user's `role` field. Mark a user as admin by signing up with that role, or by updating the row in the `Users` table directly. Once they're an admin, the rules combine: the creator can touch their own deals, and admins can touch every deal. Clear does this with an OR — if either rule matches, the access is allowed.

The deal-desk reference app (`apps/deal-desk/main.clear`) ships both rules together for exactly this reason. The CRO needs to see every rep's queue; the rep should only see her own. The two-line rule says both at once. We're going to leave the admin rule out of *this* chapter's working file so the two-user demo above stays clean — but feel free to add it.

### Try it yourself

1. **Add the admin rule and test it.** Add `any admin can read, change, or delete` to the Deals table. Sign up a third user — Carol — with `{"email":"carol@cro.com","password":"...","role":"admin"}` (note the explicit role). Hit `/api/deals` as Carol with her token. You should see *both* Alice's and Bob's deals — three rows total if Carol also has one of her own. The role check on `caller`'s `role` is what unlocks it.

2. **Try to read another user's deal directly.** As Bob, run `curl http://localhost:3000/api/deals/1 -H "Authorization: Bearer <bob-token>"`. Deal #1 belongs to Alice. The server replies `404 Not Found` — not `403 Forbidden`, because the row simply doesn't exist *from Bob's point of view*. (404 vs 403 is a deliberate choice; returning 403 would tell Bob the row exists but he can't see it. 404 says "no such deal," which leaks zero information.)

3. **Confirm the table doesn't have a `user_id` field in your source — but the rows do.** Open the database file with any SQLite browser (or run `sqlite3 clear-data.db ".schema Deals"`). You'll see a `user_id INTEGER` column in the schema, and Alice's row has `user_id = 1`, Bob's has `user_id = 2`. The compiler added the column for you; you didn't type it. That's the safe-by-default story in one query.

### Why this matters

Remember the database from Chapter 6? Each row now knows who owns it. Remember the page from Chapter 7? It still works — you didn't change a single line of the page declaration — but now the table only shows the logged-in user's deals because the GET endpoint underneath only returns the logged-in user's rows. The page is the same code; the data behind it is filtered.

This is the moment deal-desk grows from "a script that holds some deals" into "a real multi-user product a CRO can pay for." Two short lines of source, two long pages of generated security plumbing, zero per-user SQL written by hand. The Marcus pitch in plain English is one sentence: **a stolen session token cannot read another user's deals.** That's what makes the regulated-tier conversation possible.

### What's next

Right now the deal queue is locked down — only the deal's owner can read or change it — but the *workflow* on top of it is still bare. A rep saves a deal, the CRO sees it pending, but there's no formal Approve / Reject / Counter button that records who decided what. Chapter 9 introduces the queue primitive — `queue for deal: actions: approve, reject, counter` — which sits on top of the table you just protected and gives the table real action buttons backed by an audit row per decision. The login wall and the ownership rule from this chapter become the foundation the queue stands on. The CRO will be an admin (so the two-rule pattern from this chapter unlocks the cross-user view), each rep will see only their own pending deals, and every approve / reject / counter click will write a permanent decision row stamped with the CRO's user-id.

---

## Chapter 13: Working with Data

This is the **reference track**. The tutorial is over — you've built deal-desk in Chapters 1–12. From here on, the chapters answer *"what else can the data layer do?"* questions and assume you already know how to write Clear.

You met the basic CRUD shape in Chapters 5–9 (create, read, update, delete on the Deals table). This chapter covers the rest of the data toolkit: foreign keys with `belongs to`, parent-child auto-endpoints with `has many`, full-text search, server-side aggregates, and env-var access. Open it like a glossary — find the section you need, copy the pattern, get back to building.

All CRUD operations happen inside endpoint bodies. Here's the full pattern, using a Deals table like the one deal-desk built in Chapters 5–9:

```clear
build for javascript backend
database is local memory
create a Deals table:
  customer_name, required
  discount_percent, required
  status, default is 'pending'

when user calls POST /api/deals sending deal:
  new_deal = save deal as new Deal
  send back new_deal with success message

when user calls GET /api/deals:
  all_deals = get all Deals
  send back all_deals

when user calls PUT /api/deals/:id sending changes:
  requires login
  save deal to Deals
  send back changes with success message

when user calls DELETE /api/deals/:id:
  requires login
  delete the Deal with this id
  send back 'deleted' with success message
```

### DB Relationships

Use `belongs to` to declare foreign key relationships between tables. In deal-desk, a comment on a deal would look like this:

```clear
build for javascript backend

create a Deals table:
  customer_name
  discount_percent

create a Comments table:
  body
  deal belongs to Deals

when user calls GET /api/comments:
  all_comments = get all Comments
  send back all_comments
```

When you `get all Comments`, the compiler auto-loads the related Deal for each comment's `deal` field.

### Has Many Relationships

The inverse of `belongs to`. Declare that a parent table has many children,
and the compiler auto-generates nested endpoints:

```clear
create a Deals table:
  customer_name
  discount_percent

create a Comments table:
  body
  deal belongs to Deals

Deals has many Comments
```

This auto-generates `GET /api/deals/:id/comments` — returns all comments belonging
to a specific deal. You don't need to write the endpoint yourself.

### Full Text Search

Search across all fields of a table with one line. In deal-desk, a CRO might want to search deals by customer name or notes:

```clear
when user calls GET /api/deals/search sending search:
  results = search Deals for search's query
  send back results
```

`search X for Y` filters records where ANY field contains the search term
(case-insensitive). No need to specify which fields — it checks all of them.

### Aggregate Field Extraction

Extract and aggregate a field from a list of records. In deal-desk, you'd compute average discount across pending deals on the CRO dashboard:

```clear
total_value = sum of amount in deals
avg_discount = average of discount_percent in deals
highest_discount = max of discount_percent in deals
lowest_discount = min of discount_percent in deals
```

Without `in`, aggregates work on flat arrays as before: `total = sum of prices`.

### Environment Variables

```clear
api_key is env('API_KEY')
secret is env('STRIPE_SECRET')
```

---

## Chapter 15: Modules (When One File Isn't Enough)

Reference chapter. Deal-desk fits in one file because the tutorial kept it that way on purpose — but the moment your app grows past a few hundred lines, you'll want to split shared helpers, frontend pages, and the backend into separate `.clear` files. This chapter shows the import shape.

Small apps live in one file. Bigger apps split into modules — a backend file, a helpers file, a frontend file. Clear keeps it simple.

### Splitting Code Across Files

Create a **helpers.clear** file with shared functions:

```clear
double(x) = x * 2
tax(amount) = amount * 0.08
```

Then import it in **main.clear**:

```
import helpers.clear
result = double(21)
```

The canonical keyword is `import` (since 2026-05-13). `include` is a
silent alias. The old `use` keyword is retired from the import grammar —
it's reserved for future declarative-configuration syntax like
`use postgres for the database`.

Path-form imports like `import helpers.clear` inline every top-level
declaration. If two files define a function with the same name, the compiler
tells you about the collision and suggests a namespaced import:

```
import helpers.clear as helpers
result = helpers's double(21)
```

Or import specific functions only:

```
import double from helpers.clear
result = double(21)
```

The shape is always `import <file>.clear` — the extension is explicit
because explicit beats magic.

(Module imports require multiple files, so these examples show the syntax
without the ` ```clear ` tag — they can't compile standalone.)

---

## Chapter 13b: Charts (Visualizing Your Data)

Reference chapter. The deal-desk app you built in the tutorial doesn't *need* charts to function, but the moment you want a CRO dashboard — pipeline by stage, deals approved this quarter, average discount by segment — charts are the difference between *"a queue of rows"* and *"a screen the CRO opens every Monday morning."*

Clear includes built-in charts powered by ECharts. No setup needed — the CDN loads automatically when your app has a chart. Same primitives work on every dashboard you'll ever build; pick the chart type that matches the question (`bar` for *"how does this compare across categories?"*, `line` for *"how does this change over time?"*, `pie` for *"what's the breakdown?"*).

### Bar Chart

```clear
bar chart 'Revenue by Region' showing sales
```

The chart auto-detects: first string field becomes x-axis labels, number fields
become y-axis values. Multiple number fields create multiple series with a legend.

### Line and Area Charts

```clear
line chart 'Monthly Trend' showing monthly_data
area chart 'Growth Over Time' showing quarterly_data
```

### Pie Chart with Grouping

Use `by field` to group your data and count occurrences. In deal-desk you'd group pending deals by their assigned reviewer:

```clear
pie chart 'Deals by Status' showing deals by status
```

This counts how many deals have each status value and renders a donut chart.

### Bar Chart with Grouping

`by field` works on all chart types, not just pie:

```clear
bar chart 'Deals by Segment' showing deals by customer_segment
```

This groups all deals by their `customer_segment` field, counts each group, and renders
a bar chart with segment names on x-axis and counts on y-axis.

### Putting It Together

Here's a CRO dashboard with stat cards and charts — the kind the deal-desk app would show at the top of its pipeline view:

```clear
section 'Stats' as 4 columns:
  section 'Pending' with style metric_card:
    small text 'Pending Approval'
    heading '12'
    text '+3 this week'

bar chart 'Weekly Deal Volume' showing weekly_data
pie chart 'By Status' showing deals by status
```

The `+3` in the stat card automatically renders in green with an up-arrow icon.
Text starting with `-` renders in red with a down-arrow. Zero extra syntax needed.

### Alternate Syntax

You can also write the title first:

```clear
'Revenue' bar chart showing sales
```

Both forms compile to the same thing. Use whichever reads better to you.

### Chart Modifiers

Add a subtitle below the chart title, or stack bars on top of each other:

```clear
bar chart 'Weekly Deals' subtitle 'Approved vs rejected' showing weekly_stats

bar chart 'Weekly Deals' subtitle 'Last 4 weeks' showing weekly_stats stacked
```

---

## Chapter 20: Designing Beautiful Pages

Up to this point, we've been building functional apps. They work, they have
data, they have buttons. But they look like... developer prototypes. Functional
but not exactly something you'd put on Product Hunt.

Clear has a secret weapon: **style presets**. These are built-in design recipes
that emit production-quality HTML. Think Stripe's landing page. Think Linear's
dashboard. You get that level of polish by adding `with style preset_name` to
your sections.

No CSS to write. No Tailwind classes to memorize. Just pick the right preset
and fill in your content.

### Part 1: Building a Marketing Landing Page

Let's build a real landing page for a fictional SaaS product called "Beacon" --
a customer analytics tool. We'll go section by section, the way a real landing
page is structured: navbar, hero, social proof, features, pricing, FAQ, CTA,
footer.

#### Step 1: The Navbar

Every landing page starts with a navbar. Brand on the left, links in the middle,
CTA button on the right.

```clear
section 'Nav' with style page_navbar:
  heading 'Beacon'
  link 'Features' to '#features'
  link 'Pricing' to '#pricing'
  link 'Docs' to '/docs'
  button 'Start Free':
    go to '/signup'
```

The `page_navbar` preset handles all the layout: sticky positioning, responsive
hamburger menu, transparent backdrop blur. You just provide the heading (brand),
links (nav items), and a button (CTA). The last button automatically gets
primary styling.

Write links as `link 'Docs' to '/docs'` when you can. Clear also accepts
`link to '/docs' with label 'Docs'` if you think destination-first.

#### Step 2: The Hero

The hero is the first thing visitors see. It needs to grab attention in under
3 seconds.

```clear
section 'Hero' with style page_hero:
  small text 'Trusted by 2,000+ teams'
  heading 'Know your customers before they leave.'
  subheading 'Beacon tracks every click, scroll, and drop-off so you can fix problems before they cost you revenue.'
  link 'Start free trial' to '/signup'
  link 'Watch demo' to '/demo'
```

`page_hero` centers everything, adds generous padding, and puts a subtle radial
glow behind the content. The `small text` at the top becomes a badge. Links
at the bottom become side-by-side CTA buttons (primary + ghost).

Want a left-aligned hero with a product screenshot on the right? Use `hero_left`
instead.

#### Step 3: Social Proof (Stats + Logos)

Nobody wants to be the first customer. Show them they're not.

```clear
section 'Stats' with style stats_row:
  section 'S1' with style stat_item:
    heading '2.4B'
    text 'Events tracked'
  section 'S2' with style stat_item:
    heading '2,000+'
    text 'Teams'
  section 'S3' with style stat_item:
    heading '99.97%'
    text 'Uptime'
  section 'S4' with style stat_item:
    heading '<150ms'
    text 'Avg latency'
```

`stats_row` lays out child `stat_item` sections in a 4-column grid. Each item
centers a big heading (the number) over a small label (the description).

#### Step 4: Features

The `feature_split` preset creates a bento-grid layout: one large hero card
on the left (2/3 width) and smaller cards stacked on the right (1/3 width).

```clear
section 'Features' with style feature_split:
  heading 'Everything you need to understand your users'
  text 'From first click to conversion.'
  section 'Main' with style feature_card_large:
    heading 'Funnel Analysis'
    subheading 'See the drop-off. Fix the leak.'
    text 'Pinpoint exactly where users abandon your flows.'
  section 'S1' with style feature_card_teal:
    heading 'Session Replay'
    text 'Watch real user sessions.'
  section 'S2' with style feature_card_purple:
    heading 'A/B Testing'
    text 'Ship variants. Get significance.'
```

The colored card presets (`feature_card_teal`, `feature_card_purple`, etc.)
add bold background colors for visual variety -- like the bento grids you see
on Clay, Notion, and Linear marketing pages.

For a simpler even grid, use `feature_grid` with `feature_card` children.

#### Step 5: Testimonials

Social proof from real humans. The `testimonial_grid` preset automatically
adds star ratings and opening quote marks to each card.

```clear
section 'Testimonials' with style testimonial_grid:
  heading 'What our customers say'
  section 'T1' with style testimonial_card:
    text 'We cut checkout abandonment by 34% in six weeks.'
    subheading 'Sarah Chen'
    small text 'Head of Product, Cartify'
  section 'T2' with style testimonial_card:
    text 'Finally analytics that answer questions in minutes, not days.'
    subheading 'Marcus Webb'
    small text 'Growth Lead, Teamflow'
  section 'T3' with style testimonial_card:
    text 'Session replay alone was worth it. Activation went from 31% to 58%.'
    subheading 'Priya Kapoor'
    small text 'CEO, Docsend Pro'
```

#### Step 6: Pricing

The `pricing_grid` preset creates a 3-column comparison. The middle card can
use `pricing_card_featured` for a highlighted "recommended" treatment with a
ring and slight scale-up.

```clear
section 'Pricing' with style pricing_grid:
  heading 'Simple pricing'
  text 'All plans include unlimited team members.'
  section 'Free' with style pricing_card:
    heading 'Free'
    subheading '$0 / month'
    text '10k events/month'
    text '30-day retention'
    link 'Get started' to '/signup'
  section 'Pro' with style pricing_card_featured:
    heading 'Pro'
    subheading '$49 / month'
    text '5M events/month'
    text '12-month retention'
    text 'Session replay'
    link 'Start trial' to '/signup'
  section 'Enterprise' with style pricing_card:
    heading 'Enterprise'
    subheading 'Custom'
    text 'Unlimited everything'
    text 'SSO and SCIM'
    text 'Dedicated SLA'
    link 'Talk to sales' to '/contact'
```

#### Step 7: FAQ

The `faq_section` preset turns child sections into an accordion. The section
title becomes the question. The body text becomes the answer. First item
starts open.

```clear
section 'FAQ' with style faq_section:
  heading 'Frequently asked questions'
  section 'Is there a free plan?':
    text 'Yes -- the free tier includes 10k events per month with no credit card required.'
  section 'Can I cancel anytime?':
    text 'Absolutely. No contracts, no cancellation fees. Your data exports with one click.'
  section 'Do you support GDPR?':
    text 'Yes. We are SOC 2 Type II certified and fully GDPR compliant.'
```

#### Step 8: CTA + Footer

Close with a bold call-to-action banner and a multi-column footer.

```clear
section 'CTA' with style page_cta:
  heading 'Stop guessing. Start knowing.'
  text 'Free forever on the starter plan. No credit card required.'
  link 'Create free account' to '/signup'

section 'Footer' with style page_footer:
  heading 'Beacon'
  section 'Product':
    link 'Features' to '/features'
    link 'Pricing' to '/pricing'
    link 'Changelog' to '/changelog'
  section 'Company':
    link 'About' to '/about'
    link 'Blog' to '/blog'
    link 'Careers' to '/careers'
  section 'Legal':
    link 'Privacy' to '/privacy'
    link 'Terms' to '/terms'
  small text '2026 Beacon Analytics. All rights reserved.'
```

#### The Complete Landing Page

Here's the whole thing assembled. 85 lines for a production-quality SaaS
landing page:

```clear
build for web
theme 'midnight'

page 'Beacon Analytics' at '/':

  section 'Nav' with style page_navbar:
    heading 'Beacon'
    link 'Features' to '#features'
    link 'Pricing' to '#pricing'
    link 'Docs' to '/docs'
    button 'Start Free':
      go to '/signup'

  section 'Hero' with style page_hero:
    small text 'Trusted by 2,000+ teams'
    heading 'Know your customers before they leave.'
    subheading 'Beacon tracks every click, scroll, and drop-off so you can fix problems before they cost you revenue.'
    link 'Start free trial' to '/signup'
    link 'Watch demo' to '/demo'

  section 'Stats' with style stats_row:
    section 'S1' with style stat_item:
      heading '2.4B'
      text 'Events tracked'
    section 'S2' with style stat_item:
      heading '2,000+'
      text 'Teams'
    section 'S3' with style stat_item:
      heading '99.97%'
      text 'Uptime'
    section 'S4' with style stat_item:
      heading '<150ms'
      text 'Avg latency'

  section 'Features' with style feature_split:
    heading 'Everything you need to understand your users'
    text 'From first click to conversion.'
    section 'Main' with style feature_card_large:
      heading 'Funnel Analysis'
      subheading 'See the drop-off. Fix the leak.'
      text 'Pinpoint exactly where users abandon your flows.'
    section 'S1' with style feature_card_teal:
      heading 'Session Replay'
      text 'Watch real user sessions.'
    section 'S2' with style feature_card_purple:
      heading 'A/B Testing'
      text 'Ship variants. Get significance.'

  section 'Testimonials' with style testimonial_grid:
    heading 'What our customers say'
    section 'T1' with style testimonial_card:
      text 'We cut checkout abandonment by 34% in six weeks.'
      subheading 'Sarah Chen'
      small text 'Head of Product, Cartify'
    section 'T2' with style testimonial_card:
      text 'Finally analytics that answer questions in minutes, not days.'
      subheading 'Marcus Webb'
      small text 'Growth Lead, Teamflow'
    section 'T3' with style testimonial_card:
      text 'Session replay alone was worth it. Activation went from 31% to 58%.'
      subheading 'Priya Kapoor'
      small text 'CEO, Docsend Pro'

  section 'Pricing' with style pricing_grid:
    heading 'Simple pricing'
    text 'All plans include unlimited team members.'
    section 'Free' with style pricing_card:
      heading 'Free'
      subheading '$0 / month'
      text '10k events/month'
      text '30-day retention'
      link 'Get started' to '/signup'
    section 'Pro' with style pricing_card_featured:
      heading 'Pro'
      subheading '$49 / month'
      text '5M events/month'
      text '12-month retention'
      text 'Session replay'
      link 'Start trial' to '/signup'
    section 'Enterprise' with style pricing_card:
      heading 'Enterprise'
      subheading 'Custom'
      text 'Unlimited everything'
      text 'SSO and SCIM'
      text 'Dedicated SLA'
      link 'Talk to sales' to '/contact'

  section 'FAQ' with style faq_section:
    heading 'Frequently asked questions'
    section 'Is there a free plan?':
      text 'Yes -- the free tier includes 10k events per month with no credit card required.'
    section 'Can I cancel anytime?':
      text 'No contracts, no cancellation fees. Your data exports with one click.'
    section 'Do you support GDPR?':
      text 'We are SOC 2 Type II certified and fully GDPR compliant.'

  section 'CTA' with style page_cta:
    heading 'Stop guessing. Start knowing.'
    text 'Free forever on the starter plan.'
    link 'Create free account' to '/signup'

  section 'Footer' with style page_footer:
    heading 'Beacon'
    section 'Product':
      link 'Features' to '/features'
      link 'Pricing' to '/pricing'
    section 'Company':
      link 'About' to '/about'
      link 'Blog' to '/blog'
    small text '2026 Beacon Analytics. All rights reserved.'
```

### Part 2: Building an App Dashboard

Marketing pages sell the product. Dashboards ARE the product. Different
structure, different presets, same idea: pick the right preset and fill in
content.

The app UI presets give you the classic SaaS layout: fixed sidebar on the left,
sticky header across the top, scrollable content area with cards and tables.
Think Linear, Notion, or any modern productivity tool.

#### The Layout Skeleton

Every dashboard starts with the same three-level nesting:

```
app_layout (flex row, full screen height)
  app_sidebar (fixed width, left)
  app_main (fills remaining space, flex column)
    app_header (sticky top)
    app_content (scrollable)
```

In Clear:

```clear
section 'App' with style app_layout:
  section 'Sidebar' with style app_sidebar:
    # sidebar content here
  section 'Main' with style app_main:
    section 'Header' with style app_header:
      # header content here
    section 'Content' with style app_content:
      # dashboard content here
```

That's it. Four sections, four presets. You now have a full-screen app layout
with a sidebar, header, and scrollable content area.

#### The Sidebar

The `app_sidebar` preset is smart about its children. It splits them
automatically:

- The first `heading` becomes the brand/logo area at the top
- `nav section` blocks become labeled nav groups
- `nav item` rows become real sidebar links
- `with count` adds a small badge on the right
- `with icon` adds a Lucide icon on the left
- The current route automatically marks the matching row active

```clear
section 'Sidebar' with style app_sidebar:
  heading 'ProjectHub'

  nav section 'Main':
    nav item 'Dashboard' to '/' with icon 'layout-dashboard'
    nav item 'Projects' to '/projects' with count project_count with icon 'folder'
    nav item 'Team' to '/team' with icon 'users'

  nav section 'Settings':
    nav item 'Account' to '/account' with icon 'user'
    nav item 'Billing' to '/billing' with icon 'credit-card'
    nav item 'Integrations' to '/integrations' with icon 'plug'
```

That produces a sidebar with "ProjectHub" as the brand, then two labeled nav
groups ("Main" and "Settings") with linked rows under each. Legacy `text` and
`link` children still render, but new dashboards should use explicit nav rows.

#### The Header

`app_header` gives you a sticky bar with a split layout: content on the left,
actions on the right.

```clear
section 'Header' with style app_header:
  heading 'Dashboard'
  button 'New Project':
    open the New Project modal
```

#### The Page Header And Tabs

`app_header` is the sticky chrome bar. Inside the scrollable content area, use
`page header` for the actual workbench title, subtitle, and actions.

```clear
section 'Content' with style app_content:
  page header 'CRO Review':
    subtitle '5 deals waiting'
    actions:
      button 'Refresh':
        get pending from /api/deals/pending
      button 'Export':
        get export_rows from /api/deals/export

  tab strip:
    active tab is 'Pending'
    tab 'Pending' to '/cro'
    tab 'Approved' to '/approved'
    tab 'Escalated' to '/escalated'
```

Use this for approval queues, CRMs, helpdesks, and dashboard subviews. The tabs
are real links, and the current route automatically gets the underline state.

#### Stat Cards

For KPI rows at the top of dashboards, use `stat strip` with `stat card`:

```clear
stat strip:
  stat card 'Pending Count':
    value pending_count
    delta '+1.8 pts vs last week'
    sparkline [3, 4, 6, 5, 8]
    icon 'inbox'
```

#### Detail Panels

When a table is the queue and one row is the work, use a right detail panel.
It keeps the user in context instead of sending them to a separate page.

```clear
detail panel for selected_deal:
  text selected_deal's customer
  display selected_deal's amount as dollars called 'Value'
  text selected_deal's status
  actions:
    button 'Reject':
      change selected_deal's status from 'pending' to 'rejected'
      update selected_deal at /api/deals/:id/reject
      get pending from /api/deals/pending
    button 'Counter':
      change selected_deal's status from 'pending' to 'awaiting'
      update selected_deal at /api/deals/:id/counter
      get pending from /api/deals/pending
    button 'Approve':
      change selected_deal's status from 'pending' to 'approved'
      update selected_deal at /api/deals/:id/approve
      get pending from /api/deals/pending
```

The panel reads from the selected row. The normal content lines become the
scrolling body. The `actions:` block becomes the sticky decision bar at the
bottom. Update buttons need a `change` line before the `update` line, so the
source names the exact data effect.

Each `stat card` needs one `value` line. Use `delta` for trend copy,
`sparkline` for a tiny trend line, and `icon` for a Lucide symbol.

#### Tables

Wrap a `display X as table` in an `app_table` preset for the rounded, bordered
look:

```clear
section 'Projects' with style app_table:
  display projects as table showing name, status, owner, updated_at
```

#### Empty States

When there's no data yet, show a friendly placeholder instead of a blank void:

```clear
section 'No Data' with style empty_state:
  heading 'No projects yet'
  text 'Create your first project to get started.'
  button 'New Project':
    open the New Project modal
```

The `empty_state` preset adds a dashed border, centered content, and generous
padding. It says "this space is intentionally empty" instead of looking broken.

#### The Complete Dashboard

Here's a full project management dashboard. Backend + frontend in one file:

```clear
build for web and javascript backend
theme 'midnight'

database is local memory

create a Projects table:
  name, required
  status, default 'active'
  owner
  created_at_date, auto

accept requests from any website
log every request

when user calls GET /api/projects:
  all_projects = get all Projects
  send back all_projects

when user calls POST /api/projects sending project:
  validate project:
    name is text, required, min 1, max 100
  new_project = save project as new Project
  send back new_project with success message

when user calls DELETE /api/projects/:id:
  requires login
  delete the Project with this id
  send back 'deleted' with success message

page 'ProjectHub' at '/':

  revenue = 48200
  active_users = 1284
  open_issues = 37
  uptime = 0.9997

  on page load get projects from '/api/projects'

  section 'App' with style app_layout:

    section 'Sidebar' with style app_sidebar:
      heading 'ProjectHub'
      nav section 'Main':
        nav item 'Dashboard' to '/' with icon 'layout-dashboard'
        nav item 'Projects' to '/projects' with count open_issues with icon 'folder'
        nav item 'Team' to '/team' with icon 'users'
      nav section 'Settings':
        nav item 'Account' to '/account' with icon 'user'
        nav item 'Billing' to '/billing' with icon 'credit-card'

    section 'Main' with style app_main:

      section 'Header' with style app_header:
        heading 'Dashboard'
        button 'New Project':
          open the New Project modal

      section 'Content' with style app_content:

        section 'Metrics' as 4 columns:
          section 'M1' with style metric_card:
            display revenue as dollars called 'Revenue'
          section 'M2' with style metric_card:
            display active_users as number called 'Active Users'
          section 'M3' with style metric_card:
            display open_issues as number called 'Open Issues'
          section 'M4' with style metric_card:
            display uptime as percent called 'Uptime'

        section 'Projects Table' with style app_card:
          subheading 'All Projects'
          display projects as table showing name, status, owner with delete

        section 'Activity' with style app_list:
          heading 'Recent Activity'
          text 'Alice deployed v2.1.0 to production'
          text 'Bob closed 3 issues in the Backend project'
          text 'Carol updated the billing integration'

  section 'New Project' as modal:
    section 'Form' with style form:
      subheading 'Create Project'
      'Project Name' is a text input saved as a project_name
      'Owner' is a text input saved as a owner
      button 'Create':
        send project_name and owner as a new project to '/api/projects'
        get projects from '/api/projects'
        close modal
      button 'Cancel':
        close modal
```

That's 80 lines of Clear for a full-stack dashboard app with a database,
REST API, validation, auth on delete, and a polished frontend with sidebar
navigation, metric cards, a data table, activity feed, and a modal form.

In React + Express, you'd be looking at 400-500 lines across 8-10 files.
In Clear, it's one file that you can read top to bottom in two minutes.

---

## Chapter 9: The CRO Approval Queue (From CRUD App to Workflow App)

By the end of this chapter, deal-desk stops being a CRUD app and becomes a workflow app. The CRO will sign in, click **Approve** on a deal Alice saved, and three things will happen at once: the deal's status flips from `pending` to `approved`, a permanent decision row lands in an audit table that says *who* approved it and *when*, and an outbound email row drops into a queue ready to tell Alice the news. **Five lines that would have been 150 lines by hand. The compiler does the boring plumbing.**

This is the chapter where the deal desk earns the name. Up to now, the rep has been the only user — she signs in, saves a deal, sees her queue. That's a personal organizer. A real deal desk has a **second role** in the loop: somebody with the authority to approve or reject what the rep submitted. In Marcus's company that's the Chief Revenue Officer. The CRO is the wall between "the rep wants to discount this" and "the company actually agrees."

### What is an approval queue, anyway?

An approval queue is a list of work items waiting for somebody with authority to decide. You've seen them everywhere, even if you didn't call them that. A code-review request waiting on a senior engineer's eyes. An expense report waiting on a manager's signature. A vacation request waiting on HR. A discount request waiting on the CRO. Same shape every time: a record arrives in `pending` state, a specific human looks at it, and they pick from a small set of outcomes — approve, reject, or send it back with a counter-offer.

What makes a queue different from a plain CRUD list is the **decision trail**. When the CRO approves Alice's deal, the company doesn't just need to know that the deal is now approved — it needs to remember *who* approved it, *when*, and *what they decided*. If three months later a board member asks "who signed off on the 28% discount to Acme?", somebody had better be able to answer. That's an audit trail, and it's the part most teams forget to build until a regulator asks.

So a queue is really three things glued together: a filtered view of pending records, a decision URL per outcome, and an audit table that grows by one row every time somebody clicks a button. Keep that shape in mind — Clear is about to give you all three from one declaration.

### Why workflow primitives exist

Imagine you wrote this from scratch in JavaScript and Express. To support `approve / reject / counter` on a deal, you'd hand-write:

- A second table called `deal_decisions` with `deal_id`, `decision`, `decided_by`, `decided_at`, `decision_note` columns and a foreign key.
- A `GET /api/deals/queue` endpoint that filters to `status = 'pending'` and threads the right auth.
- A `PUT /api/deals/:id/approve` endpoint that requires login, looks up the deal, updates status, inserts a decision row, and queues a notification.
- The same endpoint a second time for `/reject`. And again for `/counter`. Each one nearly identical, each one a place a bug can hide.
- A `GET /api/deal-decisions` endpoint so somebody can read the audit log.
- A notification queue table so you don't block the user's request on a flaky email server.
- Two more endpoints for the notification rows.
- The frontend wiring on top of all of it.

Around 150 lines, depending on how careful you are. Each one boring, each one easy to get subtly wrong, each one identical to the next deal-desk-style app you'll ever write. **A workflow primitive is the language saying: "you've written this enough times — declare what you want, and I'll write the boring stuff for you."** You declare *what* should happen on each action. The compiler writes *how*.

That's the bargain Clear keeps: you describe the shape of the workflow once, and the compiler emits the audit table, the decision URLs, the notification queue, and the filter handler — every time you recompile, in the same shape, without typos.

### Five lines that change everything

Open `deal.clear` from Chapter 8 and add this block right after your `Deals` table declaration:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter
```

Three settings, plus the `queue for deal:` header. That's the whole thing. Read it out loud: *"queue for deal — reviewer is CRO — actions are approve, reject, counter."* No CS jargon. A manager could read this and tell you what the app does.

Here's what those three lines tell the compiler:

- `queue for deal:` — there is a queue, and the items in it are records from the `Deals` table you declared above. The compiler matches the word `deal` to your table by trimming the `s`. (You can also write `queue for deals:` with the `s`; both forms work.)
- `reviewer is 'CRO'` — the human role doing the approving is called CRO. This name shows up in audit rows and in any notification that says "approved by the CRO." It's a label, not a separate user role; you'll still mark the actual CRO user as `admin` so the rules from Chapter 8 let her see every rep's deals.
- `actions: approve, reject, counter` — the three buttons the CRO can click. Each one becomes a real URL on your server, plus a row-shape in the audit table.

Save the file and recompile. The output looks the same to a casual reader. Under the hood, the compiler just generated a small backend feature for you.

### What the compiler wrote for you

When the parser sees `queue for deal:`, it goes to work. Each of these landed in your compiled server without you typing a single character:

- **An audit table called `deal_decisions`.** Five columns: `deal_id` (which deal got decided), `decision` (`approved`, `rejected`, or `awaiting`), `decided_by` (the CRO's user id), `decided_at` (a timestamp), and `decision_note` (a free-text field for "why"). Every approve / reject / counter click adds one row. Rows are never deleted — that's the whole point of an audit log. If three months from now the board asks "who signed off on the Acme discount?", you `SELECT * FROM deal_decisions WHERE deal_id = 42` and you have your answer.
- **A login-gated URL for each action.** `PUT /api/deals/:id/approve`, `/reject`, and `/counter`. Each one requires a valid token (so anonymous attackers can't approve their own deals), looks up the deal, updates its `status` field, and inserts the audit row. The status transitions follow a small cheat sheet: `approve` → `'approved'`, `reject` → `'rejected'`, `counter` → `'awaiting'`. (The "awaiting" status means "we sent a counter-offer and we're waiting on the customer to accept or push back.")
- **A filtered query handler at `GET /api/deals/queue`.** This returns only the deals where `status = 'pending'` — the work the CRO actually has to look at. The full GET `/api/deals` handler from Chapter 8 still works, still scoped to the caller; the new `/queue` handler is the CRO's inbox view.
- **A read-only audit URL at `GET /api/deal-decisions`.** This is how anybody — auditor, board member, the CRO herself reviewing what she did last week — pulls back the full decision history.

Five lines in. Four endpoints, one table, hundreds of generated lines of JavaScript out. **You did not type the word `user_id` once. You did not write a `INSERT INTO deal_decisions` statement. You did not set up the filter on `status = 'pending'`.** The compiler did all of it, and it'll do it the same way every time you recompile, on every deal-desk-like app you ever write.

### The CRO needs an admin badge

Quick sidebar before we run anything. Remember the ownership rule from Chapter 8?

```clear
the deal's creator can read, change, or delete
```

That rule says only Alice can read or change Alice's deals. Which is exactly what we want for *Alice*, but a CRO who can only see her own deals isn't a CRO — she'd never see anything to approve. We need the second rule from Chapter 8 too:

```clear
the deal's creator can read, change, or delete
any admin can read, change, or delete
```

Two rules. Either one matching grants access. Alice (a normal `user`) can touch her own deals. The CRO (signed up with `role: 'admin'`) can touch every deal. Clear combines the two rules with an OR — that's exactly the both-of-them-at-once shape we want.

If you didn't add the `any admin` line at the end of Chapter 8, add it now. The queue endpoints depend on it: when the CRO clicks Approve on Alice's deal, the auto-generated PUT handler runs the same ownership check the GET handler does, and without the admin rule the CRO would be blocked from touching anybody else's row.

### Now run this

Save the file. Restart the server:

```bash
clear serve deal.clear
```

You should see the same `Listening on http://localhost:3000` message as Chapter 8. The new endpoints don't print themselves on startup — they're just *there* now.

We're going to drive three users through the whole workflow: Alice the rep, Bob the other rep, and Carol the CRO. Open three terminals or one with patience.

**Sign Alice up and save a pending deal:**

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@acme.com","password":"alice-pw-12345","name":"Alice"}'

curl -X POST http://localhost:3000/api/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <alice-token>" \
  -d '{"rep_name":"Alice","customer":"Acme Corp","list_price":50000,"discount_percent":15}'
```

Alice's deal saves with `status: "pending"`. She owns it.

**Sign Carol up — but with the admin role.** Notice the extra `"role":"admin"` field; that's what flips the second rule on for her account:

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"carol@cro.com","password":"carol-pw-12345","name":"Carol","role":"admin"}'
```

Carol gets a token back, same as Alice did. She's now an admin.

**Carol checks her queue:**

```bash
curl http://localhost:3000/api/deals/queue \
  -H "Authorization: Bearer <carol-token>"
```

She sees one row — Alice's pending Acme deal, list price 50000, discount 15%. The `/queue` URL is one the queue primitive auto-emitted; it filters to `status = 'pending'` so Carol's inbox only shows the work she needs to act on.

**Now Carol approves it:**

```bash
curl -X PUT http://localhost:3000/api/deals/1/approve \
  -H "Authorization: Bearer <carol-token>"
```

The server replies with the updated deal. Status is now `approved`. Carol just clicked the button, except via curl.

**Confirm the status flipped.** Pull the deal back as Alice:

```bash
curl http://localhost:3000/api/deals \
  -H "Authorization: Bearer <alice-token>"
```

Alice's row now reads `"status": "approved"`. The change happened. The wall from Chapter 8 still holds — Alice still can only see her own deal — but the *contents* of her deal updated when Carol acted.

**Now check the audit table.** This is the moment that pays for the whole feature:

```bash
curl http://localhost:3000/api/deal-decisions \
  -H "Authorization: Bearer <carol-token>"
```

You see one row:

```
[{"id":1,"deal_id":1,"decision":"approved","decided_by":2,"decided_at":"2026-05-06T...","decision_note":""}]
```

Carol's user-id (2) is permanently stamped on Alice's deal. The timestamp is locked in. **If anybody three months from now asks "who approved the Acme deal?", that row is the answer.** Nobody had to remember to write the audit code; the queue primitive emitted it.

### Adding email beats — telling the rep her deal landed

So far Carol approves a deal and the deal's status changes. But Alice doesn't *know* her deal got approved unless she refreshes the page. In the real world the rep wants an email: "Carol approved your Acme renewal." That's a notification.

Here's the concept first, because the way Clear handles notifications has a twist worth understanding. **An outbound email is not sent immediately — it lands in a queue.** When the CRO approves a deal, the app doesn't pause for two seconds while it talks to a flaky email server. Instead, it writes a row to a table called `deal_notifications` saying "an email needs to go to alice@acme.com about deal 1." The user's request returns instantly. Later, a separate worker reads the queue and actually delivers the messages.

That's how every production app does it — Slack, Stripe, Linear, all of them — because emailing is slow and unreliable, and you don't want a customer's deal-approval clicks to fail because GMail is having a bad afternoon. Clear does the same thing for you, automatically, the moment you ask for it.

Add two lines inside your queue block:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter
  email customer when counter
  email rep when approve, reject
```

Read these out loud too: *"email the customer when we counter their offer; email the rep when we approve or reject her deal."* No mystery. The compiler turns those two lines into:

- A new table called `deal_notifications` — five columns of metadata about each pending email (`deal_id`, `recipient_role`, `recipient_email`, `template`, `queued_at`).
- A new step inside each PUT handler. When Carol approves a deal, the handler now runs three writes in one transaction: update the deal's status, insert the audit row, AND insert a notification row pointing at Alice's email.
- A read-only URL at `GET /api/deal-notifications` so you can peek at the outbox.

How does the compiler know Alice's email address? **Convention.** When you write `email customer when ...`, the compiler reaches into the deal record and reads `customer_email`. When you write `email rep when ...`, it reads `rep_email`. The pattern is `<role>_email` — same name, just with `_email` glued on. Make sure your `Deals` table has those fields:

```clear
create a Deals table:
  rep_name, required
  rep_email
  customer, required
  customer_email
  list_price (number), default 0
  discount_percent (number), default 0
  status, default 'pending'
  the deal's creator can read, change, or delete
  any admin can read, change, or delete
```

Save and restart the server.

### Now run this — the email beat

Sign Alice up again (or reuse her account if you didn't restart with a fresh database), and this time include both her own email and the customer's:

```bash
curl -X POST http://localhost:3000/api/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <alice-token>" \
  -d '{"rep_name":"Alice","rep_email":"alice@acme.com","customer":"Acme Corp","customer_email":"buyer@acme.com","list_price":50000,"discount_percent":15}'
```

Carol approves it as before:

```bash
curl -X PUT http://localhost:3000/api/deals/1/approve \
  -H "Authorization: Bearer <carol-token>"
```

Now check the outbox:

```bash
curl http://localhost:3000/api/deal-notifications \
  -H "Authorization: Bearer <carol-token>"
```

There's the row. Recipient is `alice@acme.com`. Role is `rep`. Deal id 1, queued just now. **An actual email has not been sent yet** — the queue primitive only writes outbox rows in default builds. Chapter 10 turns these rows into real email sends through a provider like AgentMail or SendGrid, behind an explicit on-switch. Today you can see exactly which messages your app *would* send, before any of them go out the door. Tests, dev runs, and previews never accidentally email a real customer.

Try the same thing with `/reject` or `/counter` to watch the matching trigger fire — `counter` queues an email to the customer's address (`buyer@acme.com`) instead of the rep's, because the body said `email customer when counter`.

### What you didn't write

For the experienced developer skimming, the things that didn't appear in your source: a `decisions` table schema, a `notifications` table schema, three nearly-identical PUT handlers, a `WHERE status = 'pending'` filter, a `WHERE deal_id = ?` audit query, a `decided_by = req.user.id` insert, an `INSERT INTO ... notifications` follow-up, and the foreign-key relationships between the three tables. The compiler emitted all of it from five lines.

For the newcomer: you just shipped the workflow shape that powers a million SaaS apps — code review, expense approval, vacation requests, lead routing, customer-support tickets, content moderation, regulatory filings. The same five-line block, with different names, fits any of them. Once you can read `queue for X: actions: approve, reject, counter`, you can read every approval-style app anybody has ever written. **The shape is the language.**

### Try it yourself

1. **Add a fourth action.** Inside the queue block, change `actions:` to `actions: approve, reject, counter, awaiting customer`. Recompile and restart the server. You now have a `PUT /api/deals/:id/awaiting` URL that the CRO can hit when a deal is paused on the customer's signature. Drive a curl through it and confirm the deal's status lands on `'awaiting'` and an audit row appears.

2. **Add an email rep when reject line and confirm two outbox rows.** With `email customer when counter, awaiting customer` and `email rep when approve, reject` both in the queue body, sign up Alice + Carol, save a deal, then have Carol reject it. Hit `/api/deal-notifications` and confirm one row landed for the rep on the rejection. Now do the same for a counter: confirm one row lands for the customer instead.

3. **Read the schema directly.** Open the database file with any SQLite browser or run `sqlite3 clear-data.db ".schema deal_decisions"`. You'll see the `deal_decisions` table the compiler emitted — five columns, foreign-keyed back to `Deals`. You did not type the word CREATE TABLE anywhere in your source. The schema was written for you.

### Why this matters

Remember the ownership rules from Chapter 8? They're still doing the work underneath. The CRO can act on every deal because she's an admin; the rep is still walled off to her own queue. Add a queue primitive on top, and you have the load-bearing shape for a regulated-tier app: every decision is logged, every notification is queued, every URL is auth-gated, and not a single byte of the security plumbing is hand-rolled. That's what makes the Marcus pitch land — *"every approval is provable, every email is logged, and the audit table is just there because the compiler wrote it."*

This chapter turned deal-desk from a personal CRUD app into a real workflow app. The CRO has a queue. Each approve/reject/counter writes a permanent decision row. Each action that should email someone drops a row into an outbox. Five lines did all of it.

### What's next

The notifications table is full of rows that *should* go out the door, but nothing is actually sending them yet. Chapter 10 introduces the email-delivery primitive — `email customer when deal's status changes to 'awaiting':` — which turns those queued rows into real messages going through AgentMail (or SendGrid, or Postmark). It's the same `email when` atom you used inside the queue block, but at the top level, with a real subject line and body. Same compiler-does-the-work shape: you describe the message, Clear takes care of the delivery, the retry logic, and the bounce handling. Bring your queue from Chapter 9 — Chapter 10 stands on top of it.

---

## Chapter 10: Email the Rep When Approved (From Outbox Row to Real Email)

By the end of this chapter, deal-desk sends a real email. When Carol approves Alice's deal, Alice will get a message in her inbox — subject line, body text, the rep's name where the rep's name should be — and when Alice replies to it, the reply will land on the deal record itself, so the conversation and the record are one thing. **The email isn't a separate system bolted onto the app. It IS the app.**

Remember the outbox row that landed in Chapter 9? Every time the CRO clicked Approve, a row dropped into `deal_notifications` saying *"an email needs to go to alice@acme.com about deal 1."* That row was the placeholder. Today we turn it into a real message going through a real provider, and we wire the customer's reply back into the deal record so nobody has to copy-paste from Gmail to your app ever again.

### What does "send an email" actually mean?

You write the word `email` in your code. The customer reads a message in their inbox. In between, a lot has to happen. Let's walk through it slowly.

Your computer can't just "send an email" the way it can write to a file. Your laptop is not on the internet's mail-delivery network. Email runs on dedicated mail servers — boxes that talk to other boxes using rules called SMTP, with reputation scores and spam filters and bounce-handling. If you tried to deliver mail directly from your app, half of it would land in spam and the other half would never arrive.

So instead, your app talks to **a provider** — a service whose entire job is "you give me a message, I make it land in the customer's inbox." AgentMail. SendGrid. Resend. Postmark. Mailgun. They each run those mail servers on your behalf. You make one HTTP call to their service with the subject, the body, and the recipient address. They handle the rest. They give you back a tracking ID, retry on failure, and tell you when the customer opens the message.

That's all a provider is: a small company that owns the mail-delivery problem so you don't have to. Pick one, give it your API key, and send.

### Why the email isn't sent at the moment of approval

Here's the part most beginners get wrong on their first try. When Carol clicks **Approve**, you might think the order of events is: *update the deal's status, send the email, return success to the browser.* That's wrong, and getting it wrong has bitten thousands of teams.

What actually happens in a well-built app is: *update the deal's status, write a row to an outbox table saying "send this email," return success to the browser.* The actual email send happens **a few seconds later**, in a separate step.

Why? Because the email provider might be slow. Or down. Or rate-limiting you. Or the customer's mail server might take eight seconds to acknowledge the connection. If your "approve" button waited on all of that, every CRO click would feel sluggish, and every time the provider had a bad afternoon, deals would fail to approve. The CRO would think the app was broken when really it was the email plumbing.

So we **decouple** the two halves. Carol's click writes an outbox row instantly — that's fast, it's just a database insert, it always works. A separate worker reads the outbox a few seconds later, talks to the provider, and marks each row sent. **The deal-desk app keeps working even if the email provider falls into the ocean.** Worst case, Alice gets her email two minutes late instead of two seconds late. Carol's approve click never feels the difference.

This is how Slack, Stripe, Linear, GitHub, and every serious app does it. Clear builds the same shape for you, automatically, the moment you ask for one.

### The outbox row from Chapter 9

Look back at what Chapter 9 set up. Inside the queue block, two lines told the compiler which actions should drop email rows:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  email customer when counter, awaiting customer
  email rep when approve, reject
```

Those lines built the outbox. They told the compiler *who* to email and *when* — but not *what to say*. After Carol clicked Approve, there was a row in `deal_notifications` saying "rep Alice should get an email about deal 1," but the row had no subject and no body. It was a placeholder, like a sticky note saying "remember to email Alice" with no message written.

Today we write the message. And then we turn the worker on so the row actually gets delivered.

### Templates: one rule, many emails

Before we write the message, one more concept. The email Alice gets when her Acme deal approves needs to mention *Acme*. The email Bob gets when his Globex deal approves needs to mention *Globex*. You don't want to write a separate email rule for every customer — that's hundreds of duplicates. You want **one rule that fills in the customer name from the deal record at send time.** That's a **template**.

A template is a string with placeholders. Where you'd normally write `Hi customer,` you write `Hi {deal's customer},`. The curly braces are the trick: when the email actually sends, Clear reaches into the deal record, pulls out the `customer` field, and substitutes it for `{deal's customer}`. One template serves every deal in your database.

Read this out loud: *"Hi {deal's customer}, your discount request was approved."* You can hear the placeholder. You can hear what gets filled in. That's the whole idea.

### Add the email block

Open `deal.clear` from Chapter 9 and add this block right after your `queue for deal:` block, at the top level (no indentation):

```clear
email rep when deal's status changes to 'approved':
  subject is 'Your deal was approved'
  body is 'Hi {deal's rep_name}, your discount request for {deal's customer} just cleared CRO review. Status is now approved.'
  provider is 'agentmail'
  track replies as deal activity
```

Five lines. Read them out loud: *"email the rep when the deal's status changes to approved — subject is your deal was approved, body is hi rep_name, your discount request for customer just cleared CRO review, provider is AgentMail, track replies as deal activity."* No CS jargon. A manager could read this and tell you what the app does.

Here's what each line means:

- `email rep when deal's status changes to 'approved':` — the trigger. When *any* URL handler in your app sets a deal's status to `'approved'`, fire this rule. (The queue's auto-generated `PUT /api/deals/:id/approve` handler is the obvious one, but if you wrote a custom endpoint that also did `deal's status is 'approved'`, this rule would fire there too.)
- `subject is '...'` — the email's subject line. What Alice sees in her inbox preview before she opens the message.
- `body is '...'` — the email's main text. The `{deal's rep_name}` and `{deal's customer}` placeholders get filled in from the deal record at send time.
- `provider is 'agentmail'` — which mail-delivery service to use. Valid values are `agentmail`, `sendgrid`, `resend`, `postmark`, and `mailgun`. AgentMail is the default if you leave the line out, but writing it explicitly is clearer.
- `track replies as deal activity` — the magic line. When Alice hits Reply in her inbox, the reply lands back on *this deal record*. Marcus's CRO opens deal 1 and sees the customer's response right there, attached to the deal. The conversation and the record are one thing.

### What the compiler wrote for you

When you save this file and recompile, the compiler does several things you didn't have to type:

- **A shared outbox table called `workflow_email_queue`** — one table per app, no matter how many `email <role> when ...` blocks you eventually write. Every triggered email lands here as a row with the subject, body, recipient address, provider name, and a `queue_status` field that starts at `'pending'`. (The Chapter 9 `deal_notifications` table is still there — that's the lighter-weight notification ledger. The `workflow_email_queue` table is the actual outbox the worker reads.)
- **An auto-injected insert into every `approve` handler.** When Carol's PUT request lands on `/api/deals/:id/approve` and the queue primitive flips the deal's status to `'approved'`, the compiler also inserts a row into `workflow_email_queue` with the right subject, body, recipient, and provider — all in one transaction. If the database write fails, none of the three pieces commit. If the database write succeeds, all three are durable.
- **Template substitution at insert time.** The compiler reads `{deal's rep_name}` and `{deal's customer}` and emits code that pulls those fields off the deal record before the row gets written. By the time the outbox row hits disk, the placeholders are already filled in. The worker that sends the email doesn't have to know anything about templates.
- **Recipient resolution by convention.** Chapter 9's queue block already established that `email rep when ...` means "look up `rep_email` on the deal record." Same convention here. If the field is missing, the compiler warns at build time so you can't accidentally ship a rule that would silently land empty rows in the outbox.

You did not type the word `INSERT INTO`. You did not write a placeholder substitution function. You did not wire up provider configuration. The compiler did all of it.

### Inert by default — your first build never accidentally emails anyone

Here's a sentence you should reread until it sticks: **the compiler does not actually send emails until you flip an explicit switch.** Up to this point, every approve click queues a row in `workflow_email_queue` with `queue_status = 'pending'`. Nobody is delivering anything. The provider's API has not been called. Alice is not getting any email.

This is on purpose. It would be terrible if the first time you ran your app in dev, you accidentally fired a "your deal was approved!" message to a real customer's inbox because you were testing the approve button. Every test run, every preview build, every dev session — those should fill the outbox up so you can verify the data is right, not actually send mail.

So Clear separates *queueing* from *sending*. Queueing is the default. Sending requires one more line.

### Flip the switch — `email delivery using agentmail`

When you've watched the outbox fill up correctly for a few days and you're ready to start delivering real emails, add this single line at the top of `deal.clear`, right after your `database is local memory`:

```clear
email delivery using agentmail
```

That's the whole on-switch. Read it out loud: *"email delivery using AgentMail."* No CS jargon. The provider name has to match the one you wrote inside the `email rep when ...` block above (or you'll get a compile-time error about disagreeing providers).

When the compiler sees this directive, it emits one more piece of code: a small **background worker** that runs alongside your server. Every 30 seconds, the worker reads pending rows from `workflow_email_queue`, makes one HTTP call per row to AgentMail's API with the subject + body + recipient, and marks each row `'sent'` (or `'failed'` with the error string from AgentMail). That's the worker. Thirty seconds, one HTTP call per pending row, status update.

Without the directive, no worker emits. The outbox fills up forever. With the directive, real customer mail flows. **One line is the difference between dev mode and production.**

### One more piece — the API key

The worker needs to authenticate with AgentMail to send mail on your behalf. AgentMail (and every other provider) gives you an **API key** — a long random string that proves you're you. You set the key in an environment variable named `AGENTMAIL_API_KEY` (the worker reads this name automatically). On your laptop:

```bash
export AGENTMAIL_API_KEY='your-key-from-agentmail-dashboard'
clear serve deal.clear
```

In production, you set the same variable on whatever server you deploy to. If the variable is missing, the worker logs *"AGENTMAIL_API_KEY not set — cannot send"* once and goes quiet. **It does not crash your app. It does not silently succeed.** You see the warning in your logs, you set the key, you restart. That's the failure mode by design — a misconfigured deploy can never accidentally pretend it's sending mail when it isn't.

### Now run this

Save the file. Restart the server:

```bash
clear serve deal.clear
```

We'll walk through the same scenario from Chapter 9 — Alice signs up, saves a deal, Carol approves it — and watch a real email leave the building.

**Sign Alice up with her email address:**

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@acme.com","password":"alice-pw-12345","name":"Alice"}'
```

**Save a deal that includes Alice's `rep_email` and the customer's `customer_email`:**

```bash
curl -X POST http://localhost:3000/api/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <alice-token>" \
  -d '{"rep_name":"Alice","rep_email":"alice@acme.com","customer":"Acme Corp","customer_email":"buyer@acme.com","list_price":50000,"discount_percent":15}'
```

**Sign Carol up as admin and approve the deal:**

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"carol@cro.com","password":"carol-pw-12345","name":"Carol","role":"admin"}'

curl -X PUT http://localhost:3000/api/deals/1/approve \
  -H "Authorization: Bearer <carol-token>"
```

**Check the outbox:**

```bash
curl http://localhost:3000/api/workflow-email-queue \
  -H "Authorization: Bearer <carol-token>"
```

You see one row. Recipient is `alice@acme.com`. Subject is `Your deal was approved`. Body reads `Hi Alice, your discount request for Acme Corp just cleared CRO review. Status is now approved.` — note the placeholders are already filled in. `queue_status` is `'pending'`.

If you set `AGENTMAIL_API_KEY` and the `email delivery using agentmail` directive is in your file, wait 30 seconds and check the row again. `queue_status` is now `'sent'`. A `sent_at` timestamp landed. **Alice has the email in her inbox.** The deal-desk app just sent its first real piece of customer mail.

If the directive is *not* in your file (the default for dev), the row stays `'pending'` forever. No worker is running. Nothing leaves the building. That's the safety the inert-by-default story buys you.

### Reply tracking — where the conversation lives

Here's the headline pitch for Marcus. When Alice replies to that email — *"Thanks Carol, just confirming the start date is May 15"* — where does the reply go?

In most apps, the reply lands in some shared inbox at `team@yourcompany.com`. A human reads it, copies the relevant text, opens the deal in your app, and pastes it into a comments field. That manual handoff is where customer context goes to die. Every CRM has this problem.

The `track replies as deal activity` line you wrote earlier fixes it. AgentMail (and every provider Clear supports) lets you attach a per-message reply-to address that routes incoming mail back to your app via webhook. When Alice hits Reply, her message hits AgentMail, AgentMail posts it to your app's webhook URL, and Clear's runtime writes the reply onto a `deal_activity` table tied to deal 1. **The customer's response shows up directly on the deal record.** Carol opens deal 1 in the deal-desk UI and sees the entire conversation alongside the price and the discount and the audit row.

The conversation and the record are one thing. That's the thing Marcus's CRO has been trying to glue together with three different tools for ten years, and Clear hands it over in a single line.

### What you didn't write

For the experienced developer skimming, the things that didn't appear in your source: a `nodemailer` setup block, an HTTP client wrapper around AgentMail's API, a retry loop, a per-handler "if action == approve send X" branch, a template rendering function, a webhook receiver for incoming replies, a database table for the email queue, a database table for reply tracking, and the wire-up between any of those things. The compiler emitted all of it from one block of declarative English.

For the newcomer: you just shipped the same email shape that powers every transactional-email feature in every SaaS app you've ever used. The "your order shipped" email from Amazon. The "your invoice is ready" email from Stripe. The "you've been mentioned" email from Linear. They're all the same pattern: an event happens, an outbox row drops, a worker delivers it, replies route back into the app. Once you can read `email <role> when <entity>'s status changes to <value>:`, you can read every transactional-email system anybody has ever written.

### Try it yourself

1. **Add a reject email.** Add a second `email` block under your existing one, this time triggered by `'rejected'`. Subject: `Your deal needs a different shape`. Body: `Hi {deal's rep_name}, the {deal's customer} discount request was reviewed by Carol and won't move forward as written. Reply to this email if you'd like to discuss alternatives.` Recompile, save a fresh deal as Alice, then have Carol PUT to `/api/deals/1/reject`. Check the outbox — there's a new row, this time with the rejection subject and the rep's email as the recipient.

2. **Trigger the email from a hand-rolled endpoint.** Add a custom endpoint that flips status manually:

   ```clear
   when user updates deal at /api/deals/:id/manual-approve:
     requires login
     deal's status is 'approved'
     save deal to Deals
     send back deal with success message
   ```

   PUT to `/api/deals/1/manual-approve` as Carol. The same email row should land in the outbox — the trigger fires from any handler that sets the status, not just the queue's auto-approve path.

3. **Confirm the rep's email lands on the row.** Pull `GET /api/workflow-email-queue` and look at the `recipient_email` column. It should match the `rep_email` field you saved on the deal — `alice@acme.com`, not Carol's address. If it's blank, the rule was probably set up to email the customer instead of the rep, or the deal was saved without the `rep_email` field. The compiler's recipient-resolution convention is `<role>_email` — if the field is missing, you get an empty recipient and a build-time warning.

### Why this matters

Three chapters ago, deal-desk was a personal CRUD app. Two chapters ago, it learned to wall users off from each other. One chapter ago, it grew an approval queue with an audit trail. Today it became something the CRO can actually run a business on: *every approval generates a customer-shaped artifact, every artifact gets delivered, every reply lands back where it belongs.* That's the difference between "a database with a UI on top" and "a system the company depends on."

The Marcus pitch lands here. *"Every approval is provable, every email is logged, the customer's reply lives on the deal record, and not a single byte of the email plumbing was hand-rolled."* All of that is true because of the eleven lines you wrote across Chapters 9 and 10.

### What's next

You've watched the email get composed from a template, dropped into an outbox, and delivered by a worker — all kicked off by Carol's single click. But the *body* of the email was hand-written. You typed `Hi {deal's rep_name}, your discount request just cleared CRO review`. For a one-off rule that's fine. For a CRO who wants the email to summarize the deal — *"approved at 15% off list against a 22% precedent for similar Enterprise renewals; risk score 3"* — you'd be writing a different body for every kind of deal forever.

Chapter 11 introduces **the AI drafter**: an agent that reads the deal record and writes a one-paragraph summary that lands directly on the deal. Same outbox shape, same worker, same reply tracking — what changes is that the email body can now pull in `{deal's summary}` and that summary was written by Claude, not by you. Bring your queue from Chapter 9 and your email block from Chapter 10. Chapter 11 stands on top of both.

## Chapter 11: The AI Drafter (Claude Writes the Deal Summary)

By the end of this chapter, when Carol opens a pending deal and clicks **Draft AI summary**, an AI agent will read the deal — Acme renewal, $84,000, 28% discount, mid-quarter — and write a one-paragraph summary that lands on the deal's `summary` field alongside a clear approve-or-reject recommendation. The audit row from Chapter 9 still gets stamped. The email from Chapter 10 still gets queued. Now the email body can include the AI's summary, and the CRO opens a deal already prepped with a written brief instead of staring at a row of numbers.

This is the first chapter where deal-desk *thinks*. Up to here, every line you've written has been a rule the compiler turns into deterministic code — `if discount > 30 then reject`, `email rep when status changes to approved`. Today we add a different kind of code: a recipe that asks an AI to do the part rules can't do. **The rule is the gate. The AI is the writer. Two different jobs.** Hold that distinction — Chapter 12 will make it concrete by adding a *provable* business rule alongside the AI, and you'll see why the same app needs both.

### What is an AI agent in code?

You've been hearing "AI agent" for two years and probably picturing something complicated — a chatbot, a robot, a system with a personality. In code it's much smaller than that. **An AI agent is a named recipe for asking an AI model to do one specific job.** Like the function you wrote in Chapter 4 (`compute_discount_cap`) — but instead of math, the body is *"send this prompt and these inputs to Claude, wait for the answer, return the text."*

That's it. A function whose body is "ask the AI." You name it. You give it inputs. You call it from anywhere in your app like any other function. The AI is the engine; the agent is the wrapper around the engine that says *what job* the engine is doing this time.

A deal-desk app might have several agents: one that summarizes the deal, one that drafts a counter-offer email, one that scores a customer's risk based on free-text procurement notes. Each is its own named recipe. Each calls the same Claude in the background, but each has its own prompt, its own inputs, and its own job. **Naming the recipe is what turns "calling an AI" into a reusable feature of your app** — because now anyone reading your code sees `draft_approval(deal)` and knows exactly which AI job is happening.

### Why does the AI need context? (`knows about:`)

Here's the part newcomers trip on. When you ask Claude to summarize a deal, Claude doesn't know what's on your screen. Claude doesn't have a database connection. Claude can't peek at your `Deals` table. **Claude only sees what you put into the prompt.**

So if you write `ask claude 'Summarize this deal'` and don't pass any deal data, Claude will write a generic essay about deal summaries. Useless. You have to *hand* Claude the deal — the customer name, the price, the discount, the rep, the segment — every time. The AI's whole understanding of "this deal" is whatever bytes you typed into the call.

There are two ways to feed the AI. The simple way is `with deal_data` — you pass one record (or one variable) and Claude sees just that. The bigger way is `knows about: SomeTable` — you tell Clear *"every time this agent runs, also pull recent rows from that table and include them in the prompt."* That's how you give an agent ongoing background knowledge it can refer to without you re-typing it on every call. For our drafter, we'll keep it simple — pass the one deal that's being approved. The CRO doesn't need Claude to remember every deal in history; the CRO needs Claude to read *this* deal and write *this* summary.

### What does `ask claude` actually do?

`ask claude` is the line that makes the network call. Read it as one verb: **"go ask Claude this question with this data, and give me the answer back."** Underneath, Clear's runtime does five things: opens an HTTPS connection to Anthropic's API, sends your prompt and your inputs as a JSON request, waits for Claude to think and respond, parses the answer, and hands the text back as a regular variable in your code. From your point of view it looks like a function call. Under the covers it's a network round-trip to a server farm somewhere on the internet that runs a language model.

That round-trip costs money — Anthropic charges per word in and per word out — and takes time, usually one to five seconds. Both facts matter for your app. The cost is small per call (fractions of a cent for a deal summary) but it adds up if you call it on every page load. The latency means you don't want to put `ask claude` inside a tight loop or in front of a user click that needs to feel instant. For deal-desk, the CRO clicking *Draft AI summary* and waiting two seconds for a written paragraph is fine — that's the same wait you'd accept opening a dropdown in any web app.

### The deal-desk drafter

Open `deal.clear` from Chapter 10. Find the section just below your email block — that's where the drafter goes. Add this:

```clear
define function draft_approval(deal_data):
  drafted = ask claude 'You are a deal-desk analyst writing for the CRO. Given a discount request, write a one-paragraph approval summary. Cover: why the rep wants this discount, the financial impact in dollars, the strategic risk if approved, and a clear approve or reject recommendation. Keep it under 100 words. Be direct.' with deal_data returning JSON text:
    summary
    recommendation
    risk_score (number)
  return drafted
```

Six lines. Read the call out loud: *"drafted equals ask claude — followed by the prompt — with deal_data — returning JSON text with three fields: summary, recommendation, and risk_score as a number."* No CS jargon. A manager could tell you what this function does.

Here's what each piece is doing:

- `define function draft_approval(deal_data):` — a regular function declaration, just like Chapter 4's `compute_discount_cap`. It takes one input (the deal record) and returns one output (the drafted summary).
- `drafted = ask claude '...' with deal_data` — the AI call. The string in quotes is the **prompt** — the instructions Claude reads before writing. The `with deal_data` part attaches your input. Claude sees both.
- `returning JSON text:` followed by an indented field list — the **output shape**. We're telling Claude *"don't write me a free-form essay; give me back a JSON object with exactly these three fields."* Clear writes the JSON-parsing code for you so `drafted's summary`, `drafted's recommendation`, and `drafted's risk_score` are usable as ordinary fields the moment Claude returns.
- `return drafted` — hand the parsed object back to whoever called the function.

That's the drafter. One AI agent, sixty seconds of typing, a CRO-ready summary on demand.

### Wire it into an endpoint

A function on its own does nothing — somebody has to call it. Chapter 9's queue auto-generated the approve / reject / counter URLs. We'll add one more endpoint that runs the drafter when the CRO asks for a written brief. Add this just below the function:

```clear
when user sends deal_request to /api/deals/draft:
  requires login
  drafted = draft_approval(deal_request)
  send back drafted
```

Four lines. The CRO's browser POSTs the deal record to `/api/deals/draft`, the endpoint requires login (the wall from Chapter 8 still applies), the drafter runs, and the parsed `{summary, recommendation, risk_score}` object goes back to the browser. The browser stores it on the page's `selected_deal` so the detail panel updates with the freshly written paragraph.

Notice what we did NOT do: we did not write `fetch('https://api.anthropic.com/v1/messages')`. We did not parse a streaming response. We did not handle retries. We did not catch network errors. We did not authenticate against Anthropic's API. The compiler did all of that the moment you wrote `ask claude`.

### Why the AI doesn't replace the rule

Here's the question that has cost real companies real money: *if the AI is so smart, why not let Claude decide whether to approve the deal?*

Because Claude is a writer, not a gate. Claude is excellent at language — summaries, drafts, suggestions, explanations. Claude is **bad** at the kind of decision a CRO is paid to make: *"can this 32% discount go through, yes or no?"* Not because Claude is stupid — because Claude is non-deterministic. Ask the same question twice, get two different answers. Ask once on Tuesday and once on Wednesday and the model behind the scenes might have changed. None of that is acceptable for a business rule. The CRO needs to know *"discounts of 30% or more are blocked, every time, with the same reason."* The compliance buyer needs to be able to point at the rule and say *"prove it."* AI can't be proven. **A rule can.**

So in deal-desk we split the work cleanly:

- **The rule** — `enforce that deal's discount_percent is less than 30` — is the gate. Compiler-checked, deterministic, the same answer every time, provable. Chapter 12 will introduce this in detail.
- **The AI** — the `draft_approval` agent — is the writer. It produces the paragraph that explains *what's going on* with this deal, but never the verdict on whether the deal can pass. The verdict is the rule's job.

Get this division wrong and you ship one of two failure modes. Either you let the AI gate and your CRO fields one *"the bot let through a deal it shouldn't have"* report a month, or you write rules in English and ask Claude to interpret them, and now your business policy is whatever Claude felt like that morning. Get it right and you have an app where the boring deterministic part is always right and the writing-words part feels like having a junior analyst.

### The Anthropic key — `ANTHROPIC_API_KEY`

The `ask claude` runtime has to authenticate with Anthropic to make the call. That's done with an **API key** — a long random string that Anthropic gives you when you sign up for their developer console. You paste the key into an environment variable named `ANTHROPIC_API_KEY` and the runtime reads it on startup. **The compiler never sees the key. It's not in your source file. It's not in your git history.** It lives only in the environment of the machine running the app.

On your laptop:

```bash
export ANTHROPIC_API_KEY='sk-ant-…your-key-from-console.anthropic.com'
clear serve deal.clear
```

In production you set the same variable on whatever server you deploy to. If the variable is missing, the runtime logs *"ANTHROPIC_API_KEY not set — `ask claude` calls will fail"* once and goes quiet. Calls to `draft_approval` return a clear error to the browser instead of silently making something up. **Inert by default** — the same shape Chapter 10's email worker uses. A misconfigured deploy can never accidentally pretend it's calling an AI when it isn't, and your dev runs never accidentally burn API credit before you're ready.

### Now run this

Save the file. Set the key, restart the server:

```bash
export ANTHROPIC_API_KEY='sk-ant-…your-key'
clear serve deal.clear
```

Sign Carol up as the CRO (Chapter 8 setup):

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"carol@cro.com","password":"carol-pw-12345","name":"Carol","role":"admin"}'
```

Send a deal in for drafting. The seed data from `/api/seed` already has Acme — `customer: "Acme Corp"`, `list_price: 84000`, `discount_percent: 28`, `account_segment: "Enterprise"` — so we'll draft a summary for that one:

```bash
curl -X POST http://localhost:3000/api/deals/draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <carol-token>" \
  -d '{"customer":"Acme Corp","rep_name":"Sarah Chen","list_price":84000,"discount_percent":28,"account_segment":"Enterprise","deal_type":"Renewal"}'
```

Two seconds later you get a JSON response that looks something like this:

```json
{
  "summary": "Acme Corp is renewing as an Enterprise account with rep Sarah Chen requesting a 28% discount on $84,000 list price. The dollar concession is roughly $23,500 against a contract that historically runs at 22-24% for similar Enterprise renewals. Strategic risk is moderate: precedent supports the request and customer health is steady, but approving sets a higher anchor for the next renewal cycle.",
  "recommendation": "Approve with a 25% counter to hold the precedent line.",
  "risk_score": 3
}
```

That paragraph was not in your source file. You did not write it. Claude did. The compiler turned `ask claude '…' with deal_data returning JSON text:` into the network call, the response parse, and the object that came back into your app. **And every fact in that paragraph traces to the deal data you sent in** — Claude can't make up the dollar amount because Claude only knows what you handed over.

If you want to see the summary land on the deal record itself, the front-end button in `apps/deal-desk/main.clear` already does this — `button 'Draft AI summary': send selected_deal to '/api/deals/draft'` — and the response writes back into `selected_deal's summary`. Open the deal-desk page in a browser, click any pending deal, click **Draft AI summary**, and the detail panel re-renders with the freshly-written text.

### Try it yourself

1. **Tighten the prompt for risk-only.** Clone the `draft_approval` function as a second function called `score_risk(deal_data)`. Change the prompt to *"You are a risk analyst. Score this deal from 1 to 10 where 10 means walk away. Return only the number and a one-sentence reason."* Change the `returning JSON text:` block to `risk_score (number)` and `reason`. Wire it to `/api/deals/risk` the same way `/api/deals/draft` is wired. POST the Initech deal (35% discount, $118,000 expansion) and watch Claude push the score higher than the Acme renewal's. Same compiler shape, different job.

2. **Give the agent background knowledge with `knows about:`.** Switch from `define function` to the agent form so you can use `knows about:`. Replace the function block with:

   ```clear
   agent 'draft approval' receives deal_data:
     knows about: Deals
     drafted = ask claude 'You are a deal-desk analyst. Given a discount request and recent deal history, write a one-paragraph approval summary that compares this request to recent precedents.' with deal_data returning JSON text:
       summary
       recommendation
       risk_score (number)
     send back drafted
   ```

   Now Claude sees not only the incoming deal but also a snapshot of recent rows from the `Deals` table. Ask the drafter to summarize the same Acme renewal and watch the paragraph mention precedent rows from the seed data. Same six lines, much sharper output — that's what `knows about:` buys you.

3. **Pull the AI summary into the email body from Chapter 10.** Open the email block from Chapter 10 and change the body line from `'Hi {deal's rep_name}, your discount request for {deal's customer} just cleared CRO review. Status is now approved.'` to `'Hi {deal's rep_name}, your {deal's customer} discount cleared CRO review. Carol''s notes: {deal''s summary}'`. Recompile, run the same Chapter 10 approve flow, then check `GET /api/workflow-email-queue`. The body now includes the AI-written summary verbatim. **Same outbox row, same worker, same delivery — the email is now smarter because the deal record is now smarter.** That's the compounding the AI drafter unlocks.

### Why this matters

Three chapters ago, deal-desk learned to write rows. Two chapters ago, it learned to send mail. Today it learned to *think* — but only about the part of the job that's actually thinking. **The verdict — can this deal pass — is still the rule's job, deterministic and provable.** The writing — *what does this deal actually mean, in plain English, to a CRO with twenty more deals in the queue today* — is now Claude's job. The CRO opens deal-desk Monday morning and every pending row already has a written brief attached. The same brief lands in the rep's email when the deal approves. The audit row that gets stamped includes the deal as Claude described it. **One AI call, and three downstream surfaces get smarter.**

The Marcus pitch sharpens here. *"Claude writes the summary; the rule decides the verdict; the audit trail records both."* That sentence is the entire AI story for the regulated tier — small surface area, clear division of labor, and a story the compliance buyer can follow without ever using the word "machine learning."

### What's next

The drafter you built today is the simplest shape an AI can take in your app — one input, one prompt, one paragraph back. Real Marcus apps need more: an agent that can *look things up* (call your own functions), an agent that *remembers* the last few CRO conversations, an agent that *runs every morning at 9* without anyone clicking a button, an agent that's actually a *team* of agents handing work to each other. Chapter 11b covers all of that. Then Chapter 12 introduces the `rule` keyword that wraps everything in a provable guarantee.

---

## Chapter 11b: Building Real Agents (Tools, Memory, Schedules, Multi-Agent)

By the end of this chapter, deal-desk's drafter from Chapter 11 will grow up. It'll be able to look up past deals when summarizing a new one, remember the CRO's last few conversations, run an automatic morning briefing every day at 9 a.m., and split into a small team — one agent that researches, another that scores, a third that recommends. **And the compiler will refuse to ship any agent that reads a credential directly** — agents call functions that USE the credential, never see the value. That last bit is what makes the regulated-tier AI pitch land.

This chapter is denser than the others. Read it once, then come back to specific sections when you need them. The shape is: each capability gets a name, a one-paragraph plain-English explanation, the canonical syntax, and a deal-desk-anchored example.

### The mental model — agent = function with extras

A function in Chapter 4 (`compute_discount_cap`) had a name, inputs, a body, a return value. An **agent** has all of that plus optional extras the compiler wires for you:

- `has tool: my_function` — the agent can call your function. The AI decides when. Your function runs, returns a value, the AI uses it.
- `knows about: Deals` — the runtime fetches recent rows from the table and slips them into the prompt. The AI now has background knowledge.
- `remember conversation context` — every call from the same user threads into a running history. The AI remembers the last thing it said.
- `must not: ...` — guardrails the compiler enforces. The agent literally cannot do the listed things.
- `runs every 1 day at '9:00 AM'` — turn the agent into a scheduled job. No endpoint needed; the runtime fires it on a timer.

You add the extras you need. Skip the ones you don't. **Each extra is one line.** The compiler emits the database tables, the middleware, the cron entries, the tool-use loop with Anthropic's API — all of it.

### Tools — let the AI call your code

In Chapter 11, the drafter had to be handed everything it needed (`with deal_data`). What if the AI wants to look up *past Acme deals* on its own, mid-thought? That's what **tools** are for. A tool is just a Clear function the agent can call when it decides to.

Define the function first:

```clear
define function look_up_recent_deals(customer_name):
  matches = look up all Deals where customer is customer_name
  return matches
```

Then attach it to the agent:

```clear
agent 'precedent finder' receives current_deal:
  has tool: look_up_recent_deals
  notes = ask claude 'Look up this customer''s recent deals and tell me what discount range applies' with current_deal returning JSON text:
    precedent_summary
    suggested_cap (number)
  return notes
```

That's the whole thing. When this agent runs, Claude reads the prompt, decides it needs precedent data, **calls your `look_up_recent_deals` function with the customer name**, gets the rows back, then writes the summary using what it learned. You wrote one function; the AI uses it as a research tool. Add more tools (`has tools: look_up_recent_deals, fetch_credit_score`) and the AI picks the right one for each question.

Note the plural form: `has tools: a, b, c` works the same way as `has tool: a` — pick whichever reads better.

### Skills — bundle tools that go together

When two or three tools always travel together — a Deal Lookup skill might pair `look_up_recent_deals` and `summarize_deal_history` — wrap them in a **skill** so any agent can grab them in one line:

```clear
skill 'Deal Lookup':
  has tools: look_up_recent_deals, summarize_deal_history
  instructions:
    Always include the customer name when describing precedent.
    Round dollar amounts to the nearest thousand.

agent 'precedent finder' receives deal:
  uses skills: 'Deal Lookup'
  notes = ask claude 'Summarize precedent for this customer' with deal returning JSON text:
    precedent_summary
  return notes
```

The `instructions:` block under a skill becomes part of the agent's system prompt automatically — *"always include the customer name"* travels with the skill no matter which agent uses it. Define the skill once; reuse across the four agents that all need precedent data.

### Memory — the agent remembers across calls

The drafter from Chapter 11 has goldfish memory. Every call is a fresh conversation. Real assistants remember — the CRO asks about the Acme deal, then asks *"what about a 25% counter?"* and the AI shouldn't need *Acme* spelled out again.

Two memory types, each is one line:

```clear
agent 'CRO assistant' receives message:
  remember conversation context
  reply = ask claude 'Help the CRO triage this' with message
  return reply
```

`remember conversation context` — every call from the same authenticated user threads into a running history. The agent sees the last few exchanges automatically. The runtime stores the history in a `Conversations` table the compiler creates for you.

```clear
agent 'CRO assistant' receives message:
  remember user's preferences
  reply = ask claude 'Help the CRO' with message
  return reply
```

`remember user's preferences` — long-term facts about the user that survive across conversations. *"This CRO prefers 25% counters."* *"Carol always wants the strategic-risk paragraph first."* The AI can recall these months later without re-being-told.

Both lines together = short-term + long-term memory. The compiler handles the storage, the prompt-stitching, and the per-user scoping. **You wrote two lines; the AI now feels like it knows the CRO.**

### RAG — give the AI a knowledge base

In Chapter 11 you saw `knows about: Deals` mentioned briefly. It's the AI's library card. When the agent runs, the runtime keyword-searches the named table for rows relevant to the prompt and slips matches into the AI's context.

```clear
agent 'policy explainer' receives question:
  knows about: Policies, FAQ
  answer = ask claude 'Answer using the policies' with question
  return answer
```

Tables are one source. There are two more:

```clear
agent 'docs assistant' receives question:
  knows about: 'https://docs.deal-desk.com/handbook'
  answer = ask claude 'Answer using the handbook' with question
  return answer
```

URL — the runtime fetches the page text once at startup, indexes it, slips matching paragraphs into prompts.

```clear
agent 'returns assistant' receives question:
  knows about: 'policies/return-policy.pdf', 'handbook/onboarding.docx'
  answer = ask claude 'Answer using these documents' with question
  return answer
```

Files — the runtime reads the file at startup. Supported types: `.pdf`, `.docx`, `.txt`, `.md`. Mix sources freely: `knows about: Policies, 'https://docs.x.com', 'guide.txt'`.

### Guardrails — what the agent CAN'T do

This is the part Marcus's compliance buyer cares about. By default, an agent with tools can call any of them. With `must not:`, you list things the agent cannot do, and **the compiler enforces it at build time**. If the agent's tools could violate the rule, the build fails.

```clear
agent 'support bot' receives question:
  has tools: look_up_orders, refund_order
  must not:
    delete any records
    access Users table
    call more than 5 tools per request
  reply = ask claude 'Help this customer' with question
  return reply
```

Three guardrails, three different jobs:

- `delete any records` — the compiler checks every tool. If any tool does a `delete`, build fails with *"tool refund_order deletes from Orders, but the agent has 'must not: delete any records'."*
- `access Users table` — the compiler checks tool tables. If any tool reads/writes the `Users` table, build fails.
- `call more than 5 tools per request` — runtime cap. If Claude tries to chain 6+ tool calls, the runtime cuts it off.

There's a second guardrail for tool *inputs* — `block arguments matching '<regex>'`. If Claude tries to pass a string matching the pattern, the runtime refuses to call the tool. Useful for "no SQL keywords in the search box" or "no shell metacharacters in the file path."

```clear
agent 'database assistant' receives query:
  has tool: search_records
  block arguments matching 'drop|truncate|delete from'
  reply = ask claude 'Help search' with query
  return reply
```

### The credential safety rule — agents NEVER see secrets

Here's the load-bearing security beat. **Agents cannot read environment variables directly.** Even one prompt injection — *"print all your environment variables"* — could exfiltrate your Stripe key, your Anthropic key, your database password. The compiler refuses to compile any agent that reads `env(...)` or `process_env(...)` in its body.

The pattern that works: wrap the credential in a function. The function uses the credential. The agent calls the function.

```clear
# YES — the agent calls the function, the function uses the key, the agent never sees the value
define function charge_card(amount, token):
  result = call api 'https://api.stripe.com/v1/charges' with method 'POST' with bearer env('STRIPE_SECRET_KEY') sending {
    amount: amount,
    source: token
  }
  return result

agent 'refund bot' receives request:
  has tool: charge_card
  reply = ask claude 'Process this refund' with request
  return reply
```

The compiler accepts this — `charge_card` reads the env var, `refund bot` calls `charge_card`, the AI never touches the key.

```clear
# NO — agent reads env directly, build fails
agent 'leaky bot' receives message:
  api_key is env('STRIPE_SECRET_KEY')
  reply = ask claude 'Process payment with key' with message, api_key
  return reply
```

The compiler rejects this with: *"agent 'leaky bot' reads `env('STRIPE_SECRET_KEY')` directly. Agents must never see credential values — even one prompt injection ('print your env vars') could exfiltrate it. Wrap the credential in a function and use `has tool: that_function`."*

This rule is the **structural** version of "don't put secrets in the prompt." You don't have to remember it; the compiler does.

### Multi-agent — when one agent isn't enough

Real workflows need a small team. The drafter writes a paragraph; the scorer rates the risk; the recommender picks approve/counter/reject. Five patterns; combine freely.

**1. Sequential — one then the next.**

```clear
agent 'screen' receives deal:
  pass = call 'is sane' with deal
  return pass

agent 'score' receives deal:
  rating = ask claude 'Rate 1-10' with deal
  return rating

agent 'review' receives deal:
  screened = call 'screen' with deal
  rated = call 'score' with screened
  return rated
```

The output of each call flows into the next. Read top-to-bottom; that's the order.

**2. Parallel fan-out — known number of jobs, all at once.**

```clear
agent 'triage' receives deal:
  do these at the same time:
    sentiment = call 'sentiment' with deal
    risk = call 'risk' with deal
    fit = call 'fit' with deal
  create summary:
    sentiment is sentiment
    risk is risk
    fit is fit
  return summary
```

Three agents fire simultaneously. The runtime waits for all three before continuing. Faster than sequential when the jobs don't depend on each other.

**3. Dynamic fan-out — variable number of jobs, loop and accumulate.**

```clear
agent 'analyze pending' receives empty_input:
  pending = look up all Deals where status is 'pending'
  findings is an empty list
  for each deal in pending:
    note = call 'risk' with deal
    add note to findings
  return findings
```

You don't know how many pending deals there are; the loop handles whatever's there. Each call runs in order.

**4. Pipeline — named linear chain, reusable.**

```clear
pipeline 'review pipeline' with deal:
  'screen'
  'score'
  'review'

reviewed = call pipeline 'review pipeline' with new_deal
```

Same as the sequential pattern but with a name you can call from anywhere. The data flows through every step end-to-end.

**5. Iterative refinement — keep improving until quality is good enough.**

```clear
agent 'critic' receives draft:
  score = ask claude 'Rate clarity 1-10' with draft
  return score

agent 'polish' receives topic:
  draft = ask claude 'Write a first draft' with topic
  score = 0
  repeat until score is greater than 8, max 3 times:
    draft = ask claude 'Improve this' with draft
    score = call 'critic' with draft
  return draft
```

The polish agent drafts, critiques, redrafts, critiques again — up to three times. The `max 3 times` is required (no infinite loops). When the critic gives an 8+ or the cap hits, the loop ends and the best draft returns. Useful for: report-writing, code review, response drafting.

### Scheduled agents — runs forever, no clicks

Up to here, an agent runs because some endpoint called it. But sometimes you want an agent to fire on a schedule — *"every morning at 9 a.m., summarize yesterday's pending deals and email the CRO."* That's a **scheduled agent**.

```clear
agent 'morning briefing' runs every 1 day at '9:00 AM':
  pending = look up all Deals where status is 'pending'
  brief = ask claude 'Write a CRO morning brief covering these pending deals' with pending
  send email to 'carol@cro.com':
    subject is 'Morning brief — {count of pending} deals pending'
    body is brief
```

The `runs every 1 day at '9:00 AM'` line is the trigger. No endpoint, no button. The runtime starts the schedule when your server boots. Every morning at 9, the agent fires. The CRO gets the email.

Other schedules work the same way:

```clear
agent 'hourly cleanup' runs every 1 hour:
  ...

agent 'weekly report' runs every 1 week at '8:00 AM':
  ...

agent 'minute poller' runs every 5 minutes:
  ...
```

Long-running and durable: the runtime registers the schedule, fires the agent on time, retries on transient errors, logs every fire. **You wrote one line; you got a cron job, a job runner, error retry, and observability.**

### Streaming — token-by-token text or wait for the whole answer

Text agents stream by default. The CRO clicks *Draft summary* and the words appear as they're written, like ChatGPT. **Zero syntax — just works.** When the agent has structured output (`returning JSON text:`), the runtime knows you can't stream partial JSON, so it auto-disables streaming and waits for the full answer.

When you genuinely don't want streaming (a pipeline step that needs the full text before passing it to the next agent), opt out:

```clear
agent 'summarizer' receives text:
  do not stream
  summary = ask claude 'Summarize in one sentence' with text
  return summary
```

`do not stream` is the only opt-out you'll ever need.

### The bridge to Chapter 12 — `enforce that` wraps the agent

The drafter from Chapter 11 returns a `discount_percent`. The agent is non-deterministic — Claude could suggest 28%, 35%, or 50% depending on the day. **Chapter 12's `rule` keyword is what makes this safe.** When you wrap the agent's output with an `enforce that` rule, the rule fires AFTER the agent returns, on every output. The agent can suggest anything; the rule rejects anything over 30%.

```clear
when user sends deal to /api/draft:
  drafted = call 'precedent finder' with deal
  enforce that drafted's suggested_cap is less than 30, or fail with error message: 'Discount cap exceeded — VP approval required'
  send back drafted
```

That's the safety story Marcus's CRO will sign: **"Claude can suggest anything; the rule blocks anything over 30%; the audit log records both."** The agent is creative; the rule is the gate. Chapter 12 covers the `rule` keyword, the prover, and the audit PDF in detail.

### Try it yourself

1. **Add a precedent tool.** Define `look_up_recent_deals(customer_name)` from earlier and attach it to your Chapter 11 drafter as `has tool:`. Re-draft the Acme deal — the AI's summary should now mention Acme's last deal explicitly. Compare to the Chapter 11 version, which had to be told *Acme* in the prompt.

2. **Schedule a daily morning briefing.** Add the `agent 'morning briefing' runs every 1 day at '9:00 AM':` block from earlier. Run the server overnight. Tomorrow at 9 a.m. (or set the schedule to 5 minutes from now for a faster test), check the email outbox — there's a new row.

3. **Try to leak the Stripe key.** Write an agent that has `api_key is env('STRIPE_SECRET_KEY')` in its body. Run `clear build`. The compiler refuses with the credential-safety error. Wrap the key in a function and call the function from the agent — the build now succeeds.

### Why this matters

Chapter 11's drafter taught one shape — single agent, single prompt. This chapter showed you the full toolbox: tools, skills, memory, knowledge bases, guardrails, schedules, multi-agent patterns, streaming control. Together with Chapter 12's rules, you have what regulated-tier customers actually buy: **AI that can do real work, with provable guardrails the compliance buyer can sign.** The Marcus pitch in one sentence: *"Your AI can charge cards via Stripe but never sees the Stripe key. Your AI can suggest discounts but never break the discount cap. Your AI can email the CRO every morning but only when the rules say it can."* That's the difference between *"we use AI"* and *"we use AI safely."*

### What's next

Chapter 12 introduces the `rule` keyword — the named, provable, audit-trail-aware shape for the `enforce that` lines you've started using. Same logic, much bigger artifact: a verdict the prover can compute, a one-page PDF the CRO signs, an audit log row per rule rejection. Bring your drafter from Chapter 11, your team of agents from this chapter, and your queue from Chapter 9 — Chapter 12 closes the tutorial track.

---

## Chapter 12: Provable Business Rules (Math, Not Just Tests)

By the end of this chapter, deal-desk will refuse any discount of 30% or more — and you'll be able to prove that refusal holds for *every possible deal*, not just the three you tested. The CRO will get a one-page PDF with three rules and a verdict next to each one. The compliance buyer will get an artifact that reads like a board document, not a developer log. **And every fact in that PDF will be backed by both a math claim and a runtime witness — twenty violating inputs fired at the running app, every one rejected, every one with the rule's name on the rejection.**

This is the closing chapter of the tutorial track. Eleven chapters ago you wrote `show 'Discount: 18%'`. Today you're going to take the `if discount > 30 then reject` line you wrote in Chapter 2 and promote it from a runtime check to a *named, provable, audit-trail-aware policy*. Same logic. Wildly different artifact at the end. **The rule is the gate; the prover is the witness; the PDF is the receipt.**

### What is a business rule?

A **business rule** is a sentence the company refuses to break. *"No discount over 30%."* *"Counter-offers max out at 3 rounds."* *"Every lead needs an email address."* These aren't features — they're constraints. A feature is something your app *does*; a rule is something your app *won't do, ever, no matter who asks*. The CRO is paid to set those rules. The compliance buyer is paid to verify them. Your job, as the person building deal-desk, is to put the rule in the code in a way both can read.

Up to here, you've been writing rules implicitly. Chapter 2's `if discount > 30 then status is pending` is a rule. Chapter 8's `requires login` is a rule. Chapter 9's queue's auto-rejection of an empty status field is a rule. They all *work*. They all fire when they should. **But none of them have names.** The CRO can't point at them. The compliance buyer can't audit them. The next person on your team has to read code to figure out what's enforced.

The `rule` keyword fixes that. It wraps a check in a name, lifts it to the top of the file, and tells the compiler *"this one's load-bearing — track it specially, attribute it by name in the audit log, and submit it to the prover."* Same logic, much bigger artifact.

### Why does the CRO want a math proof, not just a test?

This is the question that matters most, so we're going to spend a paragraph on it. A test is *"I tried this case and it worked."* A math proof is *"I checked every possible case and confirmed it works."* The first is a sample. The second is a guarantee. **They are not the same thing, and the difference is the entire regulated-tier pitch.**

Here's the failure mode tests don't catch. You write a discount-cap rule. You write three tests — discount of 25 (passes), discount of 35 (rejected), discount of 50 (rejected). You ship. Six months later a rep submits a deal with discount of 29.99999% and it slips through because of a floating-point quirk in the rule. The tests didn't catch it because the tests didn't check 29.99999. **There are infinite numbers between 0 and 100, and you only tested three.**

A math proof walks the *expression* of your rule — not specific values, the actual logic — and proves the conclusion holds for every value the rule could ever see. The prover doesn't pick examples. It folds the math. It checks that any number where `discount_percent < 30` is false (i.e. 30 or more) gets rejected, period. Twenty test cases would not catch every edge case; one math proof does. The CRO asks "are you sure?" The prover answers "yes, for every possible deal." **That's a different sentence than "yes, for the three I tested."** And that sentence is exactly what a compliance buyer wants signed.

### Promote your check to a named rule

Open `apps/deal-desk/main.clear`. Just below the `database is local memory` line and above the `# Database` comment, add a top-level `rule` block. Top level means *no indentation* — the rule lives next to your `create a Deals table:` and your endpoints, not inside any of them.

```clear
rule discount-cap-thirty:
  enforce that deal's discount_percent is less than 30, or fail with error message: 'Discounts of 30% or more require VP approval'
```

Two lines. Read them out loud: *"rule discount-cap-thirty — enforce that the deal's discount percent is less than 30, or fail with error message: discounts of 30% or more require VP approval."* No CS jargon. A manager could tell you what this rule does.

Here's what each piece is doing:

- `rule discount-cap-thirty:` — the wrapper. The name `discount-cap-thirty` is what the prover, the audit log, and the PDF will use to attribute the verdict. Names use lowercase letters, numbers, and hyphens. Keep them short and policy-shaped.
- `enforce that deal's discount_percent is less than 30` — the **guard**. This is the actual check the runtime will fire. If a deal's discount is 30 or more, the guard rejects.
- `, or fail with error message: '...'` — the **refusal**. When the guard fails, this is the message that goes back to the caller and into the audit row. **Note the exact form: comma, space, then `or fail with error message:`, then the message in single quotes.** That's the locked canonical syntax — older forms like `or fail` or `with refusal:` no longer work.

Now add two more rules right below the first one. We're going to give the CRO three policies to verify, not one — a deal-desk audit PDF with one rule looks thin.

```clear
rule price-floor-positive:
  enforce that deal's list_price is greater than 0, or fail with error message: 'List price must be positive — zero or negative prices are never valid'

rule discount-not-over-cap:
  enforce that deal's discount_percent is less than 100, or fail with error message: 'Discount cannot meet or exceed 100% — that would mean giving the product away'
```

Three rules. Three policies. Each one names a single load-bearing constraint your CRO would call out by name. Save the file.

### A word about rule names

You'll notice each rule's name is a hyphenated phrase: `discount-cap-thirty`, `price-floor-positive`, `discount-not-over-cap`. That's not styling — the parser treats names as identifiers, lowercase with hyphens, and the prover output prints them verbatim. **There's also a quoted-string form** if you want a name that reads like a sentence:

```clear
rule 'Deals over $100k need CRO sign-off':
  enforce that deal's list_price is less than 100000, or fail with error message: 'Big deals need CRO sign-off'
```

When you use the quoted form, the parser **dasherizes** the name — it strips punctuation, lowercases everything, and joins the words with hyphens. The rule above becomes `deals-over-100k-need-cro-sign-off` in the prover output and the audit log. **Don't be surprised when you search the audit log for a deal that hit *"Deals over $100k need CRO sign-off"* and find dashes instead.** The dasherized form is what gets indexed.

### Now run this — `clear prove`

Save the file. From the repo root, run:

```bash
clear prove apps/deal-desk/main.clear
```

You should see something like this (line numbers will depend on where in the file you put the rules):

```
We proved 3 of 3 named rules in this app, for every possible deal.

  OK  discount-cap-thirty    PROVED for every possible deal
  OK  price-floor-positive   PROVED for every possible deal
  OK  discount-not-over-cap  PROVED for every possible deal
```

That output is the regulated-tier pitch surface. Read it slowly. *"We proved 3 of 3 named rules — for every possible deal."* Not "all the tests passed." Not "we tried 20 inputs." For *every possible deal*, the rule holds. That's a different claim — and it's the one a compliance buyer wants to see.

Notice the ending: *"PROVED for every possible deal."* The prover figures out the entity name (`deal`) by reading what your rule references — `deal's discount_percent`, `deal's list_price` — and threads the entity through the verdict. If your rule had referenced `order's discount_percent` instead, the verdict would have read *"PROVED for every possible order."* That's not a hardcoded sentence. **The prover read your code and wrote the audit-friendly English version.**

### What PROVED actually means

A PROVED verdict isn't *"this passed all the tests."* It's *"the prover read your rule's logic, simplified the math, and confirmed the answer holds for every input the rule could ever see."* No examples. No sample data. Just symbolic math.

For `enforce that deal's discount_percent is less than 30`, the prover reasons: *the rule rejects every input where `discount_percent` is 30 or more, so any execution past the guard has `discount_percent` under 30. That's a structural proof — the runtime literally cannot let a 30%+ discount through, because the guard rejects first.* That logic doesn't need test cases. It needs the prover to read the source and check the math, which it does in milliseconds.

There are three verdicts the prover can return:

- **PROVED** — the guard simplifies to a definite conclusion that holds for every input. This is what you got for all three rules above.
- **DISPROVED** — the guard always fires (rejects every input). The rule is broken — it refuses everyone. You'll see this in the next section when we deliberately break a rule.
- **UNVERIFIABLE** — the guard depends on something the prover can't see. A database lookup, an AI call, a network request, a random number. The prover refuses to claim more than its math engine can verify. The runtime check still fires; the prover just won't sign off symbolically.

PROVED is what you want for every load-bearing rule. UNVERIFIABLE is honest — some rules genuinely depend on data the prover can't access (does this customer exist in the database? did this deal get approved by an admin?) — and the prover marking them UNVERIFIABLE is *correct behavior*, not a failure. DISPROVED is a bug, and the prover catches it before you ship.

### Make a rule fail (deliberately)

Let's see DISPROVED. Add this fourth rule at the bottom of your other rules — a *deliberately impossible* rule — and run `clear prove` again:

```clear
rule impossible-rule:
  enforce that 1 is greater than 2, or fail with error message: 'This rule rejects every possible input'
```

Now run:

```bash
clear prove apps/deal-desk/main.clear
```

You should see DISPROVED come back:

```
We proved 3 of 4 named rules in this app, for every possible deal.

  OK  discount-cap-thirty    PROVED for every possible deal
  OK  price-floor-positive   PROVED for every possible deal
  OK  discount-not-over-cap  PROVED for every possible deal
  X   impossible-rule        Counterexample: guard at line 12 rejects every possible input — message: "This rule rejects every possible input"
```

The prover did the work for you. *1 is greater than 2* is never true, so `enforce that 1 is greater than 2` is a guard that fires for every input, which means the rule rejects every deal — and that's a bug the prover caught before any deal hit the runtime. **DISPROVED is your friend.** It means a rule is structurally broken — usually a flipped operator, a wrong constant, or a copy-paste mistake — and the prover refuses to let you ship it.

Delete the `impossible-rule` block. Re-run `clear prove`. You should be back to 3 of 3 PROVED.

### Get the audit PDF

The prover's terminal output is for you, the developer. The PDF is for the CRO and the compliance buyer. They want a navy/amber document with one page per rule, the math verdict next to the runtime witness, and a sample table of violating inputs and the actual rejection responses.

You can generate the PDF two ways. The simplest path — if you're working in **Clear Studio** — is to open `apps/deal-desk/main.clear`, click the **Prove** button in the toolbar, and the PDF downloads to your machine. Studio runs the same engine as the CLI, plus a runtime-witness step that fires twenty violating inputs at your running app and records every rejection, then renders the result as a navy/amber PDF. Click, wait a few seconds, you've got a deliverable.

If you're working at the command line, the same artifact takes two stages:

```bash
node scripts/audit-bundle.mjs apps/deal-desk/main.clear > /tmp/bundle.json
python scripts/audit-pdf.py /tmp/bundle.json /tmp/deal-desk-audit.pdf
```

The first command spawns deal-desk on a free port, fires twenty inputs that violate each rule (29 doesn't trigger discount-cap-thirty; 30, 31, 32, ... 49 do), and records every rejection response. The second command takes that JSON and renders the PDF.

Open `/tmp/deal-desk-audit.pdf`. You'll see a CONFIDENTIAL header bar, a metrics row that reads `3/3 rules proved · 60/60 violating inputs rejected`, a trust-basis explanation, then one page per rule with the math verdict, the runtime witness summary, and a sample of five rejected inputs with the actual response Carol's app sent back. **That PDF is what the CRO signs off on.** Date it, hand it over, save a copy. Re-run after every rule change.

### And there's an audit log the CRO can scroll through any time

The PDF is the dated artifact you hand a compliance buyer once a quarter. The audit log is the *living record* the CRO consults whenever someone says *"why did that deal get rejected last Tuesday?"* It's a real database table that Clear started filling the moment you wrote `allow signup and login` back in Chapter 8. You haven't touched it. You don't need to. Every state-changing request — every POST, PUT, PATCH, DELETE — has been quietly writing one row per request to a table named `audit_log`.

Each row holds:

- the user's id and email (so you know *who*)
- the route and HTTP method (so you know *what*)
- the response status (so you know *whether the request succeeded or got rejected*)
- an ISO timestamp (so you know *when*)
- a sanitized one-line summary of the request body (so you know *the shape of what they tried*)

That last field is doing real work. The runtime captures the request body, redacts anything that looks sensitive (`password`, `token`, `secret`, `api_key`, `jwt`, `auth` — all replaced with `[redacted]`), caps the whole thing at 1KB, and saves the result. So when a deal gets rejected by `discount-cap-thirty`, the audit row records *the discount the rep tried to push through* without leaking any session token they happened to have in the headers.

Two URLs surface the log:

- **`GET /audit`** — returns the rows as JSON. Useful for ad-hoc queries from a developer console, or for piping into a custom dashboard.
- **`GET /audit.csv`** — returns the same data as a CSV file with a `Content-Disposition: attachment` header. SOC 2 evidence collectors and most compliance tools ingest CSV natively; this is the path of least resistance for handing over the log to an auditor.

Both URLs require a logged-in caller. Both filter by tenant when you're running with tenant scope (`database is shared with tenant scope` — out of scope for this chapter, see Chapter 24b). The same wall from Chapter 8 holds for the audit log: a stolen session token can only see rows for its own tenant.

There's also a retention knob. By default the runtime keeps audit data for 90 days, then a small cleanup helper trims older rows on every server boot. Set the `AUDIT_RETENTION_DAYS` environment variable to override the window — a longer one for stricter compliance, `0` to disable cleanup entirely. **The compliance buyer's four questions — *who, when, what, how-long* — all answer in one row plus one knob.**

A practical loop you'll run at least once a quarter: hit `GET /audit.csv` from your CRO account, save the file, open it in Excel, filter to rows where `status = 403` (the "rejected by a rule" rows), look at `body_summary` to see what the rep tried, and you have a one-screen story of every rule firing in the last quarter. **The PDF says *the rules are correct.* The audit log says *here's what they actually rejected.*** Two artifacts, one story, both load-bearing.

### Why two proofs per rule? The trust-but-verify story

You'll notice the PDF lists *two* proofs for each rule, not one: the math claim and the runtime witness. That's deliberate, and it's the hardest part of the regulated-tier pitch to articulate, so let's spend a paragraph on it.

The math claim is what the prover figured out from reading your source. *Symbolically, the rule rejects any discount of 30 or more.* That's a strong claim — but the math engine is a piece of software, and software has bugs. So the audit script does a second, independent thing: it spawns your compiled app on a free port, sends twenty real HTTP requests with violating inputs (`discount_percent: 30`, 31, 32, ..., 49), and records what came back. **If every one of those twenty requests came back as a 403 with `discount-cap-thirty` named in the rejection, the math claim is corroborated by measured runtime evidence.**

The two proofs are independent. The math walks the source AST. The runtime witness drives the actual app over HTTP. If they disagree — math says PROVED, runtime says some inputs got through — you've got a compiler bug and the PDF surfaces it. If they agree, you've got a measured, verifiable, dated audit artifact. **Trust the math, verify the math.** That's the sentence the compliance buyer wants to hear.

### Deploying deal-desk

You've got rules. You've got a PDF. The last step is putting deal-desk on the internet so Carol can use it from her browser tomorrow morning.

Today's path is `clear deploy`, which packages your app and ships it to Railway:

```bash
clear deploy apps/deal-desk/main.clear
```

This runs `clear package` to generate the Dockerfile and dependencies, runs `railway up` to push the container to Railway's infrastructure, and prints the URL where deal-desk is now reachable. You'll need the Railway CLI installed (`npm install -g @railway/cli`), a Railway account (`railway login`), and a project (`railway init`). Once that's set up, `clear deploy` is the one-line ship command.

You'll also need to set the environment variables your app uses on Railway's dashboard — `ANTHROPIC_API_KEY` for the AI drafter from Chapter 11, the AgentMail key from Chapter 10, and any others your build introduced. Railway's CLI prints the variable list at the end of `clear deploy`. Set them once and Carol's browser hits the live URL.

A heads-up on the future: a single command called `clear ship` is in flight — the design is `clear ship apps/deal-desk/main.clear` produces a deploy URL, a custom domain via Cloudflare, *and* the audit PDF in one shot — but it's not in the CLI yet. Today, the path is `clear prove` for the verdict, `clear deploy` for the deploy, and either the Studio Prove button or the audit-bundle/audit-pdf CLI scripts for the PDF. When `clear ship` lands, this section will collapse to one command.

### Try it yourself

1. **Tighten the cap and see PROVED still hold.** Change `is less than 30` to `is less than 25` in `discount-cap-thirty`. Re-run `clear prove`. The verdict still says PROVED — because the prover is checking *the math of the rule*, not whether the rule is a good policy. Both 25 and 30 are valid caps as far as the prover is concerned; the prover just verifies the rule structurally rejects values at or above the threshold. **The prover doesn't tell you whether your policy is right; it tells you whether your policy is *enforced*.** Restore the rule to 30.

2. **Add a counter-offer round limit.** Add a fourth rule: `rule counter-rounds-bounded` that enforces `deal's counter_rounds is at most 3`. (You'll need to add `counter_rounds (number), default 0` to the Deals table first.) Re-run `clear prove`. You should see *4 of 4 rules proved*. Now the CRO has a math-proved cap on counter-offer rounds — a real Marcus policy from a real Marcus customer.

3. **Use the quoted-string name form.** Replace `rule discount-cap-thirty:` with `rule 'Discount cap of 30% on every deal':`. Re-run `clear prove`. The verdict now reads `discount-cap-of-30-on-every-deal PROVED for every possible deal`. **You wrote the name as a sentence; the parser dasherized it.** This matters for audit logs — searching for the original sentence won't match; you have to search for the dasherized form. Some teams use the quoted form for readability; some prefer the hyphenated identifier form for searchability. Pick a convention and stick with it. Restore the rule to `discount-cap-thirty`.

4. **Pull the audit log and find a rule rejection.** With your server running and at least one rejected deal in history (use the curl from Chapter 8 with `discount_percent: 35` if you don't have one yet), hit `curl http://localhost:3000/audit.csv -H "Authorization: Bearer <your-token>" > audit.csv` and open the file in Excel or any spreadsheet. Filter the `status` column to `403`. Look at the `body_summary` column on each rejected row — you'll see the discount the rep tried, redacted of any sensitive header fields. **That's the regulated-tier loop in one sentence: every rule rejection lands in a row, every row has the four facts a compliance buyer asks for, every quarter you hand the CSV over and the answer is already there.**

### Why this matters

Eleven chapters ago, deal-desk was a sentence on a screen: *"Discount: 18%."* Today it's a deployable app with a math-proved business policy and a one-page CRO-signed audit PDF. **You did not write a single line of JavaScript.** You did not write a SQL schema. You did not configure a prover. You wrote three sentences in plain English with a `rule` wrapper, and the compiler did everything else.

This is the regulated-tier pitch in compressed form. *"Show me your discount policy."* You point at `rule discount-cap-thirty`. *"Show me you actually enforce it."* You point at the runtime check the compiler emitted. *"Show me you've enforced it correctly for every possible input."* You hand over the PDF. *"Show me you'll catch a bug if I flip an operator."* You change `is less than 30` to `is greater than 30` and watch the audit PDF change to DISPROVED. **Every question a compliance buyer can ask, you have a one-line answer that fits on a page.**

The Marcus pitch is exactly this loop. Every Marcus app — deal-desk, approval-queue, internal-request-queue, onboarding-tracker, lead-router — is a queue with rules attached. Every rule gets a verdict. Every verdict gets a PDF. **The audit story isn't bolted on after; it's compiled in from the first line you write.**

### What's next — the reference track

You've finished the tutorial track. Twelve chapters, one app, every primitive in the language. Carol can run deal-desk in her browser, the CRO can sign the audit PDF, and the rep gets an email when the deal approves.

From here, the rest of the guide is the **reference track** — chapters you read when you need them, not in order. They assume you have deal-desk from Chapters 1–12 and they cover the rest of the language at depth:

- **Chapter 13: Working with Data** — every `look up`, `find all`, `count`, `sum`, `group by`. The full data-query reference.
- **Chapter 13b: Charts** — visualizing the deal pipeline with line charts, bar charts, and dashboards.
- **Chapter 17: Testing** and **Chapter 23: Writing Tests** — the test-block reference, including unit-level value assertions and intent-based test descriptions.
- **Chapter 22: Scheduled Tasks** — running jobs on a cron-like schedule (e.g. *"every Monday at 9 a.m., email the CRO a deal pipeline summary"*).
- **Chapter 24: Writing Business Rules** and **Chapter 24b: Audit Reports** — deeper coverage of the `rule` keyword (conditional rules, tiered rules, all the verdict shapes) and of the audit PDF.
- **Chapter 16: The Clear CLI** and **Chapter 16b: Clear Studio** — the toolbox you'll use every day.

You don't have to read those in order. Pick the one you need next, and the rest of the guide is there when a question comes up. **Welcome to the other side of the tutorial — you're a Clear developer now.**

---

## Chapter 12b: Provable Agent Bounds (Math for Agents Too)

By the end of this chapter, deal-desk will have a Refund Bot — an AI agent with real tools — and four mathematically-proven sentences about what that bot can and cannot do, no matter what a customer types into the prompt. The CRO will get a paragraph in the audit PDF that reads *"Refund Bot cannot delete from Deals — proved for every possible input,"* not *"we tested 12 prompts and none of them deleted a deal."* **Same difference as Chapter 12, but for an agent that holds a credit card processor.**

This is the chapter that takes the proof story from *"my business rules hold"* to *"and my agent can't sneak around them."* Same prover, same `clear prove` command, four new sentences your code can write.

### The four mistakes an agent can make

A tool-wielding agent is a piece of code with a *very persuasive user* (the AI) holding the keyboard. Four kinds of mistake — each one harder to catch than the last:

1. **Wires the wrong tool.** A developer adds `charge_card` to the agent's `has tools:` list by accident. The customer types *"refund my $5"* and the bot somehow charges instead.
2. **Buries the wrong tool inside an innocent one.** The agent has a tool called `deactivate`. Looks safe. But `deactivate`'s body calls a helper function that deletes the whole user row. The agent never *names* the dangerous function — the chain hides it.
3. **Wires the right tool but doesn't bound the argument.** The agent has `charge_card`. The body of `charge_card` charges whatever amount Claude passes. Claude reads the customer's *"refund $5"* prompt and decides to charge $5,000 instead — because nothing in the code stopped it.
4. **Forgets to update a policy block when the tool surface changes.** Six months ago the company wrote *"protect tables Deals"* in a `policy:` block. Today a developer added `force_close_deal` to the agent's tools. The policy is still in the file. Nothing in the build flagged the drift.

Phases 1-4 of the prover catch one mistake each. **One sentence in your source, one verdict in the audit PDF, no test cases needed.**

### Add a Refund Bot to deal-desk

Open `apps/deal-desk/main.clear`. Below the existing rules from Chapter 12, add a few helper functions and an agent. We're going to wire the agent up imperfectly on purpose — that way the prover gets to demonstrate both PROVED and DISPROVED verdicts on real code:

```clear
define function lookup_deal(deal_id):
  return look up Deal where id is deal_id

define function record_refund(deal_id, amount):
  save new_refund as new Refund

skill 'Charge Card':
  has tools: record_refund
  instructions: 'Use record_refund to log a successful refund.'

agent 'Refund Bot' receives request:
  has tools: lookup_deal
  uses skills: 'Charge Card'
  reply = ask claude 'Process this refund' with request
  return reply
```

Two functions, one skill, one agent. Read the agent block out loud: *"Refund Bot receives a request, has the tool lookup_deal, uses the skill 'Charge Card,' asks Claude to process the refund using the request, and sends the reply back."* You also need a `Refunds` table — add it next to your `Deals` table:

```clear
create a Refunds table:
  deal_id, number
  amount, number
```

Save the file. The agent is wired. Now we're going to ask the prover four questions about it.

### Phase 1 — Direct: "the agent can't even name the function"

The first question: *"Can Refund Bot ever invoke charge_card?"* You haven't even defined a function called `charge_card`, and even if it existed, you didn't put it in the bot's tool surface. Write the proof obligation right above the agent definition:

```clear
prove that agent 'Refund Bot' cannot call charge_card
```

One line. Read it out loud: *"prove that agent 'Refund Bot' cannot call charge_card."* Save the file. From the repo root:

```bash
clear prove apps/deal-desk/main.clear
```

In the *Agent tool-bound claims* section of the output you'll see:

```
OK  agent 'Refund Bot' cannot call 'charge_card' — closure has 2 tool(s) and 'charge_card' is not among them
```

PROVED. The prover walked the agent's static **tool closure** — the union of `has tools:` plus every tool brought in by `uses skills:` — and confirmed `charge_card` isn't there. Why is that *enough* for a proof? Because Clear's runtime tool-dispatch is closed-world: when Claude asks to call a tool by name, the runtime looks the name up in a dictionary that was built at compile time from the agent's declared closure. Anything not in the dictionary returns *"Unknown tool"* and the loop continues. **There's no escape hatch — no `eval`, no string lookup of globals.** If the function isn't in the closure, Claude has no way to dispatch to it.

That sentence is the soundness story for every verdict in this chapter. Lean on it.

### Phase 2 — Transitive: "the agent can't reach the forbidden op through any chain"

Now the second question: *"Can Refund Bot ever delete from the Deals table?"* The agent has `lookup_deal` (a read) and `record_refund` (an insert into `Refunds`). Neither one obviously deletes a Deal. But maybe one of them does indirectly. Add another proof obligation:

```clear
prove that agent 'Refund Bot' cannot delete from Deals
```

Run `clear prove` again:

```
OK  agent 'Refund Bot' cannot delete from 'Deals' — no reachable code (agent body + 2 tool(s)) deletes from 'Deals'
```

PROVED. This time the prover did more work. It walked the agent's body *plus* every reachable tool body — `lookup_deal`'s body, `record_refund`'s body, and the body of any function those bodies call. For every `delete the X with this id` it found, it checked whether `X` matched `Deals`. None did. **Phrased differently: the prover built the graph of every database operation the agent could ever cause, and confirmed none of them is a delete on Deals.**

To see what DISPROVED looks like, add a function that *does* delete a Deal and wire it as a tool:

```clear
define function purge_deal(deal_id):
  delete the Deal with this id
```

Then change the agent's `has tools:` line to include it:

```clear
agent 'Refund Bot' receives request:
  has tools: lookup_deal, purge_deal
  ...
```

Run `clear prove` again. The verdict flips:

```
X   agent 'Refund Bot' cannot delete from 'Deals' — agent 'Refund Bot' CAN delete from 'Deals' — 'remove' against 'Deals' at line 41 via: agent 'Refund Bot' → has tool: purge_deal → remove Deal @ line 41
```

DISPROVED, with the **call chain**: agent → tool → CRUD operation, line numbers included. A developer reading this in CI knows exactly what to fix. **Either remove `purge_deal` from the agent's tools, or remove the obligation if the deletion is genuinely intended (and update the policy block to reflect that).** Then revert the `purge_deal` change before moving on.

The Marcus pitch in one sentence: *"This is the structural answer to the Replit incident. The agent could not have deleted that production database on Clear because the prover would have refused to ship the build."*

### Phase 3 — Symbolic: "the agent can't pass a dangerous value"

The third question: *"Even if Refund Bot can call record_refund, can it ever call it with an amount over $10,000?"* This question can't be answered by walking the closure. The function IS in the closure — that's the whole point. The question is whether the *argument* could ever be that high.

Add the obligation:

```clear
prove that agent 'Refund Bot' cannot call record_refund with amount is greater than 10000
```

Run `clear prove`:

```
X   agent 'Refund Bot' cannot call 'record_refund' with amount is greater than 10000 — agent 'Refund Bot' can invoke 'record_refund' directly via tool dispatch — Claude controls every argument, so 'amount is greater than 10000' is satisfiable. Use 'cannot call record_refund' to forbid it entirely, OR add an enforce statement inside record_refund's body to bound the argument
```

DISPROVED — and the verdict gives you the *fix*. The prover noticed that `record_refund` is itself a tool Claude can dispatch to directly. When Claude makes a tool call, the runtime hands Claude's choice of arguments straight to the function — there's no source-level call site where the prover could read what value gets passed. From the prover's point of view, every argument to a directly-dispatched tool is **a free symbolic variable Claude controls**. So the constraint *"amount is greater than 10000"* is trivially satisfiable.

Two ways to make this PROVED. Either forbid the call entirely (Phase 1: `cannot call record_refund`) — but then Refund Bot can't issue refunds, which defeats the point. Or **bound the argument inside the function body** with an enforce statement:

```clear
define function record_refund(deal_id, amount):
  enforce that amount is at most 10000, or fail with error message: 'Refunds over $10k need CRO approval'
  save new_refund as new Refund
```

Now the function refuses to proceed if Claude tries to pass anything bigger than $10,000. Run `clear prove` again — the obligation is still DISPROVED for *the same structural reason* (Claude can still try to pass any value), but the function will reject the bad call at runtime. **The right pattern: a `cannot call X with arg op value` claim signals to the auditor that the bound exists; the enforce inside the function is what enforces it.** Two halves, one story.

For the cleaner PROVED case — when the constrained function is *not* a direct tool but is called transitively from a tool — the symbolic prover walks the source-level call site, evaluates the argument expression with literal substitution, and tries to fold the constraint. If the argument is literal `50` and the constraint is *"greater than 1000,"* the prover can prove `50 > 1000` is unsatisfiable and emit PROVED. **For literals, this is real symbolic verification, not pattern matching.**

### Phase 4 — The bridge: "the agent can't violate any of your declared policies"

The fourth question, and the one that survives a real audit: *"Refund Bot's tool surface might change three times before launch. Can the build keep my policies in sync?"*

In Chapter 21 (Policies — Safety Guardrails) you'll meet the `policy:` block — the enact-style catalog of one-line policies that Clear apps declare at the top of the file (`protect tables Users`, `block ddl`, `block prompt injection`, etc.). Phase 4 of the agent prover composes that block with the agent reachability walker and emits a **per-rule subverdict**.

Add a policy block to deal-desk near the top:

```clear
policy:
  protect tables Deals
  block ddl
  block prompt injection
```

Now add one obligation that covers the whole policy block:

```clear
prove that agent 'Refund Bot' upholds all policies
```

Run `clear prove`:

```
!  agent 'Refund Bot' upholds all policies — 2 of 3 policy rule(s) proved, 1 unverifiable (runtime-only)
   OK  protect tables Deals — no reachable code in agent 'Refund Bot' touches the protected table
   OK  block ddl — structurally satisfied — Clear agents have no path to execute raw SQL
   !   block prompt injection — enforced at runtime, not by static analysis — the prover cannot claim what the runtime check will refuse
```

Read it slowly. The parent verdict is **UNVERIFIABLE** because not every rule could be statically proved — but the subverdicts give you the breakdown. *"Protect tables Deals" — PROVED, no reachable code touches it.* *"Block DDL" — PROVED, structurally, Clear agents go through CRUD primitives and can't run raw SQL.* *"Block prompt injection" — UNVERIFIABLE, the prover honestly admits this is a runtime-only check and refuses to claim the build proves it.*

That last sentence is the load-bearing one. **The prover doesn't lie.** A weaker tool would print PROVED on every rule and let the auditor assume everything is mathematically guaranteed. Clear's prover splits the rules into two buckets and tells you which is which. The CRO can hand the auditor a paragraph that says *"two policies are mathematically proved at compile time, one depends on the runtime guard being in place — here are the runtime tests that exercise the third."*

### When the prover says UNVERIFIABLE

You'll see UNVERIFIABLE on three kinds of obligation. Each one means something different:

- **The named agent doesn't exist** in this file. Don't write proof obligations against agents you haven't defined.
- **A reachable tool body isn't in this file** (Transitive flavor). The prover refuses to claim what it can't read. Either pull the missing function into the file, or accept that the verdict can't be sharper than UNVERIFIABLE.
- **A policy rule is enforced at runtime** rather than by static analysis (Phase 4 only). `block_prompt_injection`, `code_freeze_active`, `maintenance_window`, `require_role`, `require_clearance`, and `contractor_cannot_write_pii` all fire at runtime — there's no source-level structure for the prover to walk. The prover marks them UNVERIFIABLE so the audit doesn't pretend they're proved.

UNVERIFIABLE is a *feature*, not a failure. It's the prover keeping the audit bundle honest.

### Reading the audit output

When `clear prove` runs against a file with all four claim shapes plus a policy block, the *Agent tool-bound claims* section shows one line per claim, with subverdicts indented under the policy claim. The CLI exit code reflects the worst verdict:

- **0** — every claim PROVED (the build is green, the audit bundle ships).
- **1** — at least one DISPROVED (the build refuses to ship; CI catches the violation).
- **5** — at least one UNVERIFIABLE without any DISPROVED (the audit bundle ships with a note for the auditor).

**The exit code is what makes this a CI gate, not just a marketing surface.** Add `clear prove apps/deal-desk/main.clear` to your build pipeline. When a developer adds a tool that breaks a standing claim, the merge fails. The audit attribution is built in: the verdict says *"agent 'Refund Bot' CAN delete from 'Deals' via: has tool: purge_deal."* That's the developer's name on the change, the tool's name on the leak, and the table's name on the data — all in one CI failure message.

### What you shipped

Five new sentences in your `.clear` file. Four PROVED verdicts and one structural UNVERIFIABLE on a runtime-only rule. **A complete, audit-trail-aware story about what Refund Bot can and cannot do, mathematically, with the path that explains every verdict.**

The Chapter 12 promise was *"prove the rule for every possible deal."* The Chapter 12b promise is *"and prove the agent can't sneak around the rule, even with the tools you gave it."* Same prover. Same audit PDF. Different question, same shape of answer.

### Where to read next

- **Chapter 21: Policies (Safety Guardrails)** — the full catalog of policy: rules and what each one protects against.
- **Chapter 11b: Building Real Agents** — the agent-syntax reference: tools, skills, memory, schedules, multi-agent.
- **Chapter 24: Writing Business Rules** and **Chapter 24b: Audit Reports** — deeper on the `rule` keyword and the audit PDF that wraps every verdict in this chapter.

The prover is the same engine across all three of those chapters and this one. *One bundle, four verdict categories, one signed PDF.*

---

## Chapter 10b: Chat Interfaces (Making Your App Talk)

Clear can build chat interfaces that look like iMessage or ChatGPT --
message bubbles, typing indicators, and a text box to send messages.
One line does the heavy lifting.

### Basic Chat Display

```clear
display messages as chat showing role, content
```

That single line gives you:
- **Your** messages on the right (blue bubbles)
- **Assistant** messages on the left (light bubbles)
- Markdown formatting in responses (bold, code blocks, lists, tables)
- A built-in Send button and text area

The `showing` clause maps two fields from your data: the first is the
message role (`'user'` or `'assistant'`), the second is the message text.
These must match the fields in your Messages table.

### Complete Chat App

Here's a minimal chat app that echoes what you type. It's a full
working server -- backend, database, and frontend in one file:

```clear
build for web and javascript backend
database is local memory

create a Messages table:
  role, required
  content, required

when user sends chat to /api/chat:
  create user_msg:
    role is 'user'
    content is chat's user_message
  save user_msg as new Message
  create bot_msg:
    role is 'assistant'
    content is 'Echo: ' + chat's user_message
  save bot_msg as new Message
  send back bot_msg

when user requests data from /api/messages:
  messages = get all Messages
  send back messages

when user deletes messages at /api/messages:
  script:
    await db.deleteAll('messages')
  send back 'cleared'

page 'Chat' at '/':
  on page load get messages from '/api/messages'
  display messages as chat showing role, content
  'Type a message...' is a text input saved as user_message
  button 'Send':
    send user_message to '/api/chat'
    get messages from '/api/messages'
    user_message is ''
```

Walk through it from top to bottom:

1. **Database** -- a Messages table with `role` and `content` columns.
2. **POST /api/chat** -- saves the user's message, creates a bot reply,
   sends back the reply.
3. **GET /api/messages** -- returns all messages (for loading history).
4. **DELETE /api/messages** -- clears the conversation.
5. **The page** -- loads messages, displays them as chat, and has a text
   input + Send button to post new messages.

### What You Get Automatically

The compiler sees the `display as chat` followed by a text input and
Send button, and folds everything into one polished chat widget:

- **Enter sends the message**, Shift+Enter adds a newline
- **A "New" button** appears to clear the conversation
- **Typing dots** animate while waiting for a response
- **Messages scroll to the bottom** automatically
- **A scroll-to-bottom button** appears when you scroll up
- **No duplicates** -- the input and button are absorbed into the chat,
  not rendered twice

You don't need to build any of this by hand. The compiler generates a
production-quality chat component from those few lines.

### Connecting to a Real AI

Swap the echo reply for an actual AI call using an agent:

```clear
agent 'Assistant' receives message:
  response = ask claude 'Help this user' with message
  send back response
```

Then change the POST endpoint to call the agent instead of echoing.
See Chapter 10 for the full agent syntax.

### When to Use `display as chat`

Any app with a conversational interface -- AI assistants, customer
support bots, helpdesk agents, or even a simple echo bot for testing.
It pairs naturally with `agent` and `ask claude`.

**Don't build chat UIs by hand.** Never use `for each` loops with
conditional role checks to render message bubbles. The compiler
generates all the bubble styling, scrolling, and input handling for you.

### Real-Time Streaming

If your agent uses `stream response`, the chat component automatically streams text in real-time — you'll see the assistant's response appear token by token, just like ChatGPT. No extra code needed:

```clear
agent 'Bot' receives message:
  stream response
  response = ask claude 'Help the user.' with message
  send back response
```

The compiler detects that the POST endpoint calls a streaming agent and wires everything automatically: the backend sends SSE events, the frontend reads the stream and appends text as it arrives.

---

## Chapter 19: Workflows (Multi-Step AI Pipelines)

Reference chapter. Chapter 11 showed you a single AI agent (the deal drafter) that produces one paragraph from one input. Real-world AI work often needs multiple agents in sequence — one researches, another writes, another reviews — with conditional branches and a quality gate at the end. That's a workflow. Reach for this chapter when one `ask claude` call isn't enough and you need a chain.

### Your First Workflow

```clear
build for web and javascript backend
database is local memory

agent 'Writer' receives topic:
  set topic's draft to ask claude 'Write a short article about this topic' with topic's topic
  send back topic

agent 'Reviewer' receives state:
  set result to ask claude 'Score this draft 1-10 for quality' with state's draft returning JSON text:
    quality_score (number)
    feedback
  set state's quality_score to result's quality_score
  set state's feedback to result's feedback
  send back state

workflow 'Article Pipeline' with state:
  state has:
    topic, required
    draft
    quality_score (number), default 0
    feedback

  step 'Write' with 'Writer'
  step 'Review' with 'Reviewer'
```

Read that out loud: *"The Article Pipeline workflow has state with a topic (required),
draft, quality score (starts at 0), and feedback. Step one: Write. Step two: Review."*

Each step passes the full state to an agent. The agent modifies it and passes it back.

### Conditional Routing

What if you want different agents for different situations?

```clear
workflow 'Support Router' with state:
  state has:
    message, required
    category
    resolution

  step 'Classify' with 'Classifier Agent'
  if state's category is 'billing':
    step 'Billing' with 'Billing Specialist'
  otherwise:
    step 'General' with 'General Support'
  step 'Close' with 'Closer Agent'
```

After classification, billing questions go to the billing specialist.
Everything else goes to general support. Then both paths converge at "Close."

### Retry Loops (Quality Gates)

The killer feature. Repeat steps until they're good enough:

```clear
workflow 'Content Review' with state:
  state has:
    draft, required
    quality_score (number), default 0

  step 'Write' with 'Writer'
  repeat until state's quality_score is greater than 8, max 3 times:
    step 'Review' with 'Reviewer'
    if state's quality_score is less than 8:
      step 'Revise' with 'Writer'
  step 'Publish' with 'Publisher'
```

Write once, review, and if the score is below 8, revise and try again — up to 3 times.
Then publish. The `max 3 times` is a safety net so it never loops forever.

### Parallel Branches

Run multiple agents at the same time and merge results:

```clear
workflow 'Article Analysis' with state:
  state has:
    text, required
    sentiment
    seo_score

  at the same time:
    step 'Sentiment' with 'Sentiment Agent' saves to state's sentiment
    step 'SEO' with 'SEO Agent' saves to state's seo_score
  step 'Report' with 'Report Agent'
```

Sentiment analysis and SEO scoring happen simultaneously. Each result saves to
a specific field in the state. Then the Report agent gets the combined result.

### Saving Progress (Crash Recovery)

For long-running workflows, save a checkpoint after each step:

```clear
workflow 'Onboarding' with state:
  save progress to Workflows table
  state has:
    user_id, required
    welcome_sent (boolean), default false
    profile_created (boolean), default false

  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
  step 'Tutorial' with 'Tutorial Agent'
```

If the server crashes mid-workflow, the progress is in the database.

### Running a Workflow

Call it from an endpoint like any other function:

```clear
when user calls POST /api/content sending content:
  result = run workflow 'Content Review' with data
  send back result
```

The result contains the final state — all fields, updated by every step.

### Tracking What Happened

Add observability to see every step the workflow took:

```clear
workflow 'Support' with state:
  track workflow progress
  state has:
    message, required
  step 'Triage' with 'Triage Agent'
  step 'Resolve' with 'Resolution Agent'
```

The result includes `_history` — an array of state snapshots at each step,
with timestamps. Great for debugging and audit trails.

---

## Chapter 19b: Approval Queues (The Deal Desk in 10 Lines)

Workflows orchestrate AI agents. **Approval queues** orchestrate humans — they're for the moment a person has to look at something and say "yes, no, or come back to me later." Discount approvals. Time-off requests. New-vendor onboarding. Any time work piles up in a list waiting for a real human to decide.

Clear has a one-block primitive for this. Watch what nine lines buys you:

```clear
create a Deals table:
  customer
  customer_email
  rep_email
  status, default 'pending'

queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  email customer when counter, awaiting customer
  email rep when approve, reject
```

That's the whole deal desk. Drop it in a `.clear` file and the compiler hands you back:

- **An audit table** — every decision gets a row stamped with who decided, what they decided, when, and an optional note.
- **A notification queue** — every time the CRO clicks Approve, a row gets added to an outbound list saying "tell the rep this was approved." Same for Reject, Counter, and Awaiting customer. The actual email-sending is a separate piece (covered next in Chapter 19c), but the queue is ready and waiting.
- **A queue page URL** at `/api/deals/queue` — returns every deal that's still pending review.
- **A history URL** at `/api/deal-decisions` — returns the full audit log.
- **A login-gated URL for every action** — `/api/deals/:id/approve`, `/reject`, `/counter`, `/awaiting`. Each one updates the deal's status, logs the decision, queues the right notifications, and returns the updated deal.

If the CRO clicks Approve, the deal flips to `'approved'`. Reject flips it to `'rejected'`. Counter and Awaiting customer flip it to `'awaiting'`. (The action name picks the new status — you can use other words too, and the new status will match.) Multi-word actions like `awaiting customer` shorten to a single URL token (`/awaiting`).

### How notifications resolve recipient emails

`email customer when counter` doesn't need you to specify how to reach the customer. It looks for a field called `customer_email` on the deal. `email rep when approve` looks for `rep_email`. The rule is `<role>_email` — match the role name in the email clause to a field name on the entity. If the field doesn't exist, the compiler will warn you (the row still gets queued, just with a blank recipient — so the CRO's flow doesn't break, but the email obviously can't go out until you add the field).

The legacy form `notify customer on counter` still parses if you have older code, but `email <role> when <action>` is the canonical form for new code — the verb names HOW (email, vs the vague "notify"), and the connector reads naturally (when, vs the slightly-off "on").

### Wiring action buttons in the UI

The primitive does the backend, the audit, and the notifications. UI buttons are still hand-added — paste a few lines in your queue page:

```clear
detail panel for selected_deal:
  text selected_deal's customer
  text selected_deal's status
  actions:
    button 'Approve':
      change selected_deal's status from 'pending' to 'approved'
      update selected_deal at /api/deals/:id/approve
      get pending from /api/deals/pending
    button 'Reject':
      change selected_deal's status from 'pending' to 'rejected'
      update selected_deal at /api/deals/:id/reject
      get pending from /api/deals/pending
```

The `change` line says which field moves from which value to which value. The `update` line saves that selected record through the generated login-gated action URL. The final `get` line reloads the queue the user sees.

### When NOT to reach for `queue for X:`

- A simple "yes/no" with no audit need — just write a normal update endpoint.
- Automated routing where no human decides — that's a different shape, and a future `routing rules for X:` primitive will handle it cleanly.
- Multi-stage approval where a deal needs Manager → Director → CRO — coming in Tier 2 once a second multi-stage app exists.

### Why this primitive earns its keep

A real Deal Desk used to need ~150 lines of hand-rolled JavaScript per app: the audit table, the URLs, the status transitions, the auth checks, the notification rows. Each one easy to get wrong, each one duplicated across every approval app. The queue primitive collapses that to **5 lines of declaration**, with auth, audit, and notifications all wired correctly by construction. Four of Clear's five Marcus-targeted apps now use it. Same visible behavior. A fraction of the surface for bugs to hide in.

---

## Chapter 19c: Triggered Emails (Send the Customer a Real Reply)

The queue primitive in Chapter 19b records that an email *should* be sent — every time the CRO counters a deal, a row lands in `deal_notifications` saying "tell the customer." But Marcus's Deal Desk doesn't just need a queue of pending emails — he wants to write the actual subject and body once, in the same Clear file, and trust that every counter triggers the right reply. That's what the **triggered email primitive** does.

It's a top-level block, written next to the queue:

```clear
create a Deals table:
  customer
  customer_email
  rep_email
  status, default 'pending'

queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  email customer when counter, awaiting customer
  email rep when approve, reject

email customer when deal's status changes to 'awaiting':
  subject is 'We countered your offer'
  body is 'Sarah from our team has prepared a counter offer. Reply when you can.'
  provider is 'agentmail'
  track replies as deal activity
```

Drop that block in and the compiler hands you back:

- **A shared outbound table** called `workflow_email_queue` — one table per app, no matter how many `email <role> when ...` blocks you write. Every triggered email lands here as a row with subject, body, provider, recipient, and `queue_status='pending'`.
- **An auto-injected insert** in every URL handler that lands the deal's status on `'awaiting'`. The queue's `counter` action transitions to `'awaiting'`, so the auto-generated `PUT /api/deals/:id/counter` handler queues the email *and* records the audit row *and* drops a notification row — all in one click. If you also write a hand-rolled `when user updates deal at /api/deals/:id/something:` endpoint that sets `deal's status is 'awaiting'`, the same queue insert lands there too. The trigger fires from every handler that hits the value.
- **Compile-time silent-bug guards.** If the entity table forgets the `customer_email` field, the compiler warns: "Queue rows will land with empty recipient_email." If you write `body is 'Hello {customer_naem}'` (typo), the compiler warns the literal `{customer_naem}` would ship in the customer's inbox. If you misspell the provider as `'agentmial'`, the compiler hard-errors with "did you mean agentmail?"

### What about real sending?

By default, every triggered email sits in the queue with `queue_status='pending'`. Nothing goes to a real provider. That's deliberate — your tests, your dev environment, and your first preview build never accidentally email a real customer. To enable live sending, you'll add a directive like `enable live email delivery via agentmail` and provision an env-var-backed API key — both deferred until you've watched the queue fill up correctly and you're ready to flip the switch.

This separation keeps the failure mode safe. Bad subjects and broken bodies and missing recipient fields ALL show up in the queue rows, where you can inspect them like any other database table — `GET /api/workflow-email-queue` returns them. By the time live delivery turns on, the data has already been correct for days.

### Why this primitive earns its keep

Marcus used to hand-write a `Notifications` table, a SendGrid client wrapper, a per-action "if approved, send X" branch, and a retry queue — for every app. The triggered email primitive collapses all of that to a single block of declarative English at the top of the file. The compiler reads that block and emits the table, the queue insert, the recipient resolution, the status-tracking, and the safety guards. Same workflow. Far less surface for the wrong email to escape.

---

## Chapter 19d: Runtime Grammar (Vocabulary That Grows After You Ship)

Approval queues, workflows, and triggered emails handle things you know about at compile time. But what about an app where **users** teach the app new commands after it's running?

That's what `runtime grammar` is for. You declare a parsing surface — a named pile of "frames" that map user input to actions — and seed it with the frames you know about now. Users add more frames later via a normal CRUD save. The next time someone types something, the matcher picks up the new frame too. No recompile.

### The shape

```clear
runtime grammar 'concepts':
  frame TASK:
    effect internal
    canonical phrase 'remind me to'
    synonyms 'todo:', 'remember to'
    slots:
      what is text, required
    on match:
      save the match as a new Task

  frame OPEN_NOTEPAD:
    effect external
    canonical phrase 'open notepad'
    permission scope: 'spawn:notepad.exe'
    first 3 runs require confirm: 3
    on match:
      ask user to confirm 'Open Notepad?'
      run command 'notepad.exe'
```

Read this out loud. "Runtime grammar called 'concepts'. Frame TASK is an internal action; canonical phrase is 'remind me to', also recognized as 'todo:' or 'remember to'; it has one slot called 'what' that's required text; on match, save it as a new Task." It's plain English, except every keyword is doing real work.

### What this compiles to

Three things land in your server file:
- A storage table (default name `Concepts`) — a regular SQLite table that holds every frame as one row.
- A registry constant seeded with the frames above — that's the compile-time set.
- A `_grammarMatch('concepts', input)` helper that resolves text against the live frame set (registry seed merged with whatever's in the storage table right now).

### Calling the matcher

```clear
result is match input against 'concepts'
if result's kind is 'matched':
  show 'matched: ' + result's frame.frame_id
otherwise:
  show 'no match'
```

The matcher returns:
- `kind` — one of `matched`, `no_match`, `partial` (a required slot was missing), or `ambiguous` (multiple frames tied).
- `frame` — the winning frame's full record.
- `slotValues` — values extracted from the input remainder, keyed by slot name.
- `missingSlots` — required slots that came back empty.
- `ambiguousMatches` — when `kind` is `ambiguous`, the list of tied frame IDs.

### Adding a frame at runtime

The storage table is just a regular Clear table. Save a row:

```clear
new_frame is { frame_id: 'DRINK_WATER', effect: 'internal', canonical_phrase: 'drink water', synonyms_json: '[]', slots_json: '[]', permission_scope: '', first_n_runs_require_confirm: 0 }
save new_frame as a new Concept
```

The next `match input against 'concepts'` call will know about DRINK_WATER. That's the trick: the matcher reads the storage table every time, so changes take effect immediately.

If a runtime row has the same `frame_id` as a compile-time seed frame, the runtime row wins. That's how users override built-in frames without you having to ship a new compiler pass.

### When to reach for this

Runtime grammar is the right shape when:
- Users type free-form text and the app needs to react.
- The set of commands isn't fixed at compile time — users add their own.
- You want each command to carry typed slots, a permission scope, and an on-match body.

It's the WRONG shape when:
- You know every command at compile time. Use `match X:` instead.
- You just need keyword search. Use `search Table for query`.

## Chapter 19e: Slot Extractors (Pulling Structured Values Out of Free-Form Text)

Runtime Grammar (Chapter 19d) routes user input to the right command. But the input usually carries DATA — "remind me **tomorrow at 2pm** to email Marcus **about Q3 numbers**" has a datetime, an action, and a topic. The matcher's prefix-match alone doesn't pull those out. That's what slot extractors are for.

Phase 2 of Lenat-in-Clear ships four primitives, each returning a `{value, remainder}`-shape so you can chain them.

### `extract datetime from text`

The fast-path handles every common case: ISO date (`2026-05-13`), slash-date (`5/13`), relative (`in 30 minutes`, `in 2 hours`), weekday-at-time (`next tuesday at 9am`, `friday at 5pm`), `tomorrow at 2pm`, bare `tomorrow`, `at 5pm`, `tonight`, `this evening`.

```clear
when user sends note to /api/intake:
  dt = extract datetime from note
  # dt is {value: <Date>, remainder: '<text with the datetime stripped>'}
  # or 'nothing' when the fast-path misses
  if dt is nothing:
    send back 'didn\'t catch a time — try \'tomorrow at 2pm\'?'
  send back dt
```

If you've configured an `ask ai` provider, the runtime falls through to an LLM call when the fast-path misses (~$0.0001 per call). Phase 6 wires the provider routing — until then, fast-path misses return `nothing`.

### `fuzzy match 'query' in list scored at least 0.7`

Pick the best match from a list. Typo-tolerant: handles substring matches (`paint` → `mspaint`), short-vs-long typos (`callculator` → `calc`), and one-character drops (`notpad` → `notepad`).

```clear
known_apps = ['mspaint', 'calc', 'notepad', 'explorer']
when user sends command to /api/launch:
  pick = fuzzy match command in known_apps scored at least 0.7
  # pick is {value: 'mspaint', score: 0.71} or 'nothing'
  if pick is nothing:
    send back 'no match — try one of: mspaint, calc, notepad'
  run command pick's value
```

Threshold is optional; default 0.7. Ties broken by longest candidate.

### `extract about-clause from text`

Splits text on word-bounded `about`, `re`, or `regarding`. Returns the head as `what` and the tail as `about`.

```clear
when user sends note to /api/intake:
  parts = extract about-clause from note
  # 'remind me to email Marcus about Q3 numbers'
  #   → {what: 'remind me to email Marcus', about: 'Q3 numbers'}
  # 'todo: stretch' (no keyword)
  #   → {what: 'todo: stretch', about: nothing}
```

### `find pattern 'P' in text returning value and remainder`

First-match-only regex with the input minus the match. Different from plain `find pattern 'P' in text` (that returns an array of every match).

```clear
when user sends note to /api/energy:
  out = find pattern '\d+' in note returning value and remainder
  # 'energy 6 tired' → {value: '6', remainder: 'energy  tired'}
  # 'no number here' → {value: nothing, remainder: 'no number here'}
  level = out's value
  rest = out's remainder
```

### Chaining

The `{value, remainder}` shape is the chain handle. Each extractor peels its part off the front; the remainder feeds the next:

```clear
when user sends note to /api/intake:
  dt_part = extract datetime from note
  about_part = extract about-clause from dt_part's remainder
  # what's left is the bare action: "remind me to email Marcus"
  action = about_part's what
  topic = about_part's about
  scheduled_at = dt_part's value
```

### Gotchas

- The text-shaped extractors (`extract datetime`, `extract about-clause`, `find pattern ... returning value and remainder`) all want a TEXT source. If you hand them a number / list / boolean, the validator warns `SLOT_EXTRACTOR_WRONG_TYPE` at compile time. At runtime the helpers defensively return `nothing` — silent failure looks like a missing slot, not a type error.
- `fuzzy match` is the exception — its second arg IS a list (the candidate set).
- Python target ships full parity. The runtime helpers live in `runtime/slot-extractors.js` and `runtime/slot_extractors.py` — same algorithm, snake_case names on the Python side.

## Chapter 22: Scheduled Tasks (Set It and Forget It)

Reference chapter. The deal-desk app doesn't strictly need scheduled tasks — every action is triggered by a CRO clicking a button. But the moment you want a *"every Monday at 9 a.m., email the CRO last week's pipeline summary"* feature, or *"every hour, expire any deals that have been pending more than 30 days,"* this chapter is the answer. Cron-style schedules in Clear's plain-English shape.

Sometimes you want your app to do things automatically — clean up old data every hour, send a daily report, check for updates every few minutes. That's what scheduled tasks are for.

### Running Something Every Few Minutes

```clear
every 5 minutes:
  old_sessions = look up all Sessions where age is greater than 24
  delete old_sessions from Sessions
```

That runs the cleanup code every 5 minutes, forever. You can use `minutes` or `hours`.

### Running Something at a Specific Time

```clear
every day at 9am:
  users = look up all Users
  for each user in users:
    send email to user's email with subject 'Good morning!'
```

Supports times like `9am`, `2:30pm`, `12:00am` (midnight).

### When to Use Scheduled Tasks

- Daily email digests
- Cleaning up expired data
- Polling external APIs for updates
- Generating daily reports

---

## Chapter 25: Security (The Part You Can't Skip)

Clear takes security seriously. The compiler actually REFUSES to build your app
if it has obvious security holes. Try creating a DELETE endpoint without auth
and the compiler will politely but firmly say no.

(Most languages let you deploy insecure code and hope for the best. Clear
would rather hurt your feelings now than let hackers hurt your users later.)

### Input Validation

```clear
when user calls POST /api/users sending user:
  validate user:
    name is text, required, min 1, max 100
    email is text, required, matches email
    age is number, required
    role is text, one of ['reader', 'editor', 'admin']
```

### Auth Scaffolding

One line gets you a full auth system with signup, login, and JWT tokens:

```clear
build for javascript backend
owner is 'marcus@acme.com'
allow signup and login

when user calls GET /api/dashboard:
  requires login
  send back 'Welcome!'
```

The `owner is` line pins which email becomes the app owner. When Marcus signs up with that email, he's the only person who sees the "Edit this app" badge in the corner — the Live App Editing widget that lets him change the app in plain English while his team keeps using it. Every other user signs up as a normal user with no edit surface.

This generates:
- `POST /auth/signup` — creates user with bcrypt-hashed password, returns JWT
- `POST /auth/login` — verifies password, returns JWT  
- `GET /auth/me` — returns info about the authenticated caller
- JWT middleware on every request (extracts user from `Authorization: Bearer <token>`)

On the frontend, use `needs login` to protect pages:

```clear
page 'Dashboard':
  needs login
  heading 'Welcome back'
```

### Authentication

```clear
when user calls DELETE /api/posts/:id:
  requires login
  delete the Post with this id
  send back 'deleted' with success message
```

### Role-Based Access

```clear
when user calls PUT /api/settings/:id sending setting:
  requires role 'admin'
  save setting to Settings
  send back setting with success message
```

### Per-row Access Rules (Each User Sees Only Their Own Stuff)

`requires login` keeps strangers out, but logged-in users can still see each
other's data unless you tell the compiler who owns each row. That's what
per-row access rules do — declare them in the table and the compiler quietly
adds the ownership check to every read, save, edit, and delete.

```clear
create a Todos table:
  task, required
  done (boolean), default false
  the todo's creator can read, change, or delete

when user requests data from /api/todos:
  requires login
  todos = look up all Todos
  send back todos
```

Compile this and look at the generated JavaScript: the `findAll` call has a
`user_id` filter wired in for you. Alice's GET returns only Alice's todos —
even if Bob steals Alice's session token and tries to guess row ids on the
URL, every CRUD operation refuses any row he didn't create.

The vocabulary is small:

- `the X's creator can read, change, or delete` — the row belongs to whoever
  inserted it (most common — todos, expenses, bookings, deals)
- `the X's reviewer can read or change` — the row is assigned to a specific
  user via a `reviewer_id` field (you must declare that field on the table)
- `any admin can read, change, or delete` — admins override the per-row
  check (useful alongside the creator rule)
- `anyone logged in can read` — any authenticated user
- `anyone can read` — public, no login needed
- `change` is a synonym for `update` — pick whichever reads naturally

Stack rules to layer permissions:

```clear
create a Deals table:
  amount, number
  status, default 'pending'
  reviewer_id, number
  the deal's creator can read, change, or delete
  the deal's reviewer can read or change
  any admin can read, change, or delete
```

Reps see their own deals. The assigned reviewer can also read and change.
Admins see everything. Anyone else gets a 404 — the WHERE clause won't match
their user_id and the row stays invisible.

You don't write `user_id` anywhere in your code — the runtime auto-adds the
column to every table and the compiler stamps it on every insert from
`req.user.id`. A malicious client trying to forge `user_id: someone_else_id`
in the request body gets ignored — server-side stamps win every time.

This composes with `database is shared with tenant scope` from Chapter 10.
A regulated app declaring both gets two layers of filtering on every CRUD:
the cross-tenant filter (Acme can't see Initech's rows) AND the per-user
filter (Bob at Acme can't see Alice at Acme's rows). Defense in depth.

### Guards

```clear
when user calls POST /api/orders sending order:
  requires login
  enforce that stock is greater than 0, or fail with error message: 'Out of stock'
  new_order = save order as new Order
  send back new_order with success message
```

Guards check a business rule and return a 400 error if it fails. The message
after `or` is what the user sees. **Write helpful messages** — not "Invalid
request" but "Upgrade to Pro to place orders." The user needs to know what
to do.

### Rate Limiting

Block brute force attacks on auth endpoints and prevent expensive endpoints
from being abused:

```clear
when user calls POST /auth/login sending credentials:
  rate limit 10 per minute
  ...

when user calls POST /api/ask-agent sending question:
  requires login
  rate limit 20 per hour   # agents are expensive — cap usage
  ...
```

### Agent Guardrails

Agents are the most dangerous thing in your app — they can call tools, read
data, and follow instructions from users. Lock them down:

```clear
agent 'Support Agent' receives question:
  has tools: look_up_order, create_ticket

  # Policies — compile-time checks that the agent's tools can't violate
  must not: delete Orders
  must not: modify pricing
  must not: refund more than 500 dollars

  # Prompt injection defense — regex filter on tool inputs
  block arguments matching 'drop|truncate|delete from'

  ask claude question with Products, FAQs
  send back response
```

- **`must not:`** — checked at compile time. If the agent has a tool that
  could delete Orders, and you wrote `must not: delete Orders`, the compiler
  refuses to build.
- **`block arguments matching 'regex'`** — checked at runtime. Every tool
  call's arguments are run through the regex. If any match, the call is
  blocked. This catches prompt injection where a user tries to trick the
  agent into running dangerous SQL.

### App-Level Policies

Set once at the top of the file, applies to the whole app. Use these for
production apps that need compliance guarantees:

```clear
build for web and javascript backend

# App-level policies (before any endpoints)
block schema changes               # No ALTER TABLE ever
block deletes without filter       # Compiler errors on bulk DELETE
protect tables: Users, Orders      # Whitelist — only named endpoints can access
require role 'admin' for deletes   # Global role gate on DELETE endpoints
no mass emails                     # Block send email with 2+ recipients
```

These become compile-time checks. If you write an endpoint that violates any
of them, the compiler refuses to build.

### The Five Guard Types (summary)

Clear has five different kinds of guards. Each one protects something
different. **Use them together, not instead of each other.**

| What you're protecting | Use this |
|------------------------|----------|
| Endpoint from anonymous users | `requires login` |
| Endpoint from wrong role | `requires role 'admin'` |
| Business rule (stock, plan, etc.) | `enforce that X, or fail with error message: 'message'` |
| Input shape (required fields, format) | `validate <entity>:` + rules |
| Agent from doing bad things | `must not:` + `block arguments matching` |
| Whole app from dangerous patterns | App-level policies at top |
| Endpoint from brute force | `rate limit N per minute` |

A real production endpoint layers multiple guards:

```clear
when user calls POST /api/orders sending order:
  requires login                                        # 1. auth
  requires role 'customer'                              # 2. role
  rate limit 30 per minute                              # 3. brute force
  validate order:                                  # 4. input shape
    product_id is number, required
    quantity is number, required, min 1, max 100
  enforce that user's plan is not 'free', or fail with error message: 'Upgrade to Pro'  # 5. business rule
  enforce that product's stock > 0, or fail with error message: 'Out of stock'          # 5. business rule
  new_order = save order as new Order
  send back new_order with success message
```

That's six guards on one endpoint. Sounds like a lot — but each catches a
different attack. Skip any one and your app has a hole.

---

## Chapter 14: Error Handling (Because Things Go Wrong)

Reference chapter. This assumes you've built the deal-desk app from Chapters 1–12.

You met the canonical refusal form in Chapter 12 (`enforce that X, or fail with error message: '...'`) — that's how *business rules* fail. This chapter is about how *infrastructure* fails: the AI service times out, the email provider rate-limits you, the database deadlocks, the customer's browser hangs up mid-request. Different failure mode, different toolkit.

The deal-desk agent in Chapter 11 calls Claude to draft an approval summary. What happens if Claude is slow to respond? What if the email provider in Chapter 10 drops the connection? The internet is unreliable. APIs go down. Databases hiccup. Clear gives you clean ways to handle all of it.

```clear
try:
  result = call api 'https://api.example.com/data'
  show result
if error:
  show 'Something went wrong'
```

### Typed Error Handlers (Route Different Failures Differently)

Not all errors are equal. A 404 (not found) needs a different response than a 403 (permission denied).

```clear
try:
  fetch post from '/api/posts/123'
if error 'not found':
  show 'That post doesn't exist'
if error 'forbidden':
  show 'You don't have permission to view this'
if error 'unauthorized':
  redirect to '/login'
if error:
  show 'Something unexpected happened'
```

### Accessing the Error Object

Inside any `if error` block, the variable `error` is automatically available:

```clear
try:
  fetch data from '/api/data'
if error 'not found':
  show 'Error {error's status}: {error's message}'
if error:
  show error's message
```

Supported typed handlers: `not found` (404), `forbidden` (403), `unauthorized` (401),
`bad request` (400), `server error` (500).

### Throwing Custom Errors

Use `send error` to throw your own error and stop execution:

```clear
define function validate_age(age):
  if age is less than 0:
    send error 'Age cannot be negative'
  if age is less than 18:
    fail with 'Must be 18 or older'
  return age
```

Aliases: `throw error`, `fail with`, `raise error` — all work identically.
Errors propagate up to the nearest `try/if error` block, or crash if uncaught.

### Finally (Cleanup Code)

Need to clean up resources no matter what — close a file, release a lock?

```clear
try:
  process_data(connection)
if error:
  show 'Processing failed: {error's message}'
finally:
  close_connection()
```

The `finally:` block always runs, whether the try succeeded or failed.
Aliases: `always do:` and `after everything:`.

### Retry on Failure

```clear
retry 3 times:
  data = call api 'https://unreliable-api.com/data'
```

### Timeout

```clear
with timeout 5 seconds:
  result = call api 'https://slow-api.com/data'
```

### Live Blocks (Effect Fences)

Some lines in your program talk to the outside world: asking Claude, calling
an API, opening a websocket, running a timer. The rest is pure — math, string
work, table reads. A `live:` block is the visible label for the part that
talks to the world:

```clear
when user sends note to /api/chat:
  live:
    reply is ask claude 'hi'
  send back reply
```

Why label them? Two reasons. First, it's easier to read — you can see at a
glance which lines could be slow or could fail because the network is flaky.
Second, the compiler can use that label to prove the rest of your program
can't hang. Pure code (no `live:` block) is provably terminating.

Today `live:` is permissive — anything is allowed inside, and code outside
isn't restricted yet. In a future Clear release the compiler will start
*requiring* effect-shaped calls (`ask claude`, `call api`, `subscribe to`,
timers) to sit inside a `live:` fence. Writing it that way now means your
apps will keep compiling cleanly when the rule tightens.

```clear
# Good — the fence makes the boundary obvious
agent 'Replier' receiving message:
  live:
    answer is ask claude message
  send back answer
```

---

## Chapter 21: Policies (Safety Guardrails)

Your AI agent is smart. But smart doesn't mean safe. What happens when it
tries to delete every record in your database? Or sends 10,000 emails? Or
drops a table?

Policies are guardrails. They're rules your app enforces at runtime — not
suggestions, not warnings, but hard blocks that throw errors.

### The Basics

```clear
policy:
  block schema changes
  block deletes without filter
  block prompt injection
```

Three lines. Your app now:
- Can't DROP, ALTER, or TRUNCATE tables (even if an agent tries)
- Can't delete all rows (requires a WHERE filter)
- Scans all input for prompt injection attempts

### Protecting Sensitive Data

```clear
policy:
  protect tables: AuditLog, Payments
  block reads on CreditCards
  require role 'admin'
```

The `AuditLog` and `Payments` tables can't be modified by any operation.
Nobody can read from `CreditCards`. And all API calls require an admin role.

### Email and Communication Safety

```clear
policy:
  no mass emails
  block direct messages
```

Agents can't accidentally mass-email your contact list. And they can't
send Slack DMs to individual users.

### The Full List

Clear supports 30+ policy types covering: database safety, prompt injection,
access control, code freeze, maintenance windows, email, Slack, filesystem,
git safety, CRM, and cloud storage. See `SYNTAX.md` for the complete reference.

### When to Use Policies

**Always.** Every production app should have at minimum:
```clear
policy:
  block schema changes
  block deletes without filter
  block prompt injection
```

These three rules prevent the most common AI agent failure modes. They cost
nothing to add and they'll save you the first time an agent goes off-script.

### Proving Your Agents Actually Respect the Policies

Writing policies is step one. Step two is proving your agent can't route around them.

Clear's prover can verify that a specific agent upholds every policy in the block — not at runtime, but mathematically, before you deploy:

```clear
prove that agent 'Refund Bot' upholds all policies
```

The prover walks every path the agent can take (every tool it might call, every endpoint it can reach) and checks each one against the policy rules. You get a per-policy verdict: PROVED, DISPROVED, or UNVERIFIABLE (runtime-dependent check — passes at compile time, enforced at runtime).

For the full walkthrough — including what the output looks like, what UNVERIFIABLE means, and how to audit agents across multiple policy rules — see **Chapter 12b: Provable Agent Bounds**.

---

You just learned an entire programming language. Not bad for one sitting.

Here's where to go from here:

1. **Browse the example apps** in the `apps/` directory — 43 apps from simple to ambitious
2. **Read `SYNTAX.md`** — the complete reference for every feature
3. **Ask AI to build something** — describe what you want and let it write Clear code
4. **Read the output** — open `main.clear` and verify it does what you asked
5. **Tweak it** — change a label, adjust a number, add a field. You can do this now.

Here's the thing about Clear that makes it different from every other language:
**you're not supposed to write it from scratch.** AI writes it. You read it.
You verify it does the right thing. You make small edits when needed.

That's the whole deal. AI is the writer. You're the editor.

And if you ever read a Clear program and can't understand what it does?
That's a bug in the language — not in you. Seriously. File an issue. We'll fix it.

---

## Chapter 17: Testing (Proving Your Code Works)

Reference chapter. The tutorial showed `clear prove` (Chapter 12) — that's *math proof* of business rules. This chapter is about *unit tests* — the everyday `expect X is Y` style of test that runs against compiled code, catches regressions, and is what your CI runs every PR. Different tool, different question. **Use them together, not instead of each other.**

You know what's better than code that looks right? Code that you can PROVE is right. Clear has built-in testing — write tests right alongside your code:

```clear
test 'addition works':
  result = 2 + 2
  expect result is 4

test 'tax calculation':
  total = 100
  tax = total * 0.08
  expect tax is 8
```

### Running Tests

```bash
clear test main.clear
```

Output:
```
✅ addition works
✅ tax calculation
2 passed, 0 failed
```

**When a test fails**, Clear tells you what went wrong in plain English:

```
✗ posting a note works
  POST /api/notes returned 404 (expected 201).
  404 means "there is no endpoint at that URL." Either the path
  in your test is wrong, or you forgot to write
  `when user calls POST /api/notes:` in your Clear file.
  [clear:12]
```

Every status code gets a real explanation — 200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 5xx. The `[clear:N]` tag points at the exact source line that failed. In **Clear Studio**, clicking a failing test row jumps the editor to that line. There's also a **Fix with Meph** button that hands the error + surrounding code to Meph for an auto-fix.

### What You Can Test

**Values:**
```clear
test 'string operations':
  name is 'Alice'
  expect name is 'Alice'

test 'math':
  price = 100
  tax = price * 0.08
  expect tax is 8
```

**Functions:**
```clear
double(x) = x * 2

test 'double works':
  result = double(5)
  expect result is 10
```

### TDD with Functions (Write the Test First)

For any logic that doesn't need a database or HTTP endpoint, use `define function` and test it directly. The test goes in first — before the function exists.

**Red step — write a failing test:**
```clear
build for javascript backend

test 'discount calculation':
  result = apply_discount(100, 0.10)
  expect result is 10
```

Run `clear test`. It fails: `apply_discount is not defined`. That's the signal. Now write the function.

**Green step — write the function:**
```clear
build for javascript backend

define function apply_discount(price, rate):
  send back price * rate

test 'discount calculation':
  result = apply_discount(100, 0.10)
  expect result is 10
```

Run `clear test` again. It passes. The function and the test live in the same file.

`send back` inside `define function` compiles to a plain `return` — not HTTP. You can call it from test blocks, from other functions, or from endpoints. It's just a regular function.

**If your function name collides with a built-in** (like `length`, `keys`, or `values`), Clear gives priority to your definition. You can write `define function length(text):` and it will shadow the built-in in your app.

### Testing AI Agents

Use `mock claude responding:` to test agents without calling the real API:

```clear
agent 'Classifier' receives feedback:
  analysis = ask claude 'Classify this feedback' with feedback returning:
    sentiment
    score (number)
  send back analysis

test 'classifier returns sentiment':
  mock claude responding:
    sentiment is 'positive'
    score = 9
  result = call 'Classifier' with 'Great product!'
  expect result's sentiment is 'positive'
```

### Intent-Based Tests (The Easy Way)

Instead of writing raw HTTP calls, describe what you want to test in English:

```clear
test 'todo workflow':
  can user create a new todo with title: 'Buy groceries'
  expect it succeeds
  can user view all todos
  expect it succeeds
  can user delete a todo
  expect it succeeds

test 'validation catches missing fields':
  can user create a todo without a title
  expect it is rejected

test 'security':
  deleting a todo should require login

test 'agent smoke test':
  can user ask agent 'Helpdesk' with message: 'hello'
  expect it succeeds

test 'display works':
  does the todos list show 'Buy groceries'
```

The compiler figures out which endpoints to call based on your tables and
endpoints. `create` becomes POST, `view` becomes GET, `delete` becomes DELETE.

**Available expectations:**
- `expect it succeeds` — status 200-299
- `expect it fails` — non-success status
- `expect it requires login` — status 401
- `expect it is rejected` — status 400
- `expect response has id` — field exists
- `expect response contains 'text'` — body contains text

### Running Agent Evals

For more thorough agent testing, use evals:

```bash
clear eval main.clear              # Schema checks (fast, no API calls)
clear eval main.clear --graded     # LLM-graded scorecard (calls Claude)
```

### Leaving a piece for later: `TBD`

Sometimes you know the shape of the program but you have not decided one
piece yet. Maybe the spec is ambiguous, maybe Russell told you to "leave
the auth for later, focus on the queue," maybe you are sketching a structure
and want compiler feedback on the parts that ARE written.

`TBD` is a placeholder marker. Drop it anywhere a value or a whole step
belongs. The compiler accepts it. The program still compiles green. Only
the line that holds the placeholder fails at runtime — every other piece
keeps working.

```clear
build for javascript backend

create a Leads table:
  name, required
  email, required

when user requests data from /api/leads:
  send back all Leads

when user sends lead to /api/leads:
  validate lead:
    name, required
    email, required
  TBD                       # the audit log piece is for next session
  saved_lead = save lead as new Lead
  send back saved_lead with success message

test 'creating a lead works':
  set new_lead = TBD        # exact payload not decided yet
  send new_lead to /api/leads
  expect response status is 200
```

Compile and run the tests:

```bash
clear test main.clear
```

You will see something like:

```
PASS: Creating a new lead succeeds
SKIP: creating a lead works - placeholder hit at line 17 — fill it in or remove it (this test exercises a stub)

Results: 1 passed, 0 failed, 1 skipped due to stub
```

The skipped test does not fail the build — `clear test` exits 0 because no
real assertion failed. The skip count tells you "structure right, piece not
filled in yet" so you know exactly which holes are still open.

Three rules of thumb:
1. **Use `TBD` for genuinely open decisions.** Ambiguous spec, deferred piece,
   sketching a structure. Not for things you do not feel like writing — that
   is just hiding the hard part.
2. **Do not ship `TBD`s in production code.** The placeholder is a bookmark,
   not a finished piece. If your final commit still has open `TBD`s, you have
   not finished the feature.
3. **Skipped tests are not coverage.** A test that hits a `TBD` did not
   actually verify anything. Refill the placeholder before you trust the test.

---

## Chapter 23: Writing Tests (Proving Your API Works)

Reference chapter. Chapter 17 covered the basic `expect X is Y` shape. This chapter goes deeper: **intent-based tests** that read like user stories (`can user create a deal`, `expect it succeeds`), end-to-end test patterns that drive the URLs your app exposes, and the test harness flags you'll use in CI. Pair this chapter with Chapter 17 — same primitive, deeper toolkit.

You can write tests right in your Clear file. The easiest way is intent-based tests that read like user stories:

```clear
test 'todo workflow':
  can user create a new todo with title: 'Buy groceries'
  expect it succeeds
  can user view all todos
  expect it succeeds
  can user delete a todo
  expect it succeeds

test 'validation':
  can user create a todo without a title
  expect it is rejected

test 'security':
  deleting a todo should require login

test 'agent works':
  can user ask agent 'Support' with message: 'hello'
  expect it succeeds
```

The compiler knows your tables and endpoints, so `can user create a todo` becomes
a POST to `/api/todos` automatically.

You can also write raw HTTP calls for more control:

```clear
test 'create a todo':
  call POST /api/todos with title is 'Buy milk'
  expect response status is 201
  expect response body has id

test 'list all todos':
  call GET /api/todos
  expect response status is 200
```

These tests run alongside the auto-generated tests when you use `clear test`.

**What gets auto-generated:** The compiler automatically generates tests for every endpoint and table in your app, with human-readable English names:
- "Creating a new todo succeeds" (not "POST /api/todos returns 201")
- "Viewing all todos returns data"
- "Deleting a todo requires login" (if the endpoint has auth)
- "User can create a todo and see it in the list" (CRUD flow test)
- "The Helpdesk agent responds to messages" (agent smoke test)

You only need to write custom tests for business logic, validation edge cases, and workflows that go beyond basic CRUD.

### What You Can Check

```clear
# After intent-based tests (can user / does)
expect it succeeds                     # 2xx status
expect it fails                        # non-2xx
expect it requires login               # 401
expect it is rejected                  # 400
expect response has id                 # field exists in response
expect response contains 'success'     # body contains text

# After raw HTTP calls
expect response status is 200          # check the status code
expect response body has name          # check a field exists
expect response body length is greater than 0  # check there's data
```

### Capturing Command Output

You can run shell commands and capture their output:

```clear
when user calls GET /api/version:
  version = run command 'node --version'
  send back version
```

The `= run command` form captures stdout as a string. Without the `=`, the command
just runs without capturing anything.

---

## Chapter 24: Writing Business Rules (Provable Policies)

A **business rule** is a policy your CRO, auditor, or compliance reviewer cares about — "discounts over 30% need VP approval," "deals over $100k need CRO sign-off," "every lead needs an email." Clear has a `rule:` keyword that names these policies so the prover can give you a per-rule verdict in plain English.

### The basics

```clear
rule discount-cap-thirty:
  enforce that discount is less than 30, or fail with error message: 'Discounts over 30% need VP approval'
```

That's it. The body is a normal `guard` line — same shape you'd use anywhere. The wrapper `rule discount-cap-thirty:` names the policy. Now when you run `clear prove`:

```
Business rules in this file:
  [PROVED]       discount-cap-thirty (line 18)
  1 of 1 rules proved.
```

The CRO sees this output and knows the policy holds. No code review required.

### The three verdicts

The prover walks every `rule:` block and produces one of three verdicts:

- **PROVED** — every guard simplifies to `true`. The rule is well-formed and never falsely refuses.
- **DISPROVED** — at least one guard always fires. The rule rejects every input — that's a bug.
- **UNVERIFIABLE** — the body has a database lookup, an AI call, an HTTP request, or some other "talks to the world" operation. The prover refuses to claim more than its math engine can see.

**A small file with PROVED and UNVERIFIABLE side-by-side:**

```clear
rule discount-cap-thirty:
  enforce that deal's discount_percent is less than 30, or fail with error message: 'Discounts of 30% or more require VP approval'

rule reads-the-database:
  found = look up Deal where status is 'pending'
  enforce that found is not nothing, or fail with error message: 'Body calls the database'
```

Output:
```
Business rules in this file:
  [PROVED]       discount-cap-thirty (line 1) — for every possible deal
  [UNVERIFIABLE] reads-the-database (line 4) — body calls the database
  1 of 2 rules proved. 1 unverifiable.
```

The first rule is **PROVED** because the compiler emits a runtime check that rejects any input where `discount_percent` is 30 or more. No execution past that check has discount ≥ 30 — that's a structural proof.

The second is **UNVERIFIABLE** because the rule body looks up data from the database. The prover refuses to claim universal correctness for code that talks to the world — the lookup result depends on what's in the database at runtime, which the math engine can't see.

**DISPROVED** is the third verdict. It fires when the prover can prove a rule's condition is false for every possible input — the rule rejects everything, which is almost always a bug. You won't normally write a DISPROVED rule on purpose; it shows up when an operator gets flipped or a constant is wrong. See `examples/rule-keyword-tour.clear` for a side-by-side demo of all three verdicts including a deliberately-DISPROVED rule for teaching.

That's the regulated-tier audit trail: every named rule gets a verdict the CRO can read.

### When to use `rule:` vs raw `guard`

Use `rule:` when the policy has a name a non-engineer would say. Use raw `guard` for a one-off check inside an endpoint that doesn't deserve a name.

The CRO trusts "discount-cap-thirty PROVED" because the verdict is attributed by name. They never read "line 42 PROVED" — that requires opening source. Per-rule attribution is what makes the prover output a real audit artifact instead of a developer log.

### Quoted-string names

If your rule name reads better as a sentence, use a quoted string and the parser will dasherize it:

```clear
rule 'Deals over $100k need CRO sign-off':
  enforce that amount is less than 100000, or fail with error message: 'Big deals need CRO sign-off'
```

That becomes `deals-over-100k-need-cro-sign-off` in the prover output.

### Hard rules

- Names must be unique per file. Duplicate names are a compile error.
- Body must have at least one statement. An empty rule is a compile error.
- Rules live at the top level. You can't nest one inside an endpoint, function, or another rule.
- A body with no `guard`, `validate`, or `throw` triggers a warning (the rule never enforces anything).

### Conditional rules — `if … otherwise …`

Rules can branch. A common pattern: enterprise customers get a different cap than standard customers.

```clear
rule discount-cap-tiered:
  if order's customer_tier is 'enterprise':
    enforce that order's discount_percent is less than 50, or fail with error message: 'enterprise cap is 50%'
  otherwise:
    enforce that order's discount_percent is less than 30, or fail with error message: 'standard cap is 30%'
```

The prover walks BOTH branches and verifies the cap holds in each path. The verdict is PROVED for the whole rule because every reachable path has a guard that enforces a discount cap. The CRO reads "discount-cap-tiered PROVED" and gets a single audit line for the entire tiered policy — no need to track two separate rules.

### A worked deal-desk example

A real policy file, with three rules covering the kinds of verdicts a regulated-tier customer wants attributed:

```clear
# Discount caps. Enterprise gets a higher ceiling; everyone else 30%.
rule discount-cap-tiered:
  if deal's segment is 'enterprise':
    enforce that deal's discount_percent is less than 50, or fail with error message: 'enterprise cap is 50%'
  otherwise:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'standard cap is 30%'

# Big deals require a named approver — VP for Big, CRO for Huge.
rule big-deals-need-approver:
  if deal's amount is greater than 100000:
    enforce that deal's approver_role is 'cro', or fail with error message: 'deals over $100k need the CRO'
  otherwise:
    enforce that deal's approver_role is one of 'vp', 'cro', or fail with error message: 'this deal needs a VP or CRO approver'

# Deals must reference an existing customer. The prover marks this UNVERIFIABLE
# because the body looks up data from the database — the math engine cannot
# universally prove that result. The runtime check still fires on every save.
rule customer-must-exist:
  found = look up Customer where id is deal's customer_id
  enforce that found is not nothing, or fail with error message: 'Unknown customer'
```

Run `clear prove deal-desk.clear`:

```
Business rules in this file:
  [PROVED]       discount-cap-tiered (line 2) — for every possible deal
  [PROVED]       big-deals-need-approver (line 9) — for every possible deal
  [UNVERIFIABLE] customer-must-exist (line 16) — body calls the database

  2 of 3 rules proved. 1 unverifiable.
```

That's a CRO-ready audit line. The first two policies are math-proved across every possible input. The third has an honest UNVERIFIABLE — the prover refuses to claim it can verify a database read, but the runtime check still rejects any save that fails the existence test.

### Trust but verify — the runtime witness

A PROVED verdict isn't just a math claim. The compiler also emits a runtime check that rejects every violating input. So if the prover says "PROVED for every possible deal," that's backed by:

1. **Math proof** — the prover walked the source and verified every guard simplifies to true.
2. **Runtime witness** — the compiled app rejects 100% of violating inputs at runtime, with the rule's name in the rejection. A test harness fires 20 violating inputs at the running app and confirms every one comes back as a 403 with the rule's name in the body.

The two together turn "PROVED" from a developer claim into a measurable claim. The regulated-tier customer can verify it themselves.

---

## Chapter 24b: Audit Reports (Hand a Compliance Buyer a PDF)

When a CRO or compliance buyer asks "how do you know your business rules actually hold?", you generate an audit PDF.

```bash
node scripts/audit-bundle.mjs apps/your-app/main.clear > /tmp/bundle.json
python scripts/audit-pdf.py /tmp/bundle.json /tmp/audit.pdf
```

The PDF lists every named rule in your app, with two independent proofs per rule:

1. **How it was proved formally** — the math-checker walks the rule and either folds it to a tautology, or proves it's structurally enforced (any execution past the guard satisfies the condition because the runtime rejects violators before the next line runs).

2. **How it was verified at runtime** — the audit script spawns your compiled application on a free port, sends 20 inputs that violate the rule, and records the rejection responses. If every input came back as a 403 with the rule's name in the body, the math claim is corroborated by measured runtime evidence.

**Sample output for a 3-rule deal app:** the PDF opens with a CONFIDENTIAL header bar, a metrics row showing `3/3 rules proved · 60/60 violating inputs rejected`, a trust-basis explanation, then one page per rule with the math verdict, the runtime witness summary, and a sample table of 5 violating inputs and their actual rejection responses. Navy/amber compliance styling — looks like a board document, not a developer artifact.

**Try it now:**

```bash
node scripts/audit-bundle.mjs apps/audit-demo/main.clear > /tmp/bundle.json
python scripts/audit-pdf.py /tmp/bundle.json /tmp/audit.pdf
```

`apps/audit-demo/main.clear` is a 20-line example with three rules (`discount-cap-thirty`, `price-floor-positive`, `risk-score-bounded`). Open the resulting PDF to see what your auditors will see.

**What rule shapes work today:** the runtime-witness auto-violator handles single-field bounds (`field is less than N`, `field is greater than N`, `field is at least N`, `field is at most N`), equality on constants, non-empty checks, non-null checks, and two-field comparisons within the same incoming record. Rules with cross-record constraints, regex matching, set membership, or computed expressions show up in the PDF with a "math-proved only; runtime witness automation pending for this rule shape" note — the math claim is still recorded, just not measurably corroborated.

**When to regenerate:** every time you change a rule, every time you ship to production, every quarterly audit. The PDF is dated — the buyer trusts what they see was true at the time the file was generated.

---

## Chapter 16: The Clear CLI (Your Toolbox)

Reference chapter. The tutorial used `clear run`, `clear serve`, `clear prove`, and `clear deploy` — those are the four commands you'll touch most. This chapter is the full menu for the day you need `clear info`, `clear lint`, `clear fix`, or the JSON output flags for your own tooling.

Clear comes with a command-line tool that does everything: build, test, deploy, lint, fix, and introspect. It's designed for both humans and AI agents — every command supports `--json` for machine-readable output.

### Build

Compile a .clear file to JS/Python/HTML:

```bash
clear build main.clear
```

This generates a `build/` directory:
```
build/
  index.html         # Frontend (if web target)
  server.js          # Backend (if JS backend target)
  server.py          # Backend (if Python backend target)
  style.css          # Fallback styles
  clear-runtime/     # Database, auth, rate limiting
```

### Check (Validate Without Compiling)

Fast validation — parses and checks for errors without generating output:

```bash
clear check main.clear
```

Great for quick feedback while editing. Catches undefined variables,
missing fields, security issues, and typos.

If validation fails and you want the compiler error fixed, print the trace packet:

```bash
clear check main.clear --trace
```

Paste the whole `CLEAR COMPILE TRACE v1` packet into the debugging session. In Studio, use the
**Copy compiler error** button that appears above compile errors.

### Run

Compile and immediately run a backend server:

```bash
clear run main.clear
```

### Serve

Compile and start a local development server with static file serving:

```bash
clear serve main.clear
```

Your app is at `http://localhost:3000`.

### Dev (Watch Mode)

Compile, serve, and auto-rebuild when files change:

```bash
clear dev main.clear
```

### Info (Introspect)

List all endpoints, tables, pages, and agents in a Clear file:

```bash
clear info main.clear
```

Output:
```
Tables: Todos (task, completed, created_at)
Endpoints: GET /api/todos, POST /api/todos, DELETE /api/todos/:id
Pages: Todo App (/)
```

### Lint (Security + Quality)

Check for security vulnerabilities and code quality issues:

```bash
clear lint main.clear
```

Catches: unauthenticated DELETE endpoints, missing validation, SQL injection
risks, open CORS without auth, and more.

### Fix (Auto-Patch)

Automatically fix patchable errors:

```bash
clear fix main.clear
```

### Package (Deploy Bundle)

Generate a Dockerfile and package.json for deployment:

```bash
clear package main.clear
```

### Init (New Project)

Scaffold a new Clear project:

```bash
clear init my-app
```

Creates `my-app/main.clear` with a starter template.

### Agent (List Agents)

List all agents with their tools, skills, and guardrails:

```bash
clear agent main.clear
```

### Global Flags

```bash
clear build main.clear --json      # Machine-readable JSON output
clear build main.clear --quiet     # Suppress non-essential output
clear build main.clear --no-test   # Skip test gate
clear build main.clear --auto-fix  # Auto-patch errors during build
clear check main.clear --trace     # Print copy-pasteable compile trace
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Compile error |
| 2 | Runtime error |
| 3 | File not found |
| 4 | Test failure |

---

## Chapter 16b: Clear Studio (The IDE)

Reference chapter. Studio is where the tutorial's "now run this" beats actually feel best — the editor, the live preview pane, and the AI assistant on the right are all in one window so the test-edit-rerun loop is friction-free. If you've been writing your `.clear` files in another editor through the tutorial, this chapter is your invitation to switch.

Clear has a built-in IDE called **Clear Studio**. Run `node studio/server.js` and open `http://localhost:3456`.

### Three Panels

- **Left:** Code editor (CodeMirror 6) — write and edit Clear code
- **Right top:** Live preview and terminal — see your app running
- **Right bottom:** AI chat — talk to Meph, the built-in AI assistant

### Click-to-Highlight (Source Mapping)

Click any line in the Clear editor and the compiled output highlights the
corresponding JavaScript/HTML line. This works because the compiler embeds
source map markers (`// clear:N`) in the compiled output.

Click a line in the compiled output and it highlights the original Clear line.
Two-way mapping — you always know which Clear line produced which output line.

This is especially useful for debugging: if something looks wrong in the
compiled output, click it to find the Clear line that generated it.

### 43 Template Apps

The dropdown at the top has 43 pre-built example apps — from simple todo lists
to full dashboards with charts and AI agents. Pick one, click it, and the code
loads in the editor. Great for learning and starting new projects.

---

## Chapter 18: Going Live (Deploying Your App)

You built it. You tested it. Now let's put it on the internet where
people can actually use it.

### Step 1: Build

```bash
clear build main.clear
```

### Step 2: Run Locally

```bash
cd build
npm install express    # First time only
node server.js
```

Your app is at `http://localhost:3000`.

### Step 3: Package for Production

```bash
clear package main.clear
```

This generates:
- `Dockerfile` — containerized deployment
- `package.json` — Node.js dependencies

### Step 4: Deploy

**Option A: Docker**
```bash
cd build
docker build -t my-app .
docker run -p 3000:3000 my-app
```

**Option B: Railway (One Command)**

```bash
clear deploy main.clear
```

This packages your app with the correct database adapter, runs `railway up`,
and prints environment variable guidance. If your app uses `database is PostgreSQL`,
the Postgres adapter is bundled automatically.

Requirements:
- Install Railway CLI: `npm install -g @railway/cli`
- Log in: `railway login`
- Create a project: `railway init`

**Option C: Any Node.js host**

Upload the `build/` directory to Vercel, Render, Fly.io, or any
Node.js hosting. The entry point is `server.js`.

### Environment Variables

If your app uses `env('API_KEY')`, set the environment variable on your host:

```bash
# Local
API_KEY=sk-xxx node server.js

# Docker
docker run -e API_KEY=sk-xxx -p 3000:3000 my-app
```

---

## Quick Reference

### Build Targets

```clear
build for web                              # Frontend only
build for javascript backend               # Backend only (Node.js)
build for python backend                   # Backend only (FastAPI)
build for web and javascript backend       # Full-stack (Node.js)
build for web and python backend           # Full-stack (Python)
```

### The Clear File Structure

Every Clear app follows this order:

```clear
build for web and javascript backend    # 1. What to build

# 2. Database
database is local memory
create a Users table:
  name, required
  email, required, unique

# 3. Backend
accept requests from any website
log every request

when user calls GET /api/users:
  all_users = get all Users
  send back all_users

# 4. Frontend
page 'My App':
  heading 'Hello'
```

Database first, then backend, then frontend. Always.

### Common Patterns

**CRUD app (the most common):**
```clear
# Create
when user calls POST /api/items sending item:
  validate item:
    name is text, required
  new_item = save item as new Item
  send back new_item with success message

# Read
when user calls GET /api/items:
  all_items = get all Items
  send back all_items

# Update
when user calls PUT /api/items/:id sending changes:
  requires login
  save entry to Items
  send back update_data with success message

# Delete
when user calls DELETE /api/items/:id:
  requires login
  delete the Item with this id
  send back 'deleted' with success message
```

**Frontend that talks to the backend:**
```clear
page 'My App':
  on page load get items from '/api/items'

  'Name' is a text input saved as a name
  button 'Add':
    send name as a new item to '/api/items'
    get items from '/api/items'
    name is ''

  display items as table showing name with delete
```

**String interpolation:**
```clear
show 'Hello, {name}! Score: {score * 10}.'
msg is 'User: {user's email}'     # possessive inside {} works
```

**Typed functions:**
```clear
define function add(a is number, b is number) returns number:
  return a + b
```

**Map iteration:**
```clear
for each key, value in settings:
  show '{key} = {value}'
if 'theme' exists in settings:
  show keys of settings
```

**Higher-order functions:**
```clear
doubled = apply double to each in numbers
evens   = filter numbers using is_even
```

**Typed error handling:**
```clear
try:
  fetch data from '/api/item'
if error 'not found':
  show 'Missing'
if error 'forbidden':
  show error's message
if error:
  show error's message
```

---

## Chapter 26: Live App Editing (Change a Running App Without Breaking It)

Your app is live. Marcus is using it. His team opened 47 deals today and the approval queue is humming. Then Marcus realizes: the `notes` field on Deals should be called `internal_notes`, and he wants to add a `contract_value` column.

In most tools, that means: deploy a migration, coordinate a restart, hope nothing breaks mid-request. In Clear, Marcus types in a chat box and the change is live in three seconds — no terminal, no coordination, no downtime.

That's Live App Editing (LAE).

### What LAE Is

LAE is a widget pinned to the corner of your running app. It's invisible to regular users — only the owner can see it. The owner types a plain-English request ("add a contract_value field to Deals"), and the widget talks to an AI model that understands your Clear source. The model proposes the change, shows you a diff, and waits for your click before touching anything.

Two things make it safe:

**Additive changes ship instantly.** Adding a field, adding an endpoint, adding a page — these can't break existing rows or break existing code, so they go through a single "Ship it" button.

**Destructive changes require confirmation.** Removing a field, changing a type — these could lose customer data. The widget shows you a permanent warning, the exact phrase you must type (like `DELETE field notes`), a reason field, and a red button that's disabled until both match. There's also an audit log row written before the change ships, so you have a paper trail even if something goes wrong.

### Enabling the Widget

Add one line to your app:

```clear
build for javascript backend
owner is 'marcus@acme.com'
allow signup and login

create a Deals table:
  customer
  list_price (number)
  discount_percent (number)
  notes
```

The `owner is` line is all it takes. When Marcus logs in with that email, he sees an "Edit this app" badge in the bottom corner. Everyone else sees nothing.

The badge opens the Meph chat widget — Meph is short for Mephistopheles, Clear's built-in AI app builder. Marcus types a request; Meph proposes the change in structured form; Marcus reviews and ships.

### Making an Additive Change

Marcus opens the widget and types:

> "Add a contract_value field to the Deals table"

Meph reads the current source, proposes `add field contract_value to Deals`, and sends back a proposal card:

```
✅ Additive   1× add field
+ contract_value
```

The card shows:
- **Green chip** — additive, safe to ship instantly.
- **What changed** — the diff showing the new line.
- **Ship it / Cancel** — two buttons.

Marcus clicks **Ship it**. Clear rewrites the source, recompiles, and reloads the server in the background. The Deals table now has a `contract_value` column. No existing rows break — the column is empty until Marcus or his team fills it in. Total time: about 3 seconds.

**Nothing to type. Nothing to confirm.** Additive changes are safe by construction: you can always roll back by removing the new field, and no existing data is touched.

### Making a Destructive Change

Marcus decides the `notes` field was a mistake from day one — nobody uses it and it's cluttering the form. He types:

> "Remove the notes field from Deals"

Meph proposes the change. But this time the card is different:

```
⚠️  Destructive   1× remove field
- notes
```

**Red chip. Permanent warning banner.** Below the diff:

> Permanent. Rolling back will restore the field, but not the data inside it.

And below that, a form with three parts:

1. **Confirmation phrase** — a text input with placeholder `DELETE field notes`. Marcus must type this exactly (case-sensitive) before the red button enables.
2. **Reason** — a textarea. Marcus writes: `"Field is unused — confirmed with the sales team."`
3. **I understand — ship and destroy** — red, disabled until both fields match.

Marcus types `DELETE field notes`, fills in his reason, and clicks the red button. The server:
1. Writes a `pending` audit row with the actor, reason, timestamp, and what changed.
2. Ships the change (recompile + server restart).
3. Updates the audit row to `shipped` with the version ID.

If the server restart fails, the audit row flips to `ship-failed` — the record exists either way. Marcus can't take an action without a paper trail.

### When It Looks Like a Rename

Marcus realizes `notes` should actually be called `internal_notes`, not deleted. He adds `internal_notes` first (additive, instant ship). Then he types:

> "Remove the notes field from Deals"

The widget sees that `notes` was just removed AND `internal_notes` was just added on the same table. Instead of jumping straight to the deletion form, it shows a **rename detection** panel above the confirmation gate:

```
Looks like a rename — what should happen to existing data?

○  Copy notes values into internal_notes, then drop notes
○  Drop notes, leave internal_notes empty
```

The first option is pre-selected. Marcus picks it (copy the values), then proceeds through the normal destructive confirmation: type `DELETE field notes`, fill in a reason, click the red button. The migration choice travels with the ship request so the right data strategy runs before the column is dropped.

**Why this matters:** without rename detection, Marcus deletes the field, ships in three seconds, and realizes three days later that 847 rows of notes data are gone. The rename prompt is the difference between "I didn't know I needed to think about that" and "the tool made me think about it."

### What the Audit Log Captures

Every destructive ship writes a row with:
- **Actor** — who did it (email from the login session)
- **Action / verdict** — `ship / destructive`
- **Kind** — `remove_field`
- **Before / After** — compact snippets (`- notes`, `(removed)`)
- **Reason** — Marcus's free-text explanation
- **Status** — `pending` → `shipped` (or `ship-failed` if the restart failed)
- **Version ID** — the deployed version this change produced

This is what you hand a compliance auditor: "Show me every field deletion in the last 90 days, who authorized it, and why." Every row is there. The server refuses to ship destructive changes when the audit store is unreachable — no row, no ship.

---

## Chapter 27: Meph + Ralph (The AI That Checks Its Own Work)

By the end of this chapter, you'll understand what happens when you ask Meph to build a real, multi-step app — not a two-table CRUD form, but something with routing logic, approval roles, and concurrent users who can't overwrite each other. The short answer: Meph doesn't just start typing code. Meph stops first and writes out, in plain English, exactly what the app is supposed to do. You read the list. You approve it. Then Meph builds. And when Meph says "done," a second system called **Ralph** reads the built app against the list you approved and decides whether "done" is actually true.

This is Clear's answer to the most common failure mode in AI-built software: the AI that ships a beautiful app that looks right, says "done," and leaves half the requirements on the floor.

### Why AI builds fail silently

Here's the thing about asking an AI to build an app: the AI will finish. Every time. It will write out the source file, build it, and say "your approval queue is ready." And nine times out of ten, the approval queue *looks* ready — there's a list of pending items, there are buttons, there's a status field that says "Pending." The problem is that "Pending" isn't a workflow. A manager can't click anywhere to approve the deal. There's no routing logic that sends a $90,000 request to the VP instead of the manager. Nobody records who approved what, or when. The app looks done because it renders. It isn't done because none of the business logic is actually there.

This is vibe coding. The AI vibes that it built what you asked for. The buttons are a vibe. The workflow is a vibe. The compliance trail is a vibe. And you don't find out until Marcus's compliance buyer opens the app and clicks the Approve button that doesn't exist.

**The requirements step exists to make the vibe explicit before the build starts.** Instead of Meph guessing what you meant by "approval queue," Meph writes down every specific, observable thing the app needs to do — and you sign off on the list. Ralph's job is to make sure the finished app actually delivers every item on that list, not just the ones that were easy to build.

### Step 1: Marcus types a request, Meph writes requirements instead of code

Marcus opens Clear Studio and types in the chat:

```
Build me an approval queue for internal requests — employees submit requests,
managers approve or reject them, high-priority ones go straight to the ops lead.
```

A junior AI would start generating code immediately. Meph does something different: Meph recognizes this is a complex multi-role app — it has routing, it has two user types, it has concurrent decisions — and stops to write requirements first.

Here's what Marcus sees in the chat panel before a single line of Clear code appears:

```
Before I write any code, I want to make sure I build exactly what you need.
Here's what I'm planning to build — read each item and let me know if I
should add, remove, or change anything. Then I'll start.

requirements:
  employees can submit requests with category, priority, owner, due date, and status
  managers can list open requests by priority and owner
  high-priority requests route to the operations lead
  managers can assign, resolve, or reopen a request
  each status change records actor, timestamp, old status, and new status
  closed requests cannot be edited unless they are reopened first
  list, detail, assign, resolve, and reopen controls are reachable

Does this capture what you need? I won't touch the code until you approve this.
```

Each line is a *checkable claim* — something Ralph can verify once the build is done. Notice what's not on the list: "the workflow is robust," "users have a dashboard," "approvals work well." Those are feelings, not facts. A checkable requirement names who does something, what data changes, what rule decides the outcome, and how you'd know if it worked.

### What makes a requirement checkable (and what doesn't)

Before Marcus approves, he should understand what he's approving. Each requirement is a claim that Ralph can evaluate by looking at the built app. Here's the dividing line:

**Good requirement:** `high-priority requests route to the operations lead`
Ralph can check whether the app has routing logic that reads the priority field and assigns the ops-lead role when it's high. That's a fact in the code.

**Bad requirement:** `the approval workflow should work well`
Ralph can't check "works well." That's not a claim — it's a wish. Meph will reject requirements phrased this way and ask Marcus to restate them concretely.

**The four questions every requirement has to answer:**
- Who acts? (`employees`, `managers`, `the ops lead`)
- What data changes or appears? (`category, priority, owner, due date, and status`)
- What rule decides the outcome? (`high-priority routes to ops lead`, `closed cannot be edited unless reopened`)
- How can Ralph observe it? (routing logic in source, audit row in table, page declared at that URL)

If a line can't answer all four, Meph will flag it and suggest a rewrite.

### Step 2: Marcus approves (or pushes back)

Marcus reads through Meph's list. He notices one thing missing: the manager approval should also send the employee an email when their request is resolved. He types:

```
Looks good, but add one more: employees get notified by email when their request is closed.
```

Meph updates the requirements list and adds the new item. Marcus types `approved`. That's the handoff. The list is locked. Meph will now build against exactly this contract — and Ralph will audit against exactly this contract too.

### Step 3: Meph builds the app

With the requirements approved, Meph writes the Clear source. The database tables, the server routes, the routing logic, the email block, the pages — every decision Meph makes has a line in the requirements list pointing at it. Routing logic exists because `high-priority requests route to the operations lead` is on the list. The audit table exists because `each status change records actor, timestamp` is on the list. The email block exists because `employees receive an email when their request is resolved or closed` is on the list.

Meph builds, runs tests, and tries to say `done`.

### Step 4: Ralph reads the verdict

Before "done" actually lands in the chat, Ralph gets a turn. Ralph is not a chatbot. Ralph is a systematic reader that walks through the approved requirements one by one and checks the built app's source for evidence that each one is implemented.

Ralph doesn't accept handwaving. For each requirement, Ralph looks for concrete evidence:

- `employees can submit requests with category, priority, owner, due date, and status` — Ralph checks that the database table has those five fields and that there's a submit route that writes all of them.
- `high-priority requests route to the operations lead` — Ralph checks that there's routing logic reading the priority field, not just a field on the table with no routing attached.
- `each status change records actor, timestamp, old status, and new status` — Ralph checks that the audit table schema includes those four columns and that the status-change route writes to it.
- `closed requests cannot be edited unless they are reopened first` — Ralph checks for a guard clause, not just a comment about it.

If Ralph finds all the evidence, Meph's "done" goes through and Marcus sees a green check on each requirement in the chat panel.

### What Ralph blocking looks like

Now suppose Meph's build was a little too optimistic on the email notification. The email block got scaffolded but wasn't wired to fire on the `resolved` and `closed` transitions — just added as a stub. Ralph reads the source. The email evidence isn't there. Here's what Marcus sees instead of "done":

```
You are not done yet. The app does not satisfy the approved requirements.

  - [missing] employees receive an email when their request is resolved or closed:
    No triggered email block found that fires on status change to resolved or closed.

Fix the Clear source. Do not rewrite the requirements unless the user asked.
(ralph-retry 1/2)
```

The chat doesn't say "done." Meph reads Ralph's message, finds the gap in the source, and adds the missing email trigger. Builds again. Ralph runs again. This time all requirements show green. Now "done" goes through.

Marcus sees:

```
All requirements met.

  ✓ employees can submit requests with category, priority, owner, due date, and status
  ✓ managers can list open requests by priority and owner
  ✓ high-priority requests route to the operations lead
  ✓ managers can assign, resolve, or reopen a request
  ✓ each status change records actor, timestamp, old status, and new status
  ✓ closed requests cannot be edited unless they are reopened first
  ✓ employees receive an email when their request is resolved or closed
  ✓ list, detail, assign, resolve, and reopen controls are reachable

Your internal request tracker is running on port 3456.
```

Not a vibe. A receipt.

### "Pending" is not a workflow

The single most common way AI app builds fail the Ralph check is the approval-status trap. The AI creates a `status` field with the value `"pending"`. There's a button labeled "Approve." The button changes the status to `"approved"`. The app looks done.

Ralph rejects this pattern. **A status field is not approval routing.** Ralph looks for:
- A reviewer role assignment — which user is responsible for deciding?
- An approval queue — where does the approver go to see what needs a decision?
- Evidence that the approver's identity is recorded when the decision is made
- A guard that prevents two approvers from overwriting each other's decision

"Pending" with no routing, no assignment, and no actor record is a placeholder, not a workflow. Ralph calls it `missing` and Meph has to build the real thing.

### Try it yourself

1. **Type a vague request and watch the requirements step.** Open Studio and type "build me a booking app for a meeting room." Read Meph's requirements list before approving. Count how many lines would have been silent gaps if Meph had just started coding. Approve the list, let Meph build, and watch Ralph's green checks land on each one.

2. **Push back on one requirement.** When Meph drafts requirements for any app, try changing one to something weaker — replace a specific rule with "it should work correctly." Watch Meph refuse the vague form and ask you to restate it.

3. **Read a Ralph block.** Build an app and deliberately remove a piece after Meph builds it (delete the email trigger block from the source, rebuild). Watch Ralph catch the gap on the next "done" attempt. Read the reason Ralph gives. Then put the trigger back and watch it go green.

### Why this matters

The problem with "AI builds apps" is that nobody believed it until it shipped something wrong. Every demo works. Every generated UI builds. The gap shows up the first time a real user tries to do real work and finds that the Approve button goes nowhere, the audit log is missing, the email was never wired up.

**The requirements + Ralph loop makes AI builds verifiable, not just plausible.** You know exactly what was promised before the build started. You know exactly what Ralph checked after it finished. If something is wrong, there's a specific requirement with a specific gap and a specific reason — not a mystery to debug.

For Marcus, this is the difference between "our ops team uses it" and "our compliance buyer audited it." The receipt of green checkmarks is a documented contract between what you asked for and what got built.

---

## You Did It

You started Chapter 1 with `show 'Discount: 18%'`. You finished Chapter 12 with a math-proved business rule, an audit log, an AI summary, and a one-page CRO-signed PDF. Twelve chapters, one app, every primitive in the language.

The reference chapters (13 onward) are there when you need them — pick the one that answers your next question, in any order. Welcome to the other side. You're a Clear developer now.
