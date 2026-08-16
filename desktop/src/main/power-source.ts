/**
 * Is this machine on wall power or running down a battery?
 *
 * WHY A RUNNER REPORTS THIS
 * -------------------------
 * Presence answers "is this builder connected". It does not answer "will this
 * builder still exist when the agent finishes", and those are different
 * questions the moment the operator is not sitting at the machine. A laptop on
 * wall power stays awake. The same laptop on battery sleeps when the lid shuts
 * and dies when the charge runs out — so a dispatch sent to it from a phone is
 * a coin flip on whether the work survives.
 *
 * NO ELECTRON. This module is imported by pusher.ts, which the headless
 * box-runner also loads; Electron's powerMonitor would be an import error
 * there. Same reason app.getVersion() was lifted out of pusher.
 *
 * NEVER THROWS. A heartbeat that dies because a power probe failed is a far
 * worse outcome than not knowing the power source: unknown is a first-class,
 * safe answer here (routing only ever acts on positive knowledge), whereas a
 * thrown error stops presence itself.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

export type PowerSource = "ac" | "battery";

const SYSFS_ROOT = "/sys/class/power_supply";

function readTrimmed(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Linux, via sysfs. Exported for tests, which point `root` at a fixture tree —
 * the real path cannot be staged and a probe nobody can test is a probe nobody
 * should trust.
 */
export function readPowerSourceLinux(root: string = SYSFS_ROOT): PowerSource | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return null; // no sysfs (container, macOS, Windows) — unknown, not battery
  }

  let sawBattery = false;
  let mainsOnline: boolean | null = null;

  for (const name of entries) {
    const type = readTrimmed(path.join(root, name, "type"));
    if (type === "Battery") {
      sawBattery = true;
      continue;
    }
    if (type === "Mains") {
      const online = readTrimmed(path.join(root, name, "online"));
      // Any Mains that is online wins: a dock and a charger both count as
      // wall power, and a machine with two adapters must not read as battery
      // because the unplugged one was enumerated last.
      if (online === "1") mainsOnline = true;
      else if (online === "0" && mainsOnline === null) mainsOnline = false;
    }
  }

  // A machine with no battery cannot be running on one. This is the box: a
  // server reports no Battery supply, and treating it as mains is both true and
  // the answer that keeps it a durable dispatch target.
  if (!sawBattery) return "ac";

  if (mainsOnline === null) return null; // battery present, no mains info — unknown
  return mainsOnline ? "ac" : "battery";
}

/** macOS, via pmset. Time-boxed; any failure is unknown. */
function readPowerSourceDarwin(): PowerSource | null {
  try {
    const out = execFileSync("pmset", ["-g", "batt"], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (/AC Power/i.test(out)) return "ac";
    if (/Battery Power/i.test(out)) return "battery";
    return null;
  } catch {
    return null;
  }
}

/**
 * Best-effort power source for this host. `null` means "could not determine" —
 * a legitimate answer that callers must treat as unknown, never as battery.
 */
export function readPowerSource(): PowerSource | null {
  try {
    if (process.platform === "linux") return readPowerSourceLinux();
    if (process.platform === "darwin") return readPowerSourceDarwin();
    return null; // Windows and anything else: unknown until someone needs it
  } catch {
    return null;
  }
}
