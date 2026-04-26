import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/utils";

/**
 * Resolve and validate the `id` route param at a `/[id]` API handler.
 *
 * Returns the validated id as a string, or a 400 NextResponse the
 * caller should return as-is. Centralises the boilerplate that every
 * `/api/.../[id]/route.ts` had at the top of every method handler.
 *
 *   const idOrResp = await readIdParam(ctx.params);
 *   if (idOrResp instanceof NextResponse) return idOrResp;
 *   const id = idOrResp;
 */
export async function readIdParam(
  params: Promise<{ id: string }>,
): Promise<string | NextResponse> {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  return id;
}
