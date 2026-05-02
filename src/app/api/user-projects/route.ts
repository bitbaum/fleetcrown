import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/session";
import { emptyToUndefined } from "@/lib/validation";
import { getUserProjects, createUserProject } from "@/db/queries/user-projects";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  dirPath: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(500).optional()),
  gitUrl: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  stack: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

export async function GET() {
  const userId = await getCurrentUserId();
  const projects = await getUserProjects(userId);
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const project = await createUserProject({ userId, ...parsed.data });
  return NextResponse.json(project, { status: 201 });
}
