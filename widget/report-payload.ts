/**
 * Payload shaping for programmatic reports (`window.FleetCrown.report`).
 *
 * Lives apart from main.ts because main.ts is a DOM bundle: this is the only
 * part of the report path with arithmetic that can silently lose information,
 * so it must be reachable by a pure unit test (scripts/test/widget-report-payload.ts).
 */

/**
 * Structured context a host page attaches to a report — e.g. the error code and
 * the action that failed. Flat on purpose: it is rendered as plain `key: value`
 * lines into the submission body, so the ingest schema needs no new column and
 * the inbox needs no new renderer.
 */
export type ReportDiagnostics = Record<string, string | number | boolean | null | undefined>;

export const DIAGNOSTICS_HEADING = "--- technical details ---";
const MAX_DIAG_CHARS = 1200;
const MAX_VALUE_CHARS = 300;

/** Render diagnostics as `key: value` lines, dropping empty entries. */
export function formatDiagnostics(d: ReportDiagnostics): string {
  return Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${String(v).slice(0, MAX_VALUE_CHARS)}`)
    .join("\n")
    .slice(0, MAX_DIAG_CHARS);
}

/**
 * Combine the visitor's prose with the diagnostics block under the ingest's
 * `suggestion` cap.
 *
 * The diagnostics are budgeted FIRST and the prose is trimmed around them: a
 * truncated sentence still reads, a truncated error code is worthless — and the
 * code is the whole reason the report can be routed without a human triaging it.
 */
export function buildSuggestion(
  body: string,
  diagnostics: ReportDiagnostics | null,
  maxLen: number
): string {
  const prose = body.trim();
  if (!diagnostics) return prose.slice(0, maxLen);
  const formatted = formatDiagnostics(diagnostics);
  if (!formatted) return prose.slice(0, maxLen);
  const block = `\n\n${DIAGNOSTICS_HEADING}\n${formatted}`;
  return (prose.slice(0, Math.max(0, maxLen - block.length)) + block).slice(0, maxLen);
}
