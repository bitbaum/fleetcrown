import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/session";
import { emptyToUndefined } from "@/lib/validation";
import { updateUserProject, deleteUserProject } from "@/db/queries/user-projects";

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dirPath: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  gitUrl: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  stack: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  agentPref: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = UpdateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const updated = await updateUserProject(id, userId, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  const { id } = await params;
  await deleteUserProject(id, userId);
  return NextResponse.json({ ok: true });
}
