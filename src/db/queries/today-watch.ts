import { and, eq, lte, isNotNull, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { goals, events, commitments, subscriptions } from "@/db/schema";
import { GOAL_STATUS, COMMITMENT_STATUS, EVENT_STATUS } from "@/lib/constants/statuses";

const STALLED_DAYS = 21;
const IMMINENT_DAYS = 5;

export type WatchFocus = {
  kind: "overdue-commitment" | "overdue-goal" | "imminent-bill" | "imminent-event" | "stalled-goal";
  title: string;
  context: string;        // a single short clarifying line ("85% done · 1mo past target")
  href: string;           // where the user goes if they click through
  ivyPrompt: string;      // pre-built prompt body for "Brief Ivy on this"
};

export type WatchData = {
  focus: WatchFocus | null;
  /** Counts across categories so the Watch can show a one-line totals strip. */
  totals: {
    overdueCommitments: number;
    overdueGoals: number;
    imminentBills: number;
    imminentEvents: number;
    stalledGoals: number;
  };
};

/**
 * Pick the one thing the user should care about right now and bundle it with
 * a totals strip across the rest of the private-zone signals.
 *
 * Priority order (highest first):
 *   1. Overdue commitments — something the user explicitly promised, now late.
 *   2. Overdue goals with high progress — close to done but past target.
 *   3. Imminent renewals — money about to leave the account in <5 days.
 *   4. Imminent events — deadlines (not financial) in <5 days.
 *   5. Stalled goals — active goals with no movement in 21+ days.
 *
 * Returns null focus when none of the above categories has an item — Today
 * gets a quieter "all clear" rendering in that case.
 */
export async function getTodayWatch(userId: string): Promise<WatchData> {
  const now = new Date();
  const imminentBy = new Date(now.getTime() + IMMINENT_DAYS * 24 * 60 * 60 * 1000);
  const stalledBy = new Date(now.getTime() - STALLED_DAYS * 24 * 60 * 60 * 1000);

  const [
    overdueCommitmentRows,
    overdueGoalRows,
    imminentBillRows,
    imminentEventRows,
    stalledGoalRows,
  ] = await Promise.all([
    db
      .select({ id: commitments.id, description: commitments.description, dueDate: commitments.dueDate })
      .from(commitments)
      .where(and(
        eq(commitments.userId, userId),
        eq(commitments.status, COMMITMENT_STATUS.ACTIVE),
        isNotNull(commitments.dueDate),
        lte(commitments.dueDate, now),
      ))
      .orderBy(asc(commitments.dueDate)),

    db
      .select({ id: goals.id, title: goals.title, progress: goals.progress, targetDate: goals.targetDate })
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.status, GOAL_STATUS.ACTIVE),
        isNotNull(goals.targetDate),
        lte(goals.targetDate, now),
      ))
      .orderBy(desc(goals.progress)),

    db
      .select({ id: subscriptions.id, name: subscriptions.name, amount: subscriptions.amount, currency: subscriptions.currency, nextBilling: subscriptions.nextDue })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        isNotNull(subscriptions.nextDue),
        lte(subscriptions.nextDue, imminentBy),
      ))
      .orderBy(asc(subscriptions.nextDue)),

    db
      .select({ id: events.id, name: events.name, deadline: events.deadline })
      .from(events)
      .where(and(
        eq(events.userId, userId),
        eq(events.status, EVENT_STATUS.ACTIVE),
        isNotNull(events.deadline),
        lte(events.deadline, imminentBy),
      ))
      .orderBy(asc(events.deadline)),

    db
      .select({ id: goals.id, title: goals.title, progress: goals.progress, updatedAt: goals.updatedAt })
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.status, GOAL_STATUS.ACTIVE),
        lte(goals.updatedAt, stalledBy),
      ))
      .orderBy(asc(goals.updatedAt)),
  ]);

  const totals = {
    overdueCommitments: overdueCommitmentRows.length,
    overdueGoals: overdueGoalRows.length,
    imminentBills: imminentBillRows.length,
    imminentEvents: imminentEventRows.length,
    stalledGoals: stalledGoalRows.length,
  };

  // Pick the highest-priority focus item.
  const focus = pickFocus(
    overdueCommitmentRows,
    overdueGoalRows,
    imminentBillRows,
    imminentEventRows,
    stalledGoalRows,
    now,
  );

  return { focus, totals };
}

function pickFocus(
  overdueCommitments: { id: string; description: string; dueDate: Date | null }[],
  overdueGoals: { id: string; title: string; progress: number | null; targetDate: Date | null }[],
  imminentBills: { id: string; name: string; amount: number | null; currency: string | null; nextBilling: Date | null }[],
  imminentEvents: { id: string; name: string; deadline: Date | null }[],
  stalledGoals: { id: string; title: string; progress: number | null; updatedAt: Date }[],
  now: Date,
): WatchFocus | null {
  const c = overdueCommitments[0];
  if (c) {
    const daysOverdue = c.dueDate ? Math.floor((now.getTime() - new Date(c.dueDate).getTime()) / 86_400_000) : null;
    return {
      kind: "overdue-commitment",
      title: c.description,
      context: daysOverdue !== null ? `Overdue by ${daysOverdue}d` : "Overdue",
      href: "/today#commitments",
      ivyPrompt: `An overdue commitment needs attention:\n\n"${c.description}"\n${daysOverdue !== null ? `It's ${daysOverdue} days past the due date.\n` : ""}\nWhat's the cleanest path to close this out today?`,
    };
  }

  const g = overdueGoals[0];
  if (g) {
    const daysOverdue = g.targetDate ? Math.floor((now.getTime() - new Date(g.targetDate).getTime()) / 86_400_000) : null;
    const progress = g.progress ?? 0;
    return {
      kind: "overdue-goal",
      title: g.title,
      context: `${progress}% done · ${daysOverdue !== null ? `${daysOverdue}d past target` : "past target"}`,
      href: "/goals",
      ivyPrompt: `An overdue goal is close to done:\n\nGoal: ${g.title}\nProgress: ${progress}%\n${daysOverdue !== null ? `Days past target: ${daysOverdue}\n` : ""}\nWhat's the smallest concrete step today to close it out?`,
    };
  }

  const b = imminentBills[0];
  if (b) {
    const daysUntil = b.nextBilling ? Math.ceil((new Date(b.nextBilling).getTime() - now.getTime()) / 86_400_000) : null;
    return {
      kind: "imminent-bill",
      title: b.name,
      context: `${b.amount !== null ? `${b.amount}${b.currency ? ` ${b.currency}` : ""} · ` : ""}${daysUntil !== null ? `renews in ${daysUntil}d` : "renews soon"}`,
      href: "/money",
      ivyPrompt: `Subscription renewal coming up:\n\n${b.name}${b.amount !== null ? ` — ${b.amount}${b.currency ? ` ${b.currency}` : ""}` : ""}${daysUntil !== null ? ` in ${daysUntil} days` : ""}.\n\nIs this still pulling its weight? Anything to flag?`,
    };
  }

  const e = imminentEvents[0];
  if (e) {
    const daysUntil = e.deadline ? Math.ceil((new Date(e.deadline).getTime() - now.getTime()) / 86_400_000) : null;
    return {
      kind: "imminent-event",
      title: e.name,
      context: daysUntil !== null ? (daysUntil <= 0 ? "Today" : `In ${daysUntil}d`) : "Soon",
      href: "/events",
      ivyPrompt: `A deadline is approaching:\n\n${e.name}${daysUntil !== null ? ` — ${daysUntil} days away` : ""}.\n\nWhat needs to happen between now and then?`,
    };
  }

  const s = stalledGoals[0];
  if (s) {
    const daysIdle = Math.floor((now.getTime() - new Date(s.updatedAt).getTime()) / 86_400_000);
    const progress = s.progress ?? 0;
    return {
      kind: "stalled-goal",
      title: s.title,
      context: `${progress}% done · ${daysIdle}d idle`,
      href: "/goals",
      ivyPrompt: `A goal has stalled:\n\nGoal: ${s.title}\nProgress: ${progress}%\nIdle for ${daysIdle} days.\n\nIs this still worth pursuing? If yes, what's the smallest unblock?`,
    };
  }

  return null;
}
