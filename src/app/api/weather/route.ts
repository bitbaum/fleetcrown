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

// WMO weather codes → human descriptions. Matches the strings weather.sh uses
// so WeatherCard's parseWeather + WeatherIcon-by-keyword detection light up
// the same icons (cloud / rain / snow / fog) regardless of source.
const WMO_DESCRIPTION: Record<number, string> = {
  0:  "Clear",                 1:  "Mainly clear",       2:  "Partly cloudy",       3:  "Overcast",
  45: "Foggy",                 48: "Foggy",
  51: "Light drizzle",         53: "Drizzle",             55: "Heavy drizzle",
  56: "Freezing drizzle",      57: "Heavy freezing drizzle",
  61: "Light rain",            63: "Rain",                65: "Heavy rain",
  66: "Freezing rain",         67: "Heavy freezing rain",
  71: "Light snow",            73: "Snow",                75: "Heavy snow",          77: "Snow grains",
  80: "Light showers",         81: "Showers",             82: "Heavy showers",
  85: "Snow showers",          86: "Heavy snow showers",
  95: "Thunderstorm",          96: "Thunderstorm + hail", 99: "Heavy thunderstorm",
};

function describeCode(code: number | undefined): string {
  return code !== undefined && WMO_DESCRIPTION[code] ? WMO_DESCRIPTION[code] : "Unknown";
}

/**
 * Vercel-safe weather fetch — direct HTTP to open-meteo so the WeatherCard
 * shows real data on the deployed site instead of "Unavailable". Returns the
 * same line-formatted string weather.sh produces locally so parseWeather()
 * in WeatherCard doesn't care which source rendered it.
 */
async function fetchOpenMeteoWeather(geo: GeoResult): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      latitude:     String(geo.latitude),
      longitude:    String(geo.longitude),
      timezone:     geo.timezone,
      current:      "temperature_2m,wind_speed_10m,relative_humidity_2m,weather_code",
      daily:        "temperature_2m_max,temperature_2m_min,weather_code",
      forecast_days: "2",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      current?: { temperature_2m?: number; wind_speed_10m?: number; relative_humidity_2m?: number; weather_code?: number };
      daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] };
    };
    const c = data.current;
    if (!c) return null;
    const nowLine = `Now: ${describeCode(c.weather_code)}, ${c.temperature_2m?.toFixed(1) ?? "?"}°C, wind ${c.wind_speed_10m?.toFixed(1) ?? "?"} km/h, humidity ${c.relative_humidity_2m ?? "?"}%`;
    const d = data.daily;
    if (!d?.time?.length) return nowLine;
    // index 1 = tomorrow when forecast_days=2 (today + tomorrow); fall back to 0.
    const i = d.time.length >= 2 ? 1 : 0;
    const date = d.time[i];
    const lo = d.temperature_2m_min?.[i];
    const hi = d.temperature_2m_max?.[i];
    const code = d.weather_code?.[i];
    const dayLine = `${date}: ${lo?.toFixed(1) ?? "?"}-${hi?.toFixed(1) ?? "?"}°C, ${describeCode(code)}`;
    return `${nowLine}\n${dayLine}`;
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = await getApiUserId();
  const prefs = userId ? await getUserPreferences(userId).catch(() => null) : null;
  const city = getActiveCity(prefs);

  const geo = await geocodeCity(city);

  // Vercel / any environment without local shell tools: fetch open-meteo
  // directly. Previously bailed to `{weather: null}` and the WeatherCard
  // showed "Unavailable" forever.
  if (!isRuntimeAvailable()) {
    if (!geo) {
      return NextResponse.json({ weather: null, error: `Could not geocode "${city}"` }, { status: 503 });
    }
    const weather = await fetchOpenMeteoWeather(geo);
    if (!weather) {
      return NextResponse.json({ weather: null, error: "open-meteo unreachable" }, { status: 503 });
    }
    return NextResponse.json({ weather, city });
  }

  // Local runtime — richer weather.sh output (handles fancier formatting / sunrise).
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
