import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getGithubToken } from "@/lib/github-token";
import { getProjectCore } from "@/db/queries/projects";
import { getUserProjectByEntityId } from "@/db/queries/user-projects";
import { getExecutionAccess } from "@/lib/execution-access";
import { parseGithubRepoUrl } from "@/lib/github-provision";
import { checkProjectSiteDeployment, registerProjectSiteCd } from "@/lib/site-cd-register";
import { PROVISION_TEMPLATE_IDS } from "@/config/project-templates";

/**
 * Register (or prepare) Hetzner CD for a project that already has a GitHub repo.
 *
 * Completes the cold-start hole after kickoff provision: repo without apps.conf /
 * deploy secret / live URL. Uses the same SSOT as new-site.sh via
 * scripts/hetzner/register-site.sh when this process is on the studio box;
 * otherwise seeds deploy.yml and returns the one command.
 */
const Body = z.object({
  template: z.enum([...PROVISION_TEMPLATE_IDS]).optional(),
});

export const maxDuration = 120;

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
  if (!project.gitUrl) {
    return NextResponse.json(
      { error: "No repository linked — provision a repo first." },
      { status: 400 },
    );
  }

  const parsed = parseGithubRepoUrl(project.gitUrl);
  if (!parsed) {
    return NextResponse.json(
      { error: "Linked repo is not a GitHub URL — cannot register bitbaum CD." },
      { status: 400 },
    );
  }

  const up = await getUserProjectByEntityId(userId, id);
  if (!up) {
    return NextResponse.json(
      { error: "No user_projects row for this entity — cannot record liveUrl." },
      { status: 400 },
    );
  }

  const token = await getGithubToken(userId);
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub account linked. Sign in with GitHub first.", hasGithub: false },
      { status: 400 },
    );
  }

  const access = await getExecutionAccess(userId);
  const result = await registerProjectSiteCd({
    userId,
    entityProjectId: id,
    userProjectId: up.id,
    projectName: project.name,
    repoFullName: `${parsed.owner}/${parsed.repo}`,
    template: dataOrResp.template ?? "nextjs-tailwind",
    githubToken: token,
    cloudBuilderAllowed: access.cloudBuilderAllowed,
  });

  if ("error" in result && result.ok === false) {
    return NextResponse.json(
      { ok: false, error: result.error, code: result.code },
      { status: 400 },
    );
  }

  if (!("plan" in result)) {
    return NextResponse.json({ ok: false, error: "Unexpected register result" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    registered: result.registered,
    liveUrl: result.liveUrl,
    predictedLiveUrl: result.plan.liveUrl,
    slug: result.plan.slug,
    command: result.command,
    reason: result.reason,
    gate: result.gate,
    deployYmlSeeded: result.deployYmlSeeded,
    alreadyLive: false,
    deploymentStatus: result.deploymentStatus,
    deploymentUrl: result.deploymentUrl,
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await readIdParam(params);
  if (id instanceof NextResponse) return id;
  const project = await getProjectCore(userId, id);
  const up = await getUserProjectByEntityId(userId, id);
  if (!project || !up) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = project.gitUrl ? parseGithubRepoUrl(project.gitUrl) : null;
  const token = await getGithubToken(userId);
  if (!parsed || !token)
    return NextResponse.json(
      { error: "A linked GitHub repository and account are required." },
      { status: 400 },
    );
  const result = await checkProjectSiteDeployment({
    userId,
    entityProjectId: id,
    userProjectId: up.id,
    projectName: project.name,
    repoFullName: `${parsed.owner}/${parsed.repo}`,
    githubToken: token,
  });
  if (!("plan" in result)) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, ...result, predictedLiveUrl: result.plan.liveUrl });
}
