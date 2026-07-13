import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createInvitation, listInvitations } from "@/db/queries/invitations";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const InviteBody = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await listInvitations(userId);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, InviteBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const email = dataOrResp.email || undefined;

  const invitation = await createInvitation(userId, email);
  return NextResponse.json(invitation, { status: 201 });
}
