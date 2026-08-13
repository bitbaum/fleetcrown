/**
 * List the open approval queue for an agent — the read half of
 * approve-from-chat. Loki fetches this so "what's waiting for me?" in chat
 * answers from the same rows the Approvals page renders, ids included, ready
 * to feed into POST /api/actions/[id]/decision.
 */
import { NextResponse } from "next/server";
import { jsonOk } from "@/lib/api/route-helpers";
import { requirePrivateApiAccessWithBearer } from "@/lib/private-zone-api";
import { getPendingActions } from "@/db/queries/actions";

export async function GET() {
  const access = await requirePrivateApiAccessWithBearer();
  if (access instanceof NextResponse) return access;

  const pending = await getPendingActions(access.userId);
  return jsonOk({
    pending: pending.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      reasoning: a.reasoning,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
    })),
  });
}
