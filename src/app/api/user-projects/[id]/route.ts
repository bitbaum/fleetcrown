import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody, readIdParam, z } from "@/lib/api/route-helpers";
import { emptyToUndefined } from "@/lib/validation";
import { getUserProject, updateUserProject, deleteUserProject } from "@/db/queries/user-projects";

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dirPath: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  gitUrl: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  stack: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  agentPref: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
  modelPref: z.preprocess(emptyToUndefined, z.string().trim().max(160).optional()),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(4000).optional()),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const project = await getUserProject(idOrResp, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, UpdateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const updated = await updateUserProject(idOrResp, userId, dataOrResp);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  await deleteUserProject(idOrResp, userId);
  return NextResponse.json({ ok: true });
}
