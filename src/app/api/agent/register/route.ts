import { NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { getUserById } from "@/db/queries/users";
import { getOrgsByUserId } from "@/db/queries/orgs";

/**
 * GET /api/agent/register
 *
 * Called by the hosted agent installer after the user pastes a token.
 * Verifies the token is valid and returns the user + org context the agent
 * should operate under. The CLI stores this response alongside the token.
 */
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user, memberships] = await Promise.all([
    getUserById(userId),
    getOrgsByUserId(userId),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
    },
    orgs: memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      role: m.role,
    })),
  });
}
