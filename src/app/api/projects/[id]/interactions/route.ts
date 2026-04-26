import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interactions } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam } from "@/lib/api/route-helpers";

const VALID_DIRECTIONS = ["inbound", "outbound"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const body = await req.json();
  const { channel, direction, summary, occurredAt } = body as {
    channel?: string;
    direction?: string;
    summary?: string;
    occurredAt?: string;
  };

  if (!channel?.trim()) return NextResponse.json({ error: "channel is required" }, { status: 400 });
  if (!direction || !VALID_DIRECTIONS.includes(direction as typeof VALID_DIRECTIONS[number])) {
    return NextResponse.json({ error: "direction must be inbound or outbound" }, { status: 400 });
  }

  const [created] = await db
    .insert(interactions)
    .values({
      userId: DEFAULT_USER_ID,
      entityId: id,
      channel: channel.trim(),
      direction: direction as typeof VALID_DIRECTIONS[number],
      summary: summary?.trim() || null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    })
    .returning();

  return NextResponse.json({ ok: true, interaction: created }, { status: 201 });
}
