"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Loader2, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { HabitHeatmap } from "./HabitHeatmap";
import { HabitGoalLinks } from "./HabitGoalLinks";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import { patchJson, deleteJson } from "@/lib/api/fetch";
import type { HabitWithHistory } from "@/db/queries/habits";
import type { LinkedGoal } from "@/db/queries/habit-goals";
import { HABIT_FREQUENCY, type HabitFrequency, scheduledDays } from "@/lib/constants/statuses";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";
import { TOAST_SHORT_MS } from "@/lib/constants/timings";
import { toLocalDateStr } from "@/lib/dates";

export function HabitCard({
  habit,
  linkedGoals = [],
  activeGoals = [],
}: {
  habit: HabitWithHistory;
  linkedGoals?: LinkedGoal[];
  activeGoals?: LinkedGoal[];
}) {
  const router = useRouter();
  const [active, setActive] = useState(habit.active);
  const [frequency, setFrequency] = useState<HabitFrequency>(habit.frequency);
  const [togglingActive, setTogglingActive] = useState(false);
  const [savingFreq, setSavingFreq] = useState(false);
  const titleEdit = useInlineEdit<string>(habit.title);
  const [displayTitle, setDisplayTitle] = useState(habit.title);

  const completedDatesArr = [...habit.completedDates];
  const [doneToday, setDoneToday] = useState(() => completedDatesArr.includes(toLocalDateStr(new Date())));
  const [togglingDone, setTogglingDone] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const scheduled = scheduledDays(frequency, HABIT_HISTORY_DAYS);
  const pct = Math.round((habit.completionsInWindow / scheduled) * 100);

  const lokiPrompt = [
    `Habit: ${habit.title}`,
    `Frequency: ${frequency}`,
    `Completion rate: ${pct}% (${habit.completionsInWindow}/${scheduled} days in the last ${HABIT_HISTORY_DAYS} days)`,
    habit.streak >= 2 && `Current streak: ${habit.streak} days`,
    doneToday ? "Completed today" : "Not yet done today",
    linkedGoals.length > 0 && `Linked goals: ${linkedGoals.map((g) => g.title).join(", ")}`,
    "",
    "How can I improve consistency with this habit? What strategies or context would help me stick to it?",
  ].filter(Boolean).join("\n");

  const commitTitle = () => {
    const trimmed = titleEdit.draft.trim();
    if (!trimmed || trimmed === displayTitle) { titleEdit.cancel(); return; }
    titleEdit.commit(async () => {
      const res = await patchJson(`/api/habits/${habit.id}`, { title: trimmed });
      if (!res.ok) throw new Error("Failed to save");
      setDisplayTitle(trimmed);
    });
  };

  const flashError = (msg: string) => {
    setToggleError(msg);
    setTimeout(() => setToggleError(""), TOAST_SHORT_MS);
  };

  const handleFrequencyChange = async (next: HabitFrequency) => {
    if (next === frequency || savingFreq) return;
    setSavingFreq(true);
    const prev = frequency;
    setFrequency(next);
    try {
      const res = await patchJson(`/api/habits/${habit.id}`, { frequency: next });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setFrequency(prev);
      flashError("Failed to save — try again");
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
      const res = await patchJson(`/api/habits/${habit.id}`, { active: next });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setActive(!next);
      flashError("Failed to save — try again");
    } finally {
      setTogglingActive(false);
    }
  };

  const handleToggleDone = async () => {
    if (togglingDone) return;
    setTogglingDone(true);
    const next = !doneToday;
    setDoneToday(next);
    try {
      const res = await patchJson(`/api/habits/${habit.id}`, { done: next });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setDoneToday(!next);
      flashError("Failed to save — try again");
    } finally {
      setTogglingDone(false);
    }
  };

  // DeleteButton handles confirm + busy + error surfacing; it rethrows on failure.
  const handleDelete = async () => {
    const res = await deleteJson(`/api/habits/${habit.id}`);
    if (!res.ok) throw new Error("Failed to delete — try again");
    router.refresh();
  };

  return (
    <Card className={active ? "" : "opacity-50"}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
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

          <HabitGoalLinks habitId={habit.id} linked={linkedGoals} allGoals={activeGoals} />
        </div>

        <div className="flex items-start gap-3 shrink-0">
          <button
            onClick={handleToggleDone}
            disabled={togglingDone || !active}
            title={doneToday ? "Unmark done today" : "Mark done today"}
            className="mt-0.5 h-9 w-9 flex items-center justify-center rounded transition-colors hover:bg-surface-raised disabled:opacity-50"
          >
            {togglingDone ? (
              <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
            ) : doneToday ? (
              <div className="h-5 w-5 rounded-full bg-status-positive/50 flex items-center justify-center">
                <Check className="h-3 w-3 text-text-inverted" />
              </div>
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-border-strong hover:border-status-positive/60 transition-colors" />
            )}
          </button>

          <div className="text-right">
            <div className="text-base font-medium text-text-primary">{pct}%</div>
            <div className="text-xs text-text-tertiary">{habit.completionsInWindow}/{scheduled}d</div>
          </div>

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

          <LokiDispatchButton
            prompt={lokiPrompt}
            title="Ask Loki about this habit"
            className="mt-0.5 p-1.5 rounded text-text-muted hover:text-status-positive transition-colors"
          />

          <div className="mt-0.5">
            <DeleteButton
              onDelete={handleDelete}
              label="Delete?"
              triggerTitle="Delete habit"
              triggerClassName="p-1.5 rounded transition-colors hover:bg-surface-raised text-text-muted hover:text-status-negative"
            />
          </div>
        </div>
      </div>

      {toggleError && (
        <p className="mt-2 text-xs text-status-negative">{toggleError}</p>
      )}

      <HabitHeatmap completedDates={completedDatesArr} frequency={frequency} />
    </Card>
  );
}
