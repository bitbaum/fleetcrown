import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interactions } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";

const CreateInteractionBody = z.object({
  channel: z.string().trim().min(1, "channel is required"),
  direction: z.enum(["inbound", "outbound"], { error: "direction must be inbound or outbound" }),
  summary: z.string().trim().optional(),
  occurredAt: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, CreateInteractionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { channel, direction, summary, occurredAt } = dataOrResp;

  const [created] = await db
    .insert(interactions)
    .values({
      userId: DEFAULT_USER_ID,
      entityId: id,
      channel,
      direction,
      summary: summary || null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    })
    .returning();

  return NextResponse.json({ ok: true, interaction: created }, { status: 201 });
}
