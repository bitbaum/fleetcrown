import { NextResponse } from "next/server";
import { getKnowledgeIndexStats } from "@/db/queries/knowledge-index-stats";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

/** GET /api/memory/rag-stats — fleet-knowledge vector index health (Memory page SSOT). */
export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const stats = await getKnowledgeIndexStats(access.userId);
  return NextResponse.json(stats);
}
