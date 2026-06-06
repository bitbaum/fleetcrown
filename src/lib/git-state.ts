/**
 * Bulk git-state probe — SSOT.
 *
 * /control needs to show, for every registered project, the branch + last
 * commit + dirty-count + commits-behind-remote + recent-commit list. Doing
 * one `git -C <dir> log` etc. per project per request would fork the process
 * 50+ times on a /control reload — slow on a healthy machine, brutal on a
 * cold cache.
 *
 * This function pushes the whole probe into a SINGLE bash invocation that
 * forks one background per dir and waits on them in parallel inside the
 * same shell. Vercel/Next.js sees one child process; total wall-clock is
 * dominated by the slowest `git log` not the sum of them.
 *
 * Lives in lib/ so non-route consumers (cron heatmap, /projects page
 * snapshots) can call it without dragging in the rest of the /api/control
 * GET handler.
 *
 * Failure mode: if the bash script bombs (no bash on PATH, permissions,
 * a quote-escape edge case), returns an empty Map. The /control UI
 * tolerates absent git state — the badges just disappear — so we'd rather
 * render the page than fail it.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { shellEscape } from "@/lib/zellij";
import type { GitState } from "@/lib/control-types";

const execAsync = promisify(exec);

/**
 * Probe git state for every directory in `dirs`. Returns a Map keyed by
 * the absolute dir path; missing entries mean the dir isn't a git repo or
 * the probe failed.
 *
 * Fields (tab-separated in the bash output):
 *   dir | branch | lastWhen|lastMsg | dirtyCount | todayCount | behindRemote | recentCommits
 *
 * `behindRemote` uses stored FETCH_HEAD — no network call, no auth needed.
 * `recentCommits` joins the last 5 commits with `~`; we escape any literal
 * `~` in commit messages to `-` first so the split is unambiguous.
 */
export async function fetchAllGitStates(dirs: string[]): Promise<Map<string, GitState>> {
  if (dirs.length === 0) return new Map();

  const dirArgs = dirs.map(shellEscape).join(" ");
  const script = `
_git_row() {
  local d="$1"
  [ -d "$d/.git" ] || return
  local b l di t beh h
  b=$(git -C "$d" branch --show-current 2>/dev/null)
  l=$(git -C "$d" log -1 '--format=%ar|%s' 2>/dev/null)
  di=$(git -C "$d" status --porcelain 2>/dev/null | wc -l)
  t=$(git -C "$d" log --since=midnight --format=%H 2>/dev/null | wc -l)
  beh=$(git -C "$d" rev-list HEAD..@{u} --count 2>/dev/null || echo 0)
  h=$(git -C "$d" log -5 '--format=%h %ar: %s' 2>/dev/null | tr '~' '-' | paste -sd '~' -)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$l" "$di" "$t" "$beh" "$h"
}
for _d in ${dirArgs}; do _git_row "$_d" & done
wait
`;

  const result = new Map<string, GitState>();
  try {
    const { stdout } = await execAsync(`bash -c '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [dir, branch, logStr, dirtyStr, todayStr, behindStr, historyStr] = line.split("\t");
      if (!dir || !branch) continue;
      const [when = "", msg = ""] = (logStr ?? "").split("|");
      const recentCommits = (historyStr ?? "").split("~").map((s) => s.trim()).filter(Boolean);
      result.set(dir, {
        branch: branch.trim(),
        lastMsg: msg.slice(0, 80),
        lastWhen: when.trim(),
        dirty: parseInt(dirtyStr ?? "0", 10) > 0,
        dirtyCount: parseInt(dirtyStr ?? "0", 10),
        todayCount: parseInt(todayStr ?? "0", 10),
        behindRemote: parseInt(behindStr ?? "0", 10),
        recentCommits,
      });
    }
  } catch {
    // git queries failed — projects show null git state
  }
  return result;
}
