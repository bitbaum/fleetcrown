import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";

const CRON_FILE = path.join(homedir(), ".openclaw", "cron", "jobs.json");

export type CronJob = {
  id: string;
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, enabled, message } = body as {
      id: string;
      enabled?: boolean;
      message?: string;
    };

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = readJobs();
    const job = data.jobs.find((j) => j.id === id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (enabled !== undefined) job.enabled = enabled;
    if (message !== undefined) job.payload.message = message;
    job.updatedAtMs = Date.now();

    writeFileSync(CRON_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
