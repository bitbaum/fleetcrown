/**
 * Loki's tools — reads over FleetCrown's OWN tables, and one proposal path.
 *
 * Every handler returns `Fact[]` built with `makeFact`, so unstored fields
 * render as `<not recorded>` and the verifier can check the answer against
 * them. No handler formats prose; see tools/registry.ts for why that invariant
 * is load-bearing rather than stylistic.
 *
 * Handlers do not throw for "nothing found" — an empty result with a `note` is
 * a real, reportable answer ("no people matched") and materially different from
 * an error. Collapsing those two was how the old context let the model treat a
 * gap as an invitation.
 */
import { z } from "zod";
import { getGoals, type GoalWithChildren } from "@/db/queries/goals";
import { getTodayHabits } from "@/db/queries/habits";
import { listUpcomingCommitments } from "@/db/queries/today";
import { getEventsDueSoon } from "@/db/queries/events";
import { getPendingActions, proposeAction } from "@/db/queries/actions";
import { ACTION_TYPE, type ActionType } from "@/lib/constants/statuses";
import { askGatewayAgent, isGatewayConfigured } from "@/lib/openclaw-gateway";
import { makeFact, type Fact } from "@/lib/agent/core/facts";
import { peopleFacts, projectFacts, documentFacts } from "@/lib/agent/sources";
import { enrichReachPayload, reachFromPerson, resolvePersonToReach } from "@/lib/people-resolve";
import { defineTool } from "@/lib/agent/tools/registry";
import type { ToolRegistry, ToolResult } from "@/lib/agent/tools/registry";

const LIST_LIMIT = 12;

function dateLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Empty-but-successful result. The note makes "none" legible as an answer. */
function empty(note: string): ToolResult {
  return { facts: [], note };
}

const searchPeopleTool = defineTool({
  name: "search_people",
  kind: "read",
  description:
    "Look up the operator's contacts by name, alias, email, or phone. Returns only stored fields — company, title, location, channels, notes when present. Never invent a job or affiliation.",
  params: z.object({ query: z.string().max(80).describe("name fragment, or empty for recent contacts") }),
  example: 'TOOL: search_people\nARGS: {"query": "Elena"}',
  handler: async ({ query }, ctx) => {
    const facts = await peopleFacts(ctx.userId, String(query ?? ""));
    return facts.length > 0
      ? { facts }
      : empty(`No contact matched "${query}". The operator's contact list has no such entry.`);
  },
});

const searchProjectsTool = defineTool({
  name: "list_projects",
  kind: "read",
  description: "List the operator's registered projects with stack, status and latest dev-log line.",
  params: z.object({}),
  example: "TOOL: list_projects\nARGS: {}",
  handler: async (_args, ctx) => {
    const facts = await projectFacts(ctx.userId);
    return facts.length > 0 ? { facts } : empty("The operator has no registered projects.");
  },
});

const searchKnowledgeTool = defineTool({
  name: "search_knowledge",
  kind: "read",
  description:
    "Semantic search over project dossiers, dev logs, repo docs and essays (pgvector). Use for 'what did I decide about X' or 'how does Y work'. Returns excerpts — evidence that something was WRITTEN, not proof it is still true.",
  params: z.object({ query: z.string().min(2).max(200) }),
  example: 'TOOL: search_knowledge\nARGS: {"query": "why did we choose pgvector"}',
  handler: async ({ query }, ctx) => {
    const facts = await documentFacts(ctx.userId, String(query), 6);
    return facts.length > 0
      ? { facts }
      : empty(`Nothing in the knowledge index matched "${query}".`);
  },
});

const listGoalsTool = defineTool({
  name: "list_goals",
  kind: "read",
  description: "The operator's active goals with progress and target date.",
  params: z.object({}),
  example: "TOOL: list_goals\nARGS: {}",
  handler: async (_args, ctx) => {
    // getGoals returns a TREE. Sub-goals are goals — flatten, or "which goal is
    // stuck" silently only ever considers top-level ones, which is exactly the
    // kind of quiet narrowing that makes an assistant confidently incomplete.
    const flatten = (nodes: GoalWithChildren[]): GoalWithChildren[] =>
      nodes.flatMap((g) => [g, ...flatten(g.children ?? [])]);
    const rows = flatten(await getGoals(ctx.userId).catch(() => [] as GoalWithChildren[]));
    if (rows.length === 0) return empty("The operator has no active goals.");
    const facts: Fact[] = rows.slice(0, LIST_LIMIT).map((g) =>
      makeFact({
        kind: "goal",
        subject: g.title,
        source: "goals table",
        values: {
          title: g.title,
          project: g.entityName,
          progress: g.progress === null || g.progress === undefined ? null : `${g.progress}%`,
          target_date: dateLabel(g.targetDate),
          last_updated: null,
        },
      }),
    );
    return { facts };
  },
});

const listHabitsTool = defineTool({
  name: "list_habits",
  kind: "read",
  description: "The operator's habits with today's check-off state and current streak.",
  params: z.object({}),
  example: "TOOL: list_habits\nARGS: {}",
  handler: async (_args, ctx) => {
    const rows = await getTodayHabits(ctx.userId).catch(() => []);
    if (rows.length === 0) return empty("The operator tracks no habits.");
    const facts = rows.slice(0, LIST_LIMIT).map((h) =>
      makeFact({
        kind: "habit",
        subject: h.title,
        source: "habits table",
        values: {
          title: h.title,
          frequency: h.frequency,
          current_streak: `${h.streak}`,
          last_checked: h.doneToday ? "done today" : "not yet done today",
        },
      }),
    );
    return { facts };
  },
});

const listCommitmentsTool = defineTool({
  name: "list_commitments",
  kind: "read",
  description: "Commitments and deadlines coming up. Give a day window.",
  params: z.object({ days: z.number().int().min(1).max(90).optional() }),
  example: 'TOOL: list_commitments\nARGS: {"days": 7}',
  handler: async ({ days }, ctx) => {
    const window = typeof days === "number" ? days : 14;
    const [commitments, events] = await Promise.all([
      listUpcomingCommitments(ctx.userId, window).catch(() => []),
      getEventsDueSoon(ctx.userId, window).catch(() => []),
    ]);
    const facts: Fact[] = [
      ...commitments.map((c) =>
        makeFact({
          kind: "commitment",
          subject: c.description,
          source: "commitments table",
          values: { title: c.description, due: dateLabel(c.dueDate), counterparty: null, status: "active" },
        }),
      ),
      ...events.map((e) =>
        makeFact({
          kind: "event",
          subject: e.name,
          source: "events table",
          values: { name: e.name, type: e.type, deadline: dateLabel(e.deadline), url: e.url, status: e.status },
        }),
      ),
    ];
    return facts.length > 0
      ? { facts }
      : empty(`Nothing due in the next ${window} days — the query ran and matched nothing.`);
  },
});

const listPendingApprovalsTool = defineTool({
  name: "list_pending_approvals",
  kind: "read",
  description:
    "The operator's approval queue — draft actions waiting for their approve/reject. Use when asked what is pending, waiting, or needs a decision. Decisions happen on the Approvals page (or via chat on WhatsApp/Telegram), not here.",
  params: z.object({}),
  example: "TOOL: list_pending_approvals\nARGS: {}",
  handler: async (_args, ctx) => {
    const rows = await getPendingActions(ctx.userId).catch(() => []);
    if (rows.length === 0) return empty("The approval queue is empty — nothing is waiting for the operator.");
    const facts = rows.slice(0, LIST_LIMIT).map((a) =>
      makeFact({
        kind: "pending_action",
        subject: a.title,
        source: "approval queue (actions table, status=draft)",
        values: {
          title: a.title,
          type: a.type,
          reasoning: a.reasoning,
          proposed_on: dateLabel(a.createdAt),
          // The short prefix is what the operator can quote to decide it from
          // chat (fc.sh decide <prefix>) — the full uuid is noise to a human.
          id: a.id.slice(0, 8),
        },
      }),
    );
    return { facts };
  },
});

/**
 * The OpenClaw gateway, demoted from "the brain" to one tool among many.
 *
 * Its answer is prose from an agent with its own memory and its own file
 * access — exactly the untrusted surface that produced the original
 * fabrications. So it is wrapped as a `document` fact whose source says so
 * loudly, which means the verifier treats its content as evidence only for
 * what it literally said, and the model must attribute rather than assert.
 */
const askOpenClawTool = defineTool({
  name: "ask_openclaw",
  kind: "read",
  description:
    "Ask the operator's OpenClaw agent (the Telegram/WhatsApp brain, with its own separate memory and workspace files). Use ONLY for things outside FleetCrown's database. Its reply is an unverified second-hand report — attribute it, never state it as fact.",
  params: z.object({ question: z.string().min(2).max(500) }),
  example: 'TOOL: ask_openclaw\nARGS: {"question": "what did we agree in the Telegram thread about the lease?"}',
  handler: async ({ question }) => {
    if (!isGatewayConfigured()) return empty("The OpenClaw gateway is not configured — that source is unavailable.");
    const res = await askGatewayAgent(String(question), {}).catch(() => null);
    const text = (res?.text ?? "").trim();
    if (!res?.ok || !text) return empty("The OpenClaw agent did not answer — that source is unavailable this turn.");
    return {
      facts: [
        makeFact({
          kind: "document",
          subject: `OpenClaw reply to "${String(question).slice(0, 60)}"`,
          source: "openclaw agent (UNVERIFIED second-hand report, not FleetCrown data)",
          values: { title: "OpenClaw agent reply", source: "openclaw agent", excerpt: text.slice(0, 1200) },
        }),
      ],
    };
  },
});

/**
 * The only way Loki affects the world: a DRAFT in the approval queue.
 *
 * Note what is deliberately absent — no send, no write, no execute. Loki
 * proposes; the operator approves. The tool returns the created draft as a
 * fact so the model reports what it actually queued rather than narrating a
 * completed action, which is the exact over-claim ("I booked it") the
 * capability preamble exists to prevent.
 */
const proposeActionTool = defineTool({
  name: "propose_action",
  kind: "propose",
  description:
    "Queue a draft action for the operator to approve (message, email, calendar event, commitment, follow-up, dispatch to a project). Nothing happens until they approve it. Never claim the action was done.",
  params: z.object({
    type: z.enum(["send_message", "send_email", "create_event", "create_commitment", "follow_up", "dispatch_prompt", "other"]),
    title: z.string().min(3).max(160).describe("what the operator will see in the queue"),
    reasoning: z.string().max(600).optional().describe("why you are proposing this, citing a record id"),
    to: z.string().max(120).optional(),
    body: z.string().max(4000).optional(),
    dueDate: z.string().max(40).optional(),
  }),
  example:
    'TOOL: propose_action\nARGS: {"type": "send_message", "title": "Message Elena Weber about funding", "to": "Elena Weber SINGA Switzerland", "body": "Hi Elena — ...", "reasoning": "contact exists in [F2]; no prior interaction recorded"}',
  handler: async (args, ctx) => {
    const a = args as {
      type: ActionType; title: string; reasoning?: string; to?: string; body?: string; dueDate?: string;
    };
    const person =
      a.type === ACTION_TYPE.SEND_MESSAGE || a.type === ACTION_TYPE.SEND_EMAIL
        ? await resolvePersonToReach(ctx.userId, a.to, a.title).catch(() => null)
        : null;
    const reach = person ? reachFromPerson(person) : null;
    const created = await proposeAction(ctx.userId, {
      type: a.type ?? ACTION_TYPE.OTHER,
      title: person && (a.type === ACTION_TYPE.SEND_MESSAGE || a.type === ACTION_TYPE.SEND_EMAIL)
        ? `Message ${person.name}`.slice(0, 160)
        : a.title,
      reasoning: person
        ? `Matched ${person.name}${reach ? ` on ${reach.channel}` : ""}.`
        : (a.reasoning ?? null),
      payload: enrichReachPayload({ to: a.to, body: a.body, dueDate: a.dueDate }, reach),
      entityId: person?.id ?? null,
    }).catch(() => null);

    // proposeAction returns null when an identical draft title is already
    // pending (a partial unique index dedupes it). That is a success for the
    // operator — the item is queued — so it must not read as a failure the
    // model then retries or apologises for.
    if (!created) {
      return empty(`A draft titled "${a.title}" is already waiting in the approval queue — not duplicated.`);
    }
    return {
      facts: [
        makeFact({
          kind: "commitment",
          subject: created.title,
          source: "approval queue (DRAFT — awaiting the operator's approval, not yet done)",
          values: { title: created.title, due: a.dueDate ?? null, counterparty: a.to ?? null, status: "draft — needs approval" },
        }),
      ],
    };
  },
});

export const LOKI_TOOLS: ToolRegistry = Object.fromEntries(
  [
    searchPeopleTool,
    searchProjectsTool,
    searchKnowledgeTool,
    listGoalsTool,
    listHabitsTool,
    listCommitmentsTool,
    listPendingApprovalsTool,
    askOpenClawTool,
    proposeActionTool,
  ].map((t) => [t.name, t]),
);
