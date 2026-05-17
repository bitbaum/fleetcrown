import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/db";
import { orgs, orgMemberships, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type OrgMember = {
  userId: string;
  name: string | null;
  email: string | null;
  username: string | null;
  image: string | null;
  role: string;
  joinedAt: string;
};

export type OrgWithMembers = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  members: OrgMember[];
};

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find all orgs this user belongs to.
  const memberships = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));

  if (memberships.length === 0) return NextResponse.json({ orgs: [] });

  const orgIds = memberships.map((m) => m.orgId);

  const result: OrgWithMembers[] = [];

  for (const orgId of orgIds) {
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    if (!org) continue;

    const memberRows = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        image: users.image,
        role: orgMemberships.role,
        joinedAt: orgMemberships.createdAt,
      })
      .from(orgMemberships)
      .innerJoin(users, eq(users.id, orgMemberships.userId))
      .where(eq(orgMemberships.orgId, orgId));

    result.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      ownerId: org.ownerId,
      members: memberRows.map((m) => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
      })),
    });
  }

  return NextResponse.json({ orgs: result });
}
