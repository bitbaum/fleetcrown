// Hosted runner — Phase 1 (spike): dispatch a real coding task to Hermes.
//
// Where Phase 0 (analyze.ts) does read-only analysis via Groq, this runs an
// actual agent that can WRITE code — by orchestrating Hermes headless rather
// than building our own sandboxed agent. The strategic bet (Thoughts: "The
// Captain Needs a Ship"): we don't out-build Nous's runtime; we point it at a
// project the same way we point claude/grok. Hermes brings its own sandboxed
// backends (Docker/SSH/Daytona/Modal), so isolation is theirs, not ours to
// hand-roll.
//
// Invocation (from the docs):
//   HERMES_INFERENCE_MODEL=<model> hermes -z "<task>"   # prompt in, final answer out
//   --ignore-user-config loads credentials from .env only (no Nous Portal OAuth
//   for a headless run). Run inside the cloned repo dir; Hermes infers CWD.
//
// SPIKE STATUS: the invocation + guard are real and tsc-clean; going live needs
// the `hermes` CLI installed on the runner + a model credential. Without it this
// returns a clear needs-install result (never a crash), proving the integration
// shape end to end.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { commandExistsInPath } from "@/lib/agents/helpers";

const run = promisify(execFile);

export type HermesRunResult =
  | { ok: true; output: string; diff: string; model: string }
  | { ok: false; error: string; needsInstall?: boolean };

/**
 * Clone the repo, run Hermes against `task` headless, and return its final
 * output + the git diff it produced. Does NOT push — the caller decides whether
 * to commit/PR (Phase 1 keeps writes behind a human gate). Always cleans up.
 */
export async function runHermesTask(input: {
  gitUrl: string;
  task: string;
  projectContext?: string | null;
  token?: string | null;
  model?: string;
}): Promise<HermesRunResult> {
  const { gitUrl, task, projectContext, token, model } = input;

  // Orchestrate, don't assume: if the runtime isn't present, say so clearly
  // (the hosted runner surfaces this as "install Hermes on the runner").
  if (!commandExistsInPath("hermes")) {
    return { ok: false, needsInstall: true, error: "The `hermes` CLI is not installed on this runner. Install it (curl … nousresearch.com/install.sh) + provide a model credential, then re-dispatch." };
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "fc-hermes-"));
    const cloneUrl = token && gitUrl.startsWith("https://")
      ? gitUrl.replace("https://", `https://x-access-token:${token}@`)
      : gitUrl;
    await run("git", ["clone", "--depth", "1", "--no-tags", cloneUrl, dir], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

    const prompt = projectContext ? `${projectContext}\n\nTask:\n${task}` : task;
    const resolvedModel = model && model !== "auto" ? model : (process.env.HERMES_INFERENCE_MODEL ?? "auto");

    // Headless: prompt in, final answer to stdout. --ignore-user-config keeps
    // it deterministic + credentials-from-env. Generous timeout — real work.
    const { stdout } = await run(
      "hermes",
      ["-z", "--ignore-user-config", prompt],
      {
        cwd: dir,
        timeout: 15 * 60_000,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, ...(resolvedModel !== "auto" ? { HERMES_INFERENCE_MODEL: resolvedModel } : {}) },
      },
    );

    // What did it change? (read-only inspection of the agent's own work.)
    const { stdout: diff } = await run("git", ["-C", dir, "diff", "--stat"], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }).catch(() => ({ stdout: "" }));

    return { ok: true, output: stdout.trim(), diff: diff.trim(), model: resolvedModel };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "hermes run failed" };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
