import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";

// openclaw agent --json output shape
type OpenclawResult = {
  status?: string;
  result?: {
    payloads?: Array<{ text: string; mediaUrl: string | null }>;
    meta?: { durationMs?: number; agentMeta?: { model?: string } };
  };
};

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // Escape for shell — wrap in single quotes, escape any single quotes inside
    const safe = message.trim().replace(/'/g, "'\\''");

    // Use gateway mode (no --local): openclaw connects to the running gateway service
    // which has API keys loaded. Takes ~20-30s for a typical response.
    const result = await runTool(
      `openclaw agent --agent main --message '${safe}' --json`,
      90000, // 90s timeout
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Agent failed" }, { status: 500 });
    }

    try {
      const data: OpenclawResult = JSON.parse(result.data ?? "{}");
      const text = data?.result?.payloads?.[0]?.text ?? "";
      const model = data?.result?.meta?.agentMeta?.model ?? "";
      const durationMs = data?.result?.meta?.durationMs ?? 0;
      return NextResponse.json({ ok: true, text, model, durationMs });
    } catch {
      return NextResponse.json({ ok: true, text: result.data ?? "" });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
