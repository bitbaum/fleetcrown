/**
 * NL command resolution for the Loki command composer (SSOT).
 *
 * Turns a plain-language input into a routable decision, per the design in
 * docs/loki-command-surface.md and George's calls:
 *   - chat vs command: route each input to one or the other.
 *   - ask when ambiguous: a command with no resolvable project sets
 *     needsProject=true so the UI asks instead of guessing.
 *   - dispatch is fire-and-forget into the project's session (the caller posts
 *     to /api/inject); this resolver only RESOLVES, it does not dispatch.
 *
 * Resolution is one fast Groq call, with a deterministic fallback (exact
 * project-name substring match, treat as command) when the LLM is unavailable —
 * so the composer degrades to "named project → run", never to a hang.
 *
 * This is the single resolver shared by /api/command/resolve and the Loki
 * /api/conversations/[id]/messages route — neither keeps its own copy.
 */
import { callGroqText } from "@/lib/groq";
import { ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";

export type CommandResolution = {
  kind: "command" | "chat";
  projectKey: string | null;
  intentId: OrchestrationTaskIntentId | null;
  prompt: string;
  needsProject: boolean;
  reason: string;
};

export type ResolveCommandInput = {
  text: string;
  projects: string[];
  selectedProject?: string;
};

const SYSTEM = `You route an operator's input in a multi-project AI-agent console. Return ONLY compact JSON with keys: kind, projectKey, intentId, prompt, reason.
- kind: "command" if they want an agent to DO work on a project; "chat" if they're asking a question or just discussing.
- projectKey: the EXACT project name (copied verbatim from the provided list) the input refers to, or null if none is named. NEVER invent a name that is not in the list.
- intentId: one of [${ORCHESTRATION_TASK_INTENT_IDS.join(", ")}] when the request clearly maps to one, else null. Hints: "code review"->quality; "review the ui"/"ux"->ux_review; "run tests"/"fix types"/"fix tests"->test_and_fix; "commit"/"push"->commit_push; "audit"/"full audit"->full_audit; "what next"/"keep going"/"next best"->next_best; "deploy check"->deploy_check; "product review"->product; "wrap up"/"close"->close_session.
- prompt: the cleaned instruction to give the agent (for command) or the user's message (for chat), with the project name removed.
- reason: <= 8 words.`;

/**
 * Resolve a natural-language input into a routable {@link CommandResolution}.
 * Resolution is currently stateless; the route callers pass userId at the HTTP
 * boundary (auth + scoping) and a future revision can bias by recent/active
 * project, so the param is reserved here without being consumed yet.
 */
export async function resolveCommand(
  { text, projects, selectedProject }: ResolveCommandInput,
  userId?: string,
): Promise<CommandResolution> {
  void userId; // reserved for per-user biasing; see doc comment.
  // Deterministic exact match first — a project named in the text wins, and is
  // the fallback if the LLM is unavailable or returns an unlisted name.
  const lower = text.toLowerCase();
  const namedInText = projects.find((p) => lower.includes(p.toLowerCase())) ?? null;

  try {
    const out = await callGroqText(
      `Projects: ${JSON.stringify(projects)}\nCurrently selected project: ${selectedProject ?? "none"}\nInput: ${text}`,
      { systemPrompt: SYSTEM, maxTokens: 220, temperature: 0, timeoutMs: 8000 },
    );
    const raw = JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as Record<string, unknown>;

    const llmProject = typeof raw.projectKey === "string" && projects.includes(raw.projectKey) ? raw.projectKey : null;
    const projectKey = llmProject ?? namedInText ?? selectedProject ?? null;
    const intentId = typeof raw.intentId === "string" && (ORCHESTRATION_TASK_INTENT_IDS as readonly string[]).includes(raw.intentId)
      ? (raw.intentId as OrchestrationTaskIntentId)
      : null;
    const kind = raw.kind === "chat" ? "chat" : "command";
    const prompt = typeof raw.prompt === "string" && raw.prompt.trim() ? raw.prompt.trim() : text;

    return {
      kind,
      projectKey,
      intentId,
      prompt,
      needsProject: kind === "command" && !projectKey,
      reason: typeof raw.reason === "string" ? raw.reason.slice(0, 60) : "",
    };
  } catch {
    // LLM unavailable → degrade to a deterministic command: project from the
    // text or the current selection; ask if neither.
    const projectKey = namedInText ?? selectedProject ?? null;
    return {
      kind: "command",
      projectKey,
      intentId: null,
      prompt: text,
      needsProject: !projectKey,
      reason: "deterministic (no llm)",
    };
  }
}
