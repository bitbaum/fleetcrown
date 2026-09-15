/** Attributes on a person. No guard: any entity the caller owns is fair game
 *  here, which is what this route already did.
 *
 *  The handlers are re-exported as plain functions rather than destructured
 *  straight off the factory — Next resolves a route's methods from the module's
 *  exports, and a named function is the shape it is guaranteed to see. */
import type { NextRequest } from "next/server";
import { entityAttrHandlers } from "@/lib/api/entity-attrs";

const handlers = entityAttrHandlers();

export function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handlers.POST(req, ctx);
}

export function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handlers.DELETE(req, ctx);
}
