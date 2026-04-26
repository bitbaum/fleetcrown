import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody, z } from "@/lib/api/route-helpers";

// openclaw agent --json output shape
type OpenclawResult = {
  status?: string;
  result?: {
    payloads?: Array<{ text: string; mediaUrl: string | null }>;
    meta?: { durationMs?: number; agentMeta?: { model?: string } };
  };
};

const AskIvyBody = z.object({
  message: z.string().trim().min(1, "Missing message"),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, AskIvyBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    // Escape for shell — wrap in single quotes, escape any single quotes inside
    const safe = dataOrResp.message.replace(/'/g, "'\\''");

    // Use gateway mode (no --local): openclaw connects to the running gateway service
    // which has API keys loaded. Takes ~20-30s for a typical response.
    const result = await runTool(
      `openclaw agent --agent main --message '${safe}' --json`,
      90000, // 90s timeout
    );

    if (!result.ok) {
      // Log the real error server-side; send a friendly message to the client
      console.error("[ivy] agent call failed:", result.error);
      const friendly = result.error?.includes("timeout")
        ? "Ivy timed out — the request took too long. Try again."
        : "Ivy is unavailable right now — please try again in a moment.";
      return NextResponse.json({ error: friendly }, { status: 500 });
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
