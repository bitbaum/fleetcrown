import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createInvitation, listInvitations } from "@/db/queries/invitations";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const InviteBody = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await listInvitations(session.user.id);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, InviteBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const email = dataOrResp.email || undefined;

  const invitation = await createInvitation(session.user.id, email);
  return NextResponse.json(invitation, { status: 201 });
}
