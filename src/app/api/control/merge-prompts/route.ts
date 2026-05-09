import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const Body = z.object({
  prompts: z.array(z.string().trim().min(1)).min(2),
});

type AgentResult = {
  result?: {
    payloads?: Array<{ text: string; mediaUrl: string | null }>;
  };
};

// ── Groq (fast path — seconds, free tier) ──────────────────────────────────
// Set GROQ_API_KEY in .env.local to enable. Falls back to openclaw agent.
async function mergeViaGroq(message: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no key");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: message }],
      max_tokens: 500,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

// ── openclaw fallback (Claude via gateway, ~20-30s) ────────────────────────
// Uses the same agent+model as Ivy. No additional API keys needed.
async function mergeViaAgent(message: string): Promise<string> {
  const safe = message.replace(/'/g, "'\\''");
  const result = await runTool(
    `openclaw agent --agent main --message '${safe}' --json`,
    90000,
  );
  if (!result.ok) throw new Error(result.error ?? "agent error");

  const data = JSON.parse(result.data ?? "{}") as AgentResult;
  return (data?.result?.payloads?.[0]?.text ?? "").trim();
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { prompts } = dataOrResp;
  const numbered = prompts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const message = `I have ${prompts.length} tasks to send to an AI coding agent. Merge them into one concise, coherent prompt that covers all the work naturally. Output ONLY the merged prompt — no preamble, no explanation, no quotes.\n\nTasks:\n${numbered}`;

  // Try Groq first (fast). Fall back to openclaw agent (Claude, ~20-30s).
  try {
    const merged = await mergeViaGroq(message);
    if (merged) return NextResponse.json({ ok: true, merged });
  } catch {
    // Groq unavailable or no key — fall through to agent
  }

  try {
    const merged = await mergeViaAgent(message);
    if (merged) return NextResponse.json({ ok: true, merged });
    return NextResponse.json({ error: "Empty response — please try again." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "AI unavailable — please try again." }, { status: 500 });
  }
}
