import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { emptyToUndefined } from "@/lib/validation";
import { createUserProject, ensureUserProjectEntityLinks } from "@/db/queries/user-projects";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  dirPath: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(500).optional()),
  gitUrl: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  stack: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

export async function GET() {
  const userId = await getCurrentUserId();
  const projects = await ensureUserProjectEntityLinks(userId);
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const project = await createUserProject({ userId, ...dataOrResp });
  return NextResponse.json(project, { status: 201 });
}
