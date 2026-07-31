import { createHash } from "node:crypto";

/**
 * Ingest dedupe key: sha256 over normalized suggestion + page. Normalization
 * (lowercase, collapsed whitespace) makes "Broken button!" and "broken
 * button !" the same report; page scoping keeps the same complaint on two
 * different pages as two rows (they may be two bugs).
 */
export function feedbackContentHash(suggestion: string, page: string | null): string {
  const normalized = `${suggestion.toLowerCase().replace(/\s+/g, " ").trim()}\n${(page ?? "").toLowerCase().trim()}`;
  return createHash("sha256").update(normalized).digest("hex");
}
