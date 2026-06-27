/**
 * SSOT for human-readable activity / log previews in the UI.
 * Strips secrets and long payloads before they render in feeds.
 */

const TOKEN_PATTERNS: RegExp[] = [
  /\b(?:cfat_|sk-|ghp_|gho_|ghu_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh secret set\b[^\n]*/gi,
  /\bssh\s+[^\s]+@[^\s]+[^\n]*/gi,
];

const LONG_BLOB = /\b[A-Za-z0-9+/=_-]{40,}\b/g;

export function sanitizeActivityPreview(text: string | null | undefined, maxLen = 160): string {
  if (!text?.trim()) return "";
  let out = text.trim();
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  out = out.replace(LONG_BLOB, "[redacted]");
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > maxLen) {
    return `${out.slice(0, maxLen - 1)}…`;
  }
  return out;
}
