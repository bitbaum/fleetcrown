/**
 * Shared inject prompt assembly — SSOT for what text reaches an agent on dispatch.
 *
 * Used by inject-core on BOTH local and cloud paths so phone → cloud → Fleet Runner
 * carries the same project context + intent templates as Control → orchestration/run.
 * Local-only session enrichment (zellij state, ~/.claude/sessions) stays in inject-core.
 */
import {
  ORCHESTRATION_TASK_INTENT_IDS,
  renderProjectContextBlock,
  renderTaskForAdapter,
  type AdapterId,
  type OrchestrationTaskIntentId,
} from "@/lib/orchestration";
import { getProjectContext } from "@/db/queries/project-context";
import { retrieveFleetContextBlock } from "@/db/queries/knowledge-embeddings";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";
import { getOrchestrationIntent } from "@/lib/orchestration/intents";
import { sessionHandoffContract } from "@/lib/agent-config";

export type AssembleInjectPromptInput = {
  userId: string;
  projectKey: string;
  projectPath: string;
  projectId: string | null;
  adapter: AdapterId;
  promptKey?: string;
  customPrompt?: string;
  model?: string;
};

export type AssembleInjectPromptResult =
  | { ok: true; prompt: string; promptLabel: string; intent: OrchestrationTaskIntentId | undefined }
  | { ok: false; status: number; error: string };

function isOrchestrationIntent(key: string): key is OrchestrationTaskIntentId {
  return (ORCHESTRATION_TASK_INTENT_IDS as readonly string[]).includes(key);
}

/** Resolve a non-orchestration prompt key from prompt-library (cloud-safe — no local files). */
function resolveLibraryPromptBody(key: string): string | null {
  const hit = PROMPT_TEMPLATES.find((t) => t.agentKey === key);
  return hit?.template ?? null;
}

/**
 * Build the fully assembled prompt body for inject / queue paths.
 * Never throws — callers treat failures as dispatch errors.
 */
export async function assembleInjectPrompt(
  input: AssembleInjectPromptInput,
): Promise<AssembleInjectPromptResult> {
  const { userId, projectKey, projectPath, projectId, adapter, promptKey, customPrompt, model } = input;

  if (!promptKey && !customPrompt) {
    return { ok: false, status: 400, error: "promptKey or customPrompt required" };
  }

  const projectContext = (await getProjectContext(userId, projectKey).catch(() => null)) ?? undefined;
  const ragQuery = customPrompt ?? promptKey ?? "";
  const fleetBlock = ragQuery
    ? await retrieveFleetContextBlock(userId, ragQuery, { excludeProject: projectKey }).catch(() => "")
    : "";

  // Handoff exit-contract, appended to EVERY queued dispatch. The run only
  // closes when the agent's session handoff reports ready (closeRunFromSession
  // reads what the pusher persisted from ~/.claude/sessions/<tab>.md on the
  // executing machine) — without this block, box-executed agents finished
  // real work, wrote no handoff, and were reaped as timeouts. Tilde-relative
  // on purpose: the assembling server doesn't know the executing machine's
  // HOME; the agent expands it. resolveSessionFile reads case-insensitively,
  // so projectKey casing vs repo-dir casing cannot strand the handoff.
  const sessionFileRef = `~/.claude/sessions/${projectKey}.md`;
  const exitContract = `Before stopping, create ${sessionFileRef}.\n${sessionHandoffContract(sessionFileRef)}`;
  const withFleet = (body: string) =>
    [fleetBlock || null, body, exitContract].filter(Boolean).join("\n\n");

  if (customPrompt) {
    const intent: OrchestrationTaskIntentId = "custom";
    const body = renderTaskForAdapter(
      {
        projectId,
        projectKey,
        projectPath,
        adapter,
        intent,
        model,
        customInstructions: customPrompt,
        projectContext,
      },
      adapter,
    );
    return {
      ok: true,
      prompt: withFleet(body),
      promptLabel: customPrompt.slice(0, 40),
      intent,
    };
  }

  const key = promptKey!;

  if (isOrchestrationIntent(key)) {
    const intent = getOrchestrationIntent(key);
    const body = renderTaskForAdapter(
      {
        projectId,
        projectKey,
        projectPath,
        adapter,
        intent: key,
        model,
        projectContext,
      },
      adapter,
    );
    return {
      ok: true,
      prompt: withFleet(body),
      promptLabel: intent.name,
      intent: key,
    };
  }

  const libraryBody = resolveLibraryPromptBody(key);
  if (libraryBody) {
    const contextBlock = renderProjectContextBlock(projectContext);
    const sections = [
      contextBlock,
      `Work on the project at ${projectPath}.`,
      libraryBody,
    ].filter(Boolean);
    return {
      ok: true,
      prompt: withFleet(sections.join("\n\n")),
      promptLabel: key,
      intent: undefined,
    };
  }

  return { ok: false, status: 400, error: `Unknown prompt key: ${key}` };
}
