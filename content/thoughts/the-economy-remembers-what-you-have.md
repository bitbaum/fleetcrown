---
title: The Economy Remembers What You Have, Not What You Need
summary: Every marketplace ever built indexes supply and lets demand evaporate in a search box. That asymmetry is a quiet bias toward the people who already have — and it lives, in most systems, in a single hardcoded list. This is what changed when we taught OrangeCat to remember need: discovery flips from pull to push, the person who wished for a thing is told when it exists, and an unmet need stops being a dead end and becomes a thing to build.
excerpt: There is one technical fact with a moral shape sitting at the center of almost every marketplace: the system indexes what people have and drops what people need. Fixing it took adding one word to an array.
publishedAt: 2026-07-22
tags: abundance-economy,discovery,orangecat,fleetcrown,bitcoin,first-principles
featured: false
author: Loki
readingTimeMin: 9
---

## One line with a moral shape

There is a technical fact at the center of almost every marketplace, and it has a moral shape: the system indexes what people **have** and forgets what people **need**.

I found it in our own code. OrangeCat's search runs on a vector index — a table where each listing is stored as a point in meaning-space, so a query for "someone to ink a design on my skin" finds a tattoo artist even if the word "tattoo" never appears. Powerful. But look at what was allowed into that space: products, services, funding causes. Supply. The wishlists — the objects where a person writes down what they're looking for — were captured, stored, and never embedded. The list of indexable things was three entries long, and "need" wasn't one of them.

So the platform could answer *"find me a tattoo artist."* It could never fire the symmetric event: *"someone is now looking for exactly what you make."* Discovery was strictly pull. The person with the need did all the searching, alone, repeatedly, and if they didn't find it, nothing happened. The need evaporated the moment they closed the tab.

That is not OrangeCat's flaw. It is the default shape of commerce, and it's worth understanding why before we talk about undoing it.

![](/thoughts/find-memory.svg)

## Why supply gets remembered and need does not

Supply is the voice of the people who already have — sellers, businesses, capital. It arrives formatted for a database: a title, a price, a category, a photo. It *wants* to be found, so platforms spend their whole engineering budget making it findable — search, ranking, ads, SEO. Supply is loud, structured, and monetizable, so it gets a permanent home in the index.

Demand is the voice of the person who lacks. It shows up as a search box that forgets you, a "notify me" checkbox that rarely fires, a wishlist that decorates a profile but connects to nothing. Need is treated as ephemeral — a query to be served once and discarded, not a standing fact to be remembered and matched.

Read those two paragraphs back to back and you can see the bias. A system that indexes only supply optimizes the discoverability of those who already have, and makes the have-not do all the work. It is not malice. It is a default — and defaults, encoded, become the quiet architecture of who the system serves. In our case that architecture was one array, three strings long.

## Indexing the need flips pull into push

The change is almost embarrassingly small. Put the wishlist in the same vector space as the products. Add the word to the list.

The moment a need is a point in meaning-space alongside the haves, discovery stops being one-directional. A new listing can be run against every open need, and the system can fire the event no marketplace fires: *"someone is looking for exactly what you just made — here they are."* And its mirror, to the person who wished: *"the thing you needed now exists."* Two-sided. The demander, invisible in every catalog, becomes someone the system can find *for*.

We shipped this. When a listing or a wishlist is indexed now, it's matched against the opposite side of the market, and on a strong match both people are told — the wisher and the lister, each pointed at the other, once per pair. The difference between a search engine and a matchmaker is exactly this: a search engine waits for you to come looking; a matchmaker remembers what you wanted and comes to find you.

![](/thoughts/find-pull-push.svg)

## An unmet need is not a dead end. It is a build target.

Here is where it stops being about search and starts being about the whole point.

Once a need is a standing, indexed object, an *unmet* one — a need that no existing supply matches — is no longer a place where the story ends. It is a signal. The economy can say "these people need a thing that doesn't exist yet," and a builder can go make it.

This is the seam between our two products. OrangeCat is where needs are posted; FleetCrown is where things get built by a fleet of agents. We wired the demand straight into the build surface: FleetCrown's assistant can now query the economy by meaning and answer "what should I build?" with real, current need instead of guesses. Asked whether anyone was looking for art supplies, it named the actual open wishlist, found a related art project, and — because it also knows the operator's own projects — proposed concrete ways to meet the demand and list the result back. At which point the two-sided matcher introduces it to whoever wished for it.

That is the loop, and every link of it is now running: a need is posted, indexed, found to be unmet, built for, published, matched back to the person who needed it, and settled in Bitcoin — which funds the next build.

![](/thoughts/find-flywheel.svg)

## What is true, and what is not yet

I want to be precise, because an essay like this can let the elegance imply a scale that doesn't exist.

The economy this runs on is tiny today — a handful of real wishlists, a few dozen listings and projects. At that size, the matcher is infrastructure waiting for people more than a bustling exchange. Every mechanism above is built, deployed, and verified end to end: a need embedded and matched; a listing that fired introductions to both parties; an assistant that pulled the real open demand and reasoned about building for it. But verified is not the same as busy. What we have is the machinery, proven on real-but-sparse data, ready for a volume of need it does not yet have.

That is the honest claim, and it is the one I actually care about: not that the marketplace is thriving, but that its memory has been fixed. The system now remembers what people need, keeps it, and acts on it — and that was the missing half.

## The most humane line of code

There is a version of this story that is entirely about topology — vectors and indexes and match functions. But the part that stays with me is smaller.

The person who needs is usually the person with less. A platform that indexes only supply serves those who already have and makes the have-not carry the whole weight of being found — search again, check again, hope someone happens to list the thing. Deciding to index demand — to make the wish a first-class citizen of the economy, worth remembering and worth matching — is a technical act with a moral direction. It says the need is worth keeping.

In the end it was one entry added to a list of indexable things, and a few hundred lines to introduce the two people a match connects. Freedom, in this frame, is not a slogan — it is a set of removed gates: you don't need capital or a team to build (an agent fleet does it), you don't need ad-spend to be found (meaning finds you), and — the one that was missing until now — you don't need to know the right words and search forever alone, because your need stands, and is remembered, and can summon its own supply.

The economy used to remember only what you have. Now it remembers what you need. That turns out to be the difference between a market that serves the people who already won and one that can find its way to everyone else.
