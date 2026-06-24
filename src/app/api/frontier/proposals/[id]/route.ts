// Owner-gated: decide a self-improvement proposal.
//   POST { action: "accept" } → creates a roadmap goal from the proposal
//   POST { action: "dismiss" } → marks it dismissed (grounds future runs)
// The fleet only ever PROPOSES; this human decision is what closes the loop.

import { type NextRequest, NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { decideProposal } from "@/db/queries/frontier";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 });
  }

  const result = await decideProposal(access.userId, id, action);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(result);
}
