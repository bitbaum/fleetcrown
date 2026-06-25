import { pgTable, uuid, text, jsonb, timestamp, unique, index, customType } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Fleet-knowledge vector index (pgvector) — SSOT for retrieval-augmented context.
 *
 * The CAPTAIN's RAG layer, not the runtime's: we index what only FleetCrown sees
 * across the whole fleet + life-OS (project profiles, dev-logs, orchestration
 * outcomes, decisions, entities) — never repo code, which the runtime retrieves
 * for itself. Embeddings are 384-dim (BAAI/bge-small-en-v1.5, local fastembed).
 * Every row is user_id-scoped — retrieval must never cross tenants.
 *
 * The `vector` extension + this table are created on the box directly (superuser
 * needed for the extension); this declaration keeps it in the Drizzle SSOT so the
 * schema-drift guard accounts for it.
 */
const vectorType = customType<{ data: number[]; driverData: string; config: { dim: number } }>({
  dataType(config) {
    return `vector(${config?.dim ?? 384})`;
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value.slice(1, -1).split(",").map(Number);
  },
});

export const knowledgeEmbeddings = pgTable("knowledge_embeddings", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // 'project_profile' | 'dev_log' | 'orchestration_outcome' | 'decision' | 'entity' | 'commitment' | 'thought'
  sourceType: text("source_type").notNull(),
  sourceId:   text("source_id").notNull(),
  chunk:      text("chunk").notNull(),
  embedding:  vectorType("embedding", { dim: 384 }).notNull(),
  metadata:   jsonb("metadata").notNull().default({}),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("uq_knowledge_embeddings_src").on(t.userId, t.sourceType, t.sourceId),
  index("idx_knowledge_embeddings_user_type").on(t.userId, t.sourceType),
]);

export type KnowledgeEmbeddingRow = typeof knowledgeEmbeddings.$inferSelect;
