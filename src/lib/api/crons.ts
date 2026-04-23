const JSON_HEADERS = { "Content-Type": "application/json" };

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
  return fetch("/api/crons", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Patch an existing cron job via PATCH /api/crons */
export function patchCronJob(body: PatchCronJobBody) {
  return fetch("/api/crons", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
