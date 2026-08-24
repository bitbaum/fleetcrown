/**
 * Building in Public — shared content contracts.
 * Company/product surfaces only (blog · roadmap · changelog). Not UGC.
 */

/** Long-form essay / blog body blocks (markdown → structured). */
export type ContentBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "blockquote"; text: string[] }
  | { type: "p"; text: string }
  | { type: "image"; alt: string; src: string }
  | { type: "code"; lang: string; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "embed"; url: string };

/** Minimal post frontmatter common across studio blogs. */
export interface BlogPostMeta {
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
  featured: boolean;
  author: string;
  readingTimeMin: number;
}

export type RoadmapItem = {
  title: string;
  line: string;
  details?: string[];
  essay?: { label: string; href: string };
};

export type RoadmapBucket = {
  title: string;
  summary: string;
  items: RoadmapItem[];
};

/** Product roadmap document shape (TS module or serialized JSON). */
export interface RoadmapDoc {
  eyebrow: string;
  title: string;
  lede: string;
  buckets: RoadmapBucket[];
}

export type ChangelogTag = "feature" | "improvement" | "fix" | "platform" | "breaking";

/** User-facing product changelog entry (not a git log). */
export interface ChangelogEntry {
  date: string;
  tag: ChangelogTag;
  title: string;
  summary: string;
  items?: string[];
}

/** Desktop / installer release notes (e.g. Fleet Runner). */
export interface ReleaseEntry {
  version: string;
  tag: string;
  date: string;
  highlights: string[];
  breaking: string[];
  notes: string;
}
