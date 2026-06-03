import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { callGroqText, GROQ_FAST_MODEL } from "@/lib/groq";
import { getApiUserId } from "@/lib/session";
import { APP_NAME } from "@/config/brand";

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

const IVY_SYSTEM_PROMPT =
  `You are Ivy, a helpful AI assistant inside ${APP_NAME} — a personal life operating system for builders. Be concise and direct.`;

// Direct Groq fallback when the local openclaw gateway is unavailable.
async function callGroq(message: string): Promise<{ text: string; model: string }> {
  const text = await callGroqText(message, {
    systemPrompt: IVY_SYSTEM_PROMPT,
    maxTokens: 1024,
    timeoutMs: 30_000,
  });
  return { text, model: `groq/${GROQ_FAST_MODEL}` };
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
      console.warn("[ivy] falling back to Groq");
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
    // Surface the actual Groq cause so the user can act (rotate key / wait
    // out rate limit / etc) instead of seeing the generic "unavailable" wall.
    // Mirrors the classification in /api/control/dispatch.
    const raw = e instanceof Error ? e.message : String(e);
    const hint = /\b401\b|invalid.api.key/i.test(raw) ? "Groq API key is invalid"
              : /\b429\b/.test(raw)                  ? "Groq rate-limited — try again shortly"
              : /\b5\d\d\b/.test(raw)                ? "Groq server error"
              : /timeout|abort/i.test(raw)           ? "Groq timed out"
              : `Ivy is unavailable right now (${raw.slice(0, 80)})`;
    console.error("[ivy] Groq fallback failed:", raw);
    return NextResponse.json(
      { error: `Ivy is offline — ${hint}.` },
      { status: 503 },
    );
  }
}
