/**
 * NL command resolution for the command composer (Loki Phase 1).
 *
 * Turns a plain-language input into a routable decision, per the design in
 * docs/loki-command-surface.md and George's calls:
 *   - chat vs command: route each input to one or the other.
 *   - ask when ambiguous: a command with no resolvable project sets
 *     needsProject=true so the UI asks instead of guessing.
 *   - dispatch is fire-and-forget into the project's session (the caller posts
 *     to /api/inject); this endpoint only RESOLVES, it does not dispatch.
 *
 * Resolution is one fast Groq call, with a deterministic fallback (exact
 * project-name substring match, treat as command) when the LLM is unavailable —
 * so the composer degrades to "named project → run", never to a hang.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiUserId } from "@/lib/session";
import { callGroqText } from "@/lib/groq";
import { ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  projects: z.array(z.string().trim().min(1)).max(200).default([]),
  selectedProject: z.string().trim().min(1).optional(),
});

export type CommandResolution = {
  kind: "command" | "chat";
  projectKey: string | null;
  intentId: OrchestrationTaskIntentId | null;
  prompt: string;
  needsProject: boolean;
  reason: string;
};

const SYSTEM = `You route an operator's input in a multi-project AI-agent console. Return ONLY compact JSON with keys: kind, projectKey, intentId, prompt, reason.
- kind: "command" if they want an agent to DO work on a project; "chat" if they're asking a question or just discussing.
- projectKey: the EXACT project name (copied verbatim from the provided list) the input refers to, or null if none is named. NEVER invent a name that is not in the list.
- intentId: one of [${ORCHESTRATION_TASK_INTENT_IDS.join(", ")}] when the request clearly maps to one, else null. Hints: "code review"->quality; "review the ui"/"ux"->ux_review; "run tests"/"fix types"/"fix tests"->test_and_fix; "commit"/"push"->commit_push; "audit"/"full audit"->full_audit; "what next"/"keep going"/"next best"->next_best; "deploy check"->deploy_check; "product review"->product; "wrap up"/"close"->close_session.
- prompt: the cleaned instruction to give the agent (for command) or the user's message (for chat), with the project name removed.
- reason: <= 8 words.`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const { text, projects, selectedProject } = body;

  // Deterministic exact match first — a project named in the text wins, and is
  // the fallback if the LLM is unavailable or returns an unlisted name.
  const lower = text.toLowerCase();
  const namedInText = projects.find((p) => lower.includes(p.toLowerCase())) ?? null;

  let resolution: CommandResolution;
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

    resolution = {
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
    resolution = {
      kind: "command",
      projectKey,
      intentId: null,
      prompt: text,
      needsProject: !projectKey,
      reason: "deterministic (no llm)",
    };
  }

  return NextResponse.json(resolution);
}
