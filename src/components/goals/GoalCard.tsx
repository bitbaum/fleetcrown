"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Target, CheckCircle, Archive, Loader2, X, Check, FolderKanban, Plus, Repeat2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { GoalWithChildren } from "@/db/queries/goals";
import type { Milestone } from "@/db/schema/goals";
import { DeleteGoalButton } from "./DeleteGoalButton";
import { patchGoal, createGoal } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { ProgressInput, DateInput, AddMilestoneInline, MilestoneRow, CopyGoalPromptButton, SendToIvyButton } from "./goal-card-helpers";
import { GoalProgressBar } from "@/components/shared/GoalProgressBar";
import { ControlDispatchButton } from "@/components/shared/ControlDispatchButton";

type SupportingHabits = Record<string, { id: string; title: string }[]>;

export function GoalCard({
  goal,
  depth,
  habitsByGoalId = {},
}: {
  goal: GoalWithChildren;
  depth: number;
  habitsByGoalId?: SupportingHabits;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(goal.status ?? GOAL_STATUS.ACTIVE);
  const [progress, setProgress] = useState(goal.progress ?? 0);
  const [milestones, setMilestones] = useState<Milestone[]>(goal.milestones ?? []);
  const [targetDate, setTargetDate] = useState<Date | null>(goal.targetDate);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [abandoningStatus, setAbandoningStatus] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [savingChild, setSavingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const titleEdit = useInlineEdit<string>(goal.title);
  const descEdit = useInlineEdit<string>(goal.description ?? "");

  const handleAddChild = async () => {
    const title = childTitle.trim();
    if (!title) return;
    setSavingChild(true);
    setChildError(null);
    try {
      const res = await createGoal({ title, parentGoalId: goal.id });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setChildTitle("");
        setAddingChild(false);
        router.refresh();
      } else {
        setChildError(data.error ?? "Failed to add sub-goal");
      }
    } catch {
      setChildError("Network error — try again");
    } finally {
      setSavingChild(false);
    }
  };

  const commitTitle = () => {
    const trimmed = titleEdit.draft.trim();
    if (!trimmed || trimmed === displayTitle) { titleEdit.cancel(); return; }
    titleEdit.commit(async () => {
      await patchGoal(goal.id, { title: trimmed });
      setDisplayTitle(trimmed);
    });
  };

  const commitDesc = () => {
    const trimmed = descEdit.draft.trim();
    descEdit.commit(async () => {
      await patchGoal(goal.id, { description: trimmed || null });
      setDescription(trimmed || null);
    });
  };

  const supportingHabits = habitsByGoalId[goal.id] ?? [];
  const isCompleted = status === GOAL_STATUS.COMPLETED;
  const isAbandoned = status === GOAL_STATUS.ABANDONED;
  const isClosed = isCompleted || isAbandoned;
  const milestoneDone = milestones.filter((m) => m.done).length;
  const milestoneTotal = milestones.length;
  const hasMilestones = milestoneTotal > 0;
  const controlPrompt = goal.entityName
    ? [`Goal: ${displayTitle}`, ...(description?.trim() ? [`Description: ${description.trim()}`] : []), `Progress: ${progress}%`, `Project: ${goal.entityName}`, "", "Please advance this goal in the codebase. Identify what needs to be done next, implement the concrete next step, and report back."].join("\n")
    : null;

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

  const toggleAbandon = async () => {
    if (abandoningStatus) return;
    setAbandoningStatus(true);
    const newStatus = isAbandoned ? GOAL_STATUS.ACTIVE : GOAL_STATUS.ABANDONED;
    try {
      await patchGoal(goal.id, { status: newStatus });
      setStatus(newStatus);
    } finally {
      setAbandoningStatus(false);
    }
  };

  return (
    <div>
      <Card className={`group ${isClosed ? "opacity-60" : ""}`}>
        <div className="flex items-start gap-3">
          {/* Status toggle */}
          <button
            onClick={toggleComplete}
            disabled={togglingStatus || isAbandoned}
            className="shrink-0 mt-0.5 p-1.5 -m-1.5 rounded hover:bg-surface-raised transition-colors disabled:opacity-50"
            title={isCompleted ? "Mark active" : isAbandoned ? "Restore to mark completed" : "Mark completed"}
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
              {titleEdit.editing ? (
                titleEdit.saving ? (
                  <Loader2 className="ui-spinner text-text-muted" />
                ) : (
                  <input
                    value={titleEdit.draft}
                    onChange={(e) => titleEdit.setDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") titleEdit.cancel(); }}
                    autoFocus
                    className={`ui-input-inline border-border-strong px-2 py-0.5 ${depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium"}`}
                  />
                )
              ) : (
                <div
                  className={`cursor-text hover:text-text-primary transition-colors ${depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium text-text-primary"}`}
                  onClick={() => !isClosed && titleEdit.start(displayTitle)}
                  title={isClosed ? undefined : "Click to edit title"}
                >
                  {displayTitle}
                </div>
              )}
              {isAbandoned && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary">
                  abandoned
                </span>
              )}
              {isCompleted && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary">
                  completed
                </span>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                {/* Goal→agent dispatch — only on active goals */}
                {!isClosed && (
                  <>
                    <SendToIvyButton
                      title={displayTitle}
                      description={description}
                      progress={progress}
                      milestones={milestones}
                      targetDate={targetDate}
                      entityName={goal.entityName ?? null}
                    />
                    <CopyGoalPromptButton
                      title={displayTitle}
                      description={description}
                      progress={progress}
                      milestones={milestones}
                      targetDate={targetDate}
                      entityName={goal.entityName ?? null}
                    />
                  </>
                )}
                {/* Abandon / restore button */}
                <button
                  onClick={toggleAbandon}
                  disabled={abandoningStatus || isCompleted}
                  title={isAbandoned ? "Restore goal" : "Mark abandoned"}
                  className={`ui-hover-reveal ui-icon-btn p-1 rounded transition-all shrink-0 disabled:opacity-30 ${
                    isAbandoned
                      ? "text-text-muted hover:text-text-secondary opacity-100"
                      : "text-text-muted hover:text-status-warning"
                  }`}
                >
                  {abandoningStatus
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Archive className="h-3.5 w-3.5" />
                  }
                </button>
                <DeleteGoalButton goalId={goal.id} />
              </div>
            </div>
            {descEdit.editing ? (
              <div className="mt-1 flex items-start gap-1.5">
                <textarea
                  value={descEdit.draft}
                  onChange={(e) => descEdit.setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") descEdit.cancel();
                    if (e.key === "Enter" && e.metaKey) commitDesc();
                  }}
                  autoFocus
                  rows={2}
                  placeholder="Add a description…"
                  className="flex-1 resize-none ui-input-tight"
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={commitDesc} disabled={descEdit.saving}
                    className="ui-btn-confirm-icon">
                    {descEdit.saving ? <Loader2 className="ui-spinner-2xs" /> : <Check className="h-2.5 w-2.5" />}
                  </button>
                  <button onClick={descEdit.cancel}
                    className="p-1.5 text-text-muted hover:text-text-secondary">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => !isClosed && descEdit.start(description ?? "")}
                className={`text-xs md:text-sm mt-1 text-left w-full transition-colors ${
                  isClosed ? "cursor-default" :
                  description ? "text-text-tertiary hover:text-text-secondary" : "text-text-muted hover:text-text-muted italic"
                }`}
                disabled={isClosed}
                title={isClosed ? undefined : "Click to edit description"}
              >
                {description ?? "Add a description…"}
              </button>
            )}
            {goal.entityName && goal.entityId && (
              <div className="flex items-center gap-2 mt-1">
                <Link
                  href={`/projects?open=${goal.entityId}`}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                  title="Open project"
                >
                  <FolderKanban className="h-3 w-3 text-status-positive/50" />
                  <span className="text-xs text-status-positive/60">{goal.entityName}</span>
                </Link>
                {!isClosed && controlPrompt && (
                  <ControlDispatchButton tab={goal.entityName!} prompt={controlPrompt} />
                )}
              </div>
            )}

            {/* Supporting habits */}
            {supportingHabits.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <Repeat2 className="h-3 w-3 text-text-muted shrink-0" />
                {supportingHabits.map((h) => (
                  <span key={h.id} className="ui-tag ui-tag-neutral">{h.title}</span>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {!isClosed && (
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
                <GoalProgressBar
                  value={progress}
                  minPercent={1}
                  className="h-1.5 bg-surface-raised"
                />
              </div>
            )}

            {/* Milestones */}
            {(milestoneTotal > 0 || !isClosed) && (
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
                  <div className="text-xs text-text-tertiary mt-1">
                    {milestoneDone}/{milestoneTotal} milestones
                  </div>
                )}
                {!isClosed && (
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

      {/* Children + inline add-sub-goal */}
      {(goal.children.length > 0 || (!isClosed && addingChild)) && (
        <div className="mt-2 ml-6 pl-5 border-l-2 border-status-positive/20 space-y-2">
          {goal.children.map((child) => (
            <GoalCard key={child.id} goal={child} depth={depth + 1} habitsByGoalId={habitsByGoalId} />
          ))}
          {addingChild && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={childTitle}
                  onChange={(e) => { setChildTitle(e.target.value); setChildError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddChild(); if (e.key === "Escape") { setAddingChild(false); setChildTitle(""); setChildError(null); } }}
                  placeholder="Sub-goal title…"
                  autoFocus
                  className="flex-1 text-sm ui-input-tight"
                />
                <button onClick={handleAddChild} disabled={!childTitle.trim() || savingChild}
                  className="ui-btn-confirm-icon shrink-0">
                  {savingChild ? <Loader2 className="ui-spinner-xs" /> : <Check className="h-3 w-3" />}
                </button>
                <button onClick={() => { setAddingChild(false); setChildTitle(""); setChildError(null); }}
                  className="ui-btn-row-action shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </div>
              {childError && <p className="ui-error-xs ml-1">{childError}</p>}
            </div>
          )}
        </div>
      )}
      {!isClosed && !addingChild && (
        <button
          onClick={() => setAddingChild(true)}
          className="mt-1 ml-6 flex items-center gap-1 text-xs text-text-secondary hover:text-status-positive transition-colors"
        >
          <Plus className="h-3 w-3" /> Add sub-goal
        </button>
      )}
    </div>
  );
}
