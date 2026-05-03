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
  const color = pct > 85 ? "bg-status-negative" : pct > 65 ? "bg-status-warning" : "bg-status-positive";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-overlay">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-sm text-text-tertiary">{pct}%</span>
    </div>
  );
}

export function SystemStats() {
  const { data, loading } = useFetch<SystemData>("/api/system");

  if (loading) {
    return <div className="animate-pulse text-base text-text-secondary">Loading system status...</div>;
  }
  if (!data) {
    return <div className="text-base text-text-secondary">Could not fetch system data</div>;
  }

  const { mem, swap, disk, uptime, gatewayStatus } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader icon={Radio} title="OpenClaw Gateway" />
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${gatewayStatus === "ok" ? "bg-status-positive" : "bg-status-negative"}`} />
          <span className="text-base text-text-primary">{gatewayStatus === "ok" ? "Connected" : "Offline"}</span>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Clock} title="Uptime" />
        <p className="text-base text-text-secondary">{uptime ?? "n/a"}</p>
      </Card>

      <Card>
        <CardHeader icon={Cpu} title="Memory" />
        {mem ? (
          <div className="space-y-3">
            <div>
              <div className="mb-2 flex justify-between text-sm text-text-tertiary">
                <span>RAM</span>
                <span>{mibToGib(mem.usedMiB)} / {mibToGib(mem.totalMiB)} GiB</span>
              </div>
              <UsageBar usedMiB={mem.usedMiB} totalMiB={mem.totalMiB} />
            </div>
            {swap && swap.totalMiB > 0 && (
              <div>
                <div className="mb-2 flex justify-between text-sm text-text-tertiary">
                  <span>Swap</span>
                  <span>{mibToGib(swap.usedMiB)} / {mibToGib(swap.totalMiB)} GiB</span>
                </div>
                <UsageBar usedMiB={swap.usedMiB} totalMiB={swap.totalMiB} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-base text-text-secondary">n/a</p>
        )}
      </Card>

      <Card>
        <CardHeader icon={HardDrive} title="Disk" />
        {disk ? (
          <div className="space-y-2">
            <div className="mb-2 flex justify-between text-sm text-text-tertiary">
              <span>/</span>
              <span>{disk.used} / {disk.size} ({disk.avail} free)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-overlay">
                <div
                  className={`h-full rounded-full ${
                    parseInt(disk.pct) > 85 ? "bg-status-negative" : parseInt(disk.pct) > 65 ? "bg-status-warning" : "bg-status-positive"
                  }`}
                  style={{ width: disk.pct }}
                />
              </div>
              <span className="w-10 text-right text-sm text-text-tertiary">{disk.pct}</span>
            </div>
          </div>
        ) : (
          <p className="text-base text-text-secondary">n/a</p>
        )}
      </Card>
    </div>
  );
}
