import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

// openclaw agent --json output shape
type OpenclawResult = {
  status?: string;
  result?: {
    payloads?: Array<{ text: string; mediaUrl: string | null }>;
    meta?: { durationMs?: number; agentMeta?: { model?: string } };
  };
};

const AskIvyBody = z.object({
  message: z.string().trim().min(1, "message is required"),
});

// Direct Groq API fallback when the local openclaw gateway is unavailable
async function callGroq(message: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const model = "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are Ivy, a helpful AI assistant inside Cockpit — a personal life operating system for builders. Be concise and direct.",
        },
        { role: "user", content: message },
      ],
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  return { text, model: `groq/${model}` };
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, AskIvyBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { message } = dataOrResp;

  // Try openclaw gateway first
  if (process.env.OPENCLAW_GATEWAY_URL || process.env.OPENCLAW_ENABLED !== "false") {
    try {
      const safe = message.replace(/'/g, "'\\''");
      const result = await runTool(
        `openclaw agent --agent main --message '${safe}' --json`,
        90000,
      );

      if (result.ok) {
        try {
          const data: OpenclawResult = JSON.parse(result.data ?? "{}");
          const text = data?.result?.payloads?.[0]?.text ?? "";
          const model = data?.result?.meta?.agentMeta?.model ?? "";
          const durationMs = data?.result?.meta?.durationMs ?? 0;
          return NextResponse.json({ ok: true, text, model, durationMs });
        } catch {
          return NextResponse.json({ ok: true, text: result.data ?? "" });
        }
      }

      // openclaw failed — fall through to Groq if available
      const isTimeout = result.error?.includes("timeout");
      console.error("[ivy] openclaw failed:", result.error);
      if (!process.env.GROQ_API_KEY) {
        const friendly = isTimeout
          ? "Ivy timed out — the request took too long. Try again."
          : "Ivy is unavailable right now — please try again in a moment.";
        return NextResponse.json({ error: friendly }, { status: 500 });
      }
      console.log("[ivy] falling back to Groq");
    } catch (e) {
      console.error("[ivy] openclaw exception:", e);
      if (!process.env.GROQ_API_KEY) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
      }
    }
  }

  // Groq fallback
  try {
    const { text, model } = await callGroq(message);
    return NextResponse.json({ ok: true, text, model, durationMs: 0, via: "groq" });
  } catch (e) {
    console.error("[ivy] Groq fallback failed:", e);
    return NextResponse.json(
      { error: "Ivy is unavailable right now — please try again in a moment." },
      { status: 500 },
    );
  }
}
