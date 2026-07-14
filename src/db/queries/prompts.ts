// Query layer for the user-owned prompts table.
//
// The /prompts page merges these rows with the FleetCrown defaults from
// src/config/prompt-library.ts at render time. This module is the SSOT
// for CRUD on the user-owned half.
//
// Three scopes today (project_id is nullable; null = global):
//   - global  : available across every project, only to the owning user
//   - project : pinned to entities.id = project_id
//   - org     : visible to all members of org_id
//
// Variables: each row's `variables` column is the declared list of
// {{name}} placeholders the body contains. The parser below derives this
// from the body so callers don't have to maintain both in sync.

import { and, asc, desc, eq, or, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { prompts, type PromptRow } from "@/db/schema/prompts";
import { getOrgPeerIds } from "./utils";

// ── Variable parsing ────────────────────────────────────────────────────────

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\|\s*([^}]+))?\s*\}\}/g;

export interface PromptVariable {
  name: string;
  defaultValue?: string;
  description?: string;
}

/** Extract {{name}} and {{name|default}} placeholders from a body. Dedupes
 *  by name (first occurrence wins for the default). Pure function — no DB. */
export function parsePromptVariables(body: string): PromptVariable[] {
  const seen = new Map<string, PromptVariable>();
  let match: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((match = VAR_RE.exec(body)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    const defaultValue = match[2]?.trim();
    seen.set(name, defaultValue ? { name, defaultValue } : { name });
  }
  return Array.from(seen.values());
}

/** Render a body with variable substitutions. Missing vars fall back to the
 *  declared default; otherwise the placeholder stays in (visible to the agent
 *  so the user notices). */
export function renderPromptBody(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (_full, name: string, defaultValue?: string) => {
    if (values[name] !== undefined) return values[name];
    if (defaultValue !== undefined) return defaultValue.trim();
    return _full;
  });
}

// ── Validators ──────────────────────────────────────────────────────────────

const Scope = z.enum(["global", "project", "org"]);

export const CreatePromptBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(20_000),
  scope: Scope.default("global"),
  projectId: z.string().uuid().optional().nullable(),
  orgId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  source: z.enum(["user", "captured", "fc-default-fork"]).default("user"),
  forkedFromKey: z.string().trim().max(120).optional().nullable(),
});

export type CreatePromptInput = z.infer<typeof CreatePromptBody>;

export const UpdatePromptBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    body: z.string().trim().min(1).max(20_000).optional(),
    scope: Scope.optional(),
    projectId: z.string().uuid().nullable().optional(),
    orgId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type UpdatePromptInput = z.infer<typeof UpdatePromptBody>;

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createPrompt(userId: string, data: CreatePromptInput): Promise<PromptRow> {
  // Scope-vs-id invariants: scope='project' demands projectId; scope='org'
  // demands orgId. Reject the wrong-shape combos before INSERT so the DB
  // never holds an inconsistent row.
  if (data.scope === "project" && !data.projectId) {
    throw new Error("scope='project' requires projectId");
  }
  if (data.scope === "org" && !data.orgId) {
    throw new Error("scope='org' requires orgId");
  }
  if (data.scope === "global" && (data.projectId || data.orgId)) {
    throw new Error("scope='global' must not set projectId or orgId");
  }
  const variables = parsePromptVariables(data.body);
  const [row] = await db
    .insert(prompts)
    .values({
      userId,
      name: data.name,
      description: data.description ?? null,
      body: data.body,
      scope: data.scope,
      projectId: data.scope === "project" ? data.projectId! : null,
      orgId: data.scope === "org" ? data.orgId! : null,
      tags: data.tags,
      variables,
      source: data.source,
      forkedFromKey: data.forkedFromKey ?? null,
    })
    .returning();
  return row;
}

export async function updatePrompt(userId: string, id: string, data: UpdatePromptInput): Promise<PromptRow | null> {
  const patch: Partial<typeof prompts.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.body !== undefined) {
    patch.body = data.body;
    patch.variables = parsePromptVariables(data.body);
  }
  if (data.scope !== undefined) patch.scope = data.scope;
  if (data.projectId !== undefined) patch.projectId = data.projectId;
  if (data.orgId !== undefined) patch.orgId = data.orgId;
  if (data.tags !== undefined) patch.tags = data.tags;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  const [row] = await db
    .update(prompts)
    .set(patch)
    .where(and(eq(prompts.id, id), eq(prompts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deletePrompt(userId: string, id: string): Promise<boolean> {
  // Soft delete via is_active=false rather than DELETE so run history (any
  // future orchestration_runs.prompt_id FK) survives. Hard delete is a
  // separate cleanup the user can never see.
  const [row] = await db
    .update(prompts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(prompts.id, id), eq(prompts.userId, userId)))
    .returning({ id: prompts.id });
  return !!row;
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** List all prompts visible to the user — their own + org-scoped from peers. */
export async function listPromptsForUser(userId: string): Promise<PromptRow[]> {
  // Org-scoped prompts from peers: anyone in the user's orgs whose row has
  // scope='org' and org_id in the user's org set. Solo users get their own
  // rows only (org_id IN [] → no peers). Reuse getOrgPeerIds (same pattern
  // user-projects uses).
  const peerIds = await getOrgPeerIds(userId);
  const visibleUserIds = [userId, ...peerIds];
  return db
    .select()
    .from(prompts)
    .where(and(
      eq(prompts.isActive, true),
      // Own rows always visible; peers' rows visible only if scope='org'.
      or(
        eq(prompts.userId, userId),
        and(inArray(prompts.userId, visibleUserIds), eq(prompts.scope, "org")),
      ),
    ))
    .orderBy(desc(prompts.updatedAt), asc(prompts.name));
}

export async function getPrompt(userId: string, id: string): Promise<PromptRow | null> {
  const [row] = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, id), eq(prompts.userId, userId)))
    .limit(1);
  return row ?? null;
}
