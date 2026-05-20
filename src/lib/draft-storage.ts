/**
 * Per-project draft persistence for the custom prompt input.
 *
 * Problem we're solving: if a /api/inject POST fails silently (auth expiry,
 * 500, network drop), the user's typed text would be lost when they navigate
 * away or close the page. Persisting to localStorage on every keystroke means
 * the draft survives a failed submit, a tab close, or a refresh — they can
 * always recover what they tried to send.
 *
 * Cleared explicitly on a confirmed-successful send (200 response from
 * /api/inject). Reads return "" when localStorage is unavailable (SSR or
 * private-browsing) — best-effort, no error states bubble out.
 */

const KEY_PREFIX = "cockpit:draft:";

function key(tab: string): string {
  return `${KEY_PREFIX}${tab}`;
}

export function getDraft(tab: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key(tab)) ?? "";
  } catch {
    return "";
  }
}

export function setDraft(tab: string, text: string): void {
  if (typeof window === "undefined") return;
  try {
    if (text.trim()) {
      window.localStorage.setItem(key(tab), text);
    } else {
      window.localStorage.removeItem(key(tab));
    }
  } catch {
    /* localStorage full, denied, or unsupported — fail silent */
  }
}

export function clearDraft(tab: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(tab));
  } catch {
    /* ignore */
  }
}
