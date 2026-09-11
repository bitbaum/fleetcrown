import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam } from "@/lib/api/route-helpers";
import {
  publishProjectToOrangeCat,
  unpublishProjectFromOrangeCat,
} from "@/lib/integrations/orangecat-publish";
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

/**
 * DELETE — take it back down.
 *
 * Publishing was one-way: there was no unpublish anywhere, and the back-link
 * could never be cleared, so "already published" was permanent and the public
 * page stayed up. This sets the OrangeCat project back to draft (owner-only
 * there) and forgets the link. The project, its funding and its wall survive;
 * publishing again puts it back.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const result = await unpublishProjectFromOrangeCat(userId, idOrResp);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "not_linked" ? 409 : 502;
    const message =
      result.reason === "not_linked"
        ? "Connect your OrangeCat account first (sign in with OrangeCat)."
        : result.reason === "not_found"
          ? "Project not found."
          : result.reason === "oc_too_old"
            ? "This OrangeCat cannot be asked to unpublish yet — it needs the 2026-09-11 release."
            : "OrangeCat did not accept the change — try again shortly.";
    return NextResponse.json({ error: message, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, wasPublished: result.reason !== "not_published" });
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
