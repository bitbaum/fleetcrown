import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const RunCronBody = z.object({
  id: z.string().uuid("Invalid job id"),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, RunCronBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const result = await runTool(`openclaw cron run ${dataOrResp.id} --timeout 10000`, 12000);
    return NextResponse.json({ ok: result.ok, output: result.data, error: result.error });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
