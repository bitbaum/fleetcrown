import type { Conversation, ConversationMessage } from "@/db/schema/conversations";

/** Left-pane row — the subset listConversations() returns (dates arrive as
 *  ISO strings over the wire). */
export type ConversationSummary = Pick<Conversation, "id" | "title" | "projectKeys"> & {
  updatedAt: string;
};

/** A transcript message as it arrives over the wire (createdAt is an ISO
 *  string; meta is opaque). */
export type LokiMessage = Omit<ConversationMessage, "createdAt" | "meta"> & {
  createdAt: string;
  meta: Record<string, unknown> | null;
};

/** GET /api/user-projects row (subset Loki needs). topGoal is the project's
 *  current active goal — what the fleet is aiming at — shown in the panel so
 *  the operator can aim a dispatch at a glance. */
export type LokiProject = {
  id: string;
  name: string;
  topGoal?: { title: string; progress: number | null } | null;
};

/** GET /api/agents row — a dispatchable agent and the models it can run, for
 *  the composer model picker. */
export type LokiAgent = {
  id: string;
  label: string;
  defaultModel: string;
  modelSuggestions: string[];
};

/** A composer model-picker selection. Empty object = "Auto" (project default). */
export type ModelChoice = { agent?: string; model?: string };

/** A text file attached in the composer — its content is folded into the
 *  dispatched prompt (no upload; the agent reads it inline). */
export type Attachment = { name: string; content: string };
