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

/**
 * Action workflow status values — IRON RULE: only 'approved' actions execute.
 * Flow: draft → approved → executed (or draft → rejected / expired)
 */
export const ACTION_STATUS = {
  DRAFT: "draft",
  APPROVED: "approved",
  EXECUTED: "executed",
  REJECTED: "rejected",
  EXPIRED: "expired",
} as const;
export type ActionStatus = (typeof ACTION_STATUS)[keyof typeof ACTION_STATUS];

/** Event status values — used in events API, queries/events.ts, queries/today.ts */
export const EVENT_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;
export type EventStatus = (typeof EVENT_STATUS)[keyof typeof EVENT_STATUS];

/** Entity type values — used in people queries, projects queries, and API routes */
export const ENTITY_TYPE = {
  PERSON:  "person",
  PROJECT: "project",
  COMPANY: "company",
  GOAL:    "goal",
  TOOL:    "tool",
  CONCEPT: "concept",
  EVENT:   "event",
} as const;
export type EntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE];

/** Habit frequency values */
export const HABIT_FREQUENCY = {
  DAILY: "daily",
  WEEKDAYS: "weekdays",
  WEEKLY: "weekly",
} as const;
export type HabitFrequency = (typeof HABIT_FREQUENCY)[keyof typeof HABIT_FREQUENCY];

/** Interaction direction — inbound = they reached out, outbound = we did */
export const INTERACTION_DIRECTION = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const;
export type InteractionDirection = (typeof INTERACTION_DIRECTION)[keyof typeof INTERACTION_DIRECTION];

/** Alert severity values */
export const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  URGENT: "urgent",
} as const;
export type AlertSeverity = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY];
