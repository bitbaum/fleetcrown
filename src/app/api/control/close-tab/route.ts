import { NextRequest, NextResponse } from "next/server";
import { enqueueTabCommand } from "@/db/queries/pending-commands";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

const CloseTabBody = z.object({
  tab: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataOrResp = await readJsonBody(req, CloseTabBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const commandId = await enqueueTabCommand(userId, "close_tab", { tab: dataOrResp.tab });
  return NextResponse.json({ ok: true, queued: true, commandId });
}
