import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = await ctx.params;

  // Safety check: ensure user won't lose their only auth method.
  const [user, otherAccounts] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { passwordHash: true } }),
    db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), ne(accounts.provider, provider))),
  ]);

  const hasPassword = !!user?.passwordHash;
  const hasOtherProvider = otherAccounts.length > 0;

  if (!hasPassword && !hasOtherProvider) {
    return NextResponse.json(
      { error: "Cannot disconnect — this is your only sign-in method. Set a password first." },
      { status: 400 },
    );
  }

  await db
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));

  return NextResponse.json({ ok: true });
}
