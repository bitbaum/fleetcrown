# Building in Public kit — studio SSOT

**created_date:** 2026-08-20  
**last_modified_date:** 2026-08-21  
**last_modified_summary:** bip-kit published (npm + public GitHub); FleetCrown consumes `bip-kit`; AOZ second consumer; local packages/bip superseded.

---

## Thesis

Every public product in the studio ships **three surfaces**:

| Surface | Job | Audience |
|---------|-----|----------|
| **Blog / Thoughts** | Why and how (essays, evidence, diagrams) | Builders, users, search |
| **Roadmap** | Where we are going (honest not-yet) | Same |
| **Changelog / Releases** | What shipped (user-facing, dated) | Same |

That triad is **building in public**. Quality must be tremendous: theme SSOT, media when structure demands it, no claims that contradict the code.

The reusable kit is **[`bip-kit`](https://github.com/maonakamoto/bip-kit)** on npm — parser + types. Bring your own design system. Dogfood: FleetCrown Thoughts (flagship), AOZ Wohnen (second consumer).

## Company voice vs user publishing

| | Company / product BiP | Blog as a feature (UGC) |
|--|----------------------|-------------------------|
| **Who** | Studio / product owner | Actors / end users |
| **Where** | Product domain (`/thoughts`, `/blog`, …) | **OrangeCat** only |
| **FleetCrown** | Thoughts + Roadmap + Releases | **Never** a user Medium |
| **Trust** | Official shipping truth | Social reputation |

## Content contract

Long-form markdown uses blocks from `bip-kit` (`parseContentBlocks`): headings, lists, quotes, paragraphs, GFM tables, Mermaid fences, images, allowlisted YouTube/Vimeo embeds.

Roadmap and changelog are structured data (`RoadmapDoc`, `ChangelogEntry` in the package).

## Status

| Phase | Work | Status |
|-------|------|--------|
| **1a** | FleetCrown Thoughts media + public theme | Done |
| **1b** | Document triad + company/UGC | Done |
| **1c** | Extract + publish `bip-kit`; FC depends on npm | Done |
| **1d** | Second studio consumer (AOZ) on `bip-kit` | In progress |
| **2** | Public GitHub + npm | Done — https://github.com/maonakamoto/bip-kit |

## Funnel

Studio sites look excellent → `bip-kit` stars/PRs → hosted upgrade via OrangeCat site factory / FleetCrown.

## Related

- [content-publishing-ssot.md](./content-publishing-ssot.md)
- `docs/thoughts-style-guide.md`
- npm: `bip-kit`
- FC: `src/lib/thoughts-content.ts` (re-exports), `scripts/test/bip-seam.ts`
