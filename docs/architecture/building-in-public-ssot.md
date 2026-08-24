# Building in Public kit — studio SSOT

**created_date:** 2026-08-20  
**last_modified_date:** 2026-08-20  
**last_modified_summary:** Freeze triad (blog · roadmap · changelog), company vs UGC split, dogfood→OSS path for bip-kit.

---

## Thesis

Every public product in the studio ships **three surfaces**:

| Surface | Job | Audience |
|---------|-----|----------|
| **Blog / Thoughts** | Why and how (essays, evidence, diagrams) | Builders, users, search |
| **Roadmap** | Where we are going (honest not-yet) | Same |
| **Changelog / Releases** | What shipped (user-facing, dated) | Same |

That triad is **building in public**. Quality must be tremendous: theme SSOT, media when structure demands it, no claims that contradict the code.

A reusable **BiP kit** (parser + types + Next route stubs) is how we stop reinventing five blog stacks — and how we later earn GitHub stars from other builders. Dogfood first; open source second.

## Company voice vs user publishing

| | Company / product BiP | Blog as a feature (UGC) |
|--|----------------------|-------------------------|
| **Who** | Studio / product owner | Actors / end users |
| **Where** | Product domain (`fleetcrown.ch/thoughts`, `aoz-wohnen…/blog`, …) | **OrangeCat** only |
| **FleetCrown** | Thoughts + Roadmap + Releases | **Never** a user Medium |
| **Trust** | Official shipping truth | Social reputation |

Do not merge these trust models. OrangeCat may host both an **OrangeCat Blog** (studio) and **actor writing** (feature); label them clearly.

## Content contract (shared)

Long-form markdown uses the block set defined in [content-publishing-ssot.md](./content-publishing-ssot.md) and implemented in `packages/bip`:

- Headings, lists, quotes, paragraphs (inline markdown)
- GFM tables, Mermaid fences, images, allowlisted video embeds

Roadmap and changelog are **structured data** (TS modules or markdown with fixed shape) — not free-form CMS soup. See package types: `RoadmapDoc`, `ChangelogEntry`.

## Phased delivery (this programme)

| Phase | Work | Status |
|-------|------|--------|
| **1a** | FleetCrown Thoughts media + public theme | Done |
| **1b** | Document triad + company/UGC split (this file) | Done |
| **1c** | `@fleetcrown/bip` workspace package; FC imports it | Done |
| **1d** | Second studio consumer (AOZ) depends on the package | Done |
| **2** | Public `bip-kit` repo (MIT): core + Next template stubs | Scaffold at `/home/g/dev/bip-kit` — push when ready |

Do not npm-publish until two in-studio consumers stay green (they do). Pushing the GitHub repo is the remaining distribution step.

## Funnel (why OSS later)

1. Studio sites look excellent → proof.
2. `bip-kit` on GitHub → stars, PRs, “used by”.
3. Hosted upgrade path → OrangeCat site factory / FleetCrown project — kit is the wedge, not a second company.

## Related

- [content-publishing-ssot.md](./content-publishing-ssot.md) — essay renderer contract
- `docs/thoughts-style-guide.md` — FleetCrown voice
- `packages/bip/` — implementation
- `/home/g/dev/bip-kit` — OSS scaffold (phase 2)
