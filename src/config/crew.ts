/**
 * Crew — SSOT for delegating work to humans.
 *
 * FleetCrown dispatches intents to agents. Some work is not an agent's to do:
 * calling twelve suppliers on the company's behalf, signing something, walking
 * into a room. Crew is that half of the fleet — the humans in the loop, and the
 * assignments you hand them.
 *
 * Three laws, and each exists because the alternative is worse:
 *
 *   1. A person is not a queue. An assignment is an ASK: `assigned` only means
 *      you asked, and the human's own answer (accept / decline / deliver) is
 *      what moves the row from there. The operator cannot mark a task accepted
 *      on someone's behalf — see ASSIGNEE_MOVES.
 *   2. Nothing reaches a human by accident. A row starts as `draft`, and a
 *      draft has told nobody anything. Handing it over is the operator minting
 *      a share link — the same shape as the action queue's IRON RULE, so Loki
 *      can propose an assignment without ever being able to send one.
 *   3. Money is OrangeCat's. A task carries a fee so both sides can see the
 *      terms; settlement happens on the assignee's OrangeCat profile. This file
 *      never moves value, it just names the amount and keeps the pointer.
 *
 * The roster itself is not a new table — crew members are person entities in
 * the operator's own book, flagged with CREW_ATTR.MEMBER (see config/actors.ts).
 * A parallel `crew` table would fork the address book in two, and the second
 * copy would be the stale one.
 */

import { z } from "zod";
import { CREW_ATTR } from "@/config/actors";
import { VALID_CURRENCIES } from "@/config/subscriptions";
import { HUMAN_TASK_STATUS, type HumanTaskStatus, type StatusTone } from "@/lib/constants/statuses";

// Re-exported so crew-domain callers have one import site. The canonical homes
// stay where they are: attribute keys in config/actors, statuses in
// lib/constants/statuses — this file adds meaning to them, it does not own them.
export { CREW_ATTR, HUMAN_TASK_STATUS, type HumanTaskStatus };

// ─── How you work with someone ────────────────────────────────────────────────

export const ENGAGEMENT = {
  FAVOR:      "favor",
  FREELANCE:  "freelance",
  CONTRACT:   "contract",
  AGENCY:     "agency",
  PARTNER:    "partner",
  EMPLOYEE:   "employee",
} as const;
export type Engagement = (typeof ENGAGEMENT)[keyof typeof ENGAGEMENT];
export const ENGAGEMENTS = Object.values(ENGAGEMENT) as [Engagement, ...Engagement[]];

export const ENGAGEMENT_LABEL: Record<Engagement, string> = {
  [ENGAGEMENT.FAVOR]:     "Favor",
  [ENGAGEMENT.FREELANCE]: "Freelance",
  [ENGAGEMENT.CONTRACT]:  "Contract",
  [ENGAGEMENT.AGENCY]:    "Agency",
  [ENGAGEMENT.PARTNER]:   "Partner",
  [ENGAGEMENT.EMPLOYEE]:  "Employee",
};

export function isEngagement(value: string): value is Engagement {
  return (ENGAGEMENTS as readonly string[]).includes(value);
}

// ─── Assignment lifecycle ─────────────────────────────────────────────────────

export const HUMAN_TASK_STATUS_LABEL: Record<HumanTaskStatus, string> = {
  [HUMAN_TASK_STATUS.DRAFT]:     "Draft",
  [HUMAN_TASK_STATUS.ASSIGNED]:  "Asked",
  [HUMAN_TASK_STATUS.ACCEPTED]:  "Accepted",
  [HUMAN_TASK_STATUS.DECLINED]:  "Declined",
  [HUMAN_TASK_STATUS.DELIVERED]: "Delivered",
  [HUMAN_TASK_STATUS.DONE]:      "Done",
  [HUMAN_TASK_STATUS.CANCELLED]: "Cancelled",
};

/** One line each, written for the operator scanning the board. */
export const HUMAN_TASK_STATUS_HINT: Record<HumanTaskStatus, string> = {
  [HUMAN_TASK_STATUS.DRAFT]:     "Written down. Nobody has been asked yet.",
  [HUMAN_TASK_STATUS.ASSIGNED]:  "Sent. Waiting on their answer.",
  [HUMAN_TASK_STATUS.ACCEPTED]:  "They said yes and are on it.",
  [HUMAN_TASK_STATUS.DECLINED]:  "They said no. Reassign or drop it.",
  [HUMAN_TASK_STATUS.DELIVERED]: "They say it is done — your turn to check.",
  [HUMAN_TASK_STATUS.DONE]:      "You accepted the work.",
  [HUMAN_TASK_STATUS.CANCELLED]: "Called off.",
};

export const HUMAN_TASK_STATUS_TONE: Record<HumanTaskStatus, StatusTone> = {
  [HUMAN_TASK_STATUS.DRAFT]:     "neutral",
  [HUMAN_TASK_STATUS.ASSIGNED]:  "warning",
  [HUMAN_TASK_STATUS.ACCEPTED]:  "positive",
  [HUMAN_TASK_STATUS.DECLINED]:  "negative",
  [HUMAN_TASK_STATUS.DELIVERED]: "warning",
  [HUMAN_TASK_STATUS.DONE]:      "positive",
  [HUMAN_TASK_STATUS.CANCELLED]: "neutral",
};

/** Board order — left to right, the way work actually travels. */
export const HUMAN_TASK_STATUS_ORDER: HumanTaskStatus[] = [
  HUMAN_TASK_STATUS.DRAFT,
  HUMAN_TASK_STATUS.ASSIGNED,
  HUMAN_TASK_STATUS.ACCEPTED,
  HUMAN_TASK_STATUS.DELIVERED,
  HUMAN_TASK_STATUS.DONE,
  HUMAN_TASK_STATUS.DECLINED,
  HUMAN_TASK_STATUS.CANCELLED,
];

/** Still live — counts toward "what is out there with my name on it". */
export const OPEN_HUMAN_TASK_STATUSES: HumanTaskStatus[] = [
  HUMAN_TASK_STATUS.DRAFT,
  HUMAN_TASK_STATUS.ASSIGNED,
  HUMAN_TASK_STATUS.ACCEPTED,
  HUMAN_TASK_STATUS.DELIVERED,
];

/** Closed — no longer anyone's move. */
export const CLOSED_HUMAN_TASK_STATUSES: HumanTaskStatus[] = [
  HUMAN_TASK_STATUS.DONE,
  HUMAN_TASK_STATUS.DECLINED,
  HUMAN_TASK_STATUS.CANCELLED,
];

export function isHumanTaskStatus(value: string): value is HumanTaskStatus {
  return Object.values(HUMAN_TASK_STATUS).includes(value as HumanTaskStatus);
}

export function isOpenHumanTask(status: HumanTaskStatus): boolean {
  return OPEN_HUMAN_TASK_STATUSES.includes(status);
}

/** Waiting on the other person, not on you. Drives the "asked, no answer" count. */
export function isWaitingOnAssignee(status: HumanTaskStatus): boolean {
  return status === HUMAN_TASK_STATUS.ASSIGNED || status === HUMAN_TASK_STATUS.ACCEPTED;
}

/** Your move. Drives the ONE question the crew page answers. */
export function isWaitingOnOperator(status: HumanTaskStatus): boolean {
  return status === HUMAN_TASK_STATUS.DRAFT
    || status === HUMAN_TASK_STATUS.DELIVERED
    || status === HUMAN_TASK_STATUS.DECLINED;
}

/**
 * Legal moves, by who is making them.
 *
 * Two maps rather than one, because the asymmetry IS the product: the operator
 * may hand out, call off, and accept delivered work; only the person asked may
 * say yes, say no, or claim it is done. An operator who could write `accepted`
 * would be recording consent nobody gave.
 */
export const OPERATOR_MOVES: Record<HumanTaskStatus, HumanTaskStatus[]> = {
  [HUMAN_TASK_STATUS.DRAFT]:     [HUMAN_TASK_STATUS.ASSIGNED, HUMAN_TASK_STATUS.CANCELLED],
  // Pulling an ask back to draft is how you un-send: the share link is revoked
  // with it, so the person you asked stops being able to answer.
  [HUMAN_TASK_STATUS.ASSIGNED]:  [HUMAN_TASK_STATUS.DRAFT, HUMAN_TASK_STATUS.DONE, HUMAN_TASK_STATUS.CANCELLED],
  [HUMAN_TASK_STATUS.ACCEPTED]:  [HUMAN_TASK_STATUS.DONE, HUMAN_TASK_STATUS.CANCELLED],
  // Delivered work you are not happy with goes back to accepted, not to draft —
  // they are still on it, the ask never stopped being theirs.
  [HUMAN_TASK_STATUS.DELIVERED]: [HUMAN_TASK_STATUS.DONE, HUMAN_TASK_STATUS.ACCEPTED, HUMAN_TASK_STATUS.CANCELLED],
  [HUMAN_TASK_STATUS.DECLINED]:  [HUMAN_TASK_STATUS.DRAFT, HUMAN_TASK_STATUS.CANCELLED],
  [HUMAN_TASK_STATUS.DONE]:      [],
  [HUMAN_TASK_STATUS.CANCELLED]: [HUMAN_TASK_STATUS.DRAFT],
};

export const ASSIGNEE_MOVES: Record<HumanTaskStatus, HumanTaskStatus[]> = {
  [HUMAN_TASK_STATUS.DRAFT]:     [],
  [HUMAN_TASK_STATUS.ASSIGNED]:  [HUMAN_TASK_STATUS.ACCEPTED, HUMAN_TASK_STATUS.DECLINED, HUMAN_TASK_STATUS.DELIVERED],
  [HUMAN_TASK_STATUS.ACCEPTED]:  [HUMAN_TASK_STATUS.DELIVERED, HUMAN_TASK_STATUS.DECLINED],
  [HUMAN_TASK_STATUS.DELIVERED]: [],
  [HUMAN_TASK_STATUS.DECLINED]:  [],
  [HUMAN_TASK_STATUS.DONE]:      [],
  [HUMAN_TASK_STATUS.CANCELLED]: [],
};

export function canOperatorMove(from: HumanTaskStatus, to: HumanTaskStatus): boolean {
  return OPERATOR_MOVES[from]?.includes(to) ?? false;
}

export function canAssigneeMove(from: HumanTaskStatus, to: HumanTaskStatus): boolean {
  return ASSIGNEE_MOVES[from]?.includes(to) ?? false;
}

/** What the person clicks on the share page, and the status each lands on. */
export const ASSIGNEE_ACTION = {
  ACCEPT:  "accept",
  DECLINE: "decline",
  DELIVER: "deliver",
} as const;
export type AssigneeAction = (typeof ASSIGNEE_ACTION)[keyof typeof ASSIGNEE_ACTION];

export const ASSIGNEE_ACTION_STATUS: Record<AssigneeAction, HumanTaskStatus> = {
  [ASSIGNEE_ACTION.ACCEPT]:  HUMAN_TASK_STATUS.ACCEPTED,
  [ASSIGNEE_ACTION.DECLINE]: HUMAN_TASK_STATUS.DECLINED,
  [ASSIGNEE_ACTION.DELIVER]: HUMAN_TASK_STATUS.DELIVERED,
};

export const ASSIGNEE_ACTION_LABEL: Record<AssigneeAction, string> = {
  [ASSIGNEE_ACTION.ACCEPT]:  "I'll do it",
  [ASSIGNEE_ACTION.DECLINE]: "I can't take this",
  [ASSIGNEE_ACTION.DELIVER]: "It's done",
};

/** The actions the share page may offer from a given status. Order is intent. */
export function assigneeActionsFor(status: HumanTaskStatus): AssigneeAction[] {
  return (Object.values(ASSIGNEE_ACTION) as AssigneeAction[]).filter((action) =>
    canAssigneeMove(status, ASSIGNEE_ACTION_STATUS[action]),
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

/** Who caused a row on the assignment's timeline. */
export const TASK_ACTOR = {
  OPERATOR: "operator",
  ASSIGNEE: "assignee",
  LOKI:     "loki",
} as const;
export type TaskActor = (typeof TASK_ACTOR)[keyof typeof TASK_ACTOR];

export const TASK_EVENT = {
  CREATED:  "created",
  STATUS:   "status",
  SHARED:   "shared",
  REVOKED:  "revoked",
  NOTE:     "note",
  EDITED:   "edited",
  PUBLISHED: "published",
} as const;
export type TaskEventKind = (typeof TASK_EVENT)[keyof typeof TASK_EVENT];

// ─── Request bodies ───────────────────────────────────────────────────────────

const uuid = z.string().uuid();
const trimmed = (max: number) => z.string().trim().max(max);

/**
 * What an assignment may be denominated in.
 *
 * The fiat four come from the subscriptions SSOT; BTC is added HERE and only
 * here, because paying a person is the one place in FleetCrown where bitcoin is
 * the point rather than a curiosity. The list is deliberately identical to the
 * currency enum OrangeCat's `services.create` accepts — a fee we cannot mirror
 * is a fee that cannot be paid, and the two lists silently diverging is exactly
 * how that would happen.
 */
export const TASK_CURRENCIES = [...VALID_CURRENCIES, "BTC"] as const;
export type TaskCurrency = (typeof TASK_CURRENCIES)[number];

export const BTC = "BTC" satisfies TaskCurrency;
export const SATS_PER_BTC = 100_000_000;

export function isTaskCurrency(value: string): value is TaskCurrency {
  return (TASK_CURRENCIES as readonly string[]).includes(value);
}

/** Fee ceiling. Not a business rule — a typo guard at the API boundary. */
export const MAX_TASK_FEE = 1_000_000;

export const CrewProfileFields = z.object({
  role:         trimmed(80).optional(),
  skills:       trimmed(240).optional(),
  engagement:   z.enum(ENGAGEMENTS).optional(),
  rate:         trimmed(60).optional(),
  currency:     z.enum(TASK_CURRENCIES).optional(),
  availability: trimmed(120).optional(),
  // A handle or a full profile URL, both accepted; stored canonical. Rejected
  // rather than silently dropped when it is neither — a payment destination
  // that quietly did not save is the worst way to find out you were not paid.
  orangecatProfile: z
    .union([trimmed(300), z.literal("")])
    .refine((v) => v === "" || orangeCatProfileUrl(v) !== null, {
      message: "Use an OrangeCat handle or a https://orangecat.ch/profiles/… link",
    })
    .optional(),
});
export type CrewProfileInput = z.infer<typeof CrewProfileFields>;

/**
 * Enrol someone. Either a person already in the book (`personId`) or a new
 * name, which creates the person row too — asking the operator to visit
 * /people first would be the kind of detour that stops the feature being used.
 */
export const EnrolCrewBody = CrewProfileFields.extend({
  personId: uuid.optional(),
  name:     trimmed(80).optional(),
  notes:    trimmed(600).optional(),
}).refine((v) => Boolean(v.personId) || Boolean(v.name), {
  message: "Pick someone from your book or give a name",
});
export type EnrolCrewInput = z.infer<typeof EnrolCrewBody>;

export const PatchCrewBody = CrewProfileFields.refine(
  (v) => Object.keys(v).length > 0,
  { message: "Nothing to update" },
);

export const CreateHumanTaskBody = z.object({
  title:       z.string().trim().min(3, "title is required").max(160),
  brief:       trimmed(6000).optional(),
  reason:      trimmed(2000).optional(),
  assigneeId:  uuid.optional(),
  projectId:   uuid.optional(),
  dueDate:     trimmed(40).optional(),
  feeAmount:   z.number().min(0).max(MAX_TASK_FEE).optional(),
  feeCurrency: z.enum(TASK_CURRENCIES).optional(),
});
export type CreateHumanTaskInput = z.infer<typeof CreateHumanTaskBody>;

export const PatchHumanTaskBody = z
  .object({
    title:       z.string().trim().min(3).max(160).optional(),
    brief:       trimmed(6000).nullable().optional(),
    reason:      trimmed(2000).nullable().optional(),
    assigneeId:  uuid.nullable().optional(),
    projectId:   uuid.nullable().optional(),
    dueDate:     trimmed(40).nullable().optional(),
    feeAmount:   z.number().min(0).max(MAX_TASK_FEE).nullable().optional(),
    feeCurrency: z.enum(TASK_CURRENCIES).optional(),
    status:      z.enum(Object.values(HUMAN_TASK_STATUS) as [HumanTaskStatus, ...HumanTaskStatus[]]).optional(),
    note:        trimmed(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type PatchHumanTaskInput = z.infer<typeof PatchHumanTaskBody>;

/** The only thing an un-authenticated assignee may send. */
export const RespondToTaskBody = z.object({
  action: z.enum(Object.values(ASSIGNEE_ACTION) as [AssigneeAction, ...AssigneeAction[]]),
  note:   trimmed(1000).optional(),
});
export type RespondToTaskInput = z.infer<typeof RespondToTaskBody>;

/**
 * A share link cannot be minted for an assignment nobody is assigned to, and
 * cannot be minted twice for one that is closed. Both are checked here rather
 * than in the route so the Loki path and the UI path share one answer.
 */
export function canShare(task: { status: HumanTaskStatus; assigneeId: string | null }): boolean {
  return Boolean(task.assigneeId) && !CLOSED_HUMAN_TASK_STATUSES.includes(task.status);
}

/** Where a shared assignment lives. Relative — callers prefix the origin. */
export function taskSharePath(token: string): string {
  return `/share/task/${token}`;
}

/**
 * "CHF 400" / "BTC 0.0005" / "400" / "" — one formatter, board and share page.
 *
 * Bitcoin gets eight decimals with the trailing zeros trimmed, because
 * `toFixed(2)` on 0.0005 BTC prints "0.00" — a fee of nothing, shown to the
 * person owed it. Fiat keeps two.
 */
export function formatFee(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return "";
  const value =
    currency === BTC
      ? amount.toFixed(8).replace(/\.?0+$/, "")
      : Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2);
  return currency ? `${currency} ${value}` : value;
}

/**
 * "50,000 sats" — the unit people actually quote small bitcoin amounts in.
 * Empty for anything that is not BTC, so callers can render it unconditionally.
 */
export function formatSats(amount: number | null, currency: string | null): string {
  if (currency !== BTC || amount === null || amount === undefined) return "";
  return `${Math.round(amount * SATS_PER_BTC).toLocaleString("en-US")} sats`;
}

/**
 * Where a crew member gets paid, normalised.
 *
 * Accepts what a person actually pastes — a full profile URL, or just their
 * OrangeCat handle — and returns the canonical profile URL, which is where
 * OrangeCat keeps their Lightning wallet. Returns null for anything that is
 * neither, so a typo becomes an empty field rather than a dead "pay" button
 * pointed at nowhere.
 */
export function orangeCatProfileUrl(input: string, base = "https://orangecat.ch"): string | null {
  const value = input.trim().replace(/\/+$/, "");
  if (!value) return null;
  const origin = base.replace(/\/+$/, "");
  const fromUrl = value.match(/^https?:\/\/[^/]+\/profiles\/([A-Za-z0-9_.-]{1,40})$/);
  if (fromUrl) return `${origin}/profiles/${fromUrl[1]}`;
  if (/^@?[A-Za-z0-9_.-]{1,40}$/.test(value)) return `${origin}/profiles/${value.replace(/^@/, "")}`;
  return null;
}
