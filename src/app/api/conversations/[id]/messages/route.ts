/**
 * The Loki core: turn a human message into one of three outcomes and persist
 * the whole exchange. Steps (docs/loki-command-surface.md §3–§4):
 *   1. persist the user turn
 *   2. resolveCommand() — the SHARED resolver (src/lib/command-resolve.ts)
 *   3a. command + projectKey  → dispatch into the project session via injectPrompt(),
 *                               persist an assistant "dispatch" turn
 *   3b. chat                  → ask Ivy via askIvy(), persist an assistant "chat" turn
 *   3c. command, no project   → persist an assistant "command" turn asking which
 *                               project (meta.needsProject)
 *
 * Dispatch + chat call the shared cores (inject-core / ivy-core) in-process —
 * the same SSOT the /api/inject and /api/ivy routes wrap. No self-HTTP.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { getUserProjects } from "@/db/queries/user-projects";
import {
  getConversationWithMessages,
  addMessage,
  updateConversationProjects,
  updateConversationTitle,
  deriveConversationTitle,
  DEFAULT_CONVERSATION_TITLE,
} from "@/db/queries/conversations";
import { resolveCommand } from "@/lib/command-resolve";
import { injectPrompt } from "@/lib/inject-core";
import { askIvy } from "@/lib/ivy-core";

const Body = z.object({
  text: z.string().trim().min(1).max(4000),
  selectedProjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
});

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

  // Auto-title: the first user turn names a still-untitled thread. `existing`
  // was loaded BEFORE this write, so an empty history means this is turn one.
  const currentTitle = existing.conversation.title.trim();
  if (
    existing.messages.length === 0 &&
    (currentTitle === "" || currentTitle === DEFAULT_CONVERSATION_TITLE)
  ) {
    const title = deriveConversationTitle(text);
    if (title) await updateConversationTitle(userId, conversationId, title);
  }

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
    const inject = await injectPrompt(
      { tab: resolution.projectKey, customPrompt: resolution.prompt },
      userId,
    );
    const ok = inject.status < 400;
    const content = ok
      ? `Dispatched to ${resolution.projectKey}: ${resolution.prompt}`
      : `Could not dispatch to ${resolution.projectKey}: ${
          typeof inject.body.error === "string" ? inject.body.error : "dispatch failed"
        }`;
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "dispatch",
      content,
      meta: {
        projectKey: resolution.projectKey,
        intentId: resolution.intentId,
        ok,
        mode: inject.body.mode ?? null,
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
    const ivy = await askIvy(resolution.prompt);
    const reply =
      (typeof ivy.body.text === "string" && ivy.body.text) ||
      (typeof ivy.body.error === "string" ? ivy.body.error : "Ivy is unavailable right now.");
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: reply,
      meta: { model: ivy.body.model ?? null },
    });
  }

  return NextResponse.json({ message: assistant });
}
