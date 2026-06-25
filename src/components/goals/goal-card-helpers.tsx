"use client";

import { useState } from "react";
import { CheckCircle, Clipboard, Loader2, X } from "lucide-react";
import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import type { Milestone } from "@/db/schema/goals";
import { patchGoal } from "@/lib/api/goals";
import { deadlineLabel, toLocalDateStr } from "@/lib/dates";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { FEEDBACK_SHORT_MS } from "@/lib/constants/timings";

export function ProgressInput({
  goalId,
  initial,
  onUpdate,
}: {
  goalId: string;
  initial: number;
  onUpdate: (progress: number) => void;
}) {
  const ie = useInlineEdit<string>("");

  const commit = () => {
    const n = Math.min(100, Math.max(0, parseInt(ie.draft) || 0));
    ie.commit(async () => {
      await patchGoal(goalId, { progress: n });
      onUpdate(n);
    });
  };

  if (ie.saving) {
    return <Loader2 className="ui-spinner-xs text-text-muted" />;
  }

  if (ie.editing) {
    return (
      <input
        type="number"
        min={0}
        max={100}
        value={ie.draft}
        onChange={(e) => ie.setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") ie.cancel();
        }}
        autoFocus
        className="ui-input-inline border-border-strong w-12 px-1.5 py-0.5 text-xs text-text-primary text-right"
      />
    );
  }

  return (
    <button
      onClick={() => ie.start(String(initial))}
      className="ui-link-subtle tabular-nums"
      title="Click to edit progress"
    >
      {initial}%
    </button>
  );
}

export function DateInput({
  goalId,
  initial,
  onUpdate,
}: {
  goalId: string;
  initial: Date | null;
  onUpdate: (date: Date | null) => void;
}) {
  // Normalise to YYYY-MM-DD string for <input type="date">
  const toDateStr = (d: Date | null) =>
    d ? toLocalDateStr(new Date(d)) : "";

  const ie = useInlineEdit<string>(toDateStr(initial));
  const currentDate = initial ? new Date(initial) : null;
  const { label: deadlineText, overdue } = deadlineLabel(currentDate);

  const commit = (newVal: string) => {
    const newDate = newVal ? new Date(newVal) : null;
    ie.commit(async () => {
      await patchGoal(goalId, { targetDate: newDate ? newDate.toISOString() : null });
      onUpdate(newDate);
    });
  };

  if (ie.saving) return <Loader2 className="ui-spinner-xs text-text-muted" />;

  if (ie.editing) {
    return (
      <input
        type="date"
        value={ie.draft}
        onChange={(e) => ie.setDraft(e.target.value)}
        onBlur={() => commit(ie.draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(ie.draft);
          if (e.key === "Escape") ie.cancel();
        }}
        autoFocus
        className="ui-input-inline border-border-strong px-1.5 py-0.5 text-xs text-text-secondary"
      />
    );
  }

  if (currentDate) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => ie.start(toDateStr(initial))}
          className={`text-xs transition-colors hover:text-text-secondary ${overdue ? "text-status-negative" : "text-text-tertiary"}`}
          title="Click to change deadline"
        >
          {deadlineText}
        </button>
        <button
          onClick={() => commit("")}
          className="text-text-muted hover:text-text-secondary transition-colors ui-hover-reveal"
          title="Clear deadline"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => ie.start("")}
      className="ui-link-muted"
      title="Set deadline"
    >
      Set deadline
    </button>
  );
}


type GoalPromptProps = {
  title: string;
  description: string | null;
  progress: number;
  milestones: Milestone[];
  targetDate: Date | null;
  entityName: string | null;
};

function buildGoalPrompt({ title, description, progress, milestones, targetDate, entityName }: GoalPromptProps): string {
  const lines: string[] = [`Goal: ${title}`];
  if (description?.trim()) lines.push(`Description: ${description.trim()}`);
  lines.push(`Progress: ${progress}%`);
  if (milestones.length > 0) {
    const done = milestones.filter((m) => m.done).length;
    lines.push(`Milestones: ${done}/${milestones.length} done`);
    const next = milestones.find((m) => !m.done);
    if (next) lines.push(`Next milestone: ${next.title}`);
  }
  if (targetDate) {
    const { label } = deadlineLabel(targetDate);
    lines.push(`Target: ${label}`);
  }
  if (entityName) lines.push(`Project: ${entityName}`);
  lines.push("", "Please advance this goal. What concrete next steps can you take right now?");
  return lines.join("\n");
}

export function CopyGoalPromptButton(props: GoalPromptProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildGoalPrompt(props));
    setCopied(true);
    setTimeout(() => setCopied(false), FEEDBACK_SHORT_MS);
  };

  return (
    <button
      onClick={handleCopy}
      className="ui-hover-reveal ui-icon-btn p-1 rounded transition-all shrink-0 text-text-muted hover:text-accent-text"
      title="Copy goal as agent prompt"
    >
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-status-positive" /> : <Clipboard className="h-3.5 w-3.5" />}
    </button>
  );
}

export function SendToLokiButton(props: GoalPromptProps) {
  return (
    <LokiDispatchButton
      prompt={buildGoalPrompt(props)}
      title="Ask Loki about this goal"
      className="ui-hover-reveal ui-icon-btn p-1 rounded transition-all shrink-0 text-text-muted hover:text-status-positive"
    />
  );
}
