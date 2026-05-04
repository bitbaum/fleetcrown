import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { auth } from "@/auth";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dir: string = body?.dir ?? "";

  if (!dir || typeof dir !== "string" || dir.length > 500) {
    return NextResponse.json({ error: "dir is required" }, { status: 400 });
  }

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
