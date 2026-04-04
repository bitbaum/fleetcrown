import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";

export async function GET() {
  const result = await runTool(
    'gog calendar list --json --days 2 2>/dev/null || echo "[]"',
    20000,
  );

  if (!result.ok) {
    return NextResponse.json({ events: [], error: result.error }, { status: 200 });
  }

  try {
    const events = JSON.parse(result.data ?? "[]");
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [], raw: result.data });
  }
}
