/**
 * GET /api/settings/fleet-lifecycle — read the user's Fleet Lifecycle prefs
 * PUT /api/settings/fleet-lifecycle — write them
 *
 * Used by:
 *   - SettingsTabs → FleetLifecycleSettings UI (the user's edit surface)
 *   - Fleet Runner boot path (reads on cold-start to decide autoRestore + mode)
 *
 * Bearer-authenticated via getApiUserId (cookie OR ck_* agent token), so
 * the Fleet Runner desktop process can read the settings with its own token
 * while the in-browser UI uses the session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type FleetLifecycleSettings, DEFAULT_FLEET_SETTINGS } from "@/db/schema/users";
import { getApiUserId } from "@/lib/session";

function sanitize(raw: unknown): FleetLifecycleSettings {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: FleetLifecycleSettings = {};
  if (typeof obj.autoRestore === "boolean") out.autoRestore = obj.autoRestore;
  if (obj.restoreMode === "fresh-spawn" || obj.restoreMode === "leave-alone") {
    out.restoreMode = obj.restoreMode;
  }
  if (typeof obj.sessionName === "string") {
    const trimmed = obj.sessionName.trim();
    // Zellij session names are simple identifiers — keep this conservative.
    if (/^[A-Za-z0-9_-]{1,48}$/.test(trimmed)) out.sessionName = trimmed;
  }
  if (typeof obj.autoStartAtLogin === "boolean") out.autoStartAtLogin = obj.autoStartAtLogin;
  return out;
}

function merged(
  stored: FleetLifecycleSettings | null | undefined,
): Required<FleetLifecycleSettings> {
  return { ...DEFAULT_FLEET_SETTINGS, ...(stored ?? {}) };
}

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [row] = await db
    .select({ fleetSettings: users.fleetSettings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return NextResponse.json({ settings: merged(row?.fleetSettings) });
}

export async function PUT(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const incoming = sanitize((body as { settings?: unknown })?.settings);
  // Merge with stored so PUT can be a partial patch.
  const [row] = await db
    .select({ fleetSettings: users.fleetSettings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const next: FleetLifecycleSettings = { ...(row?.fleetSettings ?? {}), ...incoming };
  await db
    .update(users)
    .set({ fleetSettings: next, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return NextResponse.json({ settings: merged(next) });
}
