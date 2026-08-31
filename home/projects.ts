/**
 * Project registry — reads the existing ~/.config/agent-projects.conf
 * SSOT for tab-name → filesystem-path mapping.
 *
 * The file is already maintained by the user and the install scripts; the
 * home/ system just reads it. Format (per existing convention):
 *
 *   # comments allowed
 *   TabName|/absolute/path
 *   Another Tab|/home/g/dev/foo
 *   CodexProject|/home/g/dev/foo|codex          ← optional 3rd field: adapter
 *
 * The third field declares which adapter the brain should default the
 * dispatch to. Existing two-field entries keep their meaning (adapter
 * stays undefined; downstream defaults to claude). Recognised values
 * match @/lib/events ADAPTERS — claude | codex | gemini | openclaw.
 *
 * Lookup is case-insensitive, matching the convention in
 * scripts/agent-hook-lib.sh:_find_session_for_tab and elsewhere.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ADAPTERS, type Adapter } from "@/lib/events";

export type ProjectConfig = {
  name: string;
  dirPath: string;
  /** Optional third field from the conf file. Undefined when absent or
   *  when the value isn't a recognised adapter — callers fall back to
   *  the brain's default ("claude"). */
  adapter?: Adapter;
};

/**
 * Returns the path to the project config file. Override with
 * APP_PROJECTS_CONF (falls back to legacy AGENT_PROJECTS_CONF /
 * CLAUDE_PROJECTS_CONF env names, then to ~/.config/agent-projects.conf).
 */
export function projectsConfPath(): string {
  return (
    process.env.APP_PROJECTS_CONF ??
    process.env.AGENT_PROJECTS_CONF ??
    process.env.CLAUDE_PROJECTS_CONF ??
    path.join(os.homedir(), ".config", "agent-projects.conf")
  );
}

/**
 * Parse the conf file. Returns a Map keyed by lowercase name so callers
 * don't have to remember the casing convention.
 */
export function loadProjects(confPath: string = projectsConfPath()): Map<string, ProjectConfig> {
  const result = new Map<string, ProjectConfig>();
  let raw: string;
  try {
    raw = fs.readFileSync(confPath, "utf8");
  } catch {
    return result;
  } // missing file → empty registry

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("|").map((s) => s.trim());
    const [name, dirPath, adapterRaw] = parts;
    if (!name || !dirPath) continue;
    // Only accept the 3rd field if it matches a known adapter. An unknown
    // value silently degrades to undefined so a typo doesn't poison
    // dispatches — the brain falls back to "claude" downstream.
    const adapter =
      adapterRaw && (ADAPTERS as readonly string[]).includes(adapterRaw)
        ? (adapterRaw as Adapter)
        : undefined;
    result.set(name.toLowerCase(), { name, dirPath, adapter });
  }
  return result;
}

/** Case-insensitive lookup of the declared adapter for a project, or
 *  undefined if the conf entry didn't include one. */
export function resolveProjectAdapter(
  name: string,
  projects: Map<string, ProjectConfig> = loadProjects(),
): Adapter | undefined {
  return projects.get(name.toLowerCase())?.adapter;
}

/** Lookup the dirPath for a given project name.
 *  Layered:
 *    1. Case-insensitive literal key (the common case).
 *    2. Loose match — strip hyphens + underscores from both sides and
 *       compare. Lets the cloud send "revampit" find the conf entry
 *       "revamp-it" without forcing the user to rebrand. */
export function resolveProjectPath(
  name: string,
  projects: Map<string, ProjectConfig> = loadProjects(),
): string | undefined {
  const lower = name.toLowerCase();
  const direct = projects.get(lower)?.dirPath;
  if (direct) return direct;
  const looseTarget = lower.replace(/[-_]/g, "");
  for (const [key, cfg] of projects) {
    if (key.replace(/[-_]/g, "") === looseTarget) return cfg.dirPath;
  }
  return undefined;
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/projects.ts
// Round-trips a tiny in-memory conf so the test never touches the real
// ~/.config/agent-projects.conf file.

function selfTest() {
  const tmpConf = path.join(os.tmpdir(), `home-projects-selftest-${process.pid}.conf`);
  fs.writeFileSync(
    tmpConf,
    [
      "# top-level comment",
      "FleetCrown|/home/g/dev/fleetcrown",
      "OrangeCat|/home/g/dev/orangecat|codex", // 3rd field: codex adapter
      "   ", // blank line — should be skipped
      "# inline comment",
      "Tab With Spaces|/some/where",
      "broken-line-no-separator", // should be skipped silently
      "Bogus|/path|notarealadapter", // unknown 3rd field — silently dropped
    ].join("\n"),
  );

  try {
    const projects = loadProjects(tmpConf);

    const cases: { name: string; check: () => boolean }[] = [
      {
        name: "loads 4 valid entries, skips comments and malformed lines",
        check: () => projects.size === 4,
      },
      {
        name: "case-insensitive lookup matches mixed-case names",
        check: () => resolveProjectPath("FLEETCROWN", projects) === "/home/g/dev/fleetcrown",
      },
      {
        name: "lowercase lookup also works",
        check: () => resolveProjectPath("fleetcrown", projects) === "/home/g/dev/fleetcrown",
      },
      {
        name: "tab name with embedded spaces resolves",
        check: () => resolveProjectPath("Tab With Spaces", projects) === "/some/where",
      },
      {
        name: "unknown project returns undefined",
        check: () => resolveProjectPath("nonexistent", projects) === undefined,
      },
      {
        name: "preserves the original display-case in the ProjectConfig.name field",
        check: () => projects.get("orangecat")?.name === "OrangeCat",
      },
      {
        name: "missing conf file returns empty map without throwing",
        check: () => loadProjects("/no/such/path").size === 0,
      },
      {
        name: "3rd field 'codex' becomes ProjectConfig.adapter (per-project adapter override)",
        check: () => projects.get("orangecat")?.adapter === "codex",
      },
      {
        name: "resolveProjectAdapter returns the declared adapter",
        check: () => resolveProjectAdapter("OrangeCat", projects) === "codex",
      },
      {
        name: "two-field entries (no adapter declared) have adapter=undefined",
        check: () => projects.get("fleetcrown")?.adapter === undefined,
      },
      {
        name: "unknown adapter value silently degrades to undefined (typo defence)",
        check: () =>
          projects.get("bogus")?.adapter === undefined &&
          projects.get("bogus")?.dirPath === "/path",
      },
    ];

    let pass = 0,
      fail = 0;
    for (const c of cases) {
      if (c.check()) {
        console.log(`  ✓ ${c.name}`);
        pass++;
      } else {
        console.log(`  ✗ ${c.name}`);
        fail++;
      }
    }
    console.log(`\n${pass}/${pass + fail} passed`);
    if (fail > 0) process.exit(1);
  } finally {
    try {
      fs.unlinkSync(tmpConf);
    } catch {
      /* ignore */
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
}
