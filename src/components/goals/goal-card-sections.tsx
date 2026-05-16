"use client";

import { Loader2, Archive, X, Check } from "lucide-react";
import type { Milestone } from "@/db/schema/goals";
import type { useInlineEdit } from "@/hooks/use-inline-edit";
import { DeleteGoalButton } from "./DeleteGoalButton";
import { SendToIvyButton, CopyGoalPromptButton } from "./goal-card-helpers";

type InlineEdit<T> = ReturnType<typeof useInlineEdit<T>>;

export function GoalTitleRow({
  depth,
  isClosed,
  isCompleted,
  isAbandoned,
  displayTitle,
  titleEdit,
  onCommitTitle,
  abandoningStatus,
  onToggleAbandon,
  description,
  progress,
  milestones,
  targetDate,
  entityName,
  goalId,
}: {
  depth: number;
  isClosed: boolean;
  isCompleted: boolean;
  isAbandoned: boolean;
  displayTitle: string;
  titleEdit: InlineEdit<string>;
  onCommitTitle: () => void;
  abandoningStatus: boolean;
  onToggleAbandon: () => void;
  description: string | null;
  progress: number;
  milestones: Milestone[];
  targetDate: Date | null;
  entityName: string | null;
  goalId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {titleEdit.editing ? (
        titleEdit.saving ? (
          <Loader2 className="ui-spinner text-text-muted" />
        ) : (
          <input
            value={titleEdit.draft}
            onChange={(e) => titleEdit.setDraft(e.target.value)}
            onBlur={onCommitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitTitle();
              if (e.key === "Escape") titleEdit.cancel();
            }}
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
        {!isClosed && (
          <>
            <SendToIvyButton
              title={displayTitle}
              description={description}
              progress={progress}
              milestones={milestones}
              targetDate={targetDate}
              entityName={entityName}
            />
            <CopyGoalPromptButton
              title={displayTitle}
              description={description}
              progress={progress}
              milestones={milestones}
              targetDate={targetDate}
              entityName={entityName}
            />
          </>
        )}
        <button
          onClick={onToggleAbandon}
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
        <DeleteGoalButton goalId={goalId} />
      </div>
    </div>
  );
}

export function GoalDescriptionEdit({
  isClosed,
  description,
  descEdit,
  onCommitDesc,
}: {
  isClosed: boolean;
  description: string | null;
  descEdit: InlineEdit<string>;
  onCommitDesc: () => void;
}) {
  if (descEdit.editing) {
    return (
      <div className="mt-1 flex items-start gap-1.5">
        <textarea
          value={descEdit.draft}
          onChange={(e) => descEdit.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") descEdit.cancel();
            if (e.key === "Enter" && e.metaKey) onCommitDesc();
          }}
          autoFocus
          rows={2}
          placeholder="Add a description…"
          className="flex-1 resize-none ui-input-tight"
        />
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onCommitDesc} disabled={descEdit.saving} className="ui-btn-confirm-icon">
            {descEdit.saving ? <Loader2 className="ui-spinner-2xs" /> : <Check className="h-2.5 w-2.5" />}
          </button>
          <button onClick={descEdit.cancel} className="p-1.5 text-text-muted hover:text-text-secondary">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
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
  );
}
