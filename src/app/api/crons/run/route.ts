import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    const result = await runTool(`openclaw cron run ${id} --timeout 10000`, 12000);
    return NextResponse.json({ ok: result.ok, output: result.data, error: result.error });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
