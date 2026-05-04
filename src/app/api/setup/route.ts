import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const SetupBody = z.object({
  name:     z.string().trim().min(2, "Name must be at least 2 characters."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  // Only allowed when no users exist — prevents takeover after setup
  const [{ value }] = await db.select({ value: count() }).from(users);
  if (value > 0) {
    return NextResponse.json({ error: "Setup already complete." }, { status: 409 });
  }

  const dataOrResp = await readJsonBody(req, SetupBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, password } = dataOrResp;

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
