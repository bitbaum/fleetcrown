import { db } from "@/db";
import { orgs, orgMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeUsername } from "@/lib/username";

export async function getOrgMembershipCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));
  return rows.length;
}

/** Creates a personal org for a new user and adds them as owner. */
export async function createPersonalOrg(userId: string, displayName: string): Promise<void> {
  const slug = await uniqueOrgSlug(normalizeUsername(displayName) || "user");

  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(orgs)
      .values({ name: displayName, slug, ownerId: userId })
      .returning({ id: orgs.id });

    await tx.insert(orgMemberships).values({
      orgId: org.id,
      userId,
      role: "owner",
    });
  });
}

async function uniqueOrgSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 0;
  for (;;) {
    const existing = await db
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.slug, candidate));
    if (existing.length === 0) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

export async function getOrgsByUserId(userId: string) {
  return db
    .select({ org: orgs, role: orgMemberships.role })
    .from(orgMemberships)
    .innerJoin(orgs, eq(orgs.id, orgMemberships.orgId))
    .where(eq(orgMemberships.userId, userId));
}

export async function addOrgMember(orgId: string, userId: string, role: "admin" | "member" = "member") {
  await db
    .insert(orgMemberships)
    .values({ orgId, userId, role })
    .onConflictDoUpdate({
      target: [orgMemberships.orgId, orgMemberships.userId],
      set: { role },
    });
}
