// Hosted runner — Phase 0: read-only repo analysis (no code execution).
//
// The safe core of the hosted ephemeral runner (docs/architecture/
// hosted-ephemeral-runner.md). Given a repo + a task, it shallow-clones the
// repo read-only, snapshots its structure + key manifests, and asks Groq to
// produce an analysis / plan / review. Nothing is written back to the repo and
// no shell from the repo is ever run — so this can execute on shared compute
// with no write/exec risk, while still letting a project be worked on without
// the operator's laptop. Phases 1+ add a sandboxed coding agent for writes.

import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { callGroqText, GROQ_FAST_MODEL } from "@/lib/groq";
import { HTTP_TIMEOUT_LONG_MS } from "@/lib/constants/time";

const run = promisify(execFile);

export type AnalyzeResult =
  { ok: true; report: string; model: string } | { ok: false; error: string };

const MANIFESTS = [
  "README.md",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "wrangler.toml",
];
const MAX_FILE_CHARS = 4_000;
const MAX_TREE_ENTRIES = 200;

// A shallow, read-only file listing — names + nesting, capped so the prompt
// stays cheap. Skips the usual heavy/noise dirs.
async function snapshotTree(dir: string): Promise<string> {
  const SKIP = new Set([
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    ".venv",
    "venv",
    "target",
    "__pycache__",
  ]);
  const lines: string[] = [];
  async function walk(d: string, prefix: string, depth: number) {
    if (depth > 3 || lines.length >= MAX_TREE_ENTRIES) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (lines.length >= MAX_TREE_ENTRIES) break;
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (SKIP.has(e.name)) continue;
      lines.push(`${prefix}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory()) await walk(join(d, e.name), `${prefix}  `, depth + 1);
    }
  }
  await walk(dir, "", 0);
  return lines.join("\n");
}

async function readManifests(dir: string): Promise<string> {
  const out: string[] = [];
  for (const name of MANIFESTS) {
    try {
      const body = await readFile(join(dir, name), "utf-8");
      out.push(`--- ${name} ---\n${body.slice(0, MAX_FILE_CHARS)}`);
    } catch {
      /* not present */
    }
  }
  return out.join("\n\n");
}

const SYSTEM = `You are a senior engineer doing a focused, read-only analysis of a codebase to answer a specific request. You have the file tree and the key manifests, not the full source. Be concrete and honest: cite files/paths you can see, say plainly when something can't be determined from this snapshot, and never invent code that isn't evidenced. Output is a tight markdown report — findings and a recommended plan, no preamble.`;

/**
 * Clone the repo shallow + read-only, snapshot it, and run the analysis.
 * `gitUrl` is an https repo URL; `token` (optional) is injected for private repos.
 * Always cleans up the temp checkout. Never writes to the repo.
 */
export async function analyzeRepo(input: {
  gitUrl: string;
  task: string;
  projectContext?: string | null;
  token?: string | null;
}): Promise<AnalyzeResult> {
  const { gitUrl, task, projectContext, token } = input;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "fc-hosted-"));
    // Inject the token for private repos without ever logging it.
    const cloneUrl =
      token && gitUrl.startsWith("https://")
        ? gitUrl.replace("https://", `https://x-access-token:${token}@`)
        : gitUrl;
    await run("git", ["clone", "--depth", "1", "--no-tags", cloneUrl, dir], {
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });

    const [tree, manifests] = await Promise.all([snapshotTree(dir), readManifests(dir)]);
    const user = [
      `Request:\n${task}`,
      projectContext ? `\nProject context:\n${projectContext}` : "",
      `\nRepository file tree (capped):\n${tree || "(empty)"}`,
      manifests ? `\nKey manifests:\n${manifests}` : "",
    ].join("\n");

    const report = await callGroqText(user, {
      systemPrompt: SYSTEM,
      maxTokens: 1200,
      temperature: 0.3,
      timeoutMs: HTTP_TIMEOUT_LONG_MS,
    });
    return { ok: true, report, model: GROQ_FAST_MODEL };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "analysis failed" };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
