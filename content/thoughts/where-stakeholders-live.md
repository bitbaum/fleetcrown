---
title: Where Stakeholders Live
subtitle: A stakeholder map for every project — eight relationship types, two products, one clean split between the graph and the actions on it.
publishedAt: 2026-06-01
---

# Where Stakeholders Live

Every project a builder runs has the same eight surrounding relationships:

- **Competitors** — projects that solve the same problem.
- **Potential collaborators** — projects, groups, or people who could amplify the work.
- **Potential investors** — actors who could fund it.
- **Potential customers** — actors who could pay for the output.
- **Potential employees** — actors who could come in to help build it.
- **Potential acquirers** — actors or groups who might one day buy it.
- **Potential acquisition targets** — projects that could fold into this one.
- **Potential in-house development projects** — adjacent projects worth building inside this one's umbrella.

Most builders track none of these systematically. The lucky ones track two or three in mismatched tools — a CRM for customers, a notes app for competitors, a spreadsheet for investors, a kanban for in-house ideas. The graph between them is held in the founder's head, where it decays.

This is a place where the architecture matters. Where this lives determines whether it ever scales beyond one builder's memory.

## The Eight Are All Edges, Not Entities

Look at the list again. Each entry is a **relationship between two things that already have entity representations** in OrangeCat:

| Relationship | Entity A | Entity B |
| ------------ | -------- | -------- |
| competitor of | project | project |
| potential collaborator of | project | actor / group / project |
| potential investor of | actor / group | project |
| potential customer of | actor / group | product / service |
| potential employee of | actor | project / group |
| potential acquirer of | actor / group | project |
| potential acquisition target of | project | project |
| potential in-house dev project of | project | project (parent) |

OrangeCat already has thirteen entity types: projects, products, services, causes, ai_assistants, groups, assets, loans, investments, events, research, wishlists, documents. All the nodes exist. What's missing is the edge layer — typed relationships between any two nodes — and a UI that surfaces them per project.

This is a much lighter lift than adding new entity types. It's an annotation layer over the graph that already exists.

## Why It Doesn't Belong Only In FleetCrown

FleetCrown's strength is operations: agent fleets per project, the autonomy ladder, the Watch surfacing one focus item, the approval queue for proposed actions. FleetCrown is where work happens.

FleetCrown currently has `/projects` and tracks contacts inside the private zone. To store the stakeholder graph natively in FleetCrown means inventing tables for entity types FleetCrown doesn't need otherwise — investments, groups, products, services. That duplicates OrangeCat's entity model with worse abstractions. The result is two graphs that need a sync layer to stay coherent. Two graphs are always wrong.

So: don't store stakeholders in FleetCrown.

## Why It Doesn't Belong Only In OrangeCat Either

OrangeCat's strength is the entity-relationship substrate and the economic settlement layer. The Cat is good at orchestrating actions inside OrangeCat's domain — creating listings, proposing loans, executing governance. The Cat is not where a builder lives day-to-day to direct project work.

A builder thinking "what's my competitive landscape this week" does not naturally open a marketplace. They open their work surface. That's FleetCrown.

So: don't surface stakeholders only in OrangeCat.

## The Clean Split

**Storage: OrangeCat.** Stakeholder relationships are edges in OrangeCat's entity graph. One typed-edge schema covers all eight categories (and any others a builder adds later). The actor system already handles pseudonymous identity for any non-founder party. No new database tables — just a relationships table with `from_entity`, `to_entity`, `kind`, and metadata.

**Operations: FleetCrown.** FleetCrown's `/projects` reads the OrangeCat graph for the current builder's projects and renders the eight stakeholder lanes per project. The Watch on `/today` surfaces signals derived from the graph — competitor shipped, investor opened the deck, prospective customer hit the demo page, in-house adjacent project just stalled. The agent proposes actions against specific stakeholders, the user approves or disapproves.

**Bridge: the identity bridge already on both roadmaps.** A FleetCrown user OAuth-paired with their OrangeCat actor reads and writes the graph through that bridge. No new bridge.

This is the concrete first instance of the convergence argued for in *From Two AIs to One*. Same data, two surfaces. The user perceives one agent watching their stakeholder landscape — they don't perceive "the graph is in OrangeCat and the alerts are in FleetCrown."

## Don't Ship Eight At Once. Ship Competitors First.

Eight relationship types is the destination, not the starting point. The first cut should be one — and the one to pick is **competitors**.

Competitors are the most automatable of the eight:

- A competitor entity is a URL plus metadata. Easy to register.
- Their public surface is monitorable — landing-page diffs, RSS feeds for blog or changelog, funding-event detection, hiring-page diffs.
- The signal is high-density and time-sensitive. A competitor shipping new pricing or a flagship feature is something a builder wants to know about within hours, not weeks.
- The action loop is concrete. The Watch fires "Competitor X just shipped Y — here is the diff. Brief Ivy on this?" The user approves, the agent drafts a response (a pricing tweak, a positioning post, a feature pull-forward). The user approves or disapproves.

The other seven follow with the same primitives but different polling shapes and different signal types. Investors are slower-moving and require human-in-the-loop more heavily. Customers blur into CRM territory. Acquirers are mostly silent until they aren't. Each gets its own iteration. The platform code is shared — typed edges, per-stakeholder watchers, action proposals into the approval queue.

## What This Unblocks

A builder running FleetCrown and OrangeCat in tandem, with the identity bridge live and the stakeholder graph populated, gets a different daily experience than the one most builders have today.

They open FleetCrown. The Watch greets them with "Three things this morning: your nearest competitor just shipped a competing feature; the investor you pitched two weeks ago just opened your deck again; one of your stalled in-house projects has a milestone Ivy thinks is worth finishing this week. Brief Ivy on which one to take first?"

That is not a CRM. It is not a competitive-intelligence tool. It is not a fundraising dashboard. It is **the same approval-queue interaction model**, pointed at the relationships around the project, with the graph living in the platform that was built for graphs and the agent operations living in the platform that was built for agents.

The flower's roots reach into a substrate built to hold them.

---

*This piece operationalises the convergence argued in "From Two AIs to One." The stakeholder graph is the first concrete cross-product use case — the same data viewed through two surfaces, with the agent reasoning across both. Ship competitors first; the other seven categories follow with the same primitives and a different polling shape.*
