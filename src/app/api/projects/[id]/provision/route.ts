import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import os from "os";
import path from "path";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getGithubToken } from "@/lib/github-token";
import { provisionGithubRepo, repoSlug } from "@/lib/github-provision";
import { getProjectCore, patchProject } from "@/db/queries/projects";
import { getUserProjectByEntityId, updateUserProject } from "@/db/queries/user-projects";

// One-click provisioning for an EXISTING project: create its GitHub repo (seeded
// with a starter), link it (gitUrl), and set dirPath to the path the box-runner
// clones into — so the project appears in Control and is dispatchable without the
// user ever touching `gh`, `~/dev`, or a terminal. Closes the "quick-add ≠
// provisioned" gap. Repo creation is server-side (GitHub API); the runner clones
// the gitUrl into dirPath on first dispatch (box-workspace.ensureBoxWorkspace).

// Must match box-workspace.ts DEV_ROOT so dirPath == where the runner clones.
const DEV_ROOT = process.env.FLEETCROWN_BOX_DEV_ROOT || path.join(os.homedir(), "dev");

const Body = z.object({
  visibility: z.enum(["private", "public"]).default("private"),
  template: z.enum(["bare", "nextjs-tailwind", "python-fastapi", "hono-cloudflare", "html-tailwind"]).default("nextjs-tailwind"),
});

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const project = await getProjectCore(userId, id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.gitUrl) {
    return NextResponse.json({ error: "Already provisioned — this project already has a repo linked." }, { status: 409 });
  }

  const token = await getGithubToken(userId);
  if (!token) {
    return NextResponse.json({ error: "No GitHub account linked. Sign in with GitHub first.", hasGithub: false }, { status: 400 });
  }

  const result = await provisionGithubRepo(token, {
    name: project.name,
    visibility: dataOrResp.visibility,
    template: dataOrResp.template,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status === 422 ? 409 : 502 });
  }

  // Link the repo + set dirPath (the box-runner's clone target) on the
  // user_projects row in ONE update, so a mid-flight crash can never leave a
  // repo linked without a dirPath (= visible but undispatchable in Control).
  // The entity patch comes last: it only mirrors gitUrl for the dossier and
  // the "already provisioned" 409 guard, so a crash before it just means the
  // guard doesn't trip — the project itself is already fully dispatchable.
  const dirPath = path.join(DEV_ROOT, repoSlug(project.name));
  const up = await getUserProjectByEntityId(userId, id);
  if (up) await updateUserProject(up.id, userId, { gitUrl: result.repo.html_url, dirPath });
  await patchProject(userId, id, { gitUrl: result.repo.html_url });

  return NextResponse.json({
    ok: true,
    repo: { name: result.repo.name, full_name: result.repo.full_name, gitUrl: result.repo.html_url, private: result.repo.private },
    dirPath,
    templateSeeded: result.templateSeeded,
  });
}
