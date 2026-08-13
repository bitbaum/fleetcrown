import { NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { findDuplicatePeople } from "@/db/queries/people-merge";

export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const clusters = await findDuplicatePeople(access.userId);
  return NextResponse.json({ clusters });
}
