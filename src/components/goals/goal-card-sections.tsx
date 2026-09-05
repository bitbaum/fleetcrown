"use client";

import { Loader2, Archive, X, Check } from "lucide-react";
import type { Milestone } from "@/db/schema/goals";
import type { useInlineEdit } from "@/hooks/use-inline-edit";
import { DeleteGoalButton } from "./DeleteGoalButton";
import { SendToLokiButton, CopyGoalPromptButton } from "./goal-card-helpers";
import { RowActions } from "@/components/ui/row-actions";

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
      {/* One trigger, not four glyphs. None of these is the action a person
          repeats on a goal — that is editing progress, which is inline in the
          card body — so all four belong behind an overflow menu. `ui-hover-reveal`
          kept the icons out of the way on DESKTOP, but a phone has no hover, so
          on the viewport with the least room they were all permanently visible,
          competing with the goal's own title. */}
      <div className="ml-auto flex items-center gap-0.5">
        <RowActions label={`More actions for ${displayTitle}`}>
          {!isClosed && (
            <>
              <SendToLokiButton
                title={displayTitle}
                description={description}
                progress={progress}
                milestones={milestones}
                targetDate={targetDate}
                entityName={entityName}
                className="ui-menu-item"
                label="Ask Loki about this goal"
              />
              <CopyGoalPromptButton
                title={displayTitle}
                description={description}
                progress={progress}
                milestones={milestones}
                targetDate={targetDate}
                entityName={entityName}
                className="ui-menu-item"
                label="Copy as agent prompt"
              />
              <div className="ui-menu-separator" />
            </>
          )}
          <button
            onClick={onToggleAbandon}
            disabled={abandoningStatus || isCompleted}
            title={isAbandoned ? "Restore goal" : "Mark abandoned"}
            className="ui-menu-item"
            role="menuitem"
          >
            {abandoningStatus ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5 shrink-0" />
            )}
            {isAbandoned ? "Restore goal" : "Mark abandoned"}
          </button>
          {/* Answers in place, so it must not bubble to the menu's close. */}
          <span onClick={(e) => e.stopPropagation()}>
            <DeleteGoalButton goalId={goalId} />
          </span>
        </RowActions>
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
            {descEdit.saving ? (
              <Loader2 className="ui-spinner-2xs" />
            ) : (
              <Check className="h-2.5 w-2.5" />
            )}
          </button>
          <button
            onClick={descEdit.cancel}
            className="p-1.5 text-text-muted hover:text-text-secondary"
          >
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
        isClosed
          ? "cursor-default"
          : description
            ? "text-text-tertiary hover:text-text-secondary"
            : "text-text-muted hover:text-text-muted italic"
      }`}
      disabled={isClosed}
      title={isClosed ? undefined : "Click to edit description"}
    >
      {description ?? "Add a description…"}
    </button>
  );
}
