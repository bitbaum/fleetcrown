import { NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { ensureDefaultVacuums } from "@/db/queries/robots";

export async function POST() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const robots = await ensureDefaultVacuums(access.userId);
  return NextResponse.json({ ok: true, robots });
}
