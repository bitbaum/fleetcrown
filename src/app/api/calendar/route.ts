import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { isRuntimeAvailable } from "@/lib/runtime";
import { CALENDAR_LOOKAHEAD_DAYS } from "@/lib/constants/today";

export async function GET() {
  // Cloud mode: the calendar source is `gog calendar list` (local Google CLI),
  // so there's no events stream in cloud. Surface `runtimeOnly: true` so the
  // UI can show a meaningful empty state instead of "No events today" which
  // misleads users into thinking their calendar is genuinely empty.
  if (!isRuntimeAvailable()) return NextResponse.json({ events: [], runtimeOnly: true });

  const result = await runTool(
    `gog calendar list --json --days ${CALENDAR_LOOKAHEAD_DAYS} 2>/dev/null || echo "[]"`,
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
  } catch (e) {
    console.error("[calendar/GET] JSON parse failed:", e);
    return NextResponse.json({ events: [], raw: result.data });
  }
}
