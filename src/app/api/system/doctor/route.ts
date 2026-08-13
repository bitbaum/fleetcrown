import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { validateAgentToken } from "@/db/queries/agent-tokens";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { APP_URL } from "@/config/brand";

const execp = promisify(exec);

type DoctorStatus = "pass" | "warn" | "fail";
type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  detail: string;
};

function check(id: string, label: string, status: DoctorStatus, detail: string): DoctorCheck {
  return { id, label, status, detail };
}

async function shell(command: string, timeout = 5000): Promise<string> {
  const { stdout } = await execp(command, { timeout });
  return stdout.trim();
}

function readTokenFile(): string {
  const path = `${homedir()}/.config/fleetcrown/fleet-runner-token`;
  if (!existsSync(/*turbopackIgnore: true*/ path)) return "";
  return readFileSync(/*turbopackIgnore: true*/ path, "utf8").trim();
}

function readRunnerEnv(): Record<string, string> {
  // Fleet Runner writes runner.env; older installs wrote daemon.env. Prefer the
  // current name, fall back to the legacy file so existing machines keep working.
  const dir = `${homedir()}/.config/fleetcrown`;
  const path = existsSync(/*turbopackIgnore: true*/ `${dir}/runner.env`) ? `${dir}/runner.env` : `${dir}/daemon.env`;
  if (!existsSync(/*turbopackIgnore: true*/ path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(/*turbopackIgnore: true*/ path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    out[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
    limit 1
  `) as unknown as Array<Record<string, unknown>>;
  return rows.length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table} and column_name = ${column}
    limit 1
  `) as unknown as Array<Record<string, unknown>>;
  return rows.length > 0;
}

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isRuntimeAvailable()) {
    return NextResponse.json({
      runtime: false,
      summary: { status: "warn", pass: 0, warn: 1, fail: 0 },
      checks: [
        check("runtime", "Local runtime", "warn", "Fleet Doctor runs full checks only on the local install."),
      ],
    });
  }

  const checks: DoctorCheck[] = [];

  // Session 4 of killing-the-bash-daemon: only the local Next.js prod wrapper
  // remains as a FleetCrown systemd unit. Fleet Runner desktop is a regular
  // Electron app the user launches from their tray menu — it has no
  // systemd unit to probe (its process tree appears under app-fleet-
  // runner@.service if the user enabled systemd integration, but that's
  // an OS-level convenience, not a FleetCrown surface).
  for (const unit of ["fleetcrown-app.service"]) {
    try {
      const [active, enabled] = await Promise.all([
        shell(`systemctl --user is-active ${unit}`).catch(() => "inactive"),
        shell(`systemctl --user is-enabled ${unit}`).catch(() => "disabled"),
      ]);
      checks.push(check(
        `unit:${unit}`,
        unit,
        active === "active" && enabled === "enabled" ? "pass" : active === "active" ? "warn" : "fail",
        `${active}, ${enabled}`,
      ));
    } catch (err) {
      checks.push(check(`unit:${unit}`, unit, "fail", err instanceof Error ? err.message : String(err)));
    }
  }

  const legacyUnits = await shell("systemctl --user list-unit-files '*cockpit*' --no-legend --no-pager 2>/dev/null || true")
    .catch(() => "");
  checks.push(check(
    "legacy-units",
    "Legacy Cockpit units",
    legacyUnits ? "warn" : "pass",
    legacyUnits ? legacyUnits.split("\n").slice(0, 3).join("; ") : "No active unit files listed.",
  ));

  // Session 4 of killing-the-bash-daemon retired the bash bridge that the
  // Stop hook used to exec. The hook is now expected to be a no-op (or
  // absent) — Fleet Runner's embedded watcher (home/watcher.ts) detects the
  // status:ready transition by filesystem mtime and triggers dispatch via
  // its own TS module (desktop/src/main/dispatch.ts). A hook that still
  // points at the deleted bridge is broken; flag it.
  const stopHook = `${homedir()}/.claude/hooks/stop.sh`;
  const deadBridgeTarget = ".local/share/fleetcrown-beacon/agent-hook-bridge.sh";
  const stopExists = existsSync(/*turbopackIgnore: true*/ stopHook);
  const stopReferencesDeadBridge = stopExists && readFileSync(/*turbopackIgnore: true*/ stopHook, "utf8").includes(deadBridgeTarget);
  checks.push(check(
    "hooks",
    "Claude Stop hook",
    !stopReferencesDeadBridge ? "pass" : "fail",
    !stopExists
      ? "No stop.sh installed — Fleet Runner's filesystem watcher triggers dispatch instead."
      : stopReferencesDeadBridge
        ? "stop.sh still points at the retired bash bridge — rewrite to `exit 0` or remove the file entirely."
        : "stop.sh is a no-op (correct post-migration state).",
  ));

  // Typed-prompt capture: without the UserPromptSubmit hook, prompts typed
  // directly into a Claude tab never reach /api/activity/capture, so Activity
  // only shows dispatched work. Fleet Runner installs it on startup
  // (desktop/src/main/capture-hook.ts); warn — not fail — because dispatch-only
  // setups work fine without it, they just under-report.
  const captureScript = `${homedir()}/.claude/hooks/fleetcrown-capture.sh`;
  const claudeSettingsPath = `${homedir()}/.claude/settings.json`;
  let captureRegistered = false;
  try {
    const settings = JSON.parse(readFileSync(/*turbopackIgnore: true*/ claudeSettingsPath, "utf8")) as {
      hooks?: { UserPromptSubmit?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    captureRegistered = (settings.hooks?.UserPromptSubmit ?? []).some((entry) =>
      (entry.hooks ?? []).some((h) => typeof h.command === "string" && h.command.includes("fleetcrown-capture.sh")),
    );
  } catch { /* missing or unparseable settings.json → not registered */ }
  const captureScriptExists = existsSync(/*turbopackIgnore: true*/ captureScript);
  checks.push(check(
    "hooks-capture",
    "Claude prompt-capture hook",
    captureRegistered && captureScriptExists ? "pass" : "warn",
    captureRegistered && captureScriptExists
      ? "UserPromptSubmit hook installed — directly-typed prompts reach Activity."
      : "Not installed — directly-typed Claude prompts won't appear in Activity. Start Fleet Runner (it installs the hook once a token is saved).",
  ));

  const token = readTokenFile();
  const env = readRunnerEnv();
  const envToken = env.FLEETCROWN_DAEMON_TOKEN ?? "";
  const localToken = token ? await validateAgentToken(token) : null;
  checks.push(check(
    "token-local",
    "Local runner token",
    token && localToken?.userId === userId ? "pass" : "fail",
    token && localToken?.userId === userId ? `Registered locally (${token.slice(0, 8)}…).` : "Missing or not registered for this user.",
  ));
  checks.push(check(
    "token-env",
    "Runner env token",
    token && envToken === token ? "pass" : "warn",
    token && envToken === token ? "daemon.env matches fleet-runner-token." : "daemon.env and fleet-runner-token differ.",
  ));

  const remoteBase = (env.FLEETCROWN_BASE_URL || APP_URL).replace(/\/$/, "");
  if (token) {
    try {
      const res = await fetch(`${remoteBase}/api/beacon-settings`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      checks.push(check(
        "token-cloud",
        "Cloud runner token",
        res.ok ? "pass" : "fail",
        `${remoteBase} returned HTTP ${res.status}.`,
      ));
    } catch (err) {
      checks.push(check("token-cloud", "Cloud runner token", "fail", err instanceof Error ? err.message : String(err)));
    }
  } else {
    checks.push(check("token-cloud", "Cloud runner token", "fail", "No fleet-runner-token file found."));
  }

  const auditTable = await tableExists("control_audit_events").catch(() => false);
  const beaconTable = await tableExists("beacon_sessions").catch(() => false);
  const installedAgents = await columnExists("runtime_snapshots", "installed_agents").catch(() => false);
  checks.push(check("migration:audit", "Audit migration", auditTable ? "pass" : "fail", auditTable ? "control_audit_events exists." : "control_audit_events is missing."));
  checks.push(check("migration:beacon", "Beacon migration", beaconTable ? "pass" : "fail", beaconTable ? "beacon_sessions exists." : "beacon_sessions is missing."));
  checks.push(check("migration:runtime", "Runtime snapshot migration", installedAgents ? "pass" : "fail", installedAgents ? "runtime_snapshots.installed_agents exists." : "runtime_snapshots.installed_agents is missing."));

  const legacyPaths = [
    `${homedir()}/.config/cockpit`,
    `${homedir()}/.local/share/cockpit`,
    `${homedir()}/.local/share/cockpit-beacon`,
    "/tmp/cockpit-beacon",
    "/tmp/cockpit-hook-auth",
  ].filter((path) => existsSync(/*turbopackIgnore: true*/ path));
  checks.push(check(
    "legacy-paths",
    "Legacy Cockpit paths",
    legacyPaths.length === 0 ? "pass" : "warn",
    legacyPaths.length === 0 ? "No live legacy paths found." : legacyPaths.join(", "),
  ));

  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const status: DoctorStatus = fail > 0 ? "fail" : warn > 0 ? "warn" : "pass";

  return NextResponse.json({
    runtime: true,
    checkedAt: new Date().toISOString(),
    summary: { status, pass, warn, fail },
    checks,
  });
}
