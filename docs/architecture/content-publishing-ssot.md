# Content publishing SSOT — studio blogs and Thoughts

**created_date:** 2026-08-20  
**last_modified_date:** 2026-08-21  
**last_modified_summary:** Implementation SSOT is npm `bip-kit`; FleetCrown dogfoods; AOZ second consumer; local packages/bip retired.

---

## Problem

Studio products each reinvented "markdown posts on the public site." That duplication is fine for voice; it is expensive for media affordances, theme tokens, frontmatter shape, and embed security.

## Decision

1. **`bip-kit` (npm)** is the shared parser + types: `parseContentBlocks`, video allowlist, roadmap/changelog shapes.
2. **FleetCrown Thoughts** dogfoods the essay UX (React renderers, Mermaid, theme-aware public chrome).
3. **Theme SSOT** is `THEME_OPTIONS` + `ThemeProvider` + CSS tokens. Public surfaces must not pin `.dark`.

Programme: [building-in-public-ssot.md](./building-in-public-ssot.md).

## Contract (block types)

Authors write ordinary markdown. The parser emits:

- Headings, lists, blockquotes, paragraphs (inline bold/italic/code/links)
- Fenced code (including Mermaid → client Mermaid in FC)
- GFM tables
- Images
- Embeds: lone YouTube or Vimeo URL on its own line

Style voice: `docs/thoughts-style-guide.md`.

## Phased centralization

| Phase | Work | Done when |
|-------|------|-----------|
| **A** | FleetCrown media + public theme | Done |
| **B** | Docs | Done |
| **C** | Second consumer (AOZ) on `bip-kit` | AOZ package.json + tests |
| **D** | OSS | Done — github.com/catomean/bip-kit |

## What not to centralize

- Product voice and brand-specific frontmatter
- CMS / DB-backed UGC (OrangeCat feature blogs)
- Site chrome — tokens yes; layout no

## Related

- [building-in-public-ssot.md](./building-in-public-ssot.md)
- `bip-kit` on npm
- `src/lib/thoughts-content.ts` — Thoughts FS loader
- `src/components/thoughts/*` — Mermaid, video embed UI
- `src/components/shell/ThemeToggle.tsx` — `THEME_OPTIONS`
