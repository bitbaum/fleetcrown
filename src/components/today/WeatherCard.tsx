"use client";

import { Sun } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { useFetch } from "@/hooks/use-fetch";

export function WeatherCard() {
  const { data, loading } = useFetch<{ weather: string | null }>("/api/weather");

  return (
    <Card>
      <CardHeader icon={Sun} title="Weather — Zurich" />
      {loading ? (
        <div className="text-sm text-white/30 animate-pulse">Loading...</div>
      ) : data?.weather ? (
        <pre className="text-xs text-white/60 whitespace-pre-wrap font-mono leading-relaxed">
          {data.weather.split("\n").slice(0, 8).join("\n")}
        </pre>
      ) : (
        <div className="text-sm text-white/30">Weather unavailable</div>
      )}
    </Card>
  );
}
