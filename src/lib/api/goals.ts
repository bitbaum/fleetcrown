const JSON_HEADERS = { "Content-Type": "application/json" };

export interface CreateGoalBody {
  title: string;
  description?: string;
  targetDate?: string;
  parentGoalId?: string;
}

/** PATCH /api/goals/:id — update any goal fields */
export async function patchGoal(id: string, patch: Record<string, unknown>) {
  const res = await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update goal");
  return res.json();
}

/** DELETE /api/goals/:id */
export function deleteGoal(id: string) {
  return fetch(`/api/goals/${id}`, { method: "DELETE" });
}

/** POST /api/goals — create a new goal */
export function createGoal(body: CreateGoalBody) {
  return fetch("/api/goals", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** GET /api/goals — list all goals */
export function listGoals() {
  return fetch("/api/goals");
}
