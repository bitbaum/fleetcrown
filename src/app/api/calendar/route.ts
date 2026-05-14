import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { isRuntimeAvailable } from "@/lib/runtime";

export async function GET() {
  if (!isRuntimeAvailable()) return NextResponse.json({ events: [] });

  const result = await runTool(
    'gog calendar list --json --days 2 2>/dev/null || echo "[]"',
    20000,
  );

  if (!result.ok) {
    return NextResponse.json({ events: [], error: result.error }, { status: 200 });
  }

  try {
    const parsed = JSON.parse(result.data ?? "[]");
    // gog returns {"events": [...]} or just [...] depending on version
    const events = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.events)
        ? parsed.events
        : [];
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [], raw: result.data });
  }
}
