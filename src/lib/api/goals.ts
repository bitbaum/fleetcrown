import { postJson, patchJson, deleteJson } from "./fetch";

export interface CreateGoalBody {
  title: string;
  description?: string;
  targetDate?: string;
  parentGoalId?: string;
}

/** PATCH /api/goals/:id — update any goal fields */
export async function patchGoal(id: string, patch: Record<string, unknown>) {
  const res = await patchJson(`/api/goals/${id}`, patch);
  if (!res.ok) throw new Error("Failed to update goal");
  return res.json();
}

/** DELETE /api/goals/:id */
export function deleteGoal(id: string) {
  return deleteJson(`/api/goals/${id}`);
}

/** POST /api/goals — create a new goal */
export function createGoal(body: CreateGoalBody) {
  return postJson("/api/goals", body);
}

/** GET /api/goals — list all goals */
export function listGoals() {
  return fetch("/api/goals");
}
