/**
 * Query layer for Loki conversations + their messages. Every read/write is
 * scoped by userId (multi-user safety — one user must never read or mutate
 * another's thread). Messages are reached only through a conversation the
 * caller owns, so message writes verify ownership first.
 */
import { and, desc, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  conversationMessages,
  type Conversation,
  type ConversationMessage,
} from "@/db/schema/conversations";

/** List a user's conversations, newest-updated first. Optional projectKeys
 *  filter keeps only threads tagged with at least one of the given keys
 *  (overlap). Selects only the columns the left-pane list renders. */
export async function listConversations(
  userId: string,
  opts: { projectKeys?: string[] } = {},
): Promise<Pick<Conversation, "id" | "title" | "projectKeys" | "updatedAt">[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      projectKeys: conversations.projectKeys,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));

  const filter = opts.projectKeys?.filter(Boolean) ?? [];
  if (filter.length === 0) return rows;
  const wanted = new Set(filter);
  return rows.filter((r) => r.projectKeys.some((k) => wanted.has(k)));
}

/** Create a new conversation. Title is required; projectKeys defaults to []. */
export async function createConversation(
  userId: string,
  { title, projectKeys = [] }: { title: string; projectKeys?: string[] },
): Promise<Conversation> {
  const [row] = await db
    .insert(conversations)
    .values({ userId, title, projectKeys })
    .returning();
  return row;
}

/** Fetch a conversation the user owns plus its messages (oldest-first).
 *  Returns null if the conversation doesn't exist or isn't theirs. */
export async function getConversationWithMessages(
  userId: string,
  id: string,
): Promise<{ conversation: Conversation; messages: ConversationMessage[] } | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  if (!conversation) return null;

  const messages = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, id))
    .orderBy(asc(conversationMessages.createdAt));

  return { conversation, messages };
}

/** Append a message to a conversation and bump the parent's updatedAt so the
 *  thread floats to the top of the list. Callers MUST have already verified
 *  the conversation belongs to the user (see getConversationWithMessages). */
export async function addMessage(
  conversationId: string,
  {
    role,
    kind,
    content,
    meta,
  }: {
    role: "user" | "assistant" | "system";
    kind?: "chat" | "command" | "dispatch";
    content: string;
    meta?: Record<string, unknown>;
  },
): Promise<ConversationMessage> {
  const [row] = await db
    .insert(conversationMessages)
    .values({ conversationId, role, kind: kind ?? null, content, meta: meta ?? {} })
    .returning();
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  return row;
}

/** Replace a conversation's project tags. User-scoped; returns the updated
 *  row or null if the conversation isn't theirs. */
export async function updateConversationProjects(
  userId: string,
  id: string,
  projectKeys: string[],
): Promise<Conversation | null> {
  const [row] = await db
    .update(conversations)
    .set({ projectKeys, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();
  return row ?? null;
}
