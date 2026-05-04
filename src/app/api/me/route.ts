import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { normalizeUsername } from "@/lib/username";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const PatchBody = z.object({
  username: z.preprocess(
    (value) => (typeof value === "string" ? normalizeUsername(value) : value),
    z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  ).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  onboardedAt: z.string().datetime().optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, PatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { username, name, onboardedAt } = dataOrResp;

  // Check username uniqueness
  if (username) {
    const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(username !== undefined && { username }),
      ...(name !== undefined && { name }),
      ...(onboardedAt !== undefined && { onboardedAt: new Date(onboardedAt) }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return NextResponse.json(updated);
}
