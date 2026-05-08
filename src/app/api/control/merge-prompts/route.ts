import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const Body = z.object({
  prompts: z.array(z.string().trim().min(1)).min(2),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { prompts } = dataOrResp;
  const numbered = prompts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const message = `I have ${prompts.length} tasks to send to an AI coding agent. Merge them into one concise, coherent prompt that covers all the work naturally. Output ONLY the merged prompt — no preamble, no explanation, no quotes.\n\nTasks:\n${numbered}`;

  const safe = message.replace(/'/g, "'\\''");
  const result = await runTool(
    `openclaw agent --agent main --message '${safe}' --json`,
    90000,
  );

  if (!result.ok) {
    const friendly = result.error?.includes("timeout")
      ? "Timed out — try again."
      : "AI unavailable — please try again.";
    return NextResponse.json({ error: friendly }, { status: 500 });
  }

  try {
    const data = JSON.parse(result.data ?? "{}");
    const merged = data?.result?.payloads?.[0]?.text?.trim() ?? "";
    return NextResponse.json({ ok: true, merged });
  } catch {
    return NextResponse.json({ ok: true, merged: result.data?.trim() ?? "" });
  }
}
