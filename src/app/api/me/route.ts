import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { normalizeUsername } from "@/lib/username";

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
  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { username, name, onboardedAt } = parsed.data;

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
