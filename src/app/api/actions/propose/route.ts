import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { readJsonBody } from "@/lib/api/route-helpers";
import { proposeAction } from "@/db/queries/actions";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { ACTION_TYPE } from "@/lib/constants/statuses";

const ProposeActionBody = z.object({
  type: z.enum(Object.values(ACTION_TYPE) as [string, ...string[]]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  reasoning: z.string().trim().max(2000).optional(),
  entityId: z.string().uuid().optional(),
  expiresAt: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid date")
    .optional(),
});

/**
 * Producer seam for Ivy's action queue. Enqueues a status='draft' action that
 * George must approve before anything executes (IRON RULE — see schema/actions.ts).
 * This is the entry point the future "handle X" loop calls; nothing here executes.
 */
export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const dataOrResp = await readJsonBody(req, ProposeActionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const body = dataOrResp;

  const action = await proposeAction(userId, {
    type: body.type as (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE],
    title: body.title,
    description: body.description,
    payload: body.payload,
    reasoning: body.reasoning,
    entityId: body.entityId,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
  });

  // Re-proposal of an already-pending title dedupes to null (partial unique index).
  if (!action) {
    return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
  }

  await recordActionAuditEvent(userId, action, "proposed");
  return NextResponse.json({ ok: true, action }, { status: 201 });
}
