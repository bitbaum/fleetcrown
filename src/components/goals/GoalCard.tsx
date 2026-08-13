"use client";

import Link from "next/link";
import { Target, CheckCircle, Loader2, FolderKanban, Plus, Repeat2, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { GoalWithChildren } from "@/db/queries/goals";
import { useGoalCard } from "@/hooks/use-goal-card";
import { ProgressInput, DateInput } from "./goal-card-helpers";
import { AddMilestoneInline, MilestoneRow } from "./goal-milestone-helpers";
import { GoalTitleRow, GoalDescriptionEdit } from "./goal-card-sections";
import { GoalProgressBar } from "@/components/shared/GoalProgressBar";
import { ControlDispatchButton } from "@/components/shared/ControlDispatchButton";

type SupportingHabits = Record<string, { id: string; title: string }[]>;

function GoalChildrenSection({
  goal, depth, isClosed, habitsByGoalId,
  addingChild, childTitle, childError, savingChild,
  onAddChild, onSetAddingChild, onSetChildTitle,
}: {
  goal: GoalWithChildren;
  depth: number;
  isClosed: boolean;
  habitsByGoalId: SupportingHabits;
  addingChild: boolean;
  childTitle: string;
  childError: string | null;
  savingChild: boolean;
  onAddChild: () => void;
  onSetAddingChild: (v: boolean) => void;
  onSetChildTitle: (v: string) => void;
}) {
  const showSection = goal.children.length > 0 || (!isClosed && addingChild);
  return (
    <>
      {showSection && (
        <div className="mt-2 ml-2 space-y-2 border-l-2 border-status-positive/20 pl-2 sm:ml-6 sm:pl-5">
          {goal.children.map((child) => (
            <GoalCard key={child.id} goal={child} depth={depth + 1} habitsByGoalId={habitsByGoalId} />
          ))}
          {addingChild && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={childTitle}
                  onChange={(e) => { onSetChildTitle(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAddChild();
                    if (e.key === "Escape") { onSetAddingChild(false); onSetChildTitle(""); }
                  }}
                  placeholder="Sub-goal title…"
                  autoFocus
                  className="flex-1 text-sm ui-input-tight"
                />
                <button onClick={onAddChild} disabled={!childTitle.trim() || savingChild}
                  className="ui-btn-confirm-icon shrink-0">
                  {savingChild ? <Loader2 className="ui-spinner-xs" /> : <Check className="h-3 w-3" />}
                </button>
                <button onClick={() => { onSetAddingChild(false); onSetChildTitle(""); }}
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
          onClick={() => onSetAddingChild(true)}
          className="mt-1 ml-2 flex min-h-11 items-center gap-1 text-xs text-text-secondary transition-colors hover:text-status-positive sm:ml-6 sm:min-h-0"
        >
          <Plus className="h-3 w-3" /> Add sub-goal
        </button>
      )}
    </>
  );
}

export function GoalCard({
  goal,
  depth,
  habitsByGoalId = {},
}: {
  goal: GoalWithChildren;
  depth: number;
  habitsByGoalId?: SupportingHabits;
}) {
  const {
    progress, setProgress, milestones, setMilestones, targetDate, setTargetDate,
    togglingStatus, abandoningStatus, displayTitle, description,
    addingChild, childTitle, savingChild, childError,
    titleEdit, descEdit, isClosed, isCompleted, isAbandoned,
    titleError, descError, statusError,
    handleAddChild, commitTitle, commitDesc, toggleComplete, toggleAbandon,
    setAddingChild, setChildTitle,
  } = useGoalCard(goal);

  const supportingHabits = habitsByGoalId[goal.id] ?? [];
  const milestoneDone = milestones.filter((m) => m.done).length;
  const milestoneTotal = milestones.length;
  const hasMilestones = milestoneTotal > 0;
  const controlPrompt = goal.entityName
    ? [`Goal: ${displayTitle}`, ...(description?.trim() ? [`Description: ${description.trim()}`] : []), `Progress: ${progress}%`, `Project: ${goal.entityName}`, "", "Please advance this goal in the codebase. Identify what needs to be done next, implement the concrete next step, and report back."].join("\n")
    : null;

  return (
    <div className="min-w-0">
      <Card className={`group min-w-0 ${isClosed ? "bg-surface-page" : ""}`}>
        <div className="flex min-w-0 items-start gap-3">
          <button
            onClick={toggleComplete}
            disabled={togglingStatus || isAbandoned}
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors hover:bg-surface-raised disabled:opacity-50 sm:-m-1.5 sm:h-auto sm:w-auto sm:p-1.5"
            title={isCompleted ? "Mark active" : isAbandoned ? "Restore to mark completed" : "Mark completed"}
          >
            {togglingStatus ? (
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            ) : isCompleted ? (
              <CheckCircle className="h-5 w-5 text-status-positive transition-colors hover:text-status-positive" />
            ) : depth === 0 ? (
              <Target className="h-5 w-5 text-status-positive transition-colors hover:text-status-positive" />
            ) : (
              <div className="h-4 w-4 rounded border border-border-strong hover:border-border-interactive transition-colors mt-0.5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <GoalTitleRow
              depth={depth}
              isClosed={isClosed}
              isCompleted={isCompleted}
              isAbandoned={isAbandoned}
              displayTitle={displayTitle}
              titleEdit={titleEdit}
              onCommitTitle={commitTitle}
              abandoningStatus={abandoningStatus}
              onToggleAbandon={toggleAbandon}
              description={description ?? null}
              progress={progress}
              milestones={milestones}
              targetDate={targetDate}
              entityName={goal.entityName ?? null}
              goalId={goal.id}
            />
            {titleError && <p className="ui-error-xs mt-0.5">{titleError}</p>}
            {statusError && <p className="ui-error-xs mt-0.5">{statusError}</p>}
            <GoalDescriptionEdit
              isClosed={isClosed}
              description={description ?? null}
              descEdit={descEdit}
              onCommitDesc={commitDesc}
            />
            {descError && <p className="ui-error-xs mt-0.5">{descError}</p>}
            {goal.entityName && goal.entityId && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Link
                  href={`/projects/${goal.entityId}`}
                  className="flex min-h-11 items-center gap-1 transition-opacity hover:opacity-80 sm:min-h-0"
                  title="Open project"
                >
                  <FolderKanban className="h-3 w-3 text-status-positive" />
                  <span className="text-xs text-status-positive">{goal.entityName}</span>
                </Link>
                {!isClosed && controlPrompt && (
                  <ControlDispatchButton
                    tab={goal.entityName!}
                    className="flex min-h-11 items-center gap-1 text-text-muted transition-colors hover:text-accent-text sm:min-h-0"
                  />
                )}
              </div>
            )}

            {supportingHabits.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <Repeat2 className="h-3 w-3 text-text-muted shrink-0" />
                {supportingHabits.map((h) => (
                  <span key={h.id} className="ui-tag ui-tag-neutral">{h.title}</span>
                ))}
              </div>
            )}

            {!isClosed && (
              <div className="mt-2">
                <div className="mb-1 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                  {hasMilestones ? (
                    <span className="text-xs text-text-tertiary">{progress}%</span>
                  ) : (
                    <ProgressInput goalId={goal.id} initial={progress} onUpdate={setProgress} />
                  )}
                  <DateInput goalId={goal.id} initial={targetDate} onUpdate={setTargetDate} />
                </div>
                <GoalProgressBar value={progress} minPercent={1} className="h-1.5 bg-surface-raised" />
              </div>
            )}

            {(milestoneTotal > 0 || !isClosed) && (
              <div className="mt-2 min-w-0 space-y-1.5">
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
                    onAdded={(updated) => setMilestones(updated)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <GoalChildrenSection
        goal={goal}
        depth={depth}
        isClosed={isClosed}
        habitsByGoalId={habitsByGoalId}
        addingChild={addingChild}
        childTitle={childTitle}
        childError={childError}
        savingChild={savingChild}
        onAddChild={handleAddChild}
        onSetAddingChild={setAddingChild}
        onSetChildTitle={setChildTitle}
      />
    </div>
  );
}
