"use client";

import { useState, useMemo } from "react";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";
import { APP_LOCALE } from "@/lib/constants";
import type { HistoryItem } from "@/db/queries/prompt-history";

function formatDate(d: Date): string {
  return d.toLocaleDateString(APP_LOCALE, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit" });
}

function groupByDay(items: HistoryItem[]): Map<string, HistoryItem[]> {
  const groups = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = item.dispatchedAt.toLocaleDateString(APP_LOCALE, { year: "numeric", month: "2-digit", day: "2-digit" });
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }
  return groups;
}

export function HistoryFeed({ items }: { items: HistoryItem[] }) {
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  const projects = useMemo(() => {
    const names = [...new Set(items.map((i) => i.projectKey))].sort();
    return names;
  }, [items]);

  const filtered = projectFilter
    ? items.filter((i) => i.projectKey === projectFilter)
    : items;

  const byDay = groupByDay(filtered);

  return (
    <div className="space-y-4">
      {/* Project filter chips */}
      {projects.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {projects.map((name) => (
            <button
              key={name}
              onClick={() => setProjectFilter(projectFilter === name ? null : name)}
              className={projectFilter === name ? "ui-chip-filter-active" : "ui-chip-filter"}
            >
              {name}
            </button>
          ))}
          {projectFilter && (
            <button onClick={() => setProjectFilter(null)} className="ui-chip-filter">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Day groups */}
      <div className="space-y-6">
        {[...byDay.entries()].map(([, dayItems]) => {
          const firstItem = dayItems[0];
          return (
            <div key={firstItem.id}>
              <p className="ui-kicker text-text-muted mb-2 ml-1">
                {formatDate(firstItem.dispatchedAt)}
              </p>
              <div className="space-y-px">
                {dayItems.map((item) => {
                  const label = item.intent === "custom"
                    ? null
                    : getIntentLabel(item.intent);
                  const adapterLabel = getAdapterLabel(item.adapter);

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-raised transition-colors"
                    >
                      <span className="shrink-0 w-14 text-xs text-text-muted font-mono pt-0.5">
                        {formatTime(item.dispatchedAt)}
                      </span>

                      {!projectFilter && (
                        <span className="shrink-0 w-28 text-sm font-medium text-text-primary truncate pt-0.5">
                          {item.projectKey}
                        </span>
                      )}

                      <div className="flex-1 min-w-0">
                        {item.customPrompt ? (
                          <p className="text-sm text-text-secondary leading-snug">
                            {item.customPrompt}
                          </p>
                        ) : (
                          <p className="text-sm text-text-tertiary italic">
                            {label ?? item.intent.replace(/_/g, " ")}
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                        {adapterLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {items.length >= 200 && (
        <p className="text-xs text-text-muted text-center">Showing last 200 dispatches</p>
      )}
    </div>
  );
}
