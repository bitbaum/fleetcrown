/**
 * Inline tests for coldStartWorkspaceDir — the `dir` a queued dispatch carries
 * for a project that has a repo but no checkout.
 * Run: npx tsx scripts/test/cold-start-workspace-dir.ts
 *
 * The contract: it must agree with the runner's own derivation
 * (resolveRunnerWorkspaceDir / ensureBoxWorkspace), or the transcript path and
 * the run path disagree during the first minute of a cold start.
 */
import path from "path";
import { coldStartWorkspaceDir } from "@/lib/execution-access";
import { BOX_DEV_ROOT, resolveRunnerWorkspaceDir } from "@/lib/agent-execution/box-workspace-path";

const CLONEABLE = "https://github.com/bitbaum/heidi";

const dir = coldStartWorkspaceDir("Heidi", CLONEABLE);
if (dir !== path.join(BOX_DEV_ROOT, "heidi")) throw new Error(`unexpected dir: ${dir}`);
if (dir !== resolveRunnerWorkspaceDir("Heidi", "")) {
  throw new Error("must equal what the runner derives for the same tab with no requested dir");
}
if (
  coldStartWorkspaceDir("Zürich Dialekt/App", CLONEABLE) !==
  path.join(BOX_DEV_ROOT, "z-rich-dialekt-app")
) {
  throw new Error("must sanitize the project name the way the runner does");
}
if (coldStartWorkspaceDir("Heidi", null) !== null)
  throw new Error("no repo → nothing to materialize");
if (coldStartWorkspaceDir("Heidi", "not-a-url") !== null) throw new Error("uncloneable → null");
if (coldStartWorkspaceDir("Heidi", "") !== null) throw new Error("empty → null");

console.log("cold-start-workspace-dir: ok");
