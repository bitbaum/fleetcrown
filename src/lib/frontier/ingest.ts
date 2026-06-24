// Server-side ingestion for the frontier digest.
//
// Fetches every curated source (arXiv RSS + Hacker News/Algolia), normalizes
// into a flat candidate pool, and dedupes by URL/title. No LLM here — this
// layer only collects *real* items (so titles and links can never be
// hallucinated); ranking + summarizing happens in digest.ts.

import { FRONTIER_SOURCES, HN_LOOKBACK_SECONDS, type FrontierSource } from "./sources";
import type { FrontierCategory } from "./types";

export type FrontierCandidate = {
  title: string;
  url: string;
  source: string;
  category: FrontierCategory;
  /** Raw abstract / story excerpt, trimmed. Context for the ranking model. */
  excerpt: string;
  /** Sort signal: HN points, or 0 for arXiv (recency is the feed order). */
  score: number;
};

const FETCH_TIMEOUT_MS = 12_000;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "FleetCrown-FrontierDigest/1.0 (+https://fleetcrown.orangecat.ch)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

async function ingestArxiv(src: Extract<FrontierSource, { kind: "arxiv" }>): Promise<FrontierCandidate[]> {
  const xml = await fetchText(src.url);
  const blocks = xml.split(/<item[\s>]/i).slice(1).map((b) => b.split(/<\/item>/i)[0]);
  const out: FrontierCandidate[] = [];
  for (const block of blocks.slice(0, src.max)) {
    const url = stripTags(tag(block, "link"));
    const rawTitle = stripTags(tag(block, "title"));
    // arXiv titles end with " (arXiv:NNNN [cs.XX])" — drop that tail.
    const title = rawTitle.replace(/\s*\(arXiv:[^)]*\)\s*$/i, "").trim();
    if (!url || !title) continue;
    out.push({
      title,
      url,
      source: src.name,
      category: src.category,
      excerpt: stripTags(tag(block, "description")).slice(0, 320),
      score: 0,
    });
  }
  return out;
}

type HnHit = { objectID: string; title?: string | null; url?: string | null; points?: number | null; story_text?: string | null };

async function ingestHn(
  src: Extract<FrontierSource, { kind: "hn" }>,
  cutoffSeconds: number,
): Promise<FrontierCandidate[]> {
  const params = new URLSearchParams({
    tags: "story",
    query: src.query,
    numericFilters: `points>${src.minPoints},created_at_i>${cutoffSeconds}`,
    hitsPerPage: String(src.max),
  });
  const json = await fetchText(`https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`);
  const data = JSON.parse(json) as { hits?: HnHit[] };
  const out: FrontierCandidate[] = [];
  for (const h of data.hits ?? []) {
    const url = h.url?.trim();
    const title = h.title?.trim();
    if (!url || !title) continue; // skip Ask/Show HN text posts with no link
    out.push({
      title,
      url,
      source: src.name,
      category: src.category,
      excerpt: (h.story_text ? stripTags(h.story_text) : "").slice(0, 320),
      score: h.points ?? 0,
    });
  }
  return out;
}

function dedupeKey(c: FrontierCandidate): string {
  return c.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
}

export type IngestResult = {
  candidates: FrontierCandidate[];
  sourcesOk: number;
  sourcesFailed: number;
};

/** Fetch every source, merge, dedupe, sort by score (HN points first). */
export async function ingestFrontier(nowMs = Date.now()): Promise<IngestResult> {
  const cutoff = Math.floor(nowMs / 1000) - HN_LOOKBACK_SECONDS;

  const settled = await Promise.allSettled(
    FRONTIER_SOURCES.map((src) =>
      src.kind === "arxiv" ? ingestArxiv(src) : ingestHn(src, cutoff),
    ),
  );

  const seen = new Map<string, FrontierCandidate>();
  let sourcesOk = 0;
  let sourcesFailed = 0;
  for (const r of settled) {
    if (r.status !== "fulfilled") { sourcesFailed++; continue; }
    sourcesOk++;
    for (const c of r.value) {
      const key = dedupeKey(c);
      const existing = seen.get(key);
      // Keep the higher-scored copy on a URL collision across sources.
      if (!existing || c.score > existing.score) seen.set(key, c);
    }
  }

  const candidates = [...seen.values()].sort((a, b) => b.score - a.score);
  return { candidates, sourcesOk, sourcesFailed };
}
