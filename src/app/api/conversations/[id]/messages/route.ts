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
import {
  countActiveProjects,
  createUserProject,
  getUserProjects,
} from "@/db/queries/user-projects";
import { getUserById } from "@/db/queries/users";
import {
  getConversationWithMessages,
  addMessage,
  updateConversationProjects,
  updateConversationTitle,
  deriveConversationTitle,
  DEFAULT_CONVERSATION_TITLE,
} from "@/db/queries/conversations";
import type { Conversation, ConversationMessage } from "@/db/schema/conversations";
import { resolveCommand, isGenericDevelopHandoff, type CommandResolution } from "@/lib/command-resolve";
import { injectPrompt } from "@/lib/inject-core";
import { askLoki } from "@/lib/loki-core";
import { ORCHESTRATION_ADAPTER_IDS, type AdapterId } from "@/lib/orchestration";
import {
  MAX_ATTACHMENTS,
  AttachmentBodySchema,
  attachmentNoteLabel,
  normalizeAttachment,
  renderTextAttachments,
  type Attachment,
} from "@/lib/loki/attachments";
import { describeAttachedImages } from "@/lib/loki/vision";
import { dispatchAssistantContent } from "@/lib/dispatch-status";
import { buildLokiChatPrompt, resolveLokiChatProjectKey } from "@/lib/loki/chat-context";
import {
  formatProjectList,
  isBusinessPlanRequest,
  isDevelopAllFleetRequest,
  isMoveForwardRequest,
  isListProjectsQuery,
  parseCreateProjectRequest,
  parseProfileUpdateRequest,
  projectNameFromConversationTitle,
  resolveFleetCommandProjectKey,
} from "@/lib/loki-fleet-commands";
import {
  formatBusinessPlanReply,
  formatProfileUpdateReply,
  proposeLokiProfileUpdate,
  runLokiBusinessPlan,
} from "@/lib/loki/project-mutations";
import { formatFleetKickReply, kickFleet } from "@/lib/fleet-kick";
import { resolveDispatchTargets } from "@/lib/loki/dispatch-targets";
import {
  dispatchCommandToProjects,
  formatMultiDispatchReply,
} from "@/lib/loki/multi-dispatch";
import {
  DEFAULT_VISION_QUESTION,
  shouldDispatchScreenshot,
  screenshotDispatchIntentId,
  screenshotDispatchPrompt,
} from "@/lib/loki/screenshot-dispatch";
import { getProjectLimit } from "@/lib/plan";

const Body = z
  .object({
    text: z.string().trim().max(4000),
    selectedProjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    agent: z.enum(ORCHESTRATION_ADAPTER_IDS).optional(),
    model: z.string().trim().min(1).max(60).optional(),
    attachments: z.array(AttachmentBodySchema).max(MAX_ATTACHMENTS).optional(),
    dispatchOnly: z.boolean().optional(),
    // Force the chat path, skipping the command classifier. The proactive
    // fleet-review starters are definitionally analysis/Q&A, not "run work on a
    // project" — without this the classifier can misread "review my fleet" as a
    // command and return a needs-project picker instead of Loki's answer.
    chatOnly: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasAttach = (data.attachments?.length ?? 0) > 0;
    if (!data.text.trim() && !hasAttach) {
      ctx.addIssue({ code: "custom", message: "Message text or an attachment is required.", path: ["text"] });
    }
  });

type DispatchOpts = {
  userId: string;
  conversationId: string;
  existing: { conversation: Conversation; messages: ConversationMessage[] };
  projectKey: string;
  prompt: string;
  sourceText: string;
  intentId: string | null;
  attachmentSuffix: string;
  agent?: AdapterId;
  model?: string;
  attachments?: Attachment[];
};

async function buildAttachmentSuffix(
  attachments: Attachment[] | undefined,
  userText: string,
): Promise<string> {
  const normalized = attachments ?? [];
  const images = normalized.filter((a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image");
  const vision = await describeAttachedImages(images, userText);
  return renderTextAttachments(normalized) + vision;
}

async function persistDispatch(opts: DispatchOpts): Promise<ConversationMessage> {
  const useIntentKey =
    Boolean(opts.intentId) &&
    isGenericDevelopHandoff(opts.sourceText) &&
    !(opts.attachments && opts.attachments.length > 0);
  const inject = await injectPrompt(
    useIntentKey
      ? {
          tab: opts.projectKey,
          promptKey: opts.intentId!,
          adapter: opts.agent,
          model: opts.model,
        }
      : {
          tab: opts.projectKey,
          customPrompt: opts.prompt + opts.attachmentSuffix,
          adapter: opts.agent,
          model: opts.model,
        },
    opts.userId,
  );
  const ok = inject.status < 400;
  const dispatchInput = {
    ok,
    mode: typeof inject.body.mode === "string" ? inject.body.mode : null,
    warning: typeof inject.body.warning === "string" ? inject.body.warning : null,
    runnerConnected:
      typeof inject.body.runnerConnected === "boolean" ? inject.body.runnerConnected : null,
  };
  // Identifiers the transcript footer polls to show LIVE dispatch status
  // (queued → picked up → ran/failed) instead of a frozen "starting shortly".
  // commandId is present only for queued (cloud-drained) dispatches; runId
  // tracks the underlying orchestration run.
  const commandId = typeof inject.body.commandId === "string" ? inject.body.commandId : null;
  const runId = typeof inject.body.runId === "string" ? inject.body.runId : null;
  const content = ok
    ? dispatchAssistantContent(opts.projectKey, dispatchInput)
    : `Could not dispatch to ${opts.projectKey}: ${
        typeof inject.body.error === "string" ? inject.body.error : "dispatch failed"
      }`;
  const assistant = await addMessage(opts.conversationId, {
    role: "assistant",
    kind: "dispatch",
    content,
    meta: {
      projectKey: opts.projectKey,
      intentId: opts.intentId,
      ok,
      mode: dispatchInput.mode,
      warning: dispatchInput.warning,
      runnerConnected: dispatchInput.runnerConnected,
      agent: opts.agent ?? null,
      model: opts.model ?? null,
      commandId,
      runId,
    },
  });
  if (!opts.existing.conversation.projectKeys.includes(opts.projectKey)) {
    await updateConversationProjects(opts.userId, opts.conversationId, [
      ...opts.existing.conversation.projectKeys,
      opts.projectKey,
    ]);
  }
  return assistant;
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
  const { text: rawText, selectedProjects, agent, model, attachments: rawAttachments, dispatchOnly, chatOnly } = dataOrResp;
  const text =
    rawText.trim() ||
    DEFAULT_VISION_QUESTION;
  const attachments = rawAttachments?.map(normalizeAttachment);
  const hasImages = (attachments ?? []).some((a) => a.kind === "image");

  const attachmentSuffix = await buildAttachmentSuffix(attachments, text);
  const attachmentNote = attachmentNoteLabel(attachments);

  const existing = await getConversationWithMessages(userId, conversationId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!dispatchOnly) {
    await addMessage(conversationId, { role: "user", content: text + attachmentNote });

    const titleForAuto = existing.conversation.title.trim();
    if (
      existing.messages.length === 0 &&
      (titleForAuto === "" || titleForAuto === DEFAULT_CONVERSATION_TITLE)
    ) {
      const title = deriveConversationTitle(text);
      if (title) await updateConversationTitle(userId, conversationId, title);
    }
  }

  const currentTitle = existing.conversation.title.trim();

  const projects = await getUserProjects(userId);
  const projectNames = projects.map((p) => p.name);

  // Fleet fast paths — deterministic, no LLM. Skipped entirely for chatOnly:
  // the proactive fleet-review starters ("review my fleet", "all my projects")
  // are analysis requests that would otherwise be intercepted here (e.g. the
  // list-projects fast path) and answered with a bare project list. chatOnly
  // means "let Loki think", so bypass every deterministic shortcut.
  if (!chatOnly && isListProjectsQuery(text)) {
    const assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: formatProjectList(projects),
      meta: { source: "fleet-list" },
    });
    return NextResponse.json({ message: assistant });
  }

  const createReq = chatOnly ? null : parseCreateProjectRequest(text);
  if (createReq) {
    let name = createReq.name;
    if (!name) {
      const titled =
        currentTitle !== "" && currentTitle !== DEFAULT_CONVERSATION_TITLE
          ? currentTitle
          : deriveConversationTitle(text) ?? "";
      name = projectNameFromConversationTitle(titled);
    }
    if (!name) {
      const assistant = await addMessage(conversationId, {
        role: "assistant",
        kind: "chat",
        content:
          "What should the new project be called? Say **create project my-app** or name this conversation first.",
        meta: { source: "create-project-needs-name" },
      });
      return NextResponse.json({ message: assistant });
    }

    const user = await getUserById(userId);
    if (user && !user.isDefault) {
      const limit = getProjectLimit(user.plan);
      if (Number.isFinite(limit)) {
        const current = await countActiveProjects(userId);
        if (current >= limit) {
          const assistant = await addMessage(conversationId, {
            role: "assistant",
            kind: "chat",
            content: `Project limit reached (${limit} on ${user.plan} plan). Upgrade to add more.`,
            meta: { source: "create-project-limit" },
          });
          return NextResponse.json({ message: assistant });
        }
      }
    }

    let projectName = name;
    try {
      const created = await createUserProject({ userId, name });
      projectName = created.name;
    } catch (e: unknown) {
      const duplicate =
        e && typeof e === "object" && "code" in e && e.code === "23505";
      if (!duplicate) throw e;
    }

    if (createReq.dispatchAfter) {
      const assistant = await persistDispatch({
        userId,
        conversationId,
        existing,
        projectKey: projectName,
        prompt: "Continue from our discussion and implement the plan we agreed.",
        sourceText: text,
        intentId: "next_best",
        attachmentSuffix,
        agent: agent as AdapterId | undefined,
        model,
        attachments,
      });
      return NextResponse.json({ message: assistant });
    }

    const assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: `Registered **${projectName}**. Select it on the right, then say what to run.`,
      meta: { source: "create-project", projectKey: projectName },
    });
    return NextResponse.json({ message: assistant });
  }

  if (!chatOnly && isDevelopAllFleetRequest(text)) {
    const scopeKeys =
      selectedProjects.length > 0 ? selectedProjects : undefined;
    const outcome = await kickFleet(userId, {
      source: "loki",
      projectKeys: scopeKeys,
      requireFleetOn: false,
    });
    const assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: formatFleetKickReply(outcome),
      meta: {
        source: "fleet-kick",
        kicked: outcome.kicked,
        runnerConnected: outcome.runnerConnected,
      },
    });
    return NextResponse.json({ message: assistant });
  }

  if (!chatOnly && isMoveForwardRequest(text)) {
    if (selectedProjects.length === 1) {
      const assistant = await persistDispatch({
        userId,
        conversationId,
        existing,
        projectKey: selectedProjects[0],
        prompt: text,
        sourceText: text,
        intentId: "next_best",
        attachmentSuffix,
        agent: agent as AdapterId | undefined,
        model,
        attachments,
      });
      return NextResponse.json({ message: assistant });
    }
    const scopeKeys = selectedProjects.length > 0 ? selectedProjects : undefined;
    const outcome = await kickFleet(userId, {
      source: "loki",
      projectKeys: scopeKeys,
      requireFleetOn: false,
    });
    const assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: formatFleetKickReply(outcome),
      meta: {
        source: "fleet-kick-move-forward",
        kicked: outcome.kicked,
        runnerConnected: outcome.runnerConnected,
      },
    });
    return NextResponse.json({ message: assistant });
  }

  const fleetProjectKey = resolveFleetCommandProjectKey(
    text,
    selectedProjects[0],
    projectNames,
  );

  if (isBusinessPlanRequest(text)) {
    const outcome = await runLokiBusinessPlan(userId, fleetProjectKey, projects);
    const content = outcome.ok
      ? formatBusinessPlanReply(outcome)
      : outcome.message;
    const assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content,
      meta: {
        source: outcome.ok ? "business-plan" : `business-plan-${outcome.code}`,
        projectKey: outcome.ok ? outcome.projectKey : fleetProjectKey,
        entityId: outcome.ok ? outcome.entityId : null,
      },
    });
    if (
      outcome.ok &&
      !existing.conversation.projectKeys.includes(outcome.projectKey)
    ) {
      await updateConversationProjects(userId, conversationId, [
        ...existing.conversation.projectKeys,
        outcome.projectKey,
      ]);
    }
    return NextResponse.json({ message: assistant });
  }

  const profileUpdate = parseProfileUpdateRequest(text);
  if (profileUpdate) {
    const outcome = await proposeLokiProfileUpdate(
      userId,
      fleetProjectKey,
      projects,
      profileUpdate,
    );
    const content = outcome.ok
      ? formatProfileUpdateReply(outcome)
      : outcome.message;
    const assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content,
      meta: {
        source: outcome.ok ? "profile-update-draft" : `profile-update-${outcome.code}`,
        projectKey: outcome.ok ? outcome.projectKey : fleetProjectKey,
        fieldKey: profileUpdate.fieldKey,
      },
    });
    if (
      outcome.ok &&
      !existing.conversation.projectKeys.includes(outcome.projectKey)
    ) {
      await updateConversationProjects(userId, conversationId, [
        ...existing.conversation.projectKeys,
        outcome.projectKey,
      ]);
    }
    return NextResponse.json({ message: assistant });
  }

  const screenshotProject = resolveFleetCommandProjectKey(
    text,
    selectedProjects[0],
    projectNames,
  );
  if (shouldDispatchScreenshot(text, hasImages, screenshotProject)) {
    const prompt = screenshotDispatchPrompt(text);
    const intentId = screenshotDispatchIntentId(text);
    const assistant = await persistDispatch({
      userId,
      conversationId,
      existing,
      projectKey: screenshotProject!,
      prompt,
      sourceText: text,
      intentId,
      attachmentSuffix,
      agent: agent as AdapterId | undefined,
      model,
      attachments,
    });
    return NextResponse.json({ message: assistant });
  }

  const resolution: CommandResolution = chatOnly
    ? { kind: "chat", projectKey: selectedProjects[0] ?? null, intentId: null, prompt: text, needsProject: false, reason: "forced chat (proactive fleet review)" }
    : await resolveCommand(
        { text, projects: projectNames, selectedProject: selectedProjects[0] },
        userId,
      );

  const namedInText =
    projectNames.find((p) => text.toLowerCase().includes(p.toLowerCase())) ?? null;
  const dispatchTargets = resolveDispatchTargets({
    resolution,
    selectedProjects,
    namedInText,
  });

  let assistant;

  if (resolution.kind === "command" && dispatchTargets.length > 0) {
    if (
      dispatchTargets.length > 1 &&
      resolution.intentId === "next_best" &&
      !hasImages
    ) {
      const kick = await kickFleet(userId, {
        source: "loki",
        projectKeys: dispatchTargets,
        requireFleetOn: false,
      });
      assistant = await addMessage(conversationId, {
        role: "assistant",
        kind: "chat",
        content: formatFleetKickReply(kick),
        meta: { source: "fleet-kick-multi", kicked: kick.kicked },
      });
      const kickedKeys = kick.details.filter((d) => d.outcome === "kicked").map((d) => d.projectKey);
      if (kickedKeys.length > 0) {
        const merged = [...new Set([...existing.conversation.projectKeys, ...kickedKeys])];
        await updateConversationProjects(userId, conversationId, merged);
      }
    } else if (dispatchTargets.length > 1) {
      const attempts = await dispatchCommandToProjects({
        userId,
        projectKeys: dispatchTargets,
        prompt: resolution.prompt,
        sourceText: text,
        intentId: resolution.intentId,
        attachmentSuffix,
        agent: agent as AdapterId | undefined,
        model,
        attachments,
      });
      assistant = await addMessage(conversationId, {
        role: "assistant",
        kind: "dispatch",
        content: formatMultiDispatchReply(attempts, resolution.intentId ?? undefined),
        meta: {
          multiDispatch: true,
          projectKeys: dispatchTargets,
          attempts,
        },
      });
      const okKeys = attempts.filter((a) => a.ok).map((a) => a.projectKey);
      if (okKeys.length > 0) {
        const merged = [...new Set([...existing.conversation.projectKeys, ...okKeys])];
        await updateConversationProjects(userId, conversationId, merged);
      }
    } else {
      assistant = await persistDispatch({
        userId,
        conversationId,
        existing,
        projectKey: dispatchTargets[0],
        prompt: resolution.prompt,
        sourceText: text,
        intentId: resolution.intentId,
        attachmentSuffix,
        agent: agent as AdapterId | undefined,
        model,
        attachments,
      });
    }
  } else if (resolution.needsProject) {
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "command",
      content: "Which project should I run that on? Tap one below, select on the right, or name it in your message.",
      meta: {
        needsProject: true,
        intentId: resolution.intentId,
        pendingText: text,
        projectOptions: projectNames,
      },
    });
  } else {
    const chatProject = resolveLokiChatProjectKey(
      resolution,
      selectedProjects,
      projectNames,
      text,
    );
    const chatPrompt = await buildLokiChatPrompt(
      userId,
      resolution.prompt + attachmentSuffix,
      chatProject,
    );
    const loki = await askLoki(chatPrompt, {
      // Proactive fleet reviews are one-shot analyses — route them to the warm
      // shared ask-session (same as /api/loki) rather than a cold per-conversation
      // session, which on a modest model can echo the injected context instead of
      // answering. Normal chat keeps its own per-thread memory.
      sessionKey: chatOnly ? `agent:main:web:ask:${userId}` : `agent:main:web:conv:${conversationId}`,
      userId,
    });
    const reply =
      (typeof loki.body.text === "string" && loki.body.text) ||
      (typeof loki.body.error === "string" ? loki.body.error : "Loki is unavailable right now.");
    assistant = await addMessage(conversationId, {
      role: "assistant",
      kind: "chat",
      content: reply,
      meta: {
        model: loki.body.model ?? null,
        projectKey: chatProject,
      },
    });
    if (
      chatProject &&
      !existing.conversation.projectKeys.includes(chatProject)
    ) {
      await updateConversationProjects(userId, conversationId, [
        ...existing.conversation.projectKeys,
        chatProject,
      ]);
    }
  }

  return NextResponse.json({ message: assistant });
}
