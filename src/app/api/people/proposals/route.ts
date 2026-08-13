import { NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { listBookDrafts, enqueueEnrichmentScan } from "@/db/queries/people-book";

export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const drafts = await listBookDrafts(access.userId);
  return NextResponse.json({ proposals: drafts });
}

export async function POST() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const result = await enqueueEnrichmentScan(access.userId);
  const drafts = await listBookDrafts(access.userId);
  return NextResponse.json({ ok: true, ...result, proposals: drafts });
}
