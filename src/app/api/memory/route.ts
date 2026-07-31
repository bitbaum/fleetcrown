import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { forgetAllMemory } from "@/db/queries/memory";

/**
 * DELETE /api/memory?all=true — forget everything (data controls).
 *
 * Wipes the user's knowledge graph (entities + attributes + interactions +
 * relations) AND the RAG vector index (knowledge_embeddings). Explicit
 * ?all=true so a stray DELETE on the collection can never wipe by accident.
 * PIN-gated like every other memory surface.
 */
export async function DELETE(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;

  if (req.nextUrl.searchParams.get("all") !== "true") {
    return NextResponse.json(
      { error: "Pass ?all=true to forget all memory" },
      { status: 400 },
    );
  }

  await forgetAllMemory(access.userId);
  return NextResponse.json({ ok: true });
}
