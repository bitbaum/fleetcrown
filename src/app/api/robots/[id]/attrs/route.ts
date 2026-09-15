/** Attributes on a robot. The guard keeps `/api/robots/<a person's id>/attrs`
 *  from writing through the wrong door — the attribute table does not care what
 *  kind the entity is, so this route has to. */
import type { NextRequest } from "next/server";
import { entityAttrHandlers } from "@/lib/api/entity-attrs";
import { getRobotDetail } from "@/db/queries/robots";

const handlers = entityAttrHandlers(
  async (userId, id) => (await getRobotDetail(userId, id)) !== null,
);

export function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handlers.POST(req, ctx);
}

export function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handlers.DELETE(req, ctx);
}
