"use client";

import { useEffect, useState } from "react";
import { Sun } from "lucide-react";

export function WeatherCard() {
  const [weather, setWeather] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((res) => res.json())
      .then((data) => setWeather(data.weather ?? null))
      .catch(() => setWeather(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sun className="h-4 w-4 text-white/50" />
        <h3 className="text-sm font-medium text-white/70">Weather — Zurich</h3>
      </div>
      {loading ? (
        <div className="text-sm text-white/30 animate-pulse">Loading...</div>
      ) : weather ? (
        <pre className="text-xs text-white/60 whitespace-pre-wrap font-mono leading-relaxed">
          {weather.split("\n").slice(0, 8).join("\n")}
        </pre>
      ) : (
        <div className="text-sm text-white/30">Weather unavailable</div>
      )}
    </div>
  );
}
