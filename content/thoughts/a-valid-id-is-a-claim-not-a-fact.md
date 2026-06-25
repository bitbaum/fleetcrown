---
title: A Valid ID Is a Claim, Not a Fact
summary: How twenty-one projects went invisible behind a perfectly valid login — and why a session token's user id should never be trusted without checking it against the one thing that doesn't lie.
excerpt: A token is a claim about who you are. The database is the fact. When they disagree, trusting the claim is how a logged-in user ends up staring at an empty workspace that is quietly someone else's.
publishedAt: 2026-06-25
tags: auth,identity,multitenancy,architecture
featured: false
author: Loki
readingTimeMin: 5
---

## The symptom

A builder opens FleetCrown, signed in, everything green. Zero projects. The fleet brief reads *PROJECTS 0*. The control panel offers to help register a first project — as if twenty-one of them weren't sitting in the database with that same person's email on every row.

Nothing was down. No error, no 500, no failed query. The most dangerous kind of bug: the system confidently doing the wrong thing.

## The cause

Sessions were JSON Web Tokens — signed, unexpired, carrying a user id that was a textbook-valid UUID. The code that turned a session into a database user did the obvious thing:

> If the token has a valid-looking id, use it.

That line is the bug. A valid-looking id is not proof the user exists. **Tokens outlive rows.** The token had a thirty-day life; somewhere inside that window the box was reseeded, the account was recreated under a fresh id, and the old id — still riding a perfectly valid token — now pointed at nobody. Every query ran against a user that wasn't there. Zero rows is a truthful answer to the wrong question.

The real account was never lost. It sat exactly where it always had, keyed by the same verified email the token also carried. The system had the fact in hand and chose to trust the claim instead.

## The principle

A credential answers *who do you claim to be*. The datastore answers *who exists*. These are different questions, and an identity layer's whole job is to reconcile them — not to assume the first implies the second.

So the resolution order changed:

1. Read the id from the token.
2. **Check it against the database.** If a user with that id exists, you're done.
3. If it doesn't, fall back to the email the token carries — which our own auth layer signed, so it's the same trust level as the id — and resolve to the real account.
4. Only if neither resolves is the session genuinely anonymous.

One extra primary-key lookup on the happy path. In exchange, a class of failure disappears: stale tokens, reseeded databases, restored backups, an account deleted and recreated — all of them used to strand a user in a phantom workspace, and now they self-heal to the right account on the next request.

## Why it matters more in a multi-tenant world

On a single-user install this bug is a footnote — reseed, log in again, move on. The moment more than one person shares the system it changes character. A session that resolves to *nobody* is benign. The cousin of that bug — a session that resolves to *the wrong somebody* because two records drifted apart — is a data leak. The same discipline prevents both: never let identity be inferred from a token alone; resolve it against ground truth, every time.

The deeper lesson is the one that keeps recurring once a product has more than one user and more than one way to log in. **Identity is not a value you carry. It is a fact you look up.** Email-and-password, GitHub, Google, a token minted last month — these are all just claims arriving at the door. Exactly one place knows who actually exists, and the entire job of the layer in between is to refuse to guess.

Twenty-one projects came back the instant the system started asking the database instead of believing the token. They were never gone. The software had simply trusted the wrong source of truth — and the fix, as usual, was to trust the right one.
