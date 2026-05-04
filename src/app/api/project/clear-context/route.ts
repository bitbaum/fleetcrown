import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stateFile, readProjectsMap } from "@/lib/claude-config";
import { injectIntoTab } from "@/lib/zellij";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { tab } = body;

  if (!tab || typeof tab !== "string" || tab.length > 80) {
    return NextResponse.json({ error: "tab is required" }, { status: 400 });
  }

  const projects = readProjectsMap();
  const canonical = projects.get(tab.toLowerCase());
  if (!canonical) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  try {
    injectIntoTab(canonical, "/clear");
    // /clear is not a prompt — clear the running-prompt state so UI shows idle
    try { fs.unlinkSync(stateFile.prompt(canonical)); } catch { /* already gone */ }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Clear failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
