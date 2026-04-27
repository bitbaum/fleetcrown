import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";
import { CRON_FILE, DEFAULT_TIMEZONE, TELEGRAM_CHAT_ID } from "@/lib/constants";
import { type CronJob, readCronJobs, readCronFile, CreateCronBody, PatchCronBody } from "@/lib/crons";
import { readJsonBody } from "@/lib/api/route-helpers";

// Re-export so existing imports from this path keep working
export type { CronJob };

export async function GET() {
  try {
    const jobs = readCronJobs();
    return NextResponse.json({ jobs });
  } catch (e) {
    return NextResponse.json({ jobs: [], error: String(e) });
  }
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateCronBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, scheduleExpr, message, model, timeoutSeconds, tz, projectId, projectName } = dataOrResp;

  try {
    const data = readCronFile();
    const newJob: CronJob = {
      id: crypto.randomUUID(),
      agentId: "main",
      name,
      enabled: true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      schedule: { kind: "cron", expr: scheduleExpr, tz: tz ?? DEFAULT_TIMEZONE },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message,
        timeoutSeconds: timeoutSeconds ?? 120,
        thinking: "low",
        model: model ?? "codex",
      },
      delivery: { mode: "announce", channel: "telegram", to: TELEGRAM_CHAT_ID, bestEffort: true },
      state: {},
      ...(projectId ? { projectId, projectName: projectName ?? "" } : {}),
    };

    data.jobs.push(newJob);
    writeFileSync(CRON_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true, job: newJob });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, PatchCronBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { id, enabled, message, projectId, projectName } = dataOrResp;

  try {
    const data = readCronFile();
    const job = data.jobs.find((j) => j.id === id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (enabled !== undefined) job.enabled = enabled;
    if (message !== undefined) job.payload.message = message;
    if (projectId !== undefined) job.projectId = projectId || undefined;
    if (projectName !== undefined) job.projectName = projectName || undefined;
    job.updatedAtMs = Date.now();

    writeFileSync(CRON_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
