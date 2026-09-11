// scripts/hetzner/apps.conf, read at runtime.
//
// apps.conf is the hosting SSOT: provisioning (sync-infra, deploy) reads it as
// a file, so it stays a file. This is the ONE parser for it in the app — the
// register API, the public footer and anything else that wants to know "what
// is hosted where" go through here rather than growing their own split('|').
//
// Format (the header of the file is the authority; this mirrors it):
//   name|port|domains|repo_path|app_dir|db|owner|kind|status|plan|price|since
// `#` lines are comments, domains are comma-separated, '-' means unknown.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type HostedApp = {
  name: string;
  port: number | null;
  domains: string[];
  repoPath: string;
  appDir: string;
  db: string;
  owner: string;
  kind: string;
  status: string;
  plan: string;
  price: string;
  since: string;
};

export const APPS_CONF_RELATIVE = "scripts/hetzner/apps.conf";

/** Parse apps.conf text. Tolerant of short rows (older rows had fewer columns). */
export function parseAppsConf(text: string): HostedApp[] {
  const rows: HostedApp[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const c = line.split("|").map((s) => s.trim());
    if (c.length < 3 || !c[0]) continue;
    const port = /^\d+$/.test(c[1] ?? "") ? Number(c[1]) : null;
    rows.push({
      name: c[0],
      port,
      domains: (c[2] ?? "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      repoPath: c[3] ?? "",
      appDir: c[4] ?? ".",
      db: c[5] ?? "-",
      owner: c[6] ?? "-",
      kind: c[7] ?? "-",
      status: c[8] ?? "-",
      plan: c[9] ?? "-",
      price: c[10] ?? "-",
      since: c[11] ?? "-",
    });
  }
  return rows;
}

/**
 * Read the register shipped with this build. The standalone tree carries
 * scripts/hetzner/ (the deploy relies on it), so `process.cwd()` is right in
 * prod; `root` exists so tests and scripts can point elsewhere.
 */
export function readAppsConf(root: string = process.cwd()): HostedApp[] {
  try {
    return parseAppsConf(readFileSync(join(root, APPS_CONF_RELATIVE), "utf8"));
  } catch {
    return [];
  }
}

/** The address a hosted app answers on — its first domain, as an https URL. */
export function hostedUrl(app: HostedApp): string | null {
  const d = app.domains[0];
  return d ? `https://${d}` : null;
}
