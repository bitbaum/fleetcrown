// User-owned prompts — read / update / soft-delete a single row.
//
// GET    /api/prompts/<id>  → the row, or 404
// PATCH  /api/prompts/<id>  → update (validated via UpdatePromptBody)
// DELETE /api/prompts/<id>  → soft-delete (is_active=false) — preserves any
//                              run-history FKs that may land later

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody } from "@/lib/api/route-helpers";
import { UpdatePromptBody, deletePrompt, getPrompt, updatePrompt } from "@/db/queries/prompts";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = await getPrompt(userId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ prompt: row });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = await readJsonBody(req, UpdatePromptBody);
  if (parsed instanceof NextResponse) return parsed;
  const row = await updatePrompt(userId, id, parsed);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ prompt: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await deletePrompt(userId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
