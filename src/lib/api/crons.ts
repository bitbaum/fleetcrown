import { postJson, patchJson } from "./fetch";

export interface CreateCronJobBody {
  name: string;
  scheduleExpr: string;
  message: string;
  projectId?: string;
  projectName?: string;
}

export interface PatchCronJobBody {
  id: string;
  enabled?: boolean;
  message?: string;
  projectId?: string;
  projectName?: string;
}

/** Create a new cron job via POST /api/crons */
export function createCronJob(body: CreateCronJobBody) {
  return postJson("/api/crons", body);
}

/** Patch an existing cron job via PATCH /api/crons */
export function patchCronJob(body: PatchCronJobBody) {
  return patchJson("/api/crons", body);
}
