import { getJson, postJson, patchJson, deleteJson } from "./fetch";
import type { CreateGoalInput } from "@/db/queries/goals";

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
export function createGoal(body: CreateGoalInput) {
  return postJson("/api/goals", body);
}

/** GET /api/goals — list all goals.
 * On 403 (private zone locked) returns { goals: [] } gracefully so cross-surface
 * callers (e.g. ProjectGoalsTab) can show locked state instead of crashing.
 */
export async function listGoals() {
  try {
    return await getJson<{ goals: { id: string; title: string; entityId: string | null }[] }>("/api/goals");
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "";
    if (msg.includes("HTTP 403")) {
      return { goals: [] as { id: string; title: string; entityId: string | null }[] };
    }
    throw e;
  }
}
