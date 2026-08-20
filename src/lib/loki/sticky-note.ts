/**
 * Sticky note — the walk-workflow seam (SSOT).
 *
 * On a walk you talk to Loki; anything that is a task for YOU (not an agent)
 * must land somewhere you will actually see again. That place is the sticky
 * note: the `captures` table, rendered on /today. This module owns the
 * deterministic detection ("add X to my list", "note that X", "what's on my
 * list") and the reply copy, so the messages route and tests share one
 * definition. Detection is conservative on purpose — a false positive here
 * steals a message from dispatch/chat, which is worse than falling through.
 */

export type StickyNoteRequest =
  | { kind: "add"; body: string }
  | { kind: "read" };

/** The names people call the list — one alternation, used by every pattern. */
const LIST = "(?:sticky ?note|sticky|to-?do list|to-?dos?|task list|list|notes?)";

const ADD_PATTERNS: RegExp[] = [
  // "note: buy film" / "todo — call the landlord" / "sticky note: pay invoice"
  new RegExp(`^(?:note|sticky ?note|sticky|todo)\\s*[:,\\u2014-]\\s*(.+)$`, "i"),
  // "note that the invoice is due Friday"
  /^note that\s+(.+)$/i,
  // "remind me to pay the Hetzner invoice" / "remind me about the wine"
  /^remind me (?:to|about)\s+(.+)$/i,
  // "add pay the invoice to my list" / "put buy sunscreen on the todo list"
  new RegExp(`^(?:add|put)\\s+(.+?)\\s+(?:to|on(?:to)?)\\s+(?:my|the)\\s+${LIST}$`, "i"),
  // "add to my list: buy film" / "put on my sticky note — email Anna"
  new RegExp(`^(?:add|put)\\s+(?:to|on(?:to)?)\\s+(?:my|the)\\s+${LIST}\\s*[:,\\u2014-]?\\s*(.+)$`, "i"),
];

const READ_PATTERN = new RegExp(
  `^(?:what(?:'s| is| do i have)\\s+on\\s+my\\s+${LIST}|show\\s+(?:me\\s+)?my\\s+${LIST}|read\\s+(?:me\\s+)?(?:back\\s+)?my\\s+${LIST}(?:\\s+back)?|my\\s+${LIST})\\s*\\??$`,
  "i",
);

/** Strip the punctuation voice dictation likes to append. */
function cleanBody(body: string): string {
  return body.trim().replace(/[.!]+$/, "").trim();
}

export function parseStickyNoteRequest(text: string): StickyNoteRequest | null {
  const t = text.trim();
  if (!t) return null;
  if (READ_PATTERN.test(t)) return { kind: "read" };
  for (const re of ADD_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const body = cleanBody(m[1]);
      if (body) return { kind: "add", body };
    }
  }
  return null;
}

export type StickyNoteItem = { body: string };

export function formatStickyAddReply(body: string, openCount: number): string {
  const count = openCount === 1 ? "1 item" : `${openCount} items`;
  return `On your sticky note: “${body}” — ${count} open. Review on [Today](/today#sticky-note).`;
}

const LIST_REPLY_CAP = 10;

export function formatStickyListReply(items: StickyNoteItem[], total: number): string {
  if (total === 0) return "Your sticky note is clear.";
  const shown = items.slice(0, LIST_REPLY_CAP);
  const lines = shown.map((i) => `- ${i.body}`);
  const hidden = total - shown.length;
  // Same destination as the add reply — every sticky reply hands you the way
  // back to where the list is reviewed and checked off.
  lines.push(
    hidden > 0
      ? `…and ${hidden} more on [Today](/today#sticky-note).`
      : `Review on [Today](/today#sticky-note).`,
  );
  const count = total === 1 ? "1 item" : `${total} items`;
  return [`**Sticky note — ${count} open**`, ...lines].join("\n");
}
