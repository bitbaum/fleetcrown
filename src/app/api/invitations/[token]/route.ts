import { NextResponse } from "next/server";
import { getInvitation } from "@/db/queries/invitations";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvitation(token);
  if (!invite) return NextResponse.json({ error: "Invalid or expired invitation." }, { status: 404 });
  return NextResponse.json({ valid: true, email: invite.email, used: !!invite.usedAt });
}
