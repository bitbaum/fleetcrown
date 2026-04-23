/** Canonical goal status values — used across GoalCard, goals page, ProjectGoalsTab, API routes */
export const GOAL_STATUS = {
  ACTIVE: "active",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
} as const;
export type GoalStatus = (typeof GOAL_STATUS)[keyof typeof GOAL_STATUS];

/** Canonical subscription status values — used in SubscriptionActions, money page, API routes */
export const SUB_STATUS = {
  ACTIVE: "active",
  UNVERIFIED: "unverified",
  CANCELLED: "cancelled",
} as const;
export type SubStatus = (typeof SUB_STATUS)[keyof typeof SUB_STATUS];

/** Canonical commitment status values — used in today queries, commitments API */
export const COMMITMENT_STATUS = {
  ACTIVE: "active",
  FULFILLED: "fulfilled",
} as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUS)[keyof typeof COMMITMENT_STATUS];
