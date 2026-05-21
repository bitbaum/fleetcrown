import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { TOOLS_DIR } from "@/lib/constants";
import { isRuntimeAvailable } from "@/lib/runtime";

export async function GET() {
  // Cloud mode: github-status.sh runs locally via `gh` CLI — no stream
  // available in cloud. Surface runtimeOnly so the UI can show a meaningful
  // empty state rather than "No repo data" which misleads users into thinking
  // they have no repos connected.
  if (!isRuntimeAvailable()) return NextResponse.json({ repos: [], runtimeOnly: true });

  const result = await runTool(`bash ${TOOLS_DIR}/github-status.sh --json`, 30000);

  if (!result.ok) {
    return NextResponse.json({ repos: [], error: result.error });
  }

  try {
    const lines = (result.data ?? "").split("\n").filter(Boolean);
    const repos = lines.map((line) => JSON.parse(line));
    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json({ repos: [], raw: result.data });
  }
}
