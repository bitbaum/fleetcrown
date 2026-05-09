import { readFileSync, existsSync } from "fs";
import { CRON_FILE } from "@/lib/constants";
import { z } from "zod";

export const CreateCronBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  scheduleExpr: z.string().trim().min(1, "scheduleExpr is required"),
  message: z.string().trim().min(1, "message is required"),
  model: z.string().optional(),
  timeoutSeconds: z.number().optional(),
  tz: z.string().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
});

export const PatchCronBody = z.object({
  id: z.string().min(1, "id is required"),
  enabled: z.boolean().optional(),
  message: z.string().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
});

export const RunCronBody = z.object({
  id: z.string().uuid("Invalid job id"),
});

export type CreateCronJobBody = z.infer<typeof CreateCronBody>;
export type PatchCronJobBody = z.infer<typeof PatchCronBody>;

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

const CRON_LABELS: Record<string, { compact: string; verbose: string }> = {
  "0 6 * * *":           { compact: "Daily 6:00",     verbose: "Daily at 6:00" },
  "0 20 * * 5":          { compact: "Fri 20:00",       verbose: "Every Friday at 20:00" },
  "0 20 * * 0-4":        { compact: "Sun–Thu 20:00",   verbose: "Sun–Thu at 20:00" },
  "30 3 * * *":          { compact: "Daily 3:30",      verbose: "Daily at 3:30" },
  "0 9 * * 1":           { compact: "Mon 9:00",        verbose: "Every Monday at 9:00" },
  "0 4 * * 0":           { compact: "Sun 4:00",        verbose: "Every Sunday at 4:00" },
  "0 7,11,15,19 * * *":  { compact: "4× daily",        verbose: "4× daily (7, 11, 15, 19)" },
  "0 10 * * 4":          { compact: "Thu 10:00",       verbose: "Every Thursday at 10:00" },
  "0 9 1 * *":           { compact: "Monthly 1st",     verbose: "1st of every month at 9:00" },
};

/** Human-readable cron schedule label.
 *  @param tz — when supplied, appends the timezone and returns the verbose form.
 */
export function humanCronSchedule(expr: string, tz?: string): string {
  const entry = CRON_LABELS[expr];
  if (tz) return `${entry?.verbose ?? expr} (${tz})`;
  return entry?.compact ?? expr;
}

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
