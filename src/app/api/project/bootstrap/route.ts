import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { createUserProject } from "@/db/queries/user-projects";
import { isRuntimeAvailable } from "@/lib/runtime";
import { APP_NAME } from "@/config/brand";
import os from "os";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

const BootstrapBody = z.object({
  name: z.string().min(1).max(60),
  tagline: z.string().max(200).optional(),
  targetUser: z.string().max(200).optional(),
  coreProblem: z.string().max(500).optional(),
  coreFeatures: z.array(z.string()).max(10).optional(),
  stack: z.object({
    frontend: z.string().optional(),
    backend: z.string().optional(),
    db: z.string().optional(),
  }).optional(),
  monetization: z.string().max(300).optional(),
  launchStrategy: z.string().max(300).optional(),
  db: z.enum(["postgres", "none"]).default("none"),
  visibility: z.enum(["private", "public"]).default("private"),
  githubUser: z.string().max(80).optional(),
});

type StepResult = { step: string; ok: boolean; detail?: string };

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRuntimeAvailable()) {
    return NextResponse.json({ error: "Project bootstrap requires local runtime — not available in cloud mode" }, { status: 503 });
  }

  const dataOrResp = await readJsonBody(req, BootstrapBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { name, tagline, targetUser, coreProblem, coreFeatures, stack, monetization, launchStrategy, db, visibility, githubUser } = dataOrResp;
  const repoSlug = slug(name);
  const devRoot = path.join(os.homedir(), "dev");
  const dir = path.join(devRoot, repoSlug);
  const steps: StepResult[] = [];

  // ── 1. Create local directory ─────────────────────────────────────────────
  try {
    fs.mkdirSync(dir, { recursive: true });
    steps.push({ step: "Create directory", ok: true, detail: dir });
  } catch (err) {
    return NextResponse.json({ error: `Directory creation failed: ${err}`, steps }, { status: 500 });
  }

  // ── 2. Create GitHub repo ─────────────────────────────────────────────────
  let gitUrl = "";
  try {
    const ghUser = githubUser ?? "bitbaum";
    const descArg = tagline ? `--description ${JSON.stringify(tagline)}` : "";
    const { stdout } = await execAsync(
      `gh repo create ${ghUser}/${repoSlug} --${visibility} ${descArg} --json url,sshUrl`,
      { timeout: 30_000 },
    );
    const ghData = JSON.parse(stdout.trim());
    gitUrl = ghData.url ?? `https://github.com/${ghUser}/${repoSlug}`;
    steps.push({ step: "Create GitHub repo", ok: true, detail: gitUrl });
  } catch (err) {
    const msg = String(err);
    // Repo may already exist — treat as non-fatal
    steps.push({ step: "Create GitHub repo", ok: false, detail: msg });
    gitUrl = `https://github.com/${githubUser ?? "bitbaum"}/${repoSlug}`;
  }

  // ── 3. Git init + remote ──────────────────────────────────────────────────
  try {
    await execAsync(
      `git -C ${JSON.stringify(dir)} init && git -C ${JSON.stringify(dir)} remote add origin ${JSON.stringify(gitUrl)}`,
      { timeout: 10_000 },
    );
    steps.push({ step: "Git init", ok: true });
  } catch (err) {
    steps.push({ step: "Git init", ok: false, detail: String(err) });
  }

  // ── 4. Database (self-hosted) ─────────────────────────────────────────────
  // We self-host Postgres on the box — there's no per-project managed DB to
  // auto-provision. When the developer wants a DB, they create one on the
  // self-hosted Postgres (a new database or schema) and set DATABASE_URL. The
  // brief below tells the agent to do that; nothing to shell out to here.
  const dbUrl = "";

  // ── 5. Register project in ${APP_NAME} DB ────────────────────────────────
  try {
    await createUserProject({ userId: userId, name, dirPath: dir, gitUrl: gitUrl || undefined });
    steps.push({ step: `Register in ${APP_NAME}`, ok: true });
  } catch {
    steps.push({ step: `Register in ${APP_NAME}`, ok: false, detail: "Non-fatal — project still created" });
  }

  // ── Build the initial Claude Code brief ───────────────────────────────────
  const featureList = (coreFeatures ?? []).map((f, i) => `${i + 1}. ${f}`).join("\n");
  const launchPrompt = [
    `# ${name} — Project Bootstrap`,
    ``,
    `**What we're building:** ${tagline ?? name}`,
    targetUser   ? `**For:** ${targetUser}` : null,
    coreProblem  ? `**Problem:** ${coreProblem}` : null,
    ``,
    featureList  ? `**Core MVP features:**\n${featureList}` : null,
    ``,
    `**Stack:** ${stack?.frontend ?? "Next.js 15 (App Router)"} · ${stack?.backend ?? "TypeScript"} · ${stack?.db ?? "PostgreSQL + Drizzle ORM"} · Tailwind CSS 4`,
    dbUrl        ? `**Database URL:** ${dbUrl}` : null,
    monetization ? `**Monetisation:** ${monetization}` : null,
    launchStrategy ? `**Launch:** ${launchStrategy}` : null,
    ``,
    `## Your mission`,
    ``,
    `1. Bootstrap the project:`,
    `   \`\`\`bash`,
    `   npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --yes`,
    `   \`\`\``,
    `2. Follow ${APP_NAME}'s engineering standards (CLAUDE.md if present, or use: Drizzle ORM, server components, semantic design tokens, no \`any\`).`,
    `3. Build the core MVP — ship something playable within this session.`,
    db === "postgres"
      ? `4. Create a Postgres database on the self-hosted box (a new DB or schema on the shared Postgres) and set DATABASE_URL in \`.env.local\`.`
      : `4. If you need a database, create one on the self-hosted Postgres and set DATABASE_URL in \`.env.local\`.`,
    `5. Deploy via the self-hosted flow: build → rsync to the Hetzner box → restart the systemd service behind Caddy.`,
    `6. Commit after each milestone. Keep a session summary.`,
    ``,
    `Start immediately. No questions needed — use your judgment on implementation details.`,
  ].filter(Boolean).join("\n");

  return NextResponse.json({
    ok: true,
    tab: name,
    dir,
    gitUrl,
    dbUrl: dbUrl || null,
    steps,
    launchPrompt,
  });
}
