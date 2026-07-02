import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import type { Plan, PlanStatus } from "@/db/schema/users";

export async function getUserById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) }) ?? null;
}

export async function getUserByUsername(username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) }) ?? null;
}

export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase().trim()) }) ?? null;
}

export async function createUser(data: { name: string; email: string; passwordHash: string }) {
  const [user] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      // onboardedAt set server-side by POST /api/onboarding when username is valid
    })
    .returning({ id: users.id });
  return user;
}

export async function getDefaultUser() {
  return db.query.users.findFirst({ where: eq(users.isDefault, true) }) ?? null;
}

export async function getUserCount(): Promise<number> {
  const [{ value }] = await db.select({ value: count() }).from(users);
  return value;
}

export interface CreateInitialUserInput {
  name: string;
  passwordHash: string;
}

export async function createInitialUser(data: CreateInitialUserInput) {
  const [user] = await db
    .insert(users)
    .values({ name: data.name, passwordHash: data.passwordHash, isDefault: true, onboardedAt: new Date() })
    .returning({ id: users.id });
  return user;
}

export interface UpdateUserInput {
  username?: string;
  name?: string;
  email?: string | null;
  image?: string | null;
  onboardedAt?: Date;
}

export interface UpdateUserBillingInput {
  plan?: Plan;
  planStatus?: PlanStatus | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
}

export async function getUserByStripeCustomerId(stripeCustomerId: string) {
  return db.query.users.findFirst({ where: eq(users.stripeCustomerId, stripeCustomerId) }) ?? null;
}

export async function updateUserBilling(id: string, patch: UpdateUserBillingInput) {
  const [updated] = await db
    .update(users)
    .set({
      ...(patch.plan              !== undefined && { plan:                 patch.plan }),
      ...(patch.planStatus        !== undefined && { planStatus:           patch.planStatus }),
      ...(patch.stripeCustomerId  !== undefined && { stripeCustomerId:     patch.stripeCustomerId }),
      ...(patch.stripeSubscriptionId !== undefined && { stripeSubscriptionId: patch.stripeSubscriptionId }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  return updated ?? null;
}

export async function updateUserPasswordHash(id: string, passwordHash: string) {
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
}

/**
 * Link (or clear) the user's OrangeCat actor — set on every "Login with
 * OrangeCat" sign-in (id_token.sub), see events.signIn in src/auth.ts.
 */
export async function setUserOrangeCatActorId(id: string, orangecatActorId: string | null) {
  await db.update(users).set({ orangecatActorId, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function updateUser(id: string, patch: UpdateUserInput) {
  const [updated] = await db
    .update(users)
    .set({
      ...(patch.username !== undefined && { username: patch.username }),
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.email !== undefined && { email: patch.email }),
      ...(patch.image !== undefined && { image: patch.image }),
      ...(patch.onboardedAt !== undefined && { onboardedAt: patch.onboardedAt }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  return updated ?? null;
}
