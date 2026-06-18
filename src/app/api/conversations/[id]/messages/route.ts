/**
 * The Loki core: turn a human message into one of three outcomes and persist
 * the whole exchange. Steps (docs/loki-command-surface.md §3–§4):
 *   1. persist the user turn
 *   2. resolveCommand() — the SHARED resolver (src/lib/command-resolve.ts)
 *   3a. command + projectKey  → dispatch into the project session via /api/inject,
 *                               persist an assistant "dispatch" turn
 *   3b. chat                  → ask Ivy via /api/ivy, persist an assistant "chat" turn
 *   3c. command, no project   → persist an assistant "command" turn asking which
 *                               project (meta.needsProject)
 *
 * Dispatch + chat reuse the existing routes (no new execution engine). The
 * incoming session cookie is forwarded so those routes authenticate as the
 * same user — there is no shared inject helper to import for the MVP.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { getUserProjects } from "@/db/queries/user-projects";
import {
  getConversationWithMessages,
  addMessage,
  updateConversationProjects,
} from "@/db/queries/conversations";
import { resolveCommand } from "@/lib/command-resolve";

const Body = z.object({
  text: z.string().trim().min(1).max(4000),
  selectedProjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
});

/** Call a same-origin route, forwarding the caller's session so getApiUserId()
 *  resolves to the same user. Returns the parsed JSON (or {} on parse error). */
async function callLocalRoute(
  req: NextRequest,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const cookie = req.headers.get("cookie") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(new URL(path, req.nextUrl.origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie && { cookie }),
      ...(auth && { authorization: auth }),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const conversationId = idOrResp;

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { text, selectedProjects } = dataOrResp;

  // Ownership gate — message writes are only allowed on the caller's own thread.
  const existing = await getConversationWithMessages(userId, conversationId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 1. Persist the user turn.
  await addMessage(conversationId, { role: "user", content: text });

  // 2. Resolve against the user's project registry. Selection (right pane) wins
  //    over a name in the text — explicit choice beats inference.
  const projects = await getUserProjects(userId);
  const projectNames = projects.map((p) => p.name);
  const resolution = await resolveCommand(
    { text, projects: projectNames, selectedProject: selectedProjects[0] },
    userId,
  );

  let assistant;

  if (resolution.kind === "command" && resolution.projectKey) {
    // 3a. Dispatch — fire-and-forget into the project's session.
    const inject = await callLocalRoute(req, "/api/inject", {
      tab: resolution.projectKey,
      customPrompt: resolution.prompt,
    });
    const content = inject.ok
      ? `Dispatched to ${resolution.projectKey}: ${resolution.prompt}`
      : `Could not dispatch to ${resolution.projectKey}: ${
          typeof inject.data.error === "string" ? inject.data.error : "dispatch failed"
        }`;
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "dispatch",
      content,
      meta: {
        projectKey: resolution.projectKey,
        intentId: resolution.intentId,
        ok: inject.ok,
        mode: inject.data.mode ?? null,
      },
    });
    // Keep the thread tagged with the project it now talks to.
    if (!existing.conversation.projectKeys.includes(resolution.projectKey)) {
      await updateConversationProjects(userId, conversationId, [
        ...existing.conversation.projectKeys,
        resolution.projectKey,
      ]);
    }
  } else if (resolution.needsProject) {
    // 3c. Ambiguous command — ask instead of guessing.
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "command",
      content: "Which project should I run that on? Select one on the right, or name it in your message.",
      meta: { needsProject: true, intentId: resolution.intentId },
    });
  } else {
    // 3b. Chat — answer via Ivy.
    const ivy = await callLocalRoute(req, "/api/ivy", { message: resolution.prompt });
    const reply =
      (typeof ivy.data.text === "string" && ivy.data.text) ||
      (typeof ivy.data.reply === "string" && ivy.data.reply) ||
      (typeof ivy.data.error === "string" ? ivy.data.error : "Ivy is unavailable right now.");
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: reply,
      meta: { model: ivy.data.model ?? null },
    });
  }

  return NextResponse.json({ message: assistant });
}
