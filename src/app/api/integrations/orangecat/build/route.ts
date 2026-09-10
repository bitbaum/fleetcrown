import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  orangecatBuildIntents,
  userProjects,
} from "@/db/schema";
import { createUserProject, getUserProject } from "@/db/queries/user-projects";
import { getOrangeCatLinksForProject, linkOrangeCatEntity } from "@/db/queries/orangecat-links";
import { getSessionUserId } from "@/lib/session";
import { getOrangeCatLink } from "@/lib/integrations/orangecat-identity";
import {
  describeClient,
  verifyOrangeCatBuildIntent,
} from "@/lib/integrations/orangecat-build-intent";
import { fillProfileFromHandoff } from "@/lib/integrations/orangecat-handoff-profile";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    token?: string;
    projectId?: string | null;
    replaceExistingOrigin?: boolean;
  };
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
            ...describeClient(intent),
            "",
            "Loki's proposed starting plan:",
            ...intent.suggestedHandoff.map((step, index) => `${index + 1}. ${step}`),
          ].join("\n"),
        });

    if (!project) {
      throw new Error("Choose a FleetCrown project you own.");
    }

    // A handoff used to create a project with a name and a description and
    // nothing else — no owner, no origin URL, no next step — so the agent
    // dossier briefed builders with blanks. Fill what the token already knows.
    // Best-effort: a profile that cannot be written must not lose the handoff.
    if (project.entityProjectId) {
      await fillProfileFromHandoff(userId, project.entityProjectId, intent).catch(() => {});
    }

    // Linking an existing project used to overwrite `orangecat_project_id`
    // unconditionally, silently repointing that project's OrangeCat origin —
    // and the funding read path keyed off it — at whatever entity the handoff
    // carried. Refuse unless the caller says explicitly that it is a replacement.
    // Throwing (rather than returning) releases the one-shot intent reservation
    // in the catch below, so the handoff link stays usable.
    if (body.projectId && !body.replaceExistingOrigin) {
      const existing = await getOrangeCatLinksForProject(userId, project.id);
      const foreign = existing.find(
        (row) => row.entityType === intent.entity.type && row.entityId !== intent.entity.id,
      );
      const foreignLegacy =
        intent.entity.type === "project" &&
        project.orangecatProjectId &&
        project.orangecatProjectId !== intent.entity.id;
      if (foreign || foreignLegacy) {
        throw new Error(
          `“${project.name}” already points at another OrangeCat entity${
            foreign?.title ? ` (${foreign.title})` : ""
          }. Confirm the replacement to repoint it.`,
        );
      }
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
