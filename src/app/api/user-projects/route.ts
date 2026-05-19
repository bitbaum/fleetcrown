import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { emptyToUndefined } from "@/lib/validation";
import { createUserProject, ensureUserProjectEntityLinks, countActiveProjects } from "@/db/queries/user-projects";
import { getUserById } from "@/db/queries/users";
import { getProjectLimit } from "@/lib/plan";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  dirPath: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(500).optional()),
  gitUrl: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  stack: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projects = await ensureUserProjectEntityLinks(userId);
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Default (owner) users are never limited.
  if (!user.isDefault) {
    const limit = getProjectLimit(user.plan);
    if (Number.isFinite(limit)) {
      const current = await countActiveProjects(userId);
      if (current >= limit) {
        return NextResponse.json(
          { error: `Project limit reached (${limit} on ${user.plan} plan). Upgrade to add more.`, limitReached: true },
          { status: 403 },
        );
      }
    }
  }

  const dataOrResp = await readJsonBody(req, CreateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  try {
    const project = await createUserProject({ userId, ...dataOrResp });
    return NextResponse.json(project, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") {
      return NextResponse.json(
        { error: "You already have a project with that name." },
        { status: 409 },
      );
    }
    throw e;
  }
}
