import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { auth } from "@/auth";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";

const execAsync = promisify(exec);

const SyncBody = z.object({
  dir: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRuntimeAvailable()) {
    return NextResponse.json({ error: "Git sync requires local runtime" }, { status: 503 });
  }

  const dataOrResp = await readJsonBody(req, SyncBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { dir } = dataOrResp;

  // Basic path safety — no shell metacharacters
  if (/[;&|`$<>\\]/.test(dir)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(`git -C '${dir.replace(/'/g, "'\\''")}' pull --ff-only`, {
      timeout: 30000,
    });
    return NextResponse.json({ ok: true, output: (stdout + stderr).trim().slice(0, 500) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
