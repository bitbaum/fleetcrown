import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";

const EXPIRY_HOURS = 2;

export async function createPasswordReset(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

  // Invalidate any existing unused tokens for this user
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

  await db.insert(passwordResetTokens).values({ token, userId, expiresAt });
  return token;
}

export async function getPasswordReset(token: string) {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function consumePasswordReset(token: string): Promise<boolean> {
  const result = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .returning({ id: passwordResetTokens.id });
  return result.length > 0;
}
