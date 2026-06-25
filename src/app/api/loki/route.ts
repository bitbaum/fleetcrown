import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { askLoki } from "@/lib/loki-core";

const AskLokiBody = z.object({
  message: z.string().trim().min(1, "message is required"),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, AskLokiBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  // Stable per-user session for the global "Ask Loki" modal (own thread, same
  // agent + memory). Distinct from per-conversation Loki-page threads. userId
  // also resolves the caller's writing-voice preference.
  const { status, body } = await askLoki(dataOrResp.message, {
    sessionKey: `agent:main:web:ask:${userId}`,
    userId,
  });
  return NextResponse.json(body, { status });
}
