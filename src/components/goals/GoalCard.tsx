"use client";

import { useState } from "react";
import { Target, CheckCircle, Loader2, X, Check, FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { GoalWithChildren } from "@/db/queries/goals";
import type { Milestone } from "@/db/schema/goals";
import { DeleteGoalButton } from "./DeleteGoalButton";
import { patchGoal } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { ProgressInput, DateInput, AddMilestoneInline, MilestoneRow } from "./goal-card-helpers";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";

export function GoalCard({ goal, depth }: { goal: GoalWithChildren; depth: number }) {
  const [status, setStatus] = useState(goal.status ?? GOAL_STATUS.ACTIVE);
  const [progress, setProgress] = useState(goal.progress ?? 0);
  const [milestones, setMilestones] = useState<Milestone[]>(goal.milestones ?? []);
  const [targetDate, setTargetDate] = useState<Date | null>(goal.targetDate);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(goal.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [description, setDescription] = useState(goal.description);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(goal.description ?? "");
  const [savingDesc, setSavingDesc] = useState(false);

  const commitTitle = async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === goal.title) { setEditingTitle(false); setTitleValue(goal.title); return; }
    setSavingTitle(true);
    try {
      await patchGoal(goal.id, { title: trimmed });
      goal.title = trimmed; // local ref update so re-mount shows correct value
    } finally {
      setSavingTitle(false);
      setEditingTitle(false);
    }
  };

  const commitDesc = async () => {
    const trimmed = descValue.trim();
    setSavingDesc(true);
    try {
      await patchGoal(goal.id, { description: trimmed || null });
      setDescription(trimmed || null);
    } finally {
      setSavingDesc(false);
      setEditingDesc(false);
    }
  };

  const isCompleted = status === GOAL_STATUS.COMPLETED;
  const milestoneDone = milestones.filter((m) => m.done).length;
  const milestoneTotal = milestones.length;
  const hasMilestones = milestoneTotal > 0;

  const toggleComplete = async () => {
    if (togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = isCompleted ? GOAL_STATUS.ACTIVE : GOAL_STATUS.COMPLETED;
    const newProgress = newStatus === GOAL_STATUS.COMPLETED ? 100 : progress;
    try {
      await patchGoal(goal.id, { status: newStatus, progress: newProgress });
      setStatus(newStatus);
      if (newStatus === GOAL_STATUS.COMPLETED) setProgress(100);
    } finally {
      setTogglingStatus(false);
    }
  };

  return (
    <div>
      <Card className={`group ${isCompleted ? "opacity-60" : ""}`}>
        <div className="flex items-start gap-3">
          {/* Status toggle */}
          <button
            onClick={toggleComplete}
            disabled={togglingStatus}
            className="shrink-0 mt-0.5 disabled:opacity-50"
            title={isCompleted ? "Mark active" : "Mark completed"}
          >
            {togglingStatus ? (
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            ) : isCompleted ? (
              <CheckCircle className="h-5 w-5 text-status-positive hover:text-status-positive/80 transition-colors" />
            ) : depth === 0 ? (
              <Target className="h-5 w-5 text-status-positive hover:text-status-positive/80 transition-colors" />
            ) : (
              <div className="h-4 w-4 rounded border border-border-strong hover:border-border-interactive transition-colors mt-0.5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {editingTitle ? (
                savingTitle ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                ) : (
                  <input
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleValue(goal.title); } }}
                    autoFocus
                    className={`bg-surface-raised border border-border-strong rounded px-2 py-0.5 focus:outline-none focus:border-border-strong ${depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium"}`}
                  />
                )
              ) : (
                <div
                  className={`cursor-text hover:text-text-primary transition-colors ${depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium text-text-primary"}`}
                  onClick={() => !isCompleted && setEditingTitle(true)}
                  title={isCompleted ? undefined : "Click to edit title"}
                >
                  {titleValue}
                </div>
              )}
              {status && status !== GOAL_STATUS.ACTIVE && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary">
                  {status}
                </span>
              )}
              <div className="ml-auto">
                <DeleteGoalButton goalId={goal.id} />
              </div>
            </div>
            {editingDesc ? (
              <div className="mt-1 flex items-start gap-1.5">
                <textarea
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setEditingDesc(false); setDescValue(description ?? ""); }
                    if (e.key === "Enter" && e.metaKey) commitDesc();
                  }}
                  autoFocus
                  rows={2}
                  placeholder="Add a description…"
                  className={`flex-1 resize-none ${FIELD_INPUT_CLASS_TIGHT}`}
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={commitDesc} disabled={savingDesc}
                    className="p-1.5 rounded ui-btn-confirm disabled:opacity-30">
                    {savingDesc ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                  </button>
                  <button onClick={() => { setEditingDesc(false); setDescValue(description ?? ""); }}
                    className="p-1.5 text-text-muted hover:text-text-secondary">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => !isCompleted && (setDescValue(description ?? ""), setEditingDesc(true))}
                className={`text-xs md:text-sm mt-1 text-left w-full transition-colors ${
                  isCompleted ? "cursor-default" :
                  description ? "text-text-tertiary hover:text-text-secondary" : "text-text-muted hover:text-text-muted italic"
                }`}
                disabled={isCompleted}
                title={isCompleted ? undefined : "Click to edit description"}
              >
                {description ?? "Add a description…"}
              </button>
            )}
            {goal.entityName && (
              <div className="flex items-center gap-1 mt-1">
                <FolderKanban className="h-3 w-3 text-status-positive/50" />
                <span className="text-xs text-status-positive/60">{goal.entityName}</span>
              </div>
            )}

            {/* Progress bar */}
            {!isCompleted && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  {hasMilestones ? (
                    <span className="text-xs text-text-tertiary">{progress}%</span>
                  ) : (
                    <ProgressInput goalId={goal.id} initial={progress} onUpdate={setProgress} />
                  )}
                  <DateInput
                    goalId={goal.id}
                    initial={targetDate}
                    onUpdate={setTargetDate}
                  />
                </div>
                <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
                  <div
                    className="h-full bg-status-positive/60 rounded-full transition-all"
                    style={{ width: `${Math.max(progress, 1)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Milestones */}
            {(milestoneTotal > 0 || !isCompleted) && (
              <div className="mt-2 space-y-1.5">
                {milestones.map((m, i) => (
                  <MilestoneRow
                    key={i}
                    milestone={m}
                    goalId={goal.id}
                    allMilestones={milestones}
                    index={i}
                    onUpdate={(updated, prog) => {
                      setMilestones(updated);
                      setProgress(prog);
                    }}
                  />
                ))}
                {milestoneTotal > 0 && (
                  <div className="text-xs text-text-muted mt-1">
                    {milestoneDone}/{milestoneTotal} milestones
                  </div>
                )}
                {!isCompleted && (
                  <AddMilestoneInline
                    goalId={goal.id}
                    milestones={milestones}
                    onAdded={(updated) => {
                      setMilestones(updated);
                      // If first milestone added, progress stays manual until milestones drive it
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Children */}
      {goal.children.length > 0 && (
        <div className="mt-2 ml-6 pl-5 border-l-2 border-status-positive/20 space-y-2">
          {goal.children.map((child) => (
            <GoalCard key={child.id} goal={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
