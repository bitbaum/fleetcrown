import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { enqueuePendingCommand } from "@/db/queries/pending-commands";

const PeekTabBody = z.object({
  tab: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, PeekTabBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const peekId = await enqueuePendingCommand({
    userId,
    type: "peek_tab",
    payload: { tab: dataOrResp.tab },
  });

  return NextResponse.json({ ok: true, peekId });
}
