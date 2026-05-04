import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createInvitation, listInvitations } from "@/db/queries/invitations";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await listInvitations(session.user.id);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = body?.email?.trim() || undefined;

  const invitation = await createInvitation(session.user.id, email);
  return NextResponse.json(invitation, { status: 201 });
}
