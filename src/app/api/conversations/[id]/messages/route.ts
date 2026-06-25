/**
 * The Loki core: turn a human message into one of three outcomes and persist
 * the whole exchange. Steps (docs/loki-command-surface.md §3–§4):
 *   1. persist the user turn
 *   2. resolveCommand() — the SHARED resolver (src/lib/command-resolve.ts)
 *   3a. command + projectKey  → dispatch into the project session via injectPrompt(),
 *                               persist an assistant "dispatch" turn
 *   3b. chat                  → ask Loki via askLoki(), persist an assistant "chat" turn
 *   3c. command, no project   → persist an assistant "command" turn asking which
 *                               project (meta.needsProject)
 *
 * Dispatch + chat call the shared cores (inject-core / loki-core) in-process —
 * the same SSOT the /api/inject and /api/loki routes wrap. No self-HTTP.
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
import { askLoki } from "@/lib/loki-core";
import { ORCHESTRATION_ADAPTER_IDS, type AdapterId } from "@/lib/orchestration";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS, renderAttachments } from "@/lib/loki/attachments";

const Body = z.object({
  text: z.string().trim().min(1).max(4000),
  selectedProjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  // Composer model picker: pin a one-off agent + model for this dispatch.
  // Both optional — omitted means "use the project's default" (the picker's
  // "Auto" option). agent is validated against dispatchable adapters below.
  agent: z.enum(ORCHESTRATION_ADAPTER_IDS).optional(),
  model: z.string().trim().min(1).max(60).optional(),
  // Composer file attachments — text content folded into the dispatched prompt.
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        content: z.string().max(MAX_ATTACHMENT_CHARS),
      }),
    )
    .max(MAX_ATTACHMENTS)
    .optional(),
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
  const { text, selectedProjects, agent, model, attachments } = dataOrResp;

  // Attachment text is appended to the dispatched/asked prompt AFTER resolution,
  // so the resolver classifies on the user's words — not a dumped file.
  const attachmentSuffix = renderAttachments(attachments);
  const attachmentNote =
    attachments && attachments.length > 0
      ? `\n\n[Attached: ${attachments.map((a) => a.name).join(", ")}]`
      : "";

  // Ownership gate — message writes are only allowed on the caller's own thread.
  const existing = await getConversationWithMessages(userId, conversationId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 1. Persist the user turn. The note (filenames only) keeps the transcript
  //    honest about what was sent without dumping file bodies into the bubble.
  await addMessage(conversationId, { role: "user", content: text + attachmentNote });

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
    // 3a. Dispatch — fire-and-forget into the project's session. A composer
    //     model-picker selection (agent/model) overrides the project default;
    //     "Auto" sends neither, so the project's stored prefs apply.
    const inject = await injectPrompt(
      {
        tab: resolution.projectKey,
        // Attachment bodies ride along with the dispatched prompt (not the
        // displayed bubble, which stays the user's command).
        customPrompt: resolution.prompt + attachmentSuffix,
        adapter: agent as AdapterId | undefined,
        model,
      },
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
        // "runner-offline" when queued with no live runner — surfaced so the
        // transcript can warn the work is waiting, not running.
        warning: typeof inject.body.warning === "string" ? inject.body.warning : null,
        // Only set when the operator pinned a non-default agent/model, so the
        // footer can show "on Codex · gpt-5"; Auto leaves these null.
        agent: agent ?? null,
        model: model ?? null,
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
    // 3b. Chat — answer via Loki (attachments included so a question can be
    //     about the attached file).
    // Per-conversation web session → same agent (main) + memory as Telegram, own
    // transcript. userId also resolves the caller's writing-voice preference.
    const loki = await askLoki(resolution.prompt + attachmentSuffix, {
      sessionKey: `agent:main:web:conv:${conversationId}`,
      userId,
    });
    const reply =
      (typeof loki.body.text === "string" && loki.body.text) ||
      (typeof loki.body.error === "string" ? loki.body.error : "Loki is unavailable right now.");
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: reply,
      meta: { model: loki.body.model ?? null },
    });
  }

  return NextResponse.json({ message: assistant });
}
