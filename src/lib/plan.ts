import type { Plan } from "@/db/schema/users";

export const PLAN_LIMITS = {
  projects: {
    free:     3,
    personal: 5,
    pro:      Infinity,
    team:     Infinity,
  },
} satisfies Record<string, Record<Plan, number>>;

export function getProjectLimit(plan: Plan): number {
  return PLAN_LIMITS.projects[plan];
}

/** True when limit should be shown as "Unlimited" rather than a number. */
export function isUnlimitedProjects(plan: Plan): boolean {
  return !Number.isFinite(PLAN_LIMITS.projects[plan]);
}
