/**
 * GET /api/agents/comms — the cross-agent message feed.
 *
 * Reads the shared coordination inboxes at ~/.claude/cross-project/inbox-*.md
 * (the file transport of the agent bus) and parses the PROTOCOL.md message
 * blocks into a unified, reverse-chronological timeline. This is the app's
 * only window into inter-agent traffic — previously nothing read these files.
 *
 * Local-runtime only: the inbox files live on the builder's machine. On the
 * hosted control plane (RUNTIME_AVAILABLE unset) there's no filesystem to read,
 * so it returns an empty feed + an `unavailable` hint instead of erroring.
 *
 * Reads ONLY inbox-*.md — never traverses elsewhere under ~/.claude (no secrets).
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";

export const runtime = "nodejs";

export type AgentMessage = {
  id: string;
  ts: string;
  from: string;
  to: string;
  re: string;
  body: string;
  read: boolean;
};

const HEADER_RE = /^##\s+(.+?)\s+—\s+from\s+@(\S+)\s+to\s+@(\S+)\s*$/;

/** Parse one inbox file's PROTOCOL blocks into structured messages. */
function parseInbox(text: string): AgentMessage[] {
  const lines = text.split("\n");
  const out: AgentMessage[] = [];
  let cur: { ts: string; from: string; to: string; body: string[] } | null = null;
  let re = "";
  let read = false;

  const flush = () => {
    if (!cur) return;
    const body = cur.body.join("\n").trim();
    out.push({
      id: `${cur.from}->${cur.to}@${cur.ts}`,
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
    if (!cur) continue;
    const reMatch = line.match(/^\*\*Re\*\*:\s*(.*)$/);
    if (reMatch) {
      re = reMatch[1].trim();
      continue;
    }
    if (/^READ:\s*/i.test(line.trim())) {
      read = true;
      continue;
    }
    cur.body.push(line);
  }
  flush();
  return out;
}

/** Sort key: PROTOCOL timestamps are "YYYY-MM-DD HH:MM" (lexicographically sortable). */
function tsKey(ts: string): string {
  return ts;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isRuntimeAvailable()) {
    return NextResponse.json({
      messages: [],
      unavailable: {
        code: "no-local-runtime",
        message: "The agent comms bus lives on your local machine. Open this on the builder where your agents run.",
      },
    });
  }

  const [{ readdirSync, readFileSync }, os, path] = await Promise.all([
    import("fs"),
    import("os"),
    import("path"),
  ]);
  const dir = path.join(os.homedir(), ".claude", "cross-project");

  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^inbox-.+\.md$/.test(f));
  } catch {
    return NextResponse.json({ messages: [] });
  }

  const messages: AgentMessage[] = [];
  for (const f of files) {
    try {
      messages.push(...parseInbox(readFileSync(path.join(dir, f), "utf8")));
    } catch {
      // A file deleted/unreadable between readdir and read — skip it.
    }
  }

  // Reverse-chronological. De-dupe by id (the same message can appear if a
  // sender also copies it to its own inbox).
  const seen = new Set<string>();
  const deduped = messages
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((a, b) => tsKey(b.ts).localeCompare(tsKey(a.ts)));

  return NextResponse.json({ messages: deduped });
}
