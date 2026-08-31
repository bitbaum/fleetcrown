/**
 * The deterministic brief — computed answers Loki must not derive itself.
 *
 * The failure that motivated this: asked "which goals are stuck at 0% for 30+
 * days, what's due in the next 3 days, which habit am I most at risk of
 * breaking", Loki answered all three from a context block that contained none
 * of that data. It had projects and RAG chunks; it had no goals-with-dates, no
 * commitments, no habits, no events. So it produced plausible items.
 *
 * The striking part is that FleetCrown could already answer every one of those
 * questions EXACTLY — `getStuckGoals`, `getGoalsDueSoon`, `listUpcomingCommitments`,
 * `getEventsDueSoon` and `getTodayHabits` have existed for months. They were
 * simply never wired into the assistant. The model was asked to guess at
 * something the database knew.
 *
 * So: these are SQL predicates with exact answers, not judgment calls. Computing
 * them and handing the model a settled result strictly dominates injecting raw
 * rows and hoping it filters correctly — a language model can only add error to
 * a `WHERE progress = 0 AND updated_at < now() - 30d`. The model's remaining job
 * is to PHRASE and PRIORITISE, which is genuinely what it is good at.
 *
 * An empty result is a real answer ("nothing is due") and is rendered as such —
 * distinguishable from the query never having run, which is the distinction the
 * old context could not express.
 */
import { getStuckGoals, getGoalsDueSoon, listUpcomingCommitments } from "@/db/queries/today";
import { getEventsDueSoon } from "@/db/queries/events";
import { getTodayHabits } from "@/db/queries/habits";
import type { Directive } from "@/lib/agent/core/contract";

/** Days ahead treated as "imminent" for the day-planning brief. */
const IMMINENT_DAYS = 3;
/** Progress-at-zero staleness window, matching getStuckGoals' own default. */
const STUCK_DAYS = 30;

function dateLabel(d: Date | string | null): string {
  if (!d) return "no date";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "no date" : date.toISOString().slice(0, 10);
}

/**
 * Build the computed half of Loki's context.
 *
 * Every branch is best-effort: a failing query yields a directive whose answer
 * is empty and whose method says it failed, rather than being dropped. A
 * silently missing directive is indistinguishable from "nothing matched", and
 * that ambiguity is what lets a model fill the gap — so failure is stated.
 */
export async function buildDailyBrief(userId: string): Promise<Directive[]> {
  const [stuck, goalsDue, commitments, events, habits] = await Promise.all([
    getStuckGoals(userId, STUCK_DAYS).catch(() => null),
    getGoalsDueSoon(userId, IMMINENT_DAYS).catch(() => null),
    listUpcomingCommitments(userId, IMMINENT_DAYS).catch(() => null),
    getEventsDueSoon(userId, IMMINENT_DAYS).catch(() => null),
    getTodayHabits(userId).catch(() => null),
  ]);

  const directives: Directive[] = [];

  directives.push(
    stuck === null
      ? {
          question: `goals stuck at 0% for ${STUCK_DAYS}+ days`,
          answer: [],
          method: "QUERY FAILED — treat as unknown, not as none",
        }
      : {
          question: `goals stuck at 0% for ${STUCK_DAYS}+ days`,
          method: `SQL: status=active AND progress=0 AND updated_at < now()-${STUCK_DAYS}d`,
          answer: stuck.map(
            (g) =>
              `${g.title}${g.entityName ? ` (${g.entityName})` : ""} — untouched since ${dateLabel(g.updatedAt)}`,
          ),
        },
  );

  directives.push(
    goalsDue === null
      ? {
          question: `goals with a target date inside ${IMMINENT_DAYS} days`,
          answer: [],
          method: "QUERY FAILED — treat as unknown, not as none",
        }
      : {
          question: `goals with a target date inside ${IMMINENT_DAYS} days`,
          method: `SQL: status=active AND target_date <= now()+${IMMINENT_DAYS}d`,
          answer: goalsDue.map(
            (g) => `${g.title} — due ${dateLabel(g.targetDate)}, ${g.progress ?? 0}% done`,
          ),
        },
  );

  directives.push(
    commitments === null
      ? {
          question: `commitments due inside ${IMMINENT_DAYS} days`,
          answer: [],
          method: "QUERY FAILED — treat as unknown, not as none",
        }
      : {
          question: `commitments due inside ${IMMINENT_DAYS} days`,
          method: `SQL: status=active AND due_date <= now()+${IMMINENT_DAYS}d`,
          answer: commitments.map((c) => `${c.description} — due ${dateLabel(c.dueDate)}`),
        },
  );

  directives.push(
    events === null
      ? {
          question: `events/deadlines inside ${IMMINENT_DAYS} days`,
          answer: [],
          method: "QUERY FAILED — treat as unknown, not as none",
        }
      : {
          question: `events/deadlines inside ${IMMINENT_DAYS} days`,
          method: `SQL: deadline <= now()+${IMMINENT_DAYS}d`,
          answer: events.map((e) => `${e.name} (${e.type}) — deadline ${dateLabel(e.deadline)}`),
        },
  );

  // "Most at risk of breaking today" has an exact reading: not yet done today,
  // ordered by how much streak is on the line. Ties are broken by streak length
  // because a longer streak is a larger loss — that is a product decision, and
  // it belongs here in code where it is inspectable, not in a prompt where the
  // model re-invents it differently every turn.
  directives.push(
    habits === null
      ? {
          question: "habit most at risk today",
          answer: [],
          method: "QUERY FAILED — treat as unknown, not as none",
        }
      : {
          question: "habit most at risk today",
          method: "not yet checked off today, ranked by streak at stake (longest first)",
          answer: habits
            .filter((h) => !h.doneToday)
            .sort((a, b) => b.streak - a.streak)
            .slice(0, 3)
            .map((h) => `${h.title} — ${h.streak}-day streak at stake, not yet done today`),
        },
  );

  return directives;
}
