import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { HOUR_MS } from "@/lib/constants/time";

const EXPIRY_HOURS = 24;

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * HOUR_MS);

  // Invalidate any previous unused tokens for this user
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));

  await db.insert(emailVerificationTokens).values({ token, userId, expiresAt });
  return token;
}

export async function getEmailVerificationToken(token: string) {
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.token, token),
        gt(emailVerificationTokens.expiresAt, new Date()),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function consumeEmailVerificationToken(token: string): Promise<string | null> {
  const row = await getEmailVerificationToken(token);
  if (!row) return null;

  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.token, token));

  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, row.userId));

  return row.userId;
}
