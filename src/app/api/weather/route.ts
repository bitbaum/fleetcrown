import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { TOOLS_DIR } from "@/lib/constants";

export async function GET() {
  const result = await runTool(`bash ${TOOLS_DIR}/weather.sh 2>/dev/null`, 10000);

  if (!result.ok) {
    return NextResponse.json({ weather: null, error: result.error }, { status: 200 });
  }

  return NextResponse.json({ weather: result.data });
}
