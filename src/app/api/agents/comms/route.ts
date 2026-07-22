/**
 * The cross-agent coordination feed (the "agent bus").
 *
 * GET  — the message timeline. On a LOCAL builder (RUNTIME_AVAILABLE) it reads
 *        the source of truth directly: ~/.claude/cross-project/inbox-*.md. On
 *        the hosted control plane there is no filesystem, so it reads the DB
 *        transport (agent_messages) the runner pushes into — the feed is now
 *        prod-viable, not a permanent placeholder.
 * POST — ingest. The Fleet Runner parses new inbox messages and POSTs them here
 *        with its bearer token; idempotent on (user, msgId). This is the cloud
 *        transport that makes the feed work off the builder's machine.
 *
 * Reads ONLY inbox-*.md on the local path — never traverses elsewhere under
 * ~/.claude (no secrets).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId, getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { parseInbox, dedupeAndSort, MESSAGE_TYPES, MESSAGE_STATUSES, type AgentMessage } from "@/lib/agent-comms";
import { ingestAgentMessages, listAgentMessages } from "@/db/queries/agent-messages";
import { logDebug } from "@/db/queries/debug-logs";

export const runtime = "nodejs";

export type { AgentMessage };

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Hosted control plane: read the DB transport the runner pushes into.
  if (!isRuntimeAvailable()) {
    const messages = await listAgentMessages(userId).catch(() => [] as AgentMessage[]);
    return NextResponse.json({ messages });
  }

  // Local builder: read the source of truth off the filesystem.
  const [{ readdirSync, readFileSync }, os, path] = await Promise.all([
    import("fs"),
    import("os"),
    import("path"),
  ]);
  const dir = path.join(os.homedir(), ".claude", "cross-project");

  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^inbox-.+\.md$/.test(f));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logDebug({ source: "api/agents/comms", level: "error", message: "failed to read comms inbox dir", meta: { dir, error: String(err) } });
    }
    return NextResponse.json({ messages: [] });
  }

  const messages: AgentMessage[] = [];
  for (const f of files) {
    try {
      messages.push(...parseInbox(readFileSync(path.join(dir, f), "utf8")));
    } catch {
      /* file vanished between readdir and read — skip */
    }
  }
  return NextResponse.json({ messages: dedupeAndSort(messages) });
}

/** Runner ingest: bearer-authed, idempotent. Body: { messages: AgentMessage[] }. */
export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "messages[] required" }, { status: 400 });

  // The runner's token is the trust boundary, but validate shape so a malformed
  // push can't poison the feed.
  const messages: AgentMessage[] = [];
  for (const m of raw.slice(0, 500)) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.from !== "string" || typeof o.to !== "string" || typeof o.body !== "string" || typeof o.ts !== "string") continue;
    const type = typeof o.type === "string" && (MESSAGE_TYPES as readonly string[]).includes(o.type) ? (o.type as AgentMessage["type"]) : undefined;
    const status = typeof o.status === "string" && (MESSAGE_STATUSES as readonly string[]).includes(o.status) ? (o.status as AgentMessage["status"]) : undefined;
    messages.push({
      id: o.id, from: o.from, to: o.to, body: o.body, ts: o.ts,
      re: typeof o.re === "string" ? o.re : "",
      read: o.read === true,
      type, status,
    });
  }

  const ingested = await ingestAgentMessages(userId, messages).catch(() => 0);
  return NextResponse.json({ ok: true, ingested });
}
