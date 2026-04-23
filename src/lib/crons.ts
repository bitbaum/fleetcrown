import { readFileSync, existsSync } from "fs";
import { CRON_FILE } from "@/lib/constants";

/** Mirrors the openclaw cron job schema. Cockpit-specific fields are optional. */
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
  // Cockpit extension — not part of openclaw core
  projectId?: string;
  projectName?: string;
};

/** Read all jobs from the cron file. Returns [] if the file doesn't exist or is malformed. */
export function readCronJobs(): CronJob[] {
  if (!existsSync(CRON_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(CRON_FILE, "utf-8"));
    return data.jobs ?? [];
  } catch {
    return [];
  }
}
