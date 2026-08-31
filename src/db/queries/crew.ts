/**
 * The crew roster — the humans in the loop.
 *
 * There is no `crew` table on purpose. A crew member IS a person in the
 * operator's own book (`entities`, type person) carrying CREW_ATTR.MEMBER. That
 * means enrolling someone you already know adds no row at all, un-enrolling
 * them keeps every note and interaction you ever recorded, and the address book
 * can never disagree with the roster about who someone is.
 *
 * Attribute writes go through `upsertEntityAttribute`, which runs the actor
 * kernel's `assertAttrAllowed` — so a crew flag physically cannot be written
 * onto a robot, whatever a route or a model asks for.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attributes, entities, humanTasks } from "@/db/schema";
import { ENTITY_TYPE, HUMAN_TASK_STATUS, type HumanTaskStatus } from "@/lib/constants/statuses";
import {
  CREW_ATTR,
  OPEN_HUMAN_TASK_STATUSES,
  isEngagement,
  isWaitingOnAssignee,
  orangeCatProfileUrl,
  type CrewProfileInput,
  type EnrolCrewInput,
  type Engagement,
} from "@/config/crew";
import { assertCanDelegate } from "@/config/actors";
import { createPerson } from "@/db/queries/people";
import {
  deleteEntityAttribute,
  fetchAttributesByEntityIds,
  upsertEntityAttribute,
} from "@/db/queries/utils";

export type CrewMember = {
  id: string;
  name: string;
  description: string | null;
  role: string | null;
  skills: string[];
  engagement: Engagement | null;
  rate: string | null;
  currency: string | null;
  availability: string | null;
  orangecatProfile: string | null;
  /** Assignments of theirs that are still live. */
  openTasks: number;
  /** …of which these are ones THEY owe an answer or a delivery on. */
  waitingOnThem: number;
};

function splitSkills(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function hydrate(
  row: { id: string; name: string; description: string | null },
  attrs: Record<string, string>,
  counts: { open: number; waiting: number },
): CrewMember {
  const engagement = attrs[CREW_ATTR.ENGAGEMENT];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    role: attrs[CREW_ATTR.ROLE] || null,
    skills: splitSkills(attrs[CREW_ATTR.SKILLS]),
    engagement: engagement && isEngagement(engagement) ? engagement : null,
    rate: attrs[CREW_ATTR.RATE] || null,
    currency: attrs[CREW_ATTR.CURRENCY] || null,
    availability: attrs[CREW_ATTR.AVAILABILITY] || null,
    orangecatProfile: attrs[CREW_ATTR.ORANGECAT_PROFILE] || null,
    openTasks: counts.open,
    waitingOnThem: counts.waiting,
  };
}

/** Live assignment counts per assignee, in one query rather than N. */
async function taskCountsByAssignee(
  userId: string,
  assigneeIds: string[],
): Promise<Map<string, { open: number; waiting: number }>> {
  const counts = new Map<string, { open: number; waiting: number }>();
  if (assigneeIds.length === 0) return counts;

  const rows = await db
    .select({
      assigneeId: humanTasks.assigneeId,
      status: humanTasks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(humanTasks)
    .where(
      and(
        eq(humanTasks.userId, userId),
        inArray(humanTasks.assigneeId, assigneeIds),
        inArray(humanTasks.status, OPEN_HUMAN_TASK_STATUSES),
      ),
    )
    .groupBy(humanTasks.assigneeId, humanTasks.status);

  for (const row of rows) {
    if (!row.assigneeId) continue;
    const entry = counts.get(row.assigneeId) ?? { open: 0, waiting: 0 };
    entry.open += row.count;
    if (isWaitingOnAssignee(row.status as HumanTaskStatus)) entry.waiting += row.count;
    counts.set(row.assigneeId, entry);
  }
  return counts;
}

export async function listCrew(userId: string): Promise<CrewMember[]> {
  const rows = await db
    .select({
      id: entities.id,
      name: entities.name,
      description: entities.description,
    })
    .from(entities)
    .innerJoin(
      attributes,
      and(
        eq(attributes.entityId, entities.id),
        eq(attributes.userId, userId),
        eq(attributes.key, CREW_ATTR.MEMBER),
        eq(attributes.value, "true"),
      ),
    )
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)))
    .orderBy(entities.name);

  const ids = rows.map((r) => r.id);
  const [attrsByEntity, counts] = await Promise.all([
    fetchAttributesByEntityIds(ids),
    taskCountsByAssignee(userId, ids),
  ]);

  return rows.map((row) =>
    hydrate(row, attrsByEntity.get(row.id) ?? {}, counts.get(row.id) ?? { open: 0, waiting: 0 }),
  );
}

export async function getCrewMember(userId: string, personId: string): Promise<CrewMember | null> {
  const [row] = await db
    .select({ id: entities.id, name: entities.name, description: entities.description })
    .from(entities)
    .where(
      and(
        eq(entities.id, personId),
        eq(entities.userId, userId),
        eq(entities.type, ENTITY_TYPE.PERSON),
      ),
    )
    .limit(1);
  if (!row) return null;

  const attrsByEntity = await fetchAttributesByEntityIds([row.id]);
  const attrs = attrsByEntity.get(row.id) ?? {};
  if (attrs[CREW_ATTR.MEMBER] !== "true") return null;

  const counts = await taskCountsByAssignee(userId, [row.id]);
  return hydrate(row, attrs, counts.get(row.id) ?? { open: 0, waiting: 0 });
}

/**
 * Confirm a person may be handed work, and return their display name.
 *
 * Deliberately NOT "is on the crew": you can assign to anyone in your book, and
 * enrolment follows. What it does refuse is a non-person — the guard that keeps
 * "assign the vacuum to call the supplier" from ever becoming a row.
 */
export async function assertAssignablePerson(
  userId: string,
  personId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: entities.id, name: entities.name, type: entities.type })
    .from(entities)
    .where(and(eq(entities.id, personId), eq(entities.userId, userId)))
    .limit(1);
  if (!row) return null;
  assertCanDelegate(row.type);
  return { id: row.id, name: row.name };
}

/** Write the profile half of a crew record. Absent fields are left alone; empty ones are cleared. */
async function writeProfile(
  userId: string,
  personId: string,
  input: CrewProfileInput,
): Promise<void> {
  // The profile is a payment destination, so it is stored canonical — a handle
  // and a pasted URL must not become two different-looking records of the same
  // wallet. The zod body already rejected anything that is neither.
  const profile = input.orangecatProfile
    ? (orangeCatProfileUrl(input.orangecatProfile) ?? undefined)
    : input.orangecatProfile;

  const pairs: Array<[string, string | undefined]> = [
    [CREW_ATTR.ROLE, input.role],
    [CREW_ATTR.SKILLS, input.skills],
    [CREW_ATTR.ENGAGEMENT, input.engagement],
    [CREW_ATTR.RATE, input.rate],
    [CREW_ATTR.CURRENCY, input.currency],
    [CREW_ATTR.AVAILABILITY, input.availability],
    [CREW_ATTR.ORANGECAT_PROFILE, profile],
  ];
  for (const [key, value] of pairs) {
    if (value === undefined) continue;
    if (value === "") {
      await deleteEntityAttribute(userId, personId, key);
      continue;
    }
    await upsertEntityAttribute(userId, personId, key, value);
  }
}

/**
 * Put someone in the loop. Either an existing contact (`personId`) or a new
 * name — in which case the person row is created first, because making the
 * operator go and add a contact elsewhere before they can delegate is how a
 * feature stops being used.
 */
export async function enrolCrew(userId: string, input: EnrolCrewInput): Promise<CrewMember | null> {
  let personId = input.personId ?? null;

  if (personId) {
    const person = await assertAssignablePerson(userId, personId);
    if (!person) return null;
  } else {
    const created = await createPerson(userId, {
      name: input.name!.trim(),
      description: input.notes,
    });
    personId = created.id;
  }

  const ok = await upsertEntityAttribute(userId, personId, CREW_ATTR.MEMBER, "true");
  if (!ok) return null;
  await writeProfile(userId, personId, input);
  return getCrewMember(userId, personId);
}

export async function updateCrewProfile(
  userId: string,
  personId: string,
  input: CrewProfileInput,
): Promise<CrewMember | null> {
  const existing = await getCrewMember(userId, personId);
  if (!existing) return null;
  await writeProfile(userId, personId, input);
  return getCrewMember(userId, personId);
}

/**
 * Take someone out of the loop.
 *
 * Only the crew attributes go. The person, their notes, their interactions and
 * every assignment they ever did stay exactly where they are — un-enrolling is
 * a statement about the roster, never about the relationship.
 */
export async function removeFromCrew(userId: string, personId: string): Promise<boolean> {
  const existing = await getCrewMember(userId, personId);
  if (!existing) return false;
  for (const key of Object.values(CREW_ATTR)) {
    await deleteEntityAttribute(userId, personId, key);
  }
  return true;
}

/** Roster-wide counters for the page header. One question, answered in numbers. */
export async function getCrewSummary(userId: string): Promise<{
  members: number;
  openTasks: number;
  waitingOnThem: number;
  waitingOnYou: number;
}> {
  const [members, tasks] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(attributes)
      .where(
        and(
          eq(attributes.userId, userId),
          eq(attributes.key, CREW_ATTR.MEMBER),
          eq(attributes.value, "true"),
        ),
      ),
    db
      .select({ status: humanTasks.status, count: sql<number>`count(*)::int` })
      .from(humanTasks)
      .where(
        and(eq(humanTasks.userId, userId), inArray(humanTasks.status, OPEN_HUMAN_TASK_STATUSES)),
      )
      .groupBy(humanTasks.status),
  ]);

  let openTasks = 0;
  let waitingOnThem = 0;
  let waitingOnYou = 0;
  for (const row of tasks) {
    openTasks += row.count;
    if (isWaitingOnAssignee(row.status as HumanTaskStatus)) waitingOnThem += row.count;
    // Draft and delivered are both the operator's move — one to send, one to check.
    if (row.status === HUMAN_TASK_STATUS.DRAFT || row.status === HUMAN_TASK_STATUS.DELIVERED) {
      waitingOnYou += row.count;
    }
  }

  return { members: members[0]?.count ?? 0, openTasks, waitingOnThem, waitingOnYou };
}
