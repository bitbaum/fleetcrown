import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // Escape for shell — wrap in single quotes, escape any single quotes inside
    const safe = message.trim().replace(/'/g, "'\\''");
    const result = await runTool(
      `openclaw agent --agent main --message '${safe}' --json`,
      60000, // 60s — Ivy can take a moment
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Agent failed" }, { status: 500 });
    }

    try {
      const data = JSON.parse(result.data ?? "{}");
      const text: string = data?.result?.payloads?.[0]?.text ?? data?.summary ?? "";
      const model: string = data?.result?.meta?.agentMeta?.model ?? "";
      const durationMs: number = data?.result?.meta?.durationMs ?? 0;
      return NextResponse.json({ ok: true, text, model, durationMs });
    } catch {
      // Raw text fallback
      return NextResponse.json({ ok: true, text: result.data ?? "" });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
