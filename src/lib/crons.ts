import { readFileSync, existsSync } from "fs";
import { CRON_FILE } from "@/lib/constants";
export {
  CreateCronBody,
  PatchCronBody,
  RunCronBody,
  humanCronSchedule,
  type CreateCronJobBody,
  type PatchCronJobBody,
  type CronJob,
} from "@/lib/crons-shared";
import type { CronJob } from "@/lib/crons-shared";

/** Top-level shape of CRON_FILE — `version` is preserved on writes. */
type CronFileData = { version: number; jobs: CronJob[] };

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
