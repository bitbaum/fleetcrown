---
title: The Visitor Is Part of the Fleet Now
summary: FleetCrown's feedback widget turns a stranger's complaint into a deployed fix — one script tag on any of your sites, a per-project inbox, one-click dispatch to an agent, and a loop that closes itself: when the fix ships, the report resolves automatically and the visitor gets an email. This is the full tour of the shipped product, with real screenshots — the widget on a live customer site, the inbox holding real accessibility findings, the remote kill switch, and the daily digester that clusters noise into one approvable draft.
excerpt: Feedback tools collect. A fleet executes. The difference is whether a complaint ends in a dashboard — or in a deploy.
publishedAt: 2026-07-29
tags: feedback,widget,agents,pipeline,approvals,product
featured: true
author: Loki
readingTimeMin: 10
---

## A complaint that ended in a deploy

Recently, a report landed in FleetCrown's own feedback inbox: the footer links on our public pages — Pricing, Docs, GitHub — were rendering at a contrast ratio of 1.78:1 against the near-black background. WCAG requires 4.5:1. The text was, measurably, near-illegible.

Nobody wrote a ticket. Nobody copied the complaint into an issue tracker, triaged it in a meeting, or assigned it a sprint. The report was dispatched to an agent with one click. The agent reproduced the measurement against the live page, wrote a three-line CSS fix, verified the new ratio at 6.45:1, and opened a pull request. When the fix deployed, the report flipped itself to *resolved*.

That loop — stranger's observation in, deployed fix out, reporter notified — is now a FleetCrown product. This is what it looks like and why it exists.

## One script tag on any site you run

The widget is a single script tag. You enable it on a project's page in FleetCrown, copy the snippet — or press "Install via agent" and an agent adds it to your repo for you — and every public page of that site gets a small feedback button.

```html
<script src="https://fleetcrown.orangecat.ch/widget.js"
        data-fc-project="fcw_…" async></script>
```

Here it is running on a real customer site — not a demo, the live shop of our first customer:

![The widget open on a live customer site — the visitor picks a scope, points at an element, and submits.](/thoughts/feedback-widget-visitor.png)

The visitor picks what they're talking about: a specific element (they click it, and the widget records the CSS selector and visible text), the current page, or the whole site. That scope selection matters more than it looks — "the button is broken" is a support ticket, but "this `<button>` with this selector on this URL is broken" is a work order an agent can act on without a human translating it first.

The widget renders in a Shadow DOM so the host site's styles can't break it and it can't break the host site. The token in the snippet is public by design and write-only: it can create feedback, never read anything.

## The snippet is a pointer, not the product

The most important architectural decision is invisible in the snippet: the embed carries no behavior. On every page load the widget asks the server whether it should render at all, and that call doubles as a heartbeat.

This buys three things. First, an honest status: the project page shows *Live on your-site.com · last seen today* only when the boot call has actually arrived from the site — installed-but-never-loaded shows as *waiting*, because intent is not truth. Second, a kill switch: press Pause and the widget disappears from the customer site within thirty seconds, with zero deploys on their side — the snippet stays in their HTML, pointing at a server that now says no. Third, upgrades ship centrally: the customer's site always loads the current widget.

![The widget setup card: live status from the heartbeat, the snippet, and the full control row — install or remove via agent, pause, rotate, disable.](/thoughts/feedback-setup-card.png)

On and off are both one click. "Install via agent" dispatches an agent into the project's own repository with the exact snippet and an idempotency guard — if the embed already exists, it verifies instead of duplicating. "Remove via agent" is the symmetric operation: find every trace, remove it, prove with grep that nothing remains. And if you just want it gone *now*, Pause does that without touching the repo at all.

## An inbox where every row is a work order

Submissions land in a per-project inbox on the project's page. There is deliberately no separate feedback app, no second store — the fleet view on Control is a query over the same rows, showing which projects have new reports.

![Real rows from FleetCrown's own inbox: a synthesized brief and two AI-reviewer findings, all resolved after their fixes deployed.](/thoughts/feedback-inbox.png)

The one action that matters sits on every row: **Dispatch fix**. It composes a scoped prompt from the report — the visitor's text, the URL, the selectors they pointed at — and sends an agent at it. If you want to steer, there is a pencil icon: the note you type is prepended to the prompt as an operator instruction. That is the whole commenting system. We deliberately did not build comment threads on feedback — a note that becomes part of the dispatch is useful; a discussion under a complaint is a place where work goes to die.

The same inbox accepts non-human reporters. "AI review" dispatches an agent to open any page of your site in a headless browser at desktop and mobile widths and file what it finds — through the same public API, into the same triage flow, with the same human gate before anything gets fixed. The contrast findings in the screenshot above came from exactly that: an agent measuring rendered pixels and filing numbers, not opinions.

## When volume arrives: synthesize, digest, approve

Ten reports about the same broken flow should not become ten agent runs. Two mechanisms shift the unit of work from *item* to *theme*.

**Synthesize** is manual: when a project has five or more new items, one button dispatches an agent to read them all and file structured briefs back into the same inbox — theme, evidence, proposed change, where. You triage the brief instead of the pile.

**The digester** is the automated version: a daily job looks at every busy inbox, clusters the new items into themes, and files each theme as a *draft* action on the Approvals page — the exact agent prompt included, so you review precisely what would run.

![From a visitor's browser to a deployed fix and back — with exactly one human gate in the middle.](/thoughts/feedback-loop.svg)

The iron rule holds the whole thing together: **visitor text never reaches an agent without a human click.** Feedback is untrusted input from strangers on the internet — some of it will eventually be crafted for the agent reading it, not the human. So the approval gate is not a courtesy; it is the security boundary. Nothing in this pipeline auto-executes. The digester proposes; you dispose.

## The loop closes itself

Here is the part that makes it a loop instead of a funnel. Every dispatched report remembers which run is carrying it. When that run finishes with a verified success, the system resolves the report automatically — and if the visitor left an email address, they get one line back: *your feedback on this site shipped.*

That last email is, I think, the most underrated feature in the whole pipeline. Every feedback form on the internet says "we appreciate your input" and then goes silent; the visitor learns that reporting things is shouting into a void, and stops. A reporter who gets told *your specific complaint is fixed, go look* learns the opposite lesson. The people who care enough to report are the closest thing a small product has to a QA team — the email is how you keep them.

The theme path works the same way end to end. The contrast story from the opening actually ran through the full automated pipeline: the digester clustered three independent contrast reports into one theme, the draft appeared on Approvals, one click approved it, the agent audited the live page, fixed the two remaining offenders, opened a PR — and when it deployed, every report in the cluster resolved itself.

![Control shows the fleet-wide lens: which projects have new feedback, next to the dispatch surface where the work actually happens.](/thoughts/feedback-fleet-strip.png)

## Who this is for

FleetCrown is built for builders running several small products at once — the person with four sites, no QA team, no support team, and no appetite for a feedback SaaS whose output is a dashboard someone must remember to read. For that person the economics of feedback are brutal: every report costs a context switch into a project you weren't thinking about, so most reports cost more than they return, so most go unread.

The pipeline changes that arithmetic. A report arrives already attached to its project, already carrying the selector and URL an agent needs, already one click from becoming a run in the right repository. The marginal cost of acting on feedback drops to approximately the cost of reading it once and clicking. That is the actual product — not the widget, which is a commodity, but the distance from *submitted* to *deployed*.

It also inverts who feedback tools serve. Conventional tools serve the team: collect, organize, prioritize — then the team still does the work. This serves the work: the fleet does the fixing, and the human spends their attention only where it is irreplaceable — deciding what *should* be fixed.

## What it deliberately does not do

Honesty section, because every pipeline description reads like magic until you list the edges. Nothing executes without approval — that is a feature, but it means an unattended inbox stays unattended. The digester runs daily, not in real time; a flood of reports about an outage is the wrong tool's job. An agent can misjudge a fix like any engineer — the run's evidence and the PR are there to be checked, and the approval gate exists precisely because judgment doesn't automate. And reports from strangers include noise; the origin allowlist, rate limits, and token revocation keep the pipe clean, but triage is still a human verb.

The widget is live today on FleetCrown's own public pages and on our first customer's site — the same loop, dogfooded and sold. If you run more than one site, this is what "collecting feedback" should have meant all along: not an inbox, an operating loop.
