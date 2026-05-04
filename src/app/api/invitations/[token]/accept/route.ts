import { NextRequest, NextResponse } from "next/server";
import { acceptInvitation } from "@/db/queries/invitations";
import { hashPassword } from "@/lib/password";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const body = await req.json().catch(() => null);
  const name: string = body?.name?.trim() ?? "";
  const password: string = body?.password ?? "";

  if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const result = await acceptInvitation(token, name, passwordHash);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, userId: result.userId });
}
