// SSOT for the curated frontier sources the daily digest ingests from.
//
// Two kinds, both fetchable server-side with no API key beyond what we have:
//   - "rss": any RSS/Atom feed (arXiv category feeds, lobste.rs tag feeds, …).
//            Fresh, newest-first.
//   - "hn":  Hacker News via the Algolia API (what the builder community is
//            actually rating right now — high-signal industry/tooling news).
//
// Source selection is deliberately weighted toward AGENT / LLM-ENGINEERING /
// SOFTWARE topics (cs.MA multi-agent, cs.SE software-eng, cs.CL language, HN
// agent/MCP queries) — that is what FleetCrown's own roadmap gaps are about, so
// it lifts the match rate for the self-improvement proposal loop — while still
// keeping broad AI + robotics coverage for the public digest.
//
// Adding a source = one entry here. The ingester (ingest.ts) dispatches on
// `kind`; the digest model (digest.ts) re-ranks the merged, deduped pool.

import type { FrontierCategory } from "./types";

export type FrontierSource =
  | { kind: "rss"; name: string; category: FrontierCategory; url: string; max: number }
  | {
      kind: "hn";
      name: string;
      category: FrontierCategory;
      query: string;
      minPoints: number;
      max: number;
    };

export const FRONTIER_SOURCES: FrontierSource[] = [
  // arXiv — cutting-edge research, newest first. Agent/LLM/software-eng heavy.
  {
    kind: "rss",
    name: "arXiv cs.AI",
    category: "research",
    url: "https://export.arxiv.org/rss/cs.AI",
    max: 8,
  },
  {
    kind: "rss",
    name: "arXiv cs.MA",
    category: "research",
    url: "https://export.arxiv.org/rss/cs.MA",
    max: 6,
  }, // multi-agent systems
  {
    kind: "rss",
    name: "arXiv cs.SE",
    category: "research",
    url: "https://export.arxiv.org/rss/cs.SE",
    max: 6,
  }, // software engineering
  {
    kind: "rss",
    name: "arXiv cs.CL",
    category: "ml",
    url: "https://export.arxiv.org/rss/cs.CL",
    max: 6,
  }, // language / LLMs
  {
    kind: "rss",
    name: "arXiv cs.LG",
    category: "ml",
    url: "https://export.arxiv.org/rss/cs.LG",
    max: 5,
  },
  {
    kind: "rss",
    name: "arXiv cs.RO",
    category: "robotics",
    url: "https://export.arxiv.org/rss/cs.RO",
    max: 5,
  },
  // lobste.rs — community-curated engineering signal.
  {
    kind: "rss",
    name: "Lobsters",
    category: "community",
    url: "https://lobste.rs/t/ai.rss",
    max: 8,
  },
  // Hacker News — community-rated industry/tooling signal (last ~3 days, points-gated).
  { kind: "hn", name: "Hacker News", category: "community", query: "AI", minPoints: 80, max: 8 },
  {
    kind: "hn",
    name: "Hacker News",
    category: "community",
    query: "AI agent",
    minPoints: 30,
    max: 6,
  },
  {
    kind: "hn",
    name: "Hacker News",
    category: "community",
    query: "agentic",
    minPoints: 20,
    max: 6,
  },
  { kind: "hn", name: "Hacker News", category: "community", query: "MCP", minPoints: 20, max: 5 },
  { kind: "hn", name: "Hacker News", category: "ml", query: "LLM", minPoints: 60, max: 6 },
  {
    kind: "hn",
    name: "Hacker News",
    category: "robotics",
    query: "robotics",
    minPoints: 40,
    max: 4,
  },
];

/** Look-back window for HN stories (seconds). Keeps the digest "today-ish". */
export const HN_LOOKBACK_SECONDS = 3 * 24 * 60 * 60;
