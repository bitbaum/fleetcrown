import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

export async function POST(req: Request) {
  // Only allowed when no users exist — prevents takeover after setup
  const [{ value }] = await db.select({ value: count() }).from(users);
  if (value > 0) {
    return NextResponse.json({ error: "Setup already complete." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const name: string = body?.name?.trim() ?? "";
  const password: string = body?.password ?? "";

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      name,
      passwordHash,
      isDefault: true,
      onboardedAt: new Date(),
    })
    .returning({ id: users.id });

  return NextResponse.json({ ok: true, userId: user.id });
}

// HEAD — lets middleware quickly check whether setup is needed
export async function GET() {
  const [{ value }] = await db.select({ value: count() }).from(users);
  return NextResponse.json({ setupDone: value > 0 });
}
