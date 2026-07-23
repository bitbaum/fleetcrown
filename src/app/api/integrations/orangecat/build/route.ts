import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  orangecatBuildIntents,
  userProjects,
} from "@/db/schema";
import { createUserProject, getUserProject } from "@/db/queries/user-projects";
import { linkOrangeCatEntity } from "@/db/queries/orangecat-links";
import { getSessionUserId } from "@/lib/session";
import { getOrangeCatLink } from "@/lib/integrations/orangecat-identity";
import { verifyOrangeCatBuildIntent } from "@/lib/integrations/orangecat-build-intent";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { token?: string; projectId?: string | null };
  if (!body.token || body.token.length > 20_000) {
    return NextResponse.json({ error: "Invalid build handoff" }, { status: 400 });
  }

  let intent;
  try {
    intent = verifyOrangeCatBuildIntent(body.token);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid build handoff" },
      { status: 400 },
    );
  }

  const orangeCat = await getOrangeCatLink(userId);
  if (!orangeCat || orangeCat.actorId !== intent.sub) {
    return NextResponse.json(
      { error: "Sign in with the OrangeCat account that owns this entity." },
      { status: 403 },
    );
  }

  const tokenHash = createHash("sha256").update(body.token).digest("hex");
  const [reservation] = await db
    .insert(orangecatBuildIntents)
    .values({
      jti: intent.jti,
      userId,
      tokenHash,
      expiresAt: new Date(intent.exp * 1000),
    })
    .onConflictDoNothing()
    .returning({ jti: orangecatBuildIntents.jti });
  if (!reservation) {
    return NextResponse.json({ error: "This build handoff has already been used." }, { status: 409 });
  }

  try {
    const project = body.projectId
      ? await getUserProject(body.projectId, userId)
      : await createUserProject({
          userId,
          name: intent.entity.title.slice(0, 120),
          description: intent.entity.description,
          dirPath: null,
          gitUrl: null,
          notes: [
            `Origin: ${intent.entity.publicUrl}`,
            "",
            "Loki's proposed starting plan:",
            ...intent.suggestedHandoff.map((step, index) => `${index + 1}. ${step}`),
          ].join("\n"),
        });

    if (!project) {
      throw new Error("Choose a FleetCrown project you own.");
    }

    await linkOrangeCatEntity({
      userId,
      projectId: project.id,
      entityType: intent.entity.type,
      entityId: intent.entity.id,
      role: "origin",
      publicUrl: intent.entity.publicUrl,
      title: intent.entity.title,
    });

    // Compatibility for deployed webhook/read paths that still key project
    // funding by the legacy single project UUID.
    if (intent.entity.type === "project") {
      await db
        .update(userProjects)
        .set({ orangecatProjectId: intent.entity.id, updatedAt: new Date() })
        .where(and(eq(userProjects.id, project.id), eq(userProjects.userId, userId)));
    }

    await db
      .update(orangecatBuildIntents)
      .set({ consumedAt: new Date() })
      .where(and(
        eq(orangecatBuildIntents.jti, intent.jti),
        eq(orangecatBuildIntents.userId, userId),
      ));

    return NextResponse.json({
      ok: true,
      projectId: project.entityProjectId ?? project.id,
      url: `/projects/${project.entityProjectId ?? project.id}`,
    });
  } catch (error) {
    await db
      .delete(orangecatBuildIntents)
      .where(and(
        eq(orangecatBuildIntents.jti, intent.jti),
        eq(orangecatBuildIntents.userId, userId),
        isNull(orangecatBuildIntents.consumedAt),
      ));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the FleetCrown project." },
      { status: 400 },
    );
  }
}
