/**
 * Absolute URL for the visitor-reported feedback page, if we have one.
 * Used by Check live so the operator opens the real surface in one click.
 */
export function absoluteFeedbackPageHref(
  url: string | null | undefined,
  page: string | null | undefined,
): string | null {
  for (const raw of [url, page]) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    try {
      if (/^https?:\/\//i.test(v)) return new URL(v).toString();
    } catch {
      /* ignore */
    }
  }
  return null;
}
