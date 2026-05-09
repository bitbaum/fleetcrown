import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stateFile, readProjectsMap } from "@/lib/agent-config";
import { injectIntoTab } from "@/lib/zellij";
import { auth } from "@/auth";
import { getUserProjects } from "@/db/queries/user-projects";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const ClearBody = z.object({
  tab: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, ClearBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab } = dataOrResp;

  const projects = readProjectsMap();
  let canonical = projects.get(tab.toLowerCase());

  if (!canonical) {
    const dbProjects = await getUserProjects(session.user.id).catch(() => []);
    const dbMatch = dbProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
    if (!dbMatch) {
      return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
    }
    canonical = dbMatch.name;
  }

  try {
    injectIntoTab(canonical, "/clear");
    // /clear is not a prompt — clear the running-prompt state so UI shows idle
    try { fs.unlinkSync(stateFile.prompt(canonical)); } catch { /* already gone */ }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Clear failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
