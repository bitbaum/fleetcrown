// Owner-gated: list the open self-improvement proposals the frontier loop has
// drafted (status "proposed"), highest-scored first. Reviewed on /system.

import { NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { listOpenProposals } from "@/db/queries/frontier";

export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const proposals = await listOpenProposals(access.userId);
  return NextResponse.json({ proposals });
}
