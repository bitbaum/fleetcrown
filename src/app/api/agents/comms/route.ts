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
import { parseInbox, dedupeAndSort, type AgentMessage } from "@/lib/agent-comms";

export const runtime = "nodejs";

export type { AgentMessage };

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

  return NextResponse.json({ messages: dedupeAndSort(messages) });
}
