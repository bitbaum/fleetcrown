"use client";

import type { Tab } from "./project-detail-types";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "prompts",  label: "Prompts" },
  { id: "goals",    label: "Goals" },
];

export function ProjectDetailTabBar({
  tab,
  setTab,
  jobCount,
  goalCount,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  jobCount: number;
  goalCount: number;
}) {
  return (
    <div className="flex border-t border-border-subtle">
      {TABS.map(({ id, label }) => {
        const badge = id === "prompts" ? jobCount : id === "goals" ? goalCount : undefined;
        const isActive = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              isActive
                ? "border-status-positive text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-secondary hover:border-border-strong"
            }`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? "bg-status-positive-subtle text-status-positive" : "bg-surface-overlay text-text-muted"
              }`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
