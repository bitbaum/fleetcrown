import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import os from "os";
import path from "path";
import { upsertWidgetToken } from "@/db/queries/widget-tokens";
import { appUrl } from "@/lib/email";
import { planSiteCd } from "@/lib/site-cd";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getRepoWriteToken } from "@/lib/github-org-token";
import {
  parseGithubRepoUrl,
  provisionGithubRepo,
  repoHasStarterFiles,
  repoSlug,
  seedTemplate,
} from "@/lib/github-provision";
import { getProjectCore, patchProject } from "@/db/queries/projects";
import { getUserProjectByEntityId, updateUserProject } from "@/db/queries/user-projects";
import { fetchAttributesByEntityIds } from "@/db/queries/utils";
import { PROJECT_ATTR } from "@/config/project-attrs";
import {
  DEFAULT_PROVISION_TEMPLATE,
  PROVISION_TEMPLATE_IDS,
  inferProvisionTemplate,
} from "@/config/project-templates";

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
  // "auto" resolves from the project's own stack attribute — the kickoff flow
  // has no template picker on purpose, and the profile already says what this
  // is built with. The explicit ids stay for the manual picker.
  template: z.enum([...PROVISION_TEMPLATE_IDS, "auto"]).default(DEFAULT_PROVISION_TEMPLATE),
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

  const write = await getRepoWriteToken(userId);
  if (!write) {
    return NextResponse.json(
      { error: "No GitHub account linked. Sign in with GitHub first.", hasGithub: false },
      { status: 400 },
    );
  }
  const token = write.token;

  let template = dataOrResp.template;
  if (template === "auto") {
    const attrs = (await fetchAttributesByEntityIds([id]).catch(() => new Map())).get(id) ?? {};
    template = inferProvisionTemplate(attrs[PROJECT_ATTR.STACK]);
  }

  // An already-linked repo is refused unless it is bare: seeding is non-fatal
  // inside provision, so a retry can meet a repo that exists with nothing in
  // it. That repo has nothing to deploy and nothing for an agent to build on;
  // re-seed it rather than refusing as "already linked".
  const linked = project.gitUrl ? parseGithubRepoUrl(project.gitUrl) : null;
  const reseed =
    linked && template !== "bare"
      ? !(await repoHasStarterFiles(token, linked.owner, linked.repo, template))
      : false;
  if (project.gitUrl && !reseed) {
    return NextResponse.json(
      { error: "Already provisioned — this project already has a repo linked." },
      { status: 409 },
    );
  }

  // The starter carries its own project-scoped feedback embed from first ship.
  // Restrict ingest to the planned site origin without claiming it is live yet.
  const cdPlan = planSiteCd({
    projectName: project.name,
    repoFullName: `pending/${repoSlug(project.name)}`,
    template,
  });
  const widget =
    template === "nextjs-tailwind" && cdPlan.ok
      ? await upsertWidgetToken(userId, id, { origins: [cdPlan.liveUrl] })
      : null;
  const feedback = widget ? { token: widget.token, appUrl: appUrl() } : undefined;
  const dirPath = path.join(DEV_ROOT, repoSlug(project.name));

  if (linked && reseed) {
    const seeded = await seedTemplate(
      token,
      linked.owner,
      linked.repo,
      template,
      { name: project.name, description: `Started from FleetCrown · ${project.name}` },
      feedback,
    );
    return NextResponse.json(
      {
        ok: seeded,
        error: seeded
          ? undefined
          : "Starter files could not be written to the repository. Try again.",
        repo: {
          name: linked.repo,
          full_name: `${linked.owner}/${linked.repo}`,
          gitUrl: project.gitUrl,
        },
        dirPath,
        template,
        templateSeeded: seeded,
        reseeded: true,
      },
      { status: seeded ? 200 : 502 },
    );
  }

  const result = await provisionGithubRepo(token, {
    name: project.name,
    visibility: dataOrResp.visibility,
    template,
    feedback,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status === 422 ? 409 : 502 },
    );
  }

  // Link the repo + set dirPath (the box-runner's clone target) on the
  // user_projects row in ONE update, so a mid-flight crash can never leave a
  // repo linked without a dirPath (= visible but undispatchable in Control).
  // The entity patch comes last: it only mirrors gitUrl for the dossier and
  // the "already provisioned" 409 guard, so a crash before it just means the
  // guard doesn't trip — the project itself is already fully dispatchable.
  const up = await getUserProjectByEntityId(userId, id);
  if (up) await updateUserProject(up.id, userId, { gitUrl: result.repo.html_url, dirPath });
  await patchProject(userId, id, { gitUrl: result.repo.html_url });

  return NextResponse.json({
    ok: true,
    repo: {
      name: result.repo.name,
      full_name: result.repo.full_name,
      gitUrl: result.repo.html_url,
      private: result.repo.private,
    },
    dirPath,
    template,
    templateSeeded: result.templateSeeded,
  });
}
