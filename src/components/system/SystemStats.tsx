"use client";

import { Cpu, HardDrive, Clock, Radio } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { FetchErrorState } from "@/components/ui/fetch-error-state";
import { useFetch } from "@/hooks/use-fetch";
import { ProgressBar, getProgressTone } from "@/components/ui/progress-bar";
import { HEALTH_THRESHOLDS } from "@/config/ui";

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
  return (
    <div className="flex items-center gap-2">
      <ProgressBar
        value={pct}
        tone={getProgressTone(pct, {
          negativeAt: HEALTH_THRESHOLDS.criticalPct,
          warningAt: HEALTH_THRESHOLDS.warningPct,
          lowTone: "positive",
        })}
        className="h-2 flex-1"
      />
      <span className="w-10 text-right text-sm text-text-tertiary">{pct}%</span>
    </div>
  );
}

export function SystemStats() {
  const { data, loading, error, refetch } = useFetch<SystemData>("/api/system", { intervalMs: 30_000 });

  if (loading) {
    return <div className="animate-pulse text-base text-text-secondary">Loading system status...</div>;
  }
  if (error || !data) {
    return (
      <Card>
        <CardHeader icon={Cpu} title="System" />
        <FetchErrorState message="Couldn't load system stats" onRetry={refetch} />
      </Card>
    );
  }

  const { mem, swap, disk, uptime, gatewayStatus } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader icon={Radio} title="OpenClaw Gateway" />
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${gatewayStatus === "ok" ? "bg-status-positive" : "bg-status-negative"}`} />
          <span className="text-base text-text-primary">{gatewayStatus === "ok" ? "Reachable" : "Unavailable"}</span>
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
              <div className="ui-label-row">
                <span>RAM</span>
                <span>{mibToGib(mem.usedMiB)} / {mibToGib(mem.totalMiB)} GiB</span>
              </div>
              <UsageBar usedMiB={mem.usedMiB} totalMiB={mem.totalMiB} />
            </div>
            {swap && swap.totalMiB > 0 && (
              <div>
                <div className="ui-label-row">
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
            <div className="ui-label-row">
              <span>/</span>
              <span>{disk.used} / {disk.size} ({disk.avail} free)</span>
            </div>
            <div className="flex items-center gap-2">
              <ProgressBar
                value={parseInt(disk.pct, 10) || 0}
                tone={getProgressTone(parseInt(disk.pct, 10) || 0, {
                  negativeAt: HEALTH_THRESHOLDS.criticalPct,
                  warningAt: HEALTH_THRESHOLDS.warningPct,
                  lowTone: "positive",
                })}
                className="h-2 flex-1"
              />
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
