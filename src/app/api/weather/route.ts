import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { TOOLS_DIR } from "@/lib/constants";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getApiUserId } from "@/lib/session";
import { getUserPreferences, getActiveCity } from "@/db/queries/user-preferences";

type GeoResult = { latitude: number; longitude: number; timezone: string };

const geocodeCache = new Map<string, { geo: GeoResult; ts: number }>();
const GEO_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — city coords don't change

async function geocodeCity(city: string): Promise<GeoResult | null> {
  const cached = geocodeCache.get(city);
  if (cached && Date.now() - cached.ts < GEO_TTL_MS) return cached.geo;

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json() as { results?: GeoResult[] };
    const r = data.results?.[0];
    if (!r) return null;
    const geo = { latitude: r.latitude, longitude: r.longitude, timezone: r.timezone ?? "UTC" };
    geocodeCache.set(city, { geo, ts: Date.now() });
    return geo;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!isRuntimeAvailable()) return NextResponse.json({ weather: null });

  const userId = await getApiUserId();
  const prefs = userId ? await getUserPreferences(userId).catch(() => null) : null;
  const city = getActiveCity(prefs);

  const geo = await geocodeCity(city);
  const extraEnv: Record<string, string> = geo
    ? {
        COCKPIT_LAT: String(geo.latitude),
        COCKPIT_LON: String(geo.longitude),
        COCKPIT_TZ:  geo.timezone,
      }
    : {};

  const result = await runTool(`bash ${TOOLS_DIR}/weather.sh 2>/dev/null`, 10000, extraEnv);

  if (!result.ok) {
    console.error("[weather/GET] runTool failed:", result.error);
    return NextResponse.json({ weather: null, error: result.error }, { status: 503 });
  }

  return NextResponse.json({ weather: result.data, city });
}
