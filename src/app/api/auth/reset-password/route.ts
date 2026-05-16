import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getPasswordReset, consumePasswordReset } from "@/db/queries/passwordResets";
import { hashPassword } from "@/lib/password";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const Body = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { token, password } = dataOrResp;

  const reset = await getPasswordReset(token);
  if (!reset) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const consumed = await consumePasswordReset(token);
  if (!consumed) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, reset.userId));

  return NextResponse.json({ ok: true });
}
