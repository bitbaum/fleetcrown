// Cloud-side "start a new project from scratch" — creates a brand new GitHub
// repo AND the matching FleetCrown project record in one round-trip. For users
// with an idea but no local runtime; they clone the repo afterward.
//
// Companion to /api/project/bootstrap (full local-stack scaffold, needs runner)
// and /api/projects/[id]/provision (link a repo to an EXISTING project).
//
// Repo creation + template seeding are shared via @/lib/github-provision.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { getGithubToken } from "@/lib/github-token";
import { createProject } from "@/db/queries/projects";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { TEMPLATES, renderTemplate } from "@/lib/project-templates";
import { provisionGithubRepo } from "@/lib/github-provision";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

export const maxDuration = 60;

const Body = z.object({
  name: z.string().trim().min(1, "name is required").max(80),
  description: z.string().trim().max(300).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  init_readme: z.boolean().default(true),
  template: z
    .enum(["bare", "nextjs-tailwind", "python-fastapi", "hono-cloudflare", "html-tailwind"])
    .default("bare"),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, description, visibility, init_readme, template } = parsed.data;

  const token = await getGithubToken(userId);
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub account linked. Sign in with GitHub or use the Connect GitHub button on /control/import.", hasGithub: false },
      { status: 400 },
    );
  }

  const result = await provisionGithubRepo(token, { name, description, visibility, initReadme: init_readme, template });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail, status: result.status },
      { status: result.status === 422 ? 409 : 502 },
    );
  }
  const { repo, templateSeeded } = result;

  // Now create the FleetCrown project entity linked to the new repo.
  let projectId: string;
  let projectName: string;
  try {
    const project = await createProject(userId, { name, description: description ?? undefined, gitUrl: repo.html_url }, SOURCE_FLEETCROWN_UI);
    projectId = project.id;
    projectName = project.name;
    scheduleProjectProfileReindexByEntityId(userId, project.id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // The GitHub repo IS created; we just couldn't add the FC row. Surface the URL.
    return NextResponse.json(
      {
        ok: false,
        error: `Project record could not be created (${msg.includes("duplicate") ? "duplicate name" : "db error"}), but the GitHub repo is live:`,
        gitUrl: repo.html_url,
        cloneCmd: `git clone ${repo.ssh_url}`,
      },
      { status: 409 },
    );
  }

  const tpl = TEMPLATES[template];
  const firstTask = renderTemplate(tpl.firstTask, { name: projectName, description: description ?? `Started from FleetCrown · ${name}` });

  return NextResponse.json({
    ok: true,
    project: { id: projectId, name: projectName },
    repo: {
      name: repo.name,
      full_name: repo.full_name,
      gitUrl: repo.html_url,
      sshUrl: repo.ssh_url,
      cloneUrl: repo.clone_url,
      private: repo.private,
    },
    template,
    templateSeeded,
    infra: tpl.infra,
    firstTask,
    cloneCmd: `git clone ${repo.ssh_url}`,
    cloneHttpsCmd: `git clone ${repo.clone_url}`,
  });
}
