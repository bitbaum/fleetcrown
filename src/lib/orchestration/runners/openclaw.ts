import { runTool } from "@/lib/tools";
import { shellEscape } from "@/lib/zellij";
import type { OrchestrationTaskRequest } from "../contract";
import { renderTaskForAdapter } from "../renderers";

export type OpenClawRunResult = {
  ok: boolean;
  text?: string;
  raw?: string;
  model?: string;
  durationMs?: number;
  error?: string;
};

type OpenClawAgentResponse = {
  status?: string;
  result?: {
    payloads?: Array<{ text?: string; mediaUrl?: string | null }>;
    meta?: { durationMs?: number; agentMeta?: { model?: string } };
  };
  error?: string;
};

export async function runOpenClawIntent(request: OrchestrationTaskRequest): Promise<OpenClawRunResult> {
  const prompt = renderTaskForAdapter({ ...request, adapter: "openclaw" }, "openclaw");
  const sessionId = `cockpit:${request.projectKey}:${request.intent}:${Date.now()}`;
  const command = `openclaw agent --agent main --session-id ${shellEscape(sessionId)} --message ${shellEscape(prompt)} --json`;
  const result = await runTool(command, 120000);

  if (!result.ok) {
    return { ok: false, error: result.error ?? "OpenClaw run failed" };
  }

  try {
    const parsed = JSON.parse(result.data ?? "{}") as OpenClawAgentResponse;
    return {
      ok: true,
      text: parsed.result?.payloads?.[0]?.text ?? "",
      raw: result.data ?? "",
      model: parsed.result?.meta?.agentMeta?.model,
      durationMs: parsed.result?.meta?.durationMs,
      error: parsed.error,
    };
  } catch {
    return { ok: true, text: result.data ?? "", raw: result.data ?? "" };
  }
}
