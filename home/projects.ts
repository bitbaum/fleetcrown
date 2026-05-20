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
 *
 * Lookup is case-insensitive, matching the convention in
 * scripts/agent-hook-lib.sh:_find_session_for_tab and elsewhere.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type ProjectConfig = {
  name: string;
  dirPath: string;
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
  try { raw = fs.readFileSync(confPath, "utf8"); }
  catch { return result; }  // missing file → empty registry

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("|");
    if (sep < 1) continue;
    const name = trimmed.slice(0, sep).trim();
    const dirPath = trimmed.slice(sep + 1).trim();
    if (!name || !dirPath) continue;
    result.set(name.toLowerCase(), { name, dirPath });
  }
  return result;
}

/** Case-insensitive lookup of the dirPath for a given project name. */
export function resolveProjectPath(
  name: string,
  projects: Map<string, ProjectConfig> = loadProjects(),
): string | undefined {
  return projects.get(name.toLowerCase())?.dirPath;
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/projects.ts
// Round-trips a tiny in-memory conf so the test never touches the real
// ~/.config/agent-projects.conf file.

function selfTest() {
  const tmpConf = path.join(os.tmpdir(), `home-projects-selftest-${process.pid}.conf`);
  fs.writeFileSync(tmpConf, [
    "# top-level comment",
    "Cockpit|/home/g/dev/cockpit",
    "OrangeCat|/home/g/dev/orangecat",
    "   ",                                  // blank line — should be skipped
    "# inline comment",
    "Tab With Spaces|/some/where",
    "broken-line-no-separator",             // should be skipped silently
  ].join("\n"));

  try {
    const projects = loadProjects(tmpConf);

    const cases: { name: string; check: () => boolean }[] = [
      { name: "loads 3 valid entries, skips comments and malformed lines",
        check: () => projects.size === 3 },
      { name: "case-insensitive lookup matches mixed-case names",
        check: () => resolveProjectPath("COCKPIT", projects) === "/home/g/dev/cockpit" },
      { name: "lowercase lookup also works",
        check: () => resolveProjectPath("cockpit", projects) === "/home/g/dev/cockpit" },
      { name: "tab name with embedded spaces resolves",
        check: () => resolveProjectPath("Tab With Spaces", projects) === "/some/where" },
      { name: "unknown project returns undefined",
        check: () => resolveProjectPath("nonexistent", projects) === undefined },
      { name: "preserves the original display-case in the ProjectConfig.name field",
        check: () => projects.get("orangecat")?.name === "OrangeCat" },
      { name: "missing conf file returns empty map without throwing",
        check: () => loadProjects("/no/such/path").size === 0 },
    ];

    let pass = 0, fail = 0;
    for (const c of cases) {
      if (c.check()) { console.log(`  ✓ ${c.name}`); pass++; }
      else           { console.log(`  ✗ ${c.name}`); fail++; }
    }
    console.log(`\n${pass}/${pass + fail} passed`);
    if (fail > 0) process.exit(1);
  } finally {
    try { fs.unlinkSync(tmpConf); } catch { /* ignore */ }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
}
