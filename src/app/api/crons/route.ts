import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { CRON_FILE } from "@/lib/constants";

export type CronJob = {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr: string; tz: string };
  sessionTarget: string;
  wakeMode: string;
  payload: {
    kind: string;
    message: string;
    timeoutSeconds: number;
    thinking: string;
    model: string;
  };
  delivery: {
    mode: string;
    channel: string;
    to: string;
    bestEffort: boolean;
  };
  state: {
    lastRunAtMs?: number;
    lastStatus?: string;
    lastRunStatus?: string;
    lastDurationMs?: number;
    consecutiveErrors?: number;
    lastError?: string;
    lastErrorReason?: string;
    lastDelivered?: string;
    lastDeliveryStatus?: string;
    nextRunAtMs?: number;
  };
  createdAtMs: number;
  updatedAtMs: number;
  // Optional project linkage (cockpit extension, not part of openclaw core)
  projectId?: string;
  projectName?: string;
};

function readJobs(): { version: number; jobs: CronJob[] } {
  if (!existsSync(CRON_FILE)) return { version: 1, jobs: [] };
  return JSON.parse(readFileSync(CRON_FILE, "utf-8"));
}

export async function GET() {
  try {
    const data = readJobs();
    return NextResponse.json({ jobs: data.jobs });
  } catch (e) {
    return NextResponse.json({ jobs: [], error: String(e) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, scheduleExpr, message, model, timeoutSeconds, tz, projectId, projectName } = body as {
      name: string;
      scheduleExpr: string;
      message: string;
      model?: string;
      timeoutSeconds?: number;
      tz?: string;
      projectId?: string;
      projectName?: string;
    };

    if (!name?.trim() || !scheduleExpr?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "name, scheduleExpr, and message are required" }, { status: 400 });
    }

    const data = readJobs();
    const newJob: CronJob = {
      id: crypto.randomUUID(),
      agentId: "main",
      name: name.trim(),
      enabled: true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      schedule: { kind: "cron", expr: scheduleExpr.trim(), tz: tz ?? "Europe/Zurich" },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message: message.trim(),
        timeoutSeconds: timeoutSeconds ?? 120,
        thinking: "low",
        model: model ?? "codex",
      },
      delivery: { mode: "announce", channel: "telegram", to: "575014778", bestEffort: true },
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
  try {
    const body = await req.json();
    const { id, enabled, message, projectId, projectName } = body as {
      id: string;
      enabled?: boolean;
      message?: string;
      projectId?: string;
      projectName?: string;
    };

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = readJobs();
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
