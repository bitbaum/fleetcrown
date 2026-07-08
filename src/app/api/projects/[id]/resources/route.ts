import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getProjectCore } from "@/db/queries/projects";
import { getUserProjectByEntityId, updateUserProject } from "@/db/queries/user-projects";
import type { ProjectResource } from "@/db/schema/user-projects";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

const ResourceBody = z.object({
  resources: z.array(z.object({
    id: z.string().trim().max(80).optional(),
    kind: z.enum(["link", "doc", "spec", "dataset", "credential", "environment", "design", "other"]).default("link"),
    visibility: z.enum(["private", "team", "public"]).default("private"),
    sensitivity: z.enum(["normal", "internal", "secret", "credential"]).default("normal"),
    title: z.string().trim().min(1).max(160),
    url: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(2000).optional(),
    createdAt: z.string().trim().optional(),
  })).max(40),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, ResourceBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const project = await getProjectCore(userId, idOrResp);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userProject = await getUserProjectByEntityId(userId, idOrResp);
  if (!userProject) return NextResponse.json({ error: "Project runtime row not found" }, { status: 404 });

  const now = new Date().toISOString();
  const resources: ProjectResource[] = dataOrResp.resources.map((r) => ({
    id: r.id || crypto.randomUUID(),
    kind: r.kind,
    visibility: r.visibility,
    sensitivity: r.sensitivity,
    title: r.title,
    ...(r.url ? { url: normalizeUrl(r.url) } : {}),
    ...(r.notes ? { notes: r.notes } : {}),
    createdAt: r.createdAt || now,
  }));

  const updated = await updateUserProject(userProject.id, userId, { resources });
  scheduleProjectProfileReindexByEntityId(userId, idOrResp);
  return NextResponse.json({ ok: true, resources: updated?.resources ?? resources });
}

function normalizeUrl(value: string): string {
  if (!value) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return `https://${value}`;
}
