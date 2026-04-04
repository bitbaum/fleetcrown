"use client";

import { useEffect, useState } from "react";
import { Server, Cpu, HardDrive, Clock, Radio } from "lucide-react";

type SystemData = {
  memory: string | null;
  disk: string | null;
  uptime: string | null;
  gatewayStatus: "ok" | "down";
};

export default function SystemPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/system")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System</h1>
        <p className="text-sm text-white/40 mt-1">Infrastructure health and Ivy status</p>
      </div>

      {loading ? (
        <div className="text-white/30 animate-pulse">Loading system status...</div>
      ) : !data ? (
        <div className="text-white/30">Could not fetch system data</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card icon={Radio} title="OpenClaw Gateway">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${data.gatewayStatus === "ok" ? "bg-green-400" : "bg-red-400"}`}
              />
              <span className="text-sm">
                {data.gatewayStatus === "ok" ? "Connected" : "Offline"}
              </span>
            </div>
          </Card>

          <Card icon={Clock} title="Uptime">
            <pre className="text-sm font-mono text-white/70">{data.uptime ?? "n/a"}</pre>
          </Card>

          <Card icon={Cpu} title="Memory">
            <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap">
              {data.memory ?? "n/a"}
            </pre>
          </Card>

          <Card icon={HardDrive} title="Disk">
            <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap">
              {data.disk ?? "n/a"}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Server;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-white/50" />
        <h3 className="text-sm font-medium text-white/70">{title}</h3>
      </div>
      {children}
    </div>
  );
}
