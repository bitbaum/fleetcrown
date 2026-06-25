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

  // "Ask Loki" = the user's PERSONAL Loki conversation. When LOKI_PERSONAL_SESSION_KEY
  // is set (single-tenant box: the operator's `agent:main:direct:<id>`), the modal joins
  // the SAME session as Telegram/WhatsApp → one continuous conversation across surfaces.
  // Unset (multi-tenant default) → a stable per-user web thread. The Loki *page* keeps
  // its own per-conversation threads regardless (same agent + memory).
  // userId also resolves the caller's writing-voice preference.
  const personalSessionKey =
    process.env.LOKI_PERSONAL_SESSION_KEY?.trim() || `agent:main:web:ask:${userId}`;
  const { status, body } = await askLoki(dataOrResp.message, { sessionKey: personalSessionKey, userId });
  return NextResponse.json(body, { status });
}
