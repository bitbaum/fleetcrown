"use client";

import { ShieldAlert, AlertTriangle, ArrowRight, Users, FolderKanban, CheckCircle2 } from "lucide-react";
import { StatRow } from "@/components/ui/stat-row";
import { StatCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProjectsPageFilter, ProjectsPageStats } from "@/lib/projects-page-stats";

export function ProjectsSummary({
  stats,
  activeFilter,
  onFilter,
}: {
  stats: ProjectsPageStats;
  activeFilter: ProjectsPageFilter;
  onFilter: (filter: ProjectsPageFilter) => void;
}) {
  const chips: {
    id: ProjectsPageFilter;
    label: string;
    count: number;
    icon: typeof FolderKanban;
    tone?: "warning" | "negative" | "positive";
  }[] = [
    { id: null, label: "All", count: stats.total, icon: FolderKanban },
    ...(stats.attention > 0
      ? [{ id: "attention" as const, label: "Need attention", count: stats.attention, icon: AlertTriangle, tone: "warning" as const }]
      : []),
    ...(stats.security > 0
      ? [{ id: "security" as const, label: "Security", count: stats.security, icon: ShieldAlert, tone: "negative" as const }]
      : []),
    ...(stats.withNextStep > 0
      ? [{ id: "next-step" as const, label: "Has next step", count: stats.withNextStep, icon: ArrowRight }]
      : []),
    ...(stats.team > 0
      ? [{ id: "team" as const, label: "Team", count: stats.team, icon: Users }]
      : []),
    ...(stats.healthy > 0 && stats.attention > 0
      ? [{ id: "healthy" as const, label: "Healthy", count: stats.healthy, icon: CheckCircle2, tone: "positive" as const }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <StatRow>
        <StatCard
          label="Your projects"
          value={String(stats.own)}
          sub={stats.team > 0 ? `${stats.team} shared from team` : "in your fleet"}
        />
        <StatCard
          label="Need attention"
          value={String(stats.attention)}
          sub={stats.attention > 0 ? "issues flagged in profile" : "all clear"}
        />
        <StatCard
          label="Next steps"
          value={String(stats.withNextStep)}
          sub="projects with a defined next action"
        />
      </StatRow>

      {chips.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const Icon = chip.icon;
            const active = activeFilter === chip.id;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => onFilter(active ? null : chip.id)}
                aria-pressed={active}
                className={cn(
                  "ui-projects-filter-chip",
                  active && "ui-projects-filter-chip-active",
                  chip.tone === "warning" && !active && "text-status-warning",
                  chip.tone === "negative" && !active && "text-status-negative",
                  chip.tone === "positive" && !active && "text-status-positive",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{chip.label}</span>
                <span className="ui-projects-filter-count">{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
