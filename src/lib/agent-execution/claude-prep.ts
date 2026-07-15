/**
 * Claude unattended-launch prep — pure fs, no DB, safe in the desktop bundle.
 *
 * A runner-launched claude must never hang on an interactive gate nobody is
 * watching: the trust-folder dialog on a fresh workspace, or a permission ask
 * for a tool outside the allowlist. The box has done this since box-prepare
 * shipped; the DESKTOP launch path never did, so on a machine without a
 * hand-tuned ~/.claude/settings.json (i.e. every new user — and, it turned
 * out, the founder's laptop: `Write(*)` only matches in-cwd paths, so the
 * final session-handoff write to ~/.claude/sessions/<tab>.md sat behind an
 * unanswered prompt for 26+ minutes, twice) agents stall at the finish line.
 *
 * Extracted from box-workspace.ts so both runners share ONE prep. Merge-only:
 * adds trust + allow rules, never removes or narrows anything the user set.
 */
import fs from "fs";
import os from "os";
import path from "path";

export const UNATTENDED_ALLOW = ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch", "MultiEdit", "TodoWrite"];

export function ensureClaudeReady(dir: string): void {
  const home = os.homedir();
  const cfgPath = path.join(home, ".claude.json");
  let cfg: { projects?: Record<string, Record<string, unknown>> } = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")); } catch { /* fresh config */ }
  cfg.projects ??= {};
  const existing = cfg.projects[dir] ?? {};
  cfg.projects[dir] = {
    ...existing,
    hasTrustDialogAccepted: true,
    projectOnboardingSeenCount: Math.max(1, Number(existing.projectOnboardingSeenCount) || 0),
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  const setPath = path.join(home, ".claude", "settings.json");
  let settings: { permissions?: { allow?: string[] } } = {};
  try { settings = JSON.parse(fs.readFileSync(setPath, "utf-8")); } catch { /* fresh settings */ }
  settings.permissions ??= {};
  const allow = new Set(settings.permissions.allow ?? []);
  for (const t of UNATTENDED_ALLOW) allow.add(t);
  settings.permissions.allow = [...allow];
  fs.mkdirSync(path.dirname(setPath), { recursive: true });
  fs.writeFileSync(setPath, JSON.stringify(settings, null, 2));
}
