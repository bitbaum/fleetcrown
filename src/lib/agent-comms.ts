/**
 * Parser for the cross-agent coordination inboxes (~/.claude/cross-project/inbox-*.md).
 *
 * These files are an append-only audit log of the agent bus: each message is a
 * PROTOCOL.md block — `## <ts> — from @sender to @recipient`, an optional `Re:`
 * line, a free-form body, and a trailing `READ: <ts>` once processed. This module
 * turns that text into a structured, deduped, reverse-chronological timeline for
 * the /agents comms feed.
 *
 * Kept pure (no fs, no HTTP) so it is unit-testable against real fixtures and
 * reusable by any caller — see scripts/test/agent-comms.ts.
 */

export type AgentMessage = {
  id: string;
  ts: string;
  from: string;
  to: string;
  re: string;
  body: string;
  read: boolean;
};

// Header: "## 2026-07-06 13:16 — from @kivvi to @fleetcrown" (time optional).
const HEADER_RE = /^##\s+(.+?)\s+—\s+from\s+@(\S+)\s+to\s+@(\S+)\s*$/;
// Subject line, bold or plain: "**Re**: topic" or "Re: topic".
const RE_LINE_RE = /^(?:\*\*Re\*\*|Re):\s*(.*)$/;
// A standalone horizontal rule separates messages — never part of a body.
const RULE_RE = /^-{3,}\s*$/;
const READ_RE = /^READ:\s*/i;

/**
 * Deterministic string hash (djb2 → base36). Used to disambiguate messages that
 * share sender/recipient/timestamp — real headers sometimes carry a date with no
 * time, so `from->to@ts` alone is not unique. Two byte-identical messages (the
 * same note copied into both inboxes) still hash equal, so dedupe still collapses
 * them.
 */
function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Parse one inbox file's PROTOCOL blocks into structured messages. */
export function parseInbox(text: string): AgentMessage[] {
  const lines = text.split("\n");
  const out: AgentMessage[] = [];
  let cur: { ts: string; from: string; to: string; body: string[] } | null = null;
  let re = "";
  let read = false;

  const flush = () => {
    if (!cur) return;
    const body = cur.body.join("\n").trim();
    out.push({
      id: `${cur.from}->${cur.to}@${cur.ts}#${contentHash(re + "\n" + body)}`,
      ts: cur.ts,
      from: cur.from,
      to: cur.to,
      re,
      body,
      read,
    });
    cur = null;
    re = "";
    read = false;
  };

  for (const line of lines) {
    const h = line.match(HEADER_RE);
    if (h) {
      flush();
      cur = { ts: h[1].trim(), from: h[2], to: h[3], body: [] };
      continue;
    }
    // A rule closes the current message; the next `##` opens the next one. This
    // keeps the `---` delimiter out of message bodies.
    if (RULE_RE.test(line)) {
      flush();
      continue;
    }
    if (!cur) continue;
    const reMatch = line.match(RE_LINE_RE);
    if (reMatch) {
      re = reMatch[1].trim();
      continue;
    }
    if (READ_RE.test(line.trim())) {
      read = true;
      continue;
    }
    cur.body.push(line);
  }
  flush();
  return out;
}

/**
 * Merge messages from several inboxes into one reverse-chronological feed,
 * dropping exact duplicates (a message copied into both sender and recipient
 * inboxes). PROTOCOL timestamps are "YYYY-MM-DD[ HH:MM]" — lexicographically
 * sortable, with a date-only stamp sorting before any timed stamp that day.
 */
export function dedupeAndSort(messages: AgentMessage[]): AgentMessage[] {
  const seen = new Set<string>();
  return messages
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((a, b) => b.ts.localeCompare(a.ts));
}
