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

/** Top-level shape of CRON_FILE — `version` is preserved on writes. */
export type CronFileData = { version: number; jobs: CronJob[] };

/** Read the full cron file (jobs + version). Returns a default-shaped
 *  object if the file is missing; throws if the file is unreadable or
 *  malformed (callers that mutate-and-write need to know that, instead
 *  of silently overwriting good data with an empty file).
 */
export function readCronFile(): CronFileData {
  if (!existsSync(CRON_FILE)) return { version: 1, jobs: [] };
  return JSON.parse(readFileSync(CRON_FILE, "utf-8"));
}

/** Read just the jobs list. Returns [] for any missing/malformed file —
 *  this is the read-only path, used by display code that should never
 *  crash on a bad file.
 */
export function readCronJobs(): CronJob[] {
  try {
    return readCronFile().jobs ?? [];
  } catch {
    return [];
  }
}
