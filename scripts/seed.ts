import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { readFileSync } from "fs";
import { homedir } from "os";
import * as schema from "../src/db/schema";
import type { EntityType, SubStatus, CommitmentStatus, EventStatus } from "../src/lib/constants/statuses";
import type { SubscriptionCurrency, SubscriptionFrequency } from "../src/config/subscriptions";

const HOME = homedir();
const DATABASE_URL = process.env.DATABASE_URL!;

function safeDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function safeDateRequired(v: string | null | undefined): Date {
  const d = safeDate(v);
  return d ?? new Date();
}
const SQLITE_PATH = `${HOME}/.openclaw/knowledge.sqlite`;
const CONTACTS_PATH = `${HOME}/.openclaw/workspace/data/contact-resolver.json`;
const GEORGE_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log("Connecting to Postgres...");
  const client = postgres(DATABASE_URL);
  const db = drizzle(client, { schema });

  // Truncate all tables
  console.log("Truncating tables...");
  await db.execute(sql`TRUNCATE users, entities, entity_relations, attributes, interactions, goals, commitments, subscriptions, events CASCADE`);

  // Create default user
  console.log("Creating default user...");
  await db.insert(schema.users).values({
    id: GEORGE_USER_ID,
    name: "George",
    email: "butaeff@gmail.com",
    isDefault: true,
  });

  // Read SQLite
  console.log(`Reading ${SQLITE_PATH}...`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Import entities
  const sqliteEntities = sqlite.prepare("SELECT * FROM entities").all() as Array<{
    id: number; name: string; type: string; created_at: string; updated_at: string;
  }>;

  const idMap = new Map<number, string>(); // sqlite id -> postgres uuid

  console.log(`Importing ${sqliteEntities.length} entities...`);
  for (const e of sqliteEntities) {
    const [inserted] = await db.insert(schema.entities).values({
      userId: GEORGE_USER_ID,
      name: e.name,
      // Sqlite is the legacy boundary; types are validated upstream of the import.
      type: e.type as EntityType,
      source: "knowledge.sqlite",
      createdAt: safeDateRequired(e.created_at),
      updatedAt: safeDateRequired(e.updated_at),
    }).returning({ id: schema.entities.id });
    idMap.set(e.id, inserted.id);
  }

  // Import attributes
  const sqliteAttrs = sqlite.prepare("SELECT * FROM attributes").all() as Array<{
    id: number; entity_id: number; key: string; value: string; confidence: number;
    source: string; temporal: string; valid_until: string; created_at: string; updated_at: string;
  }>;

  console.log(`Importing ${sqliteAttrs.length} attributes...`);
  for (const a of sqliteAttrs) {
    const entityId = idMap.get(a.entity_id);
    if (!entityId) continue;
    await db.insert(schema.attributes).values({
      userId: GEORGE_USER_ID,
      entityId,
      key: a.key,
      value: a.value,
      confidence: a.confidence,
      source: a.source ?? "knowledge.sqlite",
      temporal: a.temporal ?? "permanent",
      validUntil: safeDate(a.valid_until),
      createdAt: safeDateRequired(a.created_at),
      updatedAt: safeDateRequired(a.updated_at),
    });
  }

  // Import relations
  const sqliteRelations = sqlite.prepare("SELECT * FROM relations").all() as Array<{
    id: number; from_entity_id: number; relation: string; to_entity_id: number;
    properties: string; confidence: number; source: string; created_at: string; updated_at: string;
  }>;

  console.log(`Importing ${sqliteRelations.length} relations...`);
  for (const r of sqliteRelations) {
    const fromId = idMap.get(r.from_entity_id);
    const toId = idMap.get(r.to_entity_id);
    if (!fromId || !toId) continue;
    await db.insert(schema.entityRelations).values({
      userId: GEORGE_USER_ID,
      fromEntityId: fromId,
      toEntityId: toId,
      type: r.relation,
      metadata: r.properties ? JSON.parse(r.properties) : null,
      confidence: r.confidence,
      source: r.source ?? "knowledge.sqlite",
      createdAt: safeDateRequired(r.created_at),
      updatedAt: safeDateRequired(r.updated_at),
    });
  }

  // Import commitments
  const sqliteCommitments = sqlite.prepare("SELECT * FROM commitments").all() as Array<{
    id: number; description: string; entity_id: number; due_date: string;
    status: string; financial_impact: string; source: string; created_at: string; updated_at: string;
  }>;

  console.log(`Importing ${sqliteCommitments.length} commitments...`);
  for (const c of sqliteCommitments) {
    const entityId = c.entity_id ? idMap.get(c.entity_id) : null;
    await db.insert(schema.commitments).values({
      userId: GEORGE_USER_ID,
      entityId: entityId ?? null,
      description: c.description,
      dueDate: safeDate(c.due_date),
      status: c.status as CommitmentStatus,
      financialImpact: c.financial_impact,
      source: c.source ?? "knowledge.sqlite",
      createdAt: safeDateRequired(c.created_at),
      updatedAt: safeDateRequired(c.updated_at),
    });
  }

  // Import subscriptions
  const sqliteSubs = sqlite.prepare("SELECT * FROM subscriptions").all() as Array<{
    id: number; entity_id: number; name: string; vendor: string; amount: number;
    currency: string; frequency: string; category: string; status: string;
    next_due: string; payment_method: string; notes: string; created_at: string; updated_at: string;
  }>;

  console.log(`Importing ${sqliteSubs.length} subscriptions...`);
  for (const s of sqliteSubs) {
    const entityId = s.entity_id ? idMap.get(s.entity_id) : null;
    await db.insert(schema.subscriptions).values({
      userId: GEORGE_USER_ID,
      entityId: entityId ?? null,
      name: s.name,
      vendor: s.vendor,
      amount: s.amount,
      currency: (s.currency ?? "CHF") as SubscriptionCurrency,
      frequency: (s.frequency ?? "monthly") as SubscriptionFrequency,
      category: s.category,
      status: s.status as SubStatus,
      nextDue: safeDate(s.next_due),
      paymentMethod: s.payment_method,
      notes: s.notes,
      createdAt: safeDateRequired(s.created_at),
      updatedAt: safeDateRequired(s.updated_at),
    });
  }

  // Import events
  const sqliteEvents = sqlite.prepare("SELECT * FROM events").all() as Array<{
    id: number; name: string; type: string; description: string; url: string;
    location: string; date_start: string; date_end: string; deadline: string;
    cost: string; category: string; status: string; source: string;
    metadata: string; created_at: string; updated_at: string;
  }>;

  console.log(`Importing ${sqliteEvents.length} events...`);
  for (const e of sqliteEvents) {
    await db.insert(schema.events).values({
      userId: GEORGE_USER_ID,
      name: e.name,
      type: e.type,
      description: e.description,
      url: e.url,
      location: e.location,
      dateStart: safeDate(e.date_start),
      dateEnd: safeDate(e.date_end),
      deadline: safeDate(e.deadline),
      category: e.category,
      status: e.status as EventStatus,
      source: e.source ?? "knowledge.sqlite",
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
      createdAt: safeDateRequired(e.created_at),
      updatedAt: safeDateRequired(e.updated_at),
    });
  }

  sqlite.close();

  // Import contacts from contact-resolver.json
  console.log(`\nReading ${CONTACTS_PATH}...`);
  const contactsRaw = JSON.parse(readFileSync(CONTACTS_PATH, "utf-8")) as {
    contacts: Array<{
      id: string;
      displayName: string;
      aliases?: string[];
      channels?: Record<string, Record<string, string>>;
    }>;
  };

  // Build name→uuid lookup from existing entities (case-insensitive)
  const existingByName = new Map<string, string>();
  for (const [sqliteId, pgId] of idMap) {
    const entity = sqliteEntities.find((e) => e.id === sqliteId);
    if (entity && entity.type === "person") {
      existingByName.set(entity.name.toLowerCase().trim(), pgId);
    }
  }

  let contactsNew = 0;
  let contactsEnriched = 0;

  for (const contact of contactsRaw.contacts) {
    const nameLower = contact.displayName.toLowerCase().trim();
    let entityId = existingByName.get(nameLower);

    if (!entityId) {
      // Create new person entity
      const [inserted] = await db.insert(schema.entities).values({
        userId: GEORGE_USER_ID,
        name: contact.displayName,
        type: "person",
        externalId: contact.id,
        source: "contact-resolver",
      }).returning({ id: schema.entities.id });
      entityId = inserted.id;
      contactsNew++;
    } else {
      // Update external_id on existing entity
      await db.update(schema.entities)
        .set({ externalId: contact.id, source: "knowledge.sqlite+contact-resolver" })
        .where(sql`${schema.entities.id} = ${entityId}`);
      contactsEnriched++;
    }

    // Add aliases as attribute
    if (contact.aliases && contact.aliases.length > 0) {
      await db.insert(schema.attributes).values({
        userId: GEORGE_USER_ID,
        entityId,
        key: "aliases",
        value: JSON.stringify(contact.aliases),
        source: "contact-resolver",
      }).onConflictDoNothing();
    }

    // Add channel attributes
    if (contact.channels) {
      for (const [channel, data] of Object.entries(contact.channels)) {
        const value = Object.entries(data).map(([k, v]) => `${k}:${v}`).join(",");
        await db.insert(schema.attributes).values({
          userId: GEORGE_USER_ID,
          entityId,
          key: `channel:${channel}`,
          value,
          source: "contact-resolver",
        }).onConflictDoNothing();
      }
    }
  }

  // Print summary
  const [entityCount] = await db.execute(sql`SELECT COUNT(*) as count FROM entities`);
  const [attrCount] = await db.execute(sql`SELECT COUNT(*) as count FROM attributes`);
  const [relCount] = await db.execute(sql`SELECT COUNT(*) as count FROM entity_relations`);
  const [commitCount] = await db.execute(sql`SELECT COUNT(*) as count FROM commitments`);
  const [subCount] = await db.execute(sql`SELECT COUNT(*) as count FROM subscriptions`);
  const [eventCount] = await db.execute(sql`SELECT COUNT(*) as count FROM events`);

  const extractCount = (row: unknown): string => {
    if (row && typeof row === "object" && "count" in row) {
      return String((row as { count: unknown }).count);
    }
    return "0";
  };

  console.log("\n--- Seed Summary ---");
  console.log(`Entities:      ${extractCount(entityCount)} (${contactsNew} new from contacts, ${contactsEnriched} enriched)`);
  console.log(`Attributes:    ${extractCount(attrCount)}`);
  console.log(`Relations:     ${extractCount(relCount)}`);
  console.log(`Commitments:   ${extractCount(commitCount)}`);
  console.log(`Subscriptions: ${extractCount(subCount)}`);
  console.log(`Events:        ${extractCount(eventCount)}`);

  await client.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
