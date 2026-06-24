// SSOT for the curated frontier sources the daily digest ingests from.
//
// Two kinds, both fetchable server-side with no API key beyond what we have:
//   - "arxiv": arXiv category RSS (fresh research, newest-first)
//   - "hn":    Hacker News via the Algolia API (what the builder community is
//              actually rating right now — high-signal industry/tooling news)
//
// Adding a source = one entry here. The ingester (ingest.ts) dispatches on
// `kind`; the digest model (digest.ts) re-ranks the merged, deduped pool.

import type { FrontierCategory } from "./types";

export type FrontierSource =
  | { kind: "arxiv"; name: string; category: FrontierCategory; url: string; max: number }
  | { kind: "hn"; name: string; category: FrontierCategory; query: string; minPoints: number; max: number };

export const FRONTIER_SOURCES: FrontierSource[] = [
  // arXiv — cutting-edge research, newest first.
  { kind: "arxiv", name: "arXiv cs.AI", category: "research", url: "https://export.arxiv.org/rss/cs.AI", max: 10 },
  { kind: "arxiv", name: "arXiv cs.RO", category: "robotics", url: "https://export.arxiv.org/rss/cs.RO", max: 8 },
  { kind: "arxiv", name: "arXiv cs.LG", category: "ml", url: "https://export.arxiv.org/rss/cs.LG", max: 8 },
  // Hacker News — community-rated industry/tooling signal (last ~3 days, points-gated).
  { kind: "hn", name: "Hacker News", category: "community", query: "AI", minPoints: 80, max: 12 },
  { kind: "hn", name: "Hacker News", category: "robotics", query: "robotics", minPoints: 40, max: 6 },
  { kind: "hn", name: "Hacker News", category: "ml", query: "LLM", minPoints: 60, max: 8 },
];

/** Look-back window for HN stories (seconds). Keeps the digest "today-ish". */
export const HN_LOOKBACK_SECONDS = 3 * 24 * 60 * 60;
