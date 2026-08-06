import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getAtlasRows } from "@/db/queries/atlas";

/** Current Atlas state. The client re-reads this after a check or an edit so
 *  what it shows is always an observation, never an optimistic guess. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ rows: await getAtlasRows(userId) });
}
