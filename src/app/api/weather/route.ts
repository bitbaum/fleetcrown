import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { TOOLS_DIR } from "@/lib/constants";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getApiUserId } from "@/lib/session";
import { getUserPreferences, getActiveCity } from "@/db/queries/user-preferences";

export async function GET() {
  if (!isRuntimeAvailable()) return NextResponse.json({ weather: null });

  const userId = await getApiUserId();
  const prefs = userId ? await getUserPreferences(userId).catch(() => null) : null;
  const city = getActiveCity(prefs);

  const result = await runTool(`bash ${TOOLS_DIR}/weather.sh ${JSON.stringify(city)} 2>/dev/null`, 10000);

  if (!result.ok) {
    console.error("[weather/GET] runTool failed:", result.error);
    return NextResponse.json({ weather: null, error: result.error }, { status: 503 });
  }

  return NextResponse.json({ weather: result.data, city });
}
