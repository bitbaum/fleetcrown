"use client";

import { useState } from "react";
import { CheckCircle, Loader2, Plus, X } from "lucide-react";
import type { Milestone } from "@/db/schema/goals";
import { patchGoal } from "@/lib/api/goals";
import { deadlineLabel, toLocalDateStr } from "@/lib/dates";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";

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
    return <Loader2 className="h-3 w-3 animate-spin text-white/30" />;
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
        className="w-12 bg-white/[0.06] border border-white/20 rounded px-1.5 py-0.5 text-xs text-white/80 text-right focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => ie.start(String(initial))}
      className="text-xs text-white/40 hover:text-white/70 transition-colors tabular-nums"
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

  if (ie.saving) return <Loader2 className="h-3 w-3 animate-spin text-white/30" />;

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
        className="text-xs bg-white/[0.06] border border-white/20 rounded px-1.5 py-0.5 text-white/70 focus:outline-none focus:border-white/35"
      />
    );
  }

  if (currentDate) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => ie.start(toDateStr(initial))}
          className={`text-xs transition-colors hover:text-white/70 ${overdue ? "text-status-negative" : "text-white/40"}`}
          title="Click to change deadline"
        >
          {deadlineText}
        </button>
        <button
          onClick={() => commit("")}
          className="text-white/20 hover:text-white/50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
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
      className="text-xs text-white/20 hover:text-white/50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
      title="Set deadline"
    >
      Set deadline
    </button>
  );
}

export function AddMilestoneInline({
  goalId,
  milestones,
  onAdded,
}: {
  goalId: string;
  milestones: Milestone[];
  onAdded: (updated: Milestone[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const title = value.trim();
    if (!title || saving) return;
    setSaving(true);
    const updated = [...milestones, { title, done: false }];
    try {
      await patchGoal(goalId, { milestones: updated });
      onAdded(updated);
      setValue("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-white/35 hover:text-status-positive transition-colors mt-1"
      >
        <Plus className="h-3 w-3" /> Add milestone
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setOpen(false); setValue(""); }
        }}
        placeholder="Milestone title…"
        autoFocus
        className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
      />
      <button
        onClick={save}
        disabled={!value.trim() || saving}
        className="p-1.5 rounded ui-btn-confirm disabled:opacity-30 transition-colors shrink-0"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      </button>
      <button
        onClick={() => { setOpen(false); setValue(""); }}
        className="p-1.5 rounded text-white/25 hover:text-white/60 transition-colors shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function MilestoneRow({
  milestone,
  goalId,
  allMilestones,
  index,
  onUpdate,
}: {
  milestone: Milestone;
  goalId: string;
  allMilestones: Milestone[];
  index: number;
  onUpdate: (milestones: Milestone[], progress: number) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const toggle = async () => {
    if (toggling) return;
    setToggling(true);
    const updated = allMilestones.map((m, i) =>
      i === index ? { ...m, done: !m.done } : m,
    );
    const doneCount = updated.filter((m) => m.done).length;
    const progress = updated.length > 0 ? Math.round((doneCount / updated.length) * 100) : 0;
    try {
      await patchGoal(goalId, { milestones: updated, progress });
      onUpdate(updated, progress);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs md:text-sm">
      <button
        onClick={toggle}
        disabled={toggling}
        className="shrink-0 flex items-center justify-center disabled:opacity-50"
      >
        {toggling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />
        ) : milestone.done ? (
          <CheckCircle className="h-3.5 w-3.5 text-status-positive/70 hover:text-status-positive transition-colors" />
        ) : (
          <div className="h-3.5 w-3.5 rounded-full border border-white/25 hover:border-white/60 transition-colors" />
        )}
      </button>
      <span className={milestone.done ? "text-white/35 line-through" : "text-white/60"}>
        {milestone.title}
      </span>
    </div>
  );
}
