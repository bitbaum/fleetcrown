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
            className={`ui-tab ${isActive ? "ui-tab-active" : ""}`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className={isActive ? "ui-tab-badge ui-tab-badge-active" : "ui-tab-badge"}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
