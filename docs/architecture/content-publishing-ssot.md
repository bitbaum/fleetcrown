# Content publishing SSOT — studio blogs and Thoughts

**created_date:** 2026-08-20  
**last_modified_date:** 2026-08-20  
**last_modified_summary:** Pointed implementation at packages/bip; BiP programme doc; phase C = AOZ file dep.

---

## Problem

Studio products each reinvent "markdown posts on the public site":

| Product | Content home | Renderer |
|---------|--------------|----------|
| FleetCrown | `content/thoughts/*.md` | Homegrown `parseThoughtBlocks` + React blocks |
| OrangeCat | `content/blog/*.mdx` | MDX pipeline |
| AOZ Wohnen | `docs/blog/*.md` | `marked` GFM → HTML |
| botsmann / evig / aslan / datacat | various `content/` or `app/blog` | Local copies |

That duplication is fine for **voice and domain copy**. It is expensive for **media affordances, theme tokens, frontmatter shape, and security** (embed allowlists, SVG inlining, remote images). Thoughts stayed text-only while the parser already had half the media path; public marketing forced `.dark` while the app shell honored `THEME_OPTIONS`. That is SSOT drift, not taste.

## Decision (now)

1. **FleetCrown Thoughts dogfoods the essay UX**; implementation lives in **`packages/bip`** (`parseContentBlocks`, video allowlist, roadmap/changelog types).
2. **Second studio consumer before public npm** — AOZ depends on the package via `file:`; then extract OSS `bip-kit`.
3. **Theme SSOT is already `THEME_OPTIONS` + `ThemeProvider` + CSS tokens.** Public surfaces must not pin `.dark`.

Programme overview: [building-in-public-ssot.md](./building-in-public-ssot.md).

## Contract (Thoughts block types)

Authors write ordinary markdown. The parser emits:

- Headings, lists, blockquotes, paragraphs (inline bold/italic/code/links)
- Fenced code (including ` ```mermaid ` → client Mermaid)
- GFM tables (`| col |` + separator row)
- Images: `![alt](/thoughts/….svg|png)` — local SVG inlined for token colors; raster via `next/image`
- Embeds: a **lone** YouTube or Vimeo URL on its own line → iframe (allowlist only)

Style voice remains `docs/thoughts-style-guide.md`. Media is required when a claim is structural (tables for comparisons, Mermaid for seams, diagrams for topology). Plain walls of text are a style failure, not a default.

## Phased centralization

| Phase | Work | Done when |
|-------|------|-----------|
| **A — FleetCrown dogfood** | Tables, embeds, theme toggle on public nav, Mermaid follows theme | Live essays use media; public theme matches app |
| **B — Document contract** | content-publishing + building-in-public SSOT docs | Agents write media without inventing syntax |
| **C — Second consumer** | AOZ imports `@fleetcrown/bip` (file dep) | Package used outside FleetCrown |
| **D — OSS extract** | Public `bip-kit` repo (core + Next template) | Stars / external adopters path |

Prefer **C before D**.

## What not to centralize

- Product voice and frontmatter fields that differ by brand (`author`, `featured`, OC MDX components).
- CMS / DB-backed posts (if any app grows an editor) — stay local until the file-based contract is boring.
- Site chrome and marketing layout — tokens yes; layout no.

## Related

- [building-in-public-ssot.md](./building-in-public-ssot.md) — triad + company vs UGC + OSS funnel
- `docs/thoughts-style-guide.md` — voice + media authoring
- `packages/bip/` — shared parser + types
- `src/lib/thoughts-content.ts` — Thoughts FS loader (uses bip)
- `src/components/thoughts/*` — Mermaid, video embed UI
- `src/components/shell/ThemeToggle.tsx` — `THEME_OPTIONS`
