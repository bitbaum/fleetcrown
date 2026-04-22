"use client";

import { Server, Cpu, HardDrive, Clock, Radio } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { useFetch } from "@/hooks/use-fetch";

type SystemData = {
  memory: string | null;
  disk: string | null;
  uptime: string | null;
  gatewayStatus: "ok" | "down";
};

export function SystemStats() {
  const { data, loading } = useFetch<SystemData>("/api/system");

  if (loading) {
    return <div className="text-white/30 animate-pulse text-sm">Loading system status...</div>;
  }
  if (!data) {
    return <div className="text-white/30 text-sm">Could not fetch system data</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader icon={Radio} title="OpenClaw Gateway" />
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${data.gatewayStatus === "ok" ? "bg-green-400" : "bg-red-400"}`}
          />
          <span className="text-sm">
            {data.gatewayStatus === "ok" ? "Connected" : "Offline"}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Clock} title="Uptime" />
        <pre className="text-sm font-mono text-white/70">{data.uptime ?? "n/a"}</pre>
      </Card>

      <Card>
        <CardHeader icon={Cpu} title="Memory" />
        <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap">
          {data.memory ?? "n/a"}
        </pre>
      </Card>

      <Card>
        <CardHeader icon={HardDrive} title="Disk" />
        <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap">
          {data.disk ?? "n/a"}
        </pre>
      </Card>
    </div>
  );
}
