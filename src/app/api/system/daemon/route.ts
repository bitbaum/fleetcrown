/**
 * POST /api/system/daemon  { action: "start" | "restart" | "stop" }
 * GET  /api/system/daemon  (returns current state)
 *
 * Controls the fleetcrown-daemon.service systemd user unit (legacy
 * cockpit-daemon.service is auto-detected as a fallback for transitional
 * installs). Local-only — Vercel cloud has no daemon to control, so the
 * route 403s when isRuntimeAvailable() is false. This is the one-click
 * recovery path the user surfaced 2026-05-31: until now, when the daemon
 * went offline the only recovery was a terminal command, which is
 * product-fatal for the "fleet control" value prop.
 *
 * Security: the route shells out to systemctl. We hard-code the unit-name
 * candidate list + action whitelist; no user input is interpolated into
 * the shell command. RUNTIME_AVAILABLE is the local-machine gate (Vercel
 * never sets it, so cloud users can never reach the shell-out path).
 */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";

const execp = promisify(exec);

const DaemonAction = z.object({
  action: z.enum(["start", "restart", "stop", "status"]),
});

// Canonical first; legacy is the transition fallback. Both names are
// hard-coded — no user input ever reaches systemctl.
const UNIT_CANDIDATES = ["fleetcrown-daemon.service", "cockpit-daemon.service"] as const;

// Resolved unit is cached after the first lookup. systemd unit installation is
// a one-time setup event; this cache stays valid for the life of the process.
let _resolvedUnit: string | null = null;

async function getUnit(): Promise<string> {
  if (_resolvedUnit) return _resolvedUnit;
  for (const candidate of UNIT_CANDIDATES) {
    try {
      await execp(`systemctl --user cat ${candidate}`, { timeout: 2000 });
      _resolvedUnit = candidate;
      return candidate;
    } catch { /* not installed under this name; try next */ }
  }
  // Default to canonical so error messages reference the name we want to be the standard.
  _resolvedUnit = UNIT_CANDIDATES[0];
  return _resolvedUnit;
}

async function systemctlState(): Promise<"active" | "inactive" | "failed" | "unknown"> {
  try {
    const { stdout } = await execp(`systemctl --user is-active ${await getUnit()}`, { timeout: 5000 });
    const s = stdout.trim();
    if (s === "active" || s === "inactive" || s === "failed") return s;
    return "unknown";
  } catch (e: unknown) {
    const stdout = (e as { stdout?: string })?.stdout?.toString().trim();
    if (stdout === "inactive" || stdout === "failed") return stdout;
    return "unknown";
  }
}

export async function GET() {
  if (!isRuntimeAvailable()) {
    return NextResponse.json({ error: "Daemon control unavailable on cloud — runs only on the local install." }, { status: 403 });
  }
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await systemctlState();
  return NextResponse.json({ state, unit: await getUnit() });
}

export async function POST(req: NextRequest) {
  if (!isRuntimeAvailable()) {
    return NextResponse.json({
      error: "Daemon control unavailable on cloud — runs only on the local install. Start the daemon from your machine.",
    }, { status: 403 });
  }
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, DaemonAction);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { action } = dataOrResp;
  const unit = await getUnit();

  // "status" is just a GET in POST clothing — no side effect.
  if (action === "status") {
    return NextResponse.json({ state: await systemctlState(), unit });
  }

  try {
    await execp(`systemctl --user ${action} ${unit}`, { timeout: 10000 });
    // systemctl returns immediately; give the unit a beat to settle so the
    // state we report back is post-action, not pre-action.
    await new Promise((r) => setTimeout(r, 800));
    const state = await systemctlState();
    return NextResponse.json({ ok: true, action, state, unit });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      error: `systemctl ${action} ${unit} failed: ${message}`,
      state: await systemctlState(),
    }, { status: 500 });
  }
}
