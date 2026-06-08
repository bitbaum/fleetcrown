// Bulk-create projects from a list of locally-detected folders.
//
// Companion to /api/projects/bulk-from-github. For users whose projects live
// on disk in ~/dev/ (the common case alongside GitHub) — they run a one-line
// curl|bash that scans their dev folder, then POSTs the list here.
//
// Auth: Bearer ck_* agent token (minted from /settings → Agent tokens, or via
// onboarding's ConnectMachineStep). We do NOT accept session cookies because
// this endpoint is designed to be called from a terminal, not a browser.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBearerUserId } from "@/lib/daemon-auth";
import { upsertLocalUserProject } from "@/db/queries/user-projects";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";

const FolderItem = z.object({
  /** Display name — typically the directory basename. */
  name: z.string().trim().min(1).max(120),
  /** Absolute path on the user's machine. Stored in description; not used as a secret. */
  path: z.string().trim().min(1).max(500),
  /** Optional git remote URL (origin). */
  remote_url: z.string().trim().max(500).optional(),
  /** Optional last-commit timestamp in ISO 8601 (for sorting later). */
  last_commit_iso: z.string().trim().max(40).optional(),
});

const Body = z.object({
  folders: z.array(FolderItem).min(1).max(200),
});

export async function POST(req: NextRequest) {
  const userId = await getBearerUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized — set FC_TOKEN to a ck_* agent token from /settings" },
      { status: 401 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const created: { id: string; name: string; path: string }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const folder of parsed.data.folders) {
    try {
      const project = await upsertLocalUserProject({
        userId,
        name: folder.name,
        dirPath: folder.path,
        description: folder.remote_url ? `Local repository imported from ${SOURCE_FLEETCROWN_UI}` : "Local repository",
        gitUrl: folder.remote_url || null,
      });
      created.push({ id: project.id, name: project.name, path: folder.path });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({
        name: folder.name,
        reason: msg.includes("duplicate") || msg.includes("unique") ? "duplicate" : msg.slice(0, 200),
      });
    }
  }

  return NextResponse.json({
    created,
    skipped,
    total: parsed.data.folders.length,
  });
}
