/**
 * SSOT for HTML/XML entity escaping.
 *
 * Written because the same five-line `.replace()` chain had been open-coded
 * twice (src/lib/email.ts, src/app/rss.xml/route.ts) and a third caller —
 * feedbackShippedTemplate — forgot it entirely and interpolated raw visitor
 * text into an outbound email. An escaper that lives in one place is one that
 * a new template can be pointed at instead of reinvented or skipped.
 *
 * Escapes the five XML predefined entities, so the output is safe in an HTML
 * text node, inside a double- or single-quoted attribute, and in XML alike.
 * Callers never need to pick a variant.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape, then turn newlines into <br>. For untrusted multi-line prose that
 * should keep its line breaks in an HTML email body.
 *
 * Order matters: escaping first means a literal "<br>" typed by a visitor
 * stays visible text rather than becoming markup.
 */
export function escapeHtmlWithBreaks(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

/**
 * The inverse: turn the entities that actually appear in scraped HTML and RSS
 * back into characters. Two copies of this existed (lib/atlas/probe for
 * og:-tag scraping, lib/frontier/ingest for feeds) and one of them was wrong.
 *
 * `&amp;` is decoded LAST, and that is the whole subtlety. Decode it first —
 * as the atlas copy did — and `&amp;lt;` becomes `&lt;` becomes `<`: a
 * double-decode that turns text a site deliberately escaped back into markup.
 * Doing it last means a literal ampersand survives as an ampersand and nothing
 * else is created by it.
 *
 * This is a reader for text that will be displayed as TEXT, not a sanitizer.
 * Anything heading back into HTML goes through escapeHtml above.
 */
export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
