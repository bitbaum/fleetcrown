import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { TOOLS_DIR } from "@/lib/constants";

export async function GET() {
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
