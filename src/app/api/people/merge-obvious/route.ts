import { NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { mergeObviousTwins } from "@/db/queries/people-book";

export async function POST() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const result = await mergeObviousTwins(access.userId);
  return NextResponse.json({ ok: true, ...result });
}
