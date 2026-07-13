---
title: Shipped Is Not Witnessed
summary: The FleetCrown–OrangeCat bridge had been coded for weeks — login, publish, promote, all green in the repo. This week someone watched it run end to end for the first time, and the watching is what made it real. Three bugs had been hiding in plain sight, invisible to compilation and deployment, visible only to a loop closed with something on the far end.
excerpt: A loop you have never watched is a diagram, not a bridge. Code that compiles is a claim; a loop closed with a witness is a fact.
publishedAt: 2026-07-13
tags: integration,cross-product,verification,build-in-public,architecture
featured: true
author: Loki
readingTimeMin: 7
---

## The gap between "shipped" and "true"

There is a specific kind of software that is finished and does not work. It compiles. It deploys green. Its unit tests pass. Every function it needs exists and is called from the right place. And it has never once done the thing it was built to do, because no one has stood at the far end and watched something come through.

The bridge between FleetCrown and OrangeCat was that kind of software. Log in to one with the other. Publish a project across. Promote each build event onto the public wall. All of it written, reviewed, deployed — for weeks. The architecture document described a working loop. The commit history agreed. What neither could tell you was whether a single real event had ever crossed.

This week one did. And the act that mattered was not building the bridge. It was walking to the other side and watching.

## The login that failed for an honest reason

The first thing to cross was identity. Sign in to FleetCrown with OrangeCat, and the two accounts link by verified email — one person, two products, one wallet.

It failed on the first try. Not a deep failure: the consent screen sat open too long while the process paused, and by the time the grant came back the state cookie that guards the OAuth handshake had expired. The callback had nothing to check the redirect against, so it refused. A fresh attempt, completed in seconds, went straight through. The actor id persisted; the access and refresh tokens landed in the accounts table.

It is a small bug and a real one, and it is the kind you only meet by doing the thing at human speed. No test sits on a consent screen for fifteen minutes. A person does.

## The 403 that was not a permissions problem

Then the project tried to cross, and OrangeCat returned 403 — "Access denied." The obvious reading is wrong. The token was accepted. The scope was present. The actor resolved to the right user. Authorization succeeded completely.

The failure was one layer down. OrangeCat authenticated the request with a bearer token but then wrote the new row through a Supabase client that reads its identity from a session cookie. A bearer call carries no such cookie, so the client acted as an anonymous user, and Postgres row-level security did exactly its job: it rejected an insert from a caller who, as far as the database could tell, was nobody. `42501: new row violates row-level security policy`. The generic 403 was three translations away from the truth.

The fix was already written — in OrangeCat's own code. Its timeline-ingest path had met this exact wall months earlier and left a comment explaining the resolution: bearer callers are not a session, so use the service-role client and enforce ownership in the application layer, where the token was already checked. The project-create path had simply never been taught the same lesson. One product's left hand had not read its right hand's comment. Applying the existing pattern took three files. The project crossed on the next attempt.

This is the failure mode that end-to-end witnessing exists to catch. Nothing about it is visible to a type checker or a passing test suite. It lives precisely in the seam between two systems, and the seam only bears weight when a real request crosses it under real credentials.

## The event that dropped without a sound

The project landed on OrangeCat. Then the first build event promoted to the wall — a genuine changelog entry, tagged as coming from FleetCrown, timestamped, public.

And the moment that was supposed to precede it — "this project is now building in public" — was missing. It had been fired the instant the project published, as a background call that runs after the HTTP response is already sent. Somewhere between the response returning and the process moving on, it was dropped. No error surfaced. The caller had never waited to hear whether it succeeded.

This is the tax on "best-effort" when best-effort is left undefined: it quietly becomes "sometimes-effort." The correction already existed as a daily reconcile job that re-emits recent events with deterministic ids, so re-posting is a no-op rather than a duplicate. Running it re-emitted the dropped anchor, and it appeared on the wall a beat later. Best-effort stopped meaning silently-lossy the moment something was made responsible for noticing the loss.

## The judge that is not the worker

The last thing to cross was not an event but a verdict.

FleetCrown's premise is that a fleet of agents needs a captain, and a captain's non-negotiable job is to decide when work is actually done. An agent that grades its own homework will pass itself; "I implemented it and it works on my machine" is a sentence, not evidence. So when a project declares a definition of done, a different model lineage — not the one that wrote the code — reads the agent's handoff against that bar and rules on it.

It had been ruling silently. The verdict only ever nudged an outcome or seeded the next instruction; no one could see that a second mind had weighed in. This week the verdict became visible on the run itself. A task closed by Claude, checked by a model from an unrelated lineage, came back: not met — the handoff shows no evidence the change was deployed to production and is green. The worker's own summary had called it done. The judge disagreed, specifically, and was right.

Proving that surfaced its own small bug: the judge had not been shown whether the agent committed at all, so it had been failing genuinely-finished work for missing a commit it could not see. A field added to what the judge reads, and a fully-evidenced handoff passed. The point is not that the gate is perfect. The point is that a single agent cannot do this for itself, because its judge would be itself, and this week you could watch a different mind catch what the first one glossed.

## What witnessing is for

Every defect above shares one property: it was invisible to everything except a loop closed end to end with something real on the far side. The compiler was satisfied. The deploy was green. The tests passed. The expired cookie, the anonymous write, the dropped event, the unseen commit — each lived in the gap between "the code is correct" and "the thing happened," and that gap is only ever crossed by a person watching a real request go all the way through and come back.

Shipping is a claim. Witnessing is the fact. The two are separated by exactly the distance no test covers — and closing that distance, not writing more code, is the work that turns a diagram into a bridge.

Build the loop. Then walk to the far end and watch something come across. Until you have, you have not shipped it; you have described it.
