import { db } from "@/db";
import { actions, entities } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ACTION_STATUS, ACTION_TYPE, ENTITY_TYPE } from "@/lib/constants/statuses";
import { proposeAction } from "./actions";
import { createPerson, patchPerson } from "./people";
import { upsertEntityAttribute, fetchAttributesByEntityIds } from "./utils";
import {
  BOOK_ACTION_TYPES,
  ENRICH_SCAN_CAP,
  IMPORT_APPLY_CAP,
  IMPORT_BATCH_CAP,
  enrichDraftTitle,
  importDraftTitle,
  isBookAttrKey,
  type ImportSource,
} from "@/config/book";
import { matchImportedContact, shouldPreferImportedName } from "@/lib/people-dedupe";
import { isUniqueViolation } from "@/lib/api/route-helpers";
import { proposeEnrichments } from "@/lib/people-enrich";
import type { ImportedContact } from "@/lib/people-import";
import { canImportSocial } from "@/config/actors";

export async function listBookDrafts(userId: string) {
  return db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.userId, userId),
        eq(actions.status, ACTION_STATUS.DRAFT),
        inArray(actions.type, [...BOOK_ACTION_TYPES]),
      ),
    )
    .orderBy(desc(actions.createdAt));
}

export async function applyImportedContact(
  userId: string,
  contact: ImportedContact,
): Promise<{ id: string; name: string }> {
  if (!canImportSocial(ENTITY_TYPE.PERSON)) {
    throw new Error("This actor kind cannot be imported into the people book");
  }
  let created: { id: string; name: string };
  try {
    created = await createPerson(userId, {
      name: contact.name,
      description: contact.description,
      source: contact.source,
      externalId: contact.externalId,
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const [existing] = await db
      .select({ id: entities.id, name: entities.name })
      .from(entities)
      .where(
        and(
          eq(entities.userId, userId),
          eq(entities.type, ENTITY_TYPE.PERSON),
          eq(entities.name, contact.name),
        ),
      )
      .limit(1);
    if (!existing) throw e;
    created = existing;
  }
  for (const [key, value] of Object.entries(contact.attrs)) {
    if (!isBookAttrKey(key) && !key.startsWith("channel:")) continue;
    if (!value.trim()) continue;
    await upsertEntityAttribute(userId, created.id, key, value);
  }
  return created;
}

export async function applyEnrichment(
  userId: string,
  entityId: string,
  key: string,
  value: string,
) {
  if (!isBookAttrKey(key) && !key.startsWith("channel:")) {
    throw new Error("That field is not an allowed book attribute");
  }
  const [person] = await db
    .select({ id: entities.id, type: entities.type })
    .from(entities)
    .where(
      and(
        eq(entities.id, entityId),
        eq(entities.userId, userId),
        eq(entities.type, ENTITY_TYPE.PERSON),
      ),
    );
  if (!person) throw new Error("Person not found");
  const ok = await upsertEntityAttribute(userId, entityId, key, value);
  if (!ok) throw new Error("Person not found");
}

export async function enqueueImport(
  userId: string,
  contacts: ImportedContact[],
  source: ImportSource,
) {
  const existing = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)));
  const existingIds = existing.map((e) => e.id);
  const attrsById = await fetchAttributesByEntityIds(existingIds);
  const book = existing.map((e) => ({ id: e.id, name: e.name, attrs: attrsById.get(e.id) ?? {} }));

  let imported = 0;
  let enrich = 0;
  let skipped = 0;

  for (const contact of contacts.slice(0, IMPORT_BATCH_CAP)) {
    const match = matchImportedContact(contact, book);
    if (!match) {
      const created = await proposeAction(userId, {
        type: ACTION_TYPE.IMPORT_PERSON,
        title: importDraftTitle(contact.name),
        description: contact.description ?? null,
        payload: {
          kind: "import_person",
          name: contact.name,
          description: contact.description,
          attrs: contact.attrs,
          externalId: contact.externalId,
          source,
        },
        reasoning: `From your ${source} file. Accept to add them to your book. Nothing is sent.`,
      });
      if (created) imported += 1;
      else skipped += 1;
      continue;
    }

    const current = attrsById.get(match.id) ?? {};
    const newKeys = Object.entries(contact.attrs).filter(([k, v]) => v && !current[k]);
    if (newKeys.length === 0) {
      skipped += 1;
      continue;
    }
    for (const [key, value] of newKeys) {
      const created = await proposeAction(userId, {
        type: ACTION_TYPE.ENRICH_PERSON,
        title: enrichDraftTitle(match.name, key),
        payload: { kind: "enrich_person", key, value, source },
        reasoning: `Already in your book as ${match.name}. Accept to add this field.`,
        entityId: match.id,
      });
      if (created) enrich += 1;
    }
  }

  return { imported, enrich, skipped, capped: contacts.length > IMPORT_BATCH_CAP };
}

/**
 * Write the file the operator just handed us. Selecting the file is the
 * approval — inferred scan enrichments still go through accept/discard.
 */
export async function applyImportedBook(
  userId: string,
  contacts: ImportedContact[],
  offset = 0,
  cap = IMPORT_APPLY_CAP,
) {
  const existing = await db
    .select({ id: entities.id, name: entities.name, description: entities.description })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)));
  const existingIds = existing.map((e) => e.id);
  const attrsById = await fetchAttributesByEntityIds(existingIds);
  const book = existing.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    attrs: attrsById.get(e.id) ?? {},
  }));

  let created = 0;
  let enriched = 0;
  let skipped = 0;
  const slice = contacts.slice(offset, offset + cap);

  for (const contact of slice) {
    const match = matchImportedContact(contact, book);
    if (!match) {
      const row = await applyImportedContact(userId, contact);
      book.push({
        id: row.id,
        name: row.name,
        description: contact.description ?? null,
        attrs: { ...contact.attrs },
      });
      created += 1;
      continue;
    }

    let wrote = false;
    const current = attrsById.get(match.id) ?? {};
    for (const [key, value] of Object.entries(contact.attrs)) {
      if (!value.trim()) continue;
      if (!isBookAttrKey(key) && !key.startsWith("channel:")) continue;
      if (current[key]) continue;
      await applyEnrichment(userId, match.id, key, value);
      current[key] = value;
      wrote = true;
    }
    const matched = book.find((p) => p.id === match.id);
    if (matched && shouldPreferImportedName(matched.name, contact.name)) {
      try {
        await patchPerson(userId, match.id, { name: contact.name });
        matched.name = contact.name;
        wrote = true;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    if (contact.description && matched && !matched.description) {
      await patchPerson(userId, match.id, { description: contact.description });
      matched.description = contact.description;
      wrote = true;
    }
    attrsById.set(match.id, current);
    if (matched) matched.attrs = current;
    if (wrote) enriched += 1;
    else skipped += 1;
  }

  const nextOffset = offset + slice.length;
  return {
    created,
    enriched,
    skipped,
    parsed: contacts.length,
    nextOffset,
    done: nextOffset >= contacts.length,
  };
}

export async function enqueueEnrichmentScan(userId: string) {
  const existing = await db
    .select({ id: entities.id, name: entities.name, description: entities.description })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)));
  const attrsById = await fetchAttributesByEntityIds(existing.map((e) => e.id));
  let proposed = 0;
  for (const person of existing) {
    if (proposed >= ENRICH_SCAN_CAP) break;
    const proposals = proposeEnrichments({
      name: person.name,
      description: person.description,
      attrs: attrsById.get(person.id) ?? {},
    });
    for (const p of proposals) {
      if (proposed >= ENRICH_SCAN_CAP) break;
      const created = await proposeAction(userId, {
        type: ACTION_TYPE.ENRICH_PERSON,
        title: enrichDraftTitle(person.name, p.key),
        payload: { kind: "enrich_person", key: p.key, value: p.value, source: "internal" },
        reasoning: p.reason,
        entityId: person.id,
      });
      if (created) proposed += 1;
    }
  }
  return { proposed, capped: proposed >= ENRICH_SCAN_CAP };
}

/** Merge 2-person clusters that share an email or phone — not a name-only guess. */
export async function mergeObviousTwins(
  userId: string,
): Promise<{ merged: number; skipped: number }> {
  const { findDuplicatePeople } = await import("./people-merge");
  const { mergePeoplePair } = await import("./people-merge");
  const { pickCanonicalPerson } = await import("@/lib/people-dedupe");
  const clusters = await findDuplicatePeople(userId);
  let merged = 0;
  let skipped = 0;
  for (const c of clusters) {
    if (c.reason === "name" || c.members.length !== 2) {
      skipped += 1;
      continue;
    }
    const keep = pickCanonicalPerson(c.members);
    const drop = c.members.find((m) => m.id !== keep.id);
    if (!drop) {
      skipped += 1;
      continue;
    }
    await mergePeoplePair(userId, keep.id, drop.id);
    merged += 1;
  }
  return { merged, skipped };
}
