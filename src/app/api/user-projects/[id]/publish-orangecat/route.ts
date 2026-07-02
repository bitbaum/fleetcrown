import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam } from "@/lib/api/route-helpers";
import { publishProjectToOrangeCat } from "@/lib/integrations/orangecat-publish";
import { isOrangeCatLinked } from "@/lib/integrations/orangecat-identity";

/**
 * POST /api/user-projects/[id]/publish-orangecat — opt-in, per-project
 * "Publish to OrangeCat" (cross-product bridge Part C). Creates the public
 * OrangeCat project as the user's own actor and stores the back-link.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const result = await publishProjectToOrangeCat(userId, idOrResp);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "not_linked" ? 409 : 502;
    const message =
      result.reason === "not_linked"
        ? "Connect your OrangeCat account first (sign in with OrangeCat)."
        : result.reason === "not_found"
          ? "Project not found."
          : "OrangeCat publish failed — try again shortly.";
    return NextResponse.json({ error: message, reason: result.reason }, { status });
  }
  return NextResponse.json({
    ok: true,
    orangecatProjectId: result.orangecatProjectId,
    alreadyPublished: result.reason === "already_published",
  });
}

/** GET — publish state for the button (linked? published?). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const { db } = await import("@/db");
  const { userProjects } = await import("@/db/schema");
  const { and, eq, or } = await import("drizzle-orm");
  const project = await db.query.userProjects.findFirst({
    where: and(
      eq(userProjects.userId, userId),
      or(eq(userProjects.id, idOrResp), eq(userProjects.entityProjectId, idOrResp)),
    ),
    columns: { orangecatProjectId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    linked: await isOrangeCatLinked(userId),
    orangecatProjectId: project.orangecatProjectId ?? null,
  });
}
