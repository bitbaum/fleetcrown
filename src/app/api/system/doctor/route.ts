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
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trim();
}

function readDaemonEnv(): Record<string, string> {
  const path = `${homedir()}/.config/fleetcrown/daemon.env`;
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
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

  for (const unit of ["fleetcrown-app.service", "fleetcrown-beacon-window.service", "fleetcrown-daemon.service"]) {
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

  const stopHook = `${homedir()}/.claude/hooks/stop.sh`;
  const notificationHook = `${homedir()}/.claude/hooks/notification.sh`;
  const hookTarget = ".local/share/fleetcrown-beacon/agent-hook-bridge.sh";
  const stopOk = existsSync(stopHook) && readFileSync(stopHook, "utf8").includes(hookTarget);
  const notificationOk = existsSync(notificationHook) && readFileSync(notificationHook, "utf8").includes(hookTarget);
  checks.push(check(
    "hooks",
    "Claude hooks",
    stopOk && notificationOk ? "pass" : "fail",
    stopOk && notificationOk ? "stop and notification hooks target FleetCrown." : "One or more hooks do not target the FleetCrown bridge.",
  ));

  const token = readTokenFile();
  const env = readDaemonEnv();
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
    "Daemon env token",
    token && envToken === token ? "pass" : "warn",
    token && envToken === token ? "daemon.env matches fleet-runner-token." : "daemon.env and fleet-runner-token differ.",
  ));

  const remoteBase = (env.FLEETCROWN_BASE_URL || "https://fleetcrown.vercel.app").replace(/\/$/, "");
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
  ].filter((path) => existsSync(path));
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
