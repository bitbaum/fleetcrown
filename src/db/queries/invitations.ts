import { eq, and, gt } from "drizzle-orm";
import { db } from "@/db";
import { invitations, users, orgMemberships, orgs, type Invitation } from "@/db/schema";
import { randomBytes } from "crypto";
import { INVITATION_EXPIRY_DAYS } from "@/lib/constants";
import { createPersonalOrg, getOwnerOrgId } from "@/db/queries/orgs";

export async function createInvitation(createdBy: string, email?: string): Promise<Invitation> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
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
  email?: string,
): Promise<{ userId: string } | { error: string }> {
  const invite = await getInvitation(token);
  if (!invite) return { error: "Invitation not found or expired." };
  if (invite.usedAt) return { error: "Invitation already used." };

  const { userId } = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        name,
        email: invite.email ?? email ?? null,
        passwordHash,
      })
      .returning({ id: users.id });

    await tx
      .update(invitations)
      .set({ usedBy: user.id, usedAt: new Date() })
      .where(eq(invitations.token, token));

    // Add new member to inviter's org (if the inviter owns one).
    const [inviterOrg] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.ownerId, invite.createdBy))
      .limit(1);

    if (inviterOrg) {
      await tx.insert(orgMemberships).values({
        orgId: inviterOrg.id,
        userId: user.id,
        role: "member",
      }).onConflictDoNothing();
    }

    return { userId: user.id };
  });

  // Bootstrap the invitee's OWN personal owned org — the same bootstrap that
  // auth.ts events.signIn performs for normal OAuth/credential users. That hook
  // only fires when the user has zero org memberships, but an invitee already
  // belongs to the inviter's org by the time sign-in runs, so its guard skips
  // them and getOwnerOrgId() stays null forever. A null owner-org later breaks
  // agent-token / event-stream-token creation, and if the inviter owns no org
  // the invitee would be fully orphaned. Idempotent: only create if absent, and
  // outside the accept transaction so a bootstrap failure can't void a valid
  // invite acceptance (sign-in's events.signIn is a second safety net only when
  // the membership count is zero, which it won't be here).
  const ownedOrg = await getOwnerOrgId(userId);
  if (!ownedOrg) {
    await createPersonalOrg(userId, name);
  }

  return { userId };
}
