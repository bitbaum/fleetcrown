"use client";

import { Cpu, HardDrive, Clock, Radio } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { useFetch } from "@/hooks/use-fetch";

type MemInfo = { totalMiB: number; usedMiB: number; availMiB: number };
type SwapInfo = { totalMiB: number; usedMiB: number };
type DiskInfo = { size: string; used: string; avail: string; pct: string };

type SystemData = {
  mem: MemInfo | null;
  swap: SwapInfo | null;
  disk: DiskInfo | null;
  uptime: string | null;
  gatewayStatus: "ok" | "down";
};

function mibToGib(mib: number) {
  return (mib / 1024).toFixed(1);
}

function UsageBar({ usedMiB, totalMiB }: { usedMiB: number; totalMiB: number }) {
  const pct = totalMiB > 0 ? Math.round((usedMiB / totalMiB) * 100) : 0;
  const color = pct > 85 ? "bg-red-400" : pct > 65 ? "bg-yellow-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/40 w-8 text-right">{pct}%</span>
    </div>
  );
}

export function SystemStats() {
  const { data, loading } = useFetch<SystemData>("/api/system");

  if (loading) {
    return <div className="text-white/30 animate-pulse text-sm">Loading system status...</div>;
  }
  if (!data) {
    return <div className="text-white/30 text-sm">Could not fetch system data</div>;
  }

  const { mem, swap, disk, uptime, gatewayStatus } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader icon={Radio} title="OpenClaw Gateway" />
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${gatewayStatus === "ok" ? "bg-green-400" : "bg-red-400"}`} />
          <span className="text-sm">{gatewayStatus === "ok" ? "Connected" : "Offline"}</span>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Clock} title="Uptime" />
        <p className="text-sm text-white/70">{uptime ?? "n/a"}</p>
      </Card>

      <Card>
        <CardHeader icon={Cpu} title="Memory" />
        {mem ? (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-white/40 mb-1.5">
                <span>RAM</span>
                <span>{mibToGib(mem.usedMiB)} / {mibToGib(mem.totalMiB)} GiB</span>
              </div>
              <UsageBar usedMiB={mem.usedMiB} totalMiB={mem.totalMiB} />
            </div>
            {swap && swap.totalMiB > 0 && (
              <div>
                <div className="flex justify-between text-xs text-white/40 mb-1.5">
                  <span>Swap</span>
                  <span>{mibToGib(swap.usedMiB)} / {mibToGib(swap.totalMiB)} GiB</span>
                </div>
                <UsageBar usedMiB={swap.usedMiB} totalMiB={swap.totalMiB} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/30">n/a</p>
        )}
      </Card>

      <Card>
        <CardHeader icon={HardDrive} title="Disk" />
        {disk ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-white/40 mb-1.5">
              <span>/</span>
              <span>{disk.used} / {disk.size} ({disk.avail} free)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    parseInt(disk.pct) > 85 ? "bg-red-400" : parseInt(disk.pct) > 65 ? "bg-yellow-400" : "bg-emerald-400"
                  }`}
                  style={{ width: disk.pct }}
                />
              </div>
              <span className="text-xs text-white/40 w-8 text-right">{disk.pct}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/30">n/a</p>
        )}
      </Card>
    </div>
  );
}
