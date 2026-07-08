import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { askLoki } from "@/lib/loki-core";
import { getProjectContext } from "@/db/queries/project-context";

const AskLokiBody = z.object({
  message: z.string().trim().min(1, "message is required"),
  // When set, scope the conversation to a project: load its brief + goals as
  // context so Loki reasons about it, and keep a per-project thread.
  projectKey: z.string().trim().max(120).optional(),
  // Include the (token-heavy) full context this turn — the client sends true on
  // the first message of a project thread, false after (the agent's session
  // memory carries it forward).
  includeContext: z.boolean().default(false),
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
  let message = dataOrResp.message;
  let sessionKey =
    process.env.LOKI_PERSONAL_SESSION_KEY?.trim() || `agent:main:web:ask:${userId}`;

  // Project-scoped discussion: a per-project thread, with the project's brief +
  // goals prefaced so Loki reasons as a partner on THIS project (not the generic
  // assistant). Context is prefaced only on the first turn; the shared agent's
  // per-session memory carries it forward.
  if (dataOrResp.projectKey) {
    sessionKey = `agent:main:web:project:${dataOrResp.projectKey.toLowerCase()}:${userId}`;
    if (dataOrResp.includeContext) {
      const ctx = await getProjectContext(userId, dataOrResp.projectKey).catch(() => null);
      if (ctx) {
        message = `You are Loki, acting as a reasoning partner on the owner's project "${dataOrResp.projectKey}". Here is its current context — use it to give specific, grounded answers:\n\n${ctx}\n\n---\n\nThe owner says:\n${dataOrResp.message}`;
      }
    }
  }

  const { status, body } = await askLoki(message, { sessionKey, userId });
  return NextResponse.json(body, { status });
}
