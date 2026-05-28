import { NextResponse } from "next/server";
import { getUserProjects } from "@/db/queries/user-projects";
import { getApiUserId } from "@/lib/session";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await getUserProjects(userId);
  return NextResponse.json({
    ok: true,
    projects: projects
      .filter((project) => project.dirPath?.trim())
      .map((project) => ({
        name: project.name,
        dirPath: project.dirPath,
        agent: project.agentPref?.trim() || "",
        model: project.modelPref?.trim() || "",
      })),
  });
}
