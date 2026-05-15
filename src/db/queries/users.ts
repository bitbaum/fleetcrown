import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export async function getUserById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) }) ?? null;
}

export async function getUserByUsername(username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) }) ?? null;
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
