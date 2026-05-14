import { execSync } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { shellEscape } from "@/lib/zellij";

const CommitBody = z.object({
  dir:     z.string().trim().min(1),
  message: z.string().trim().max(200).optional(),
  push:    z.boolean().optional(),
});

function gitExec(dir: string, args: string): string {
  return execSync(`git -C ${shellEscape(dir)} ${args}`, {
    encoding: "utf-8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export async function POST(req: NextRequest) {
  if (!isRuntimeAvailable()) {
    return NextResponse.json({ ok: false, reason: "runtime_offline" }, { status: 503 });
  }

  const dataOrResp = await readJsonBody(req, CommitBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { dir, message, push = true } = dataOrResp;

  try {
    // Stage everything.
    gitExec(dir, "add -A");

    // Check if there's anything to commit.
    const status = gitExec(dir, "status --porcelain");
    if (!status) {
      return NextResponse.json({ ok: false, error: "Nothing to commit — working tree is clean" }, { status: 422 });
    }

    const msg = message?.trim() || "wip: checkpoint";
    gitExec(dir, `commit -m ${shellEscape(msg)}`);

    const sha = gitExec(dir, "rev-parse --short HEAD");

    let pushed = false;
    let pushError: string | null = null;
    if (push) {
      try {
        gitExec(dir, "push");
        pushed = true;
      } catch (err) {
        pushError = err instanceof Error ? err.message : "Push failed";
      }
    }

    return NextResponse.json({ ok: true, sha, message: msg, pushed, pushError });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Surface the git error message without leaking full stack.
    const gitMsg = raw.match(/error: (.+)|fatal: (.+)/)?.[1] ?? raw.slice(0, 200);
    return NextResponse.json({ error: gitMsg }, { status: 500 });
  }
}
