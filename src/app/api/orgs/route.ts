import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/db";
import { orgs, orgMemberships, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

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

  // Query 1: all orgs the user belongs to (single join, no loop).
  const orgRows = await db
    .select({ id: orgs.id, name: orgs.name, slug: orgs.slug, ownerId: orgs.ownerId })
    .from(orgMemberships)
    .innerJoin(orgs, eq(orgs.id, orgMemberships.orgId))
    .where(eq(orgMemberships.userId, userId));

  if (orgRows.length === 0) return NextResponse.json({ orgs: [] });

  const orgIds = orgRows.map((o) => o.id);

  // Query 2: all members across those orgs (single query, grouped in memory).
  const memberRows = await db
    .select({
      orgId: orgMemberships.orgId,
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
    .where(inArray(orgMemberships.orgId, orgIds));

  const membersByOrg = new Map<string, OrgMember[]>();
  for (const m of memberRows) {
    const list = membersByOrg.get(m.orgId) ?? [];
    list.push({
      userId: m.userId,
      name: m.name,
      email: m.email,
      username: m.username,
      image: m.image,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    });
    membersByOrg.set(m.orgId, list);
  }

  const result: OrgWithMembers[] = orgRows.map((org) => ({
    ...org,
    members: membersByOrg.get(org.id) ?? [],
  }));

  return NextResponse.json({ orgs: result });
}
