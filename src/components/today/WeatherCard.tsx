"use client";

import { Sun, CloudRain, Cloud, CloudSnow, CloudFog } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { useFetch } from "@/hooks/use-fetch";

function parseWeather(raw: string) {
  // Format: "Now: Mainly clear, 22.3°C, wind 6.1 km/h, humidity 31%\n2026-04-07: 6.8-22.3°C, Foggy"
  const lines = raw.split("\n").filter(Boolean);
  const now = lines[0] ?? "";
  const forecast = lines[1] ?? "";

  const tempMatch = now.match(/([\d.]+)°C/);
  const condMatch = now.match(/Now:\s*([^,]+)/);
  const windMatch = now.match(/wind\s+([\d.]+)\s*km/);
  const humMatch = now.match(/humidity\s+(\d+)/);
  const rangeMatch = forecast.match(/([\d.]+-[\d.]+)°C/);
  const foreCondMatch = forecast.match(/°C,\s*(.+)/);

  return {
    temp: tempMatch?.[1] ?? "--",
    condition: condMatch?.[1]?.trim() ?? "Unknown",
    wind: windMatch?.[1] ?? "--",
    humidity: humMatch?.[1] ?? "--",
    range: rangeMatch?.[1] ?? "",
    forecastCondition: foreCondMatch?.[1]?.trim() ?? "",
  };
}

function WeatherIcon({ condition, className }: { condition: string; className?: string }) {
  const c = condition.toLowerCase();
  if (c.includes("rain") || c.includes("drizzle")) return <CloudRain className={className} />;
  if (c.includes("snow")) return <CloudSnow className={className} />;
  if (c.includes("fog") || c.includes("mist")) return <CloudFog className={className} />;
  if (c.includes("cloud") || c.includes("overcast")) return <Cloud className={className} />;
  return <Sun className={className} />;
}

export function WeatherCard() {
  const { data, loading } = useFetch<{ weather: string | null }>("/api/weather");

  if (loading) {
    return (
      <Card>
        <CardHeader icon={Sun} title="Weather" />
        <div className="text-sm text-text-muted animate-pulse">Loading...</div>
      </Card>
    );
  }

  if (!data?.weather) {
    return (
      <Card>
        <CardHeader icon={Sun} title="Weather" />
        <div className="text-sm text-text-secondary">Unavailable</div>
      </Card>
    );
  }

  const w = parseWeather(data.weather);

  return (
    <Card>
      <CardHeader icon={Sun} title="Zurich" />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <WeatherIcon condition={w.condition} className="h-8 w-8 text-status-warning/80" />
          <div className="text-2xl font-semibold">{w.temp}°</div>
        </div>
        <div className="text-xs text-text-tertiary space-y-0.5">
          <div>{w.condition}</div>
          <div>Wind {w.wind} km/h · Humidity {w.humidity}%</div>
          {w.range && <div>Today {w.range}° · {w.forecastCondition}</div>}
        </div>
      </div>
    </Card>
  );
}
