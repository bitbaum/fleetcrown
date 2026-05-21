import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { readJsonBody } from "@/lib/api/route-helpers";
import { RunCronBody } from "@/lib/crons";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getCronJobRowByOpenclawId } from "@/db/queries/cron-jobs";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, RunCronBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const row = await getCronJobRowByOpenclawId(userId, dataOrResp.id);
  if (!row) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (!isRuntimeAvailable()) {
    return NextResponse.json(
      { error: "Running cron jobs requires the local openclaw runtime on your machine." },
      { status: 503 },
    );
  }

  try {
    const result = await runTool(`openclaw cron run ${dataOrResp.id} --timeout 10000`, 12000);
    return NextResponse.json({ ok: result.ok, output: result.data, error: result.error });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
