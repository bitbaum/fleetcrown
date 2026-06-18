"use client";

import { Check } from "lucide-react";
import type { LokiProject } from "./types";

export function ProjectFilter({
  projects,
  selected,
  loading,
  onToggle,
}: {
  projects: LokiProject[];
  selected: string[];
  loading: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <h2 className="ui-kicker">Projects</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="ui-loki-convo-meta">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="ui-loki-convo-meta">No projects yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {projects.map((p) => {
              const isOn = selected.includes(p.name);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggle(p.name)}
                  className={`ui-loki-project ${isOn ? "ui-loki-project-active" : ""}`}
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {isOn && <Check className="h-4 w-4" />}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
