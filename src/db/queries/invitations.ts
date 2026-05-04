import { eq, and, gt } from "drizzle-orm";
import { db } from "@/db";
import { invitations, users, type Invitation } from "@/db/schema";
import { randomBytes } from "crypto";

const EXPIRY_DAYS = 7;

export async function createInvitation(createdBy: string, email?: string): Promise<Invitation> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(invitations)
    .values({ token, email: email?.toLowerCase().trim() || null, createdBy, expiresAt })
    .returning();
  return row;
}

export async function getInvitation(token: string): Promise<Invitation | null> {
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), gt(invitations.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function listInvitations(createdBy: string): Promise<Invitation[]> {
  return db
    .select()
    .from(invitations)
    .where(eq(invitations.createdBy, createdBy))
    .orderBy(invitations.createdAt);
}

export async function acceptInvitation(
  token: string,
  name: string,
  passwordHash: string,
): Promise<{ userId: string } | { error: string }> {
  const invite = await getInvitation(token);
  if (!invite) return { error: "Invitation not found or expired." };
  if (invite.usedAt) return { error: "Invitation already used." };

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        name,
        email: invite.email,
        passwordHash,
        onboardedAt: new Date(),
      })
      .returning({ id: users.id });

    await tx
      .update(invitations)
      .set({ usedBy: user.id, usedAt: new Date() })
      .where(eq(invitations.token, token));

    return { userId: user.id };
  });
}
