"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Loader2, Check, X, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HabitHeatmap } from "./HabitHeatmap";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { patchJson, deleteJson } from "@/lib/api/fetch";
import type { HabitWithHistory } from "@/db/queries/habits";
import { scheduledDays } from "@/db/queries/habits";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";

export function HabitCard({ habit }: { habit: HabitWithHistory }) {
  const router = useRouter();
  const [active, setActive] = useState(habit.active);
  const [frequency, setFrequency] = useState<HabitFrequency>(habit.frequency);
  const [togglingActive, setTogglingActive] = useState(false);
  const [savingFreq, setSavingFreq] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleEdit = useInlineEdit<string>(habit.title);
  const [displayTitle, setDisplayTitle] = useState(habit.title);

  const completedDatesArr = [...habit.completedDates];
  const scheduled = scheduledDays(frequency, HABIT_HISTORY_DAYS);
  const pct = Math.round((habit.completionsInWindow / scheduled) * 100);

  const commitTitle = () => {
    const trimmed = titleEdit.draft.trim();
    if (!trimmed || trimmed === displayTitle) { titleEdit.cancel(); return; }
    titleEdit.commit(async () => {
      await patchJson(`/api/habits/${habit.id}`, { title: trimmed });
      setDisplayTitle(trimmed);
    });
  };

  const handleFrequencyChange = async (next: HabitFrequency) => {
    if (next === frequency || savingFreq) return;
    setSavingFreq(true);
    setFrequency(next);
    try {
      await patchJson(`/api/habits/${habit.id}`, { frequency: next });
    } finally {
      setSavingFreq(false);
    }
  };

  const handleToggleActive = async () => {
    if (togglingActive) return;
    setTogglingActive(true);
    const next = !active;
    setActive(next);
    try {
      await patchJson(`/api/habits/${habit.id}`, { active: next });
    } catch {
      setActive(!next); // revert on error
    } finally {
      setTogglingActive(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteJson(`/api/habits/${habit.id}`);
      router.refresh();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <Card className={active ? "" : "opacity-50"}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Title inline edit */}
            {titleEdit.editing ? (
              titleEdit.saving ? (
                <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
              ) : (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    value={titleEdit.draft}
                    onChange={(e) => titleEdit.setDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitTitle();
                      if (e.key === "Escape") titleEdit.cancel();
                    }}
                    autoFocus
                    className="ui-input-inline border-border-strong px-2 py-0.5 text-base font-medium text-text-primary flex-1"
                  />
                  <button onClick={commitTitle} className="ui-btn-confirm-icon shrink-0">
                    <Check className="h-2.5 w-2.5" />
                  </button>
                  <button onClick={titleEdit.cancel} className="p-1.5 text-text-muted hover:text-text-secondary shrink-0">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            ) : (
              <button
                onClick={() => titleEdit.start(displayTitle)}
                className="text-base font-medium text-text-primary hover:text-accent-text transition-colors text-left"
                title="Click to edit title"
              >
                {displayTitle}
              </button>
            )}

            {!active && (
              <span className="ui-tag ui-tag-neutral shrink-0">inactive</span>
            )}

            {habit.streak >= 2 && (
              <span className="flex items-center gap-1 text-sm text-status-warning shrink-0">
                <Flame className="h-3 w-3" />
                {habit.streak}d
              </span>
            )}
          </div>

          {/* Frequency selector */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {(Object.values(HABIT_FREQUENCY) as HabitFrequency[]).map((f) => (
              <button
                key={f}
                onClick={() => handleFrequencyChange(f)}
                disabled={savingFreq}
                className={
                  frequency === f
                    ? "ui-chip-filter-active text-xs px-2 py-0.5 disabled:opacity-50"
                    : "ui-chip-filter text-xs px-2 py-0.5 disabled:opacity-50"
                }
              >
                {f}
              </button>
            ))}
            {savingFreq && <Loader2 className="h-3 w-3 animate-spin text-text-muted" />}
          </div>
        </div>

        {/* Stats + actions */}
        <div className="flex items-start gap-3 shrink-0">
          <div className="text-right">
            <div className="text-base font-medium text-text-primary">{pct}%</div>
            <div className="text-xs text-text-tertiary">{habit.completionsInWindow}/{scheduled}d</div>
          </div>

          {/* Active toggle */}
          <button
            onClick={handleToggleActive}
            disabled={togglingActive}
            title={active ? "Deactivate habit" : "Activate habit"}
            className="mt-0.5 p-1.5 rounded transition-colors hover:bg-surface-raised text-text-muted hover:text-text-secondary disabled:opacity-50"
          >
            {togglingActive
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <span className={`text-xs font-mono ${active ? "text-status-positive" : "text-text-muted"}`}>
                  {active ? "on" : "off"}
                </span>
            }
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete habit"
            className="mt-0.5 p-1.5 rounded transition-colors hover:bg-surface-raised text-text-muted hover:text-status-negative disabled:opacity-50"
          >
            {deleting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Trash2 className="h-4 w-4" />
            }
          </button>
        </div>
      </div>

      <HabitHeatmap
        completedDates={completedDatesArr}
        frequency={frequency}
      />
    </Card>
  );
}
