/**
 * Atlas probe — turns a URL into the facts the Atlas shows: is it up, what is
 * it called, what does it look like, and who does it link to.
 *
 * Parsing is deliberately separate from fetching. `parseSiteHtml` is pure, so
 * the fragile part (metadata extraction across inconsistent real-world markup)
 * is unit-tested without a network. `probeSite` only adds I/O.
 *
 * No HTML-parser dependency: we read <title>, <meta>, and <a href> only. A DOM
 * parser would be a heavier tool than the job needs (KISS) — but tag scanning,
 * not naive regex over the whole document, because attribute order varies.
 */

export type ParsedSite = {
  title: string | null;
  description: string | null;
  previewImageUrl: string | null;
  /** Distinct external hosts linked from this page, lowercased, no port. */
  outboundHosts: string[];
};

export type SiteProbeResult = ParsedSite & {
  requestedUrl: string;
  finalUrl: string | null;
  statusCode: number | null;
  ok: boolean;
  responseMs: number;
  error: string | null;
};

/** Only the <head> matters for metadata, and bodies can be megabytes. */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;

/** Parse `key="value"` / `key='value'` / `key=value` pairs from one tag. */
function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    attrs[m[1].toLowerCase()] = decodeEntities(value.trim());
  }
  return attrs;
}

/** The handful of entities that actually show up in titles and descriptions. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function clean(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

/** Absolute URL or null — a relative og:image is useless to an <img> elsewhere. */
function absolutize(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function hostOf(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function parseSiteHtml(html: string, baseUrl: string): ParsedSite {
  const metas: Record<string, string> = {};
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const attrs = parseAttributes(m[0]);
    const key = (attrs["property"] ?? attrs["name"] ?? attrs["itemprop"] ?? "").toLowerCase();
    const content = attrs["content"];
    // First occurrence wins: pages sometimes repeat og:image for a gallery, and
    // the first is the one crawlers treat as canonical.
    if (key && content !== undefined && metas[key] === undefined) metas[key] = content;
  }

  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title =
    clean(metas["og:title"], 200) ??
    clean(titleTag ? decodeEntities(titleTag[1]) : null, 200);

  const description =
    clean(metas["og:description"], 400) ??
    clean(metas["description"], 400) ??
    clean(metas["twitter:description"], 400);

  const previewImageUrl = absolutize(
    clean(metas["og:image"], 1000) ??
      clean(metas["og:image:url"], 1000) ??
      clean(metas["twitter:image"], 1000),
    baseUrl,
  );

  const ownHost = hostOf(baseUrl, baseUrl);
  const hosts = new Set<string>();
  const anchorRe = /<a\b[^>]*>/gi;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = parseAttributes(m[0])["href"];
    if (!href) continue;
    const host = hostOf(href, baseUrl);
    if (host && host !== ownHost) hosts.add(host);
  }

  return {
    title,
    description,
    previewImageUrl,
    outboundHosts: [...hosts].sort(),
  };
}

export async function probeSite(url: string): Promise<SiteProbeResult> {
  const started = Date.now();
  const base: SiteProbeResult = {
    requestedUrl: url,
    finalUrl: null,
    statusCode: null,
    ok: false,
    responseMs: 0,
    title: null,
    description: null,
    previewImageUrl: null,
    outboundHosts: [],
    error: null,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "FleetCrownAtlas/1.0 (+https://fleetcrown.orangecat.ch)" },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ...base,
      responseMs: Date.now() - started,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }

  const result: SiteProbeResult = {
    ...base,
    finalUrl: response.url || url,
    statusCode: response.status,
    ok: response.status < 400,
    responseMs: Date.now() - started,
  };

  // A 500 page still has a <title> worth showing ("Application error"), so parse
  // regardless of status — but only when the body is actually HTML.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) return result;

  try {
    const html = (await response.text()).slice(0, MAX_BYTES);
    return { ...result, ...parseSiteHtml(html, result.finalUrl ?? url) };
  } catch (e) {
    return { ...result, error: e instanceof Error ? e.message : "body read failed" };
  }
}
