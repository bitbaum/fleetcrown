import { postJson, patchJson } from "./fetch";
import type { CreateCronJobBody, PatchCronJobBody } from "@/lib/crons";

export type { CreateCronJobBody, PatchCronJobBody };

/** Create a new cron job via POST /api/crons */
export function createCronJob(body: CreateCronJobBody) {
  return postJson("/api/crons", body);
}

/** Patch an existing cron job via PATCH /api/crons */
export function patchCronJob(body: PatchCronJobBody) {
  return patchJson("/api/crons", body);
}
