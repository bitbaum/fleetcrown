import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { TOOLS_DIR } from "@/lib/constants";

export async function GET() {
  const result = await runTool(`bash ${TOOLS_DIR}/github-status.sh 2>/dev/null`, 30000);

  if (!result.ok) {
    return NextResponse.json({ repos: [], error: result.error });
  }

  try {
    const repos = JSON.parse(result.data ?? "[]");
    return NextResponse.json({ repos: Array.isArray(repos) ? repos : [] });
  } catch {
    return NextResponse.json({ repos: [], raw: result.data });
  }
}
