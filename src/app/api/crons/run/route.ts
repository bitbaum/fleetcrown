import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const result = await runTool(`openclaw cron run ${id} --timeout 10000`, 12000);
    return NextResponse.json({ ok: result.ok, output: result.data, error: result.error });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
