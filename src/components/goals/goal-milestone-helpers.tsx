"use client";

import { useState } from "react";
import { CheckCircle, Loader2, Plus, X } from "lucide-react";
import type { Milestone } from "@/db/schema/goals";
import { patchGoal } from "@/lib/api/goals";

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
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-status-positive transition-colors mt-1"
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
        className="flex-1 ui-input-tight"
      />
      <button
        onClick={save}
        disabled={!value.trim() || saving}
        className="ui-btn-confirm-icon shrink-0"
      >
        {saving ? <Loader2 className="ui-spinner-xs" /> : <Plus className="h-3 w-3" />}
      </button>
      <button
        onClick={() => { setOpen(false); setValue(""); }}
        className="ui-btn-inline-cancel"
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
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(milestone.title);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const saveRename = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === milestone.title) {
      setEditing(false);
      setEditTitle(milestone.title);
      return;
    }
    setSavingEdit(true);
    const updated = allMilestones.map((m, i) =>
      i === index ? { ...m, title: trimmed } : m,
    );
    const doneCount = updated.filter((m) => m.done).length;
    const progress = updated.length > 0 ? Math.round((doneCount / updated.length) * 100) : 0;
    try {
      await patchGoal(goalId, { milestones: updated, progress });
      onUpdate(updated, progress);
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteMilestone = async () => {
    setDeleting(true);
    const updated = allMilestones.filter((_, i) => i !== index);
    const doneCount = updated.filter((m) => m.done).length;
    const progress = updated.length > 0 ? Math.round((doneCount / updated.length) * 100) : 0;
    try {
      await patchGoal(goalId, { milestones: updated, progress });
      onUpdate(updated, progress);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs md:text-sm group">
      <button
        onClick={toggle}
        disabled={toggling}
        className="shrink-0 h-11 w-11 flex items-center justify-center disabled:opacity-50 rounded"
      >
        {toggling ? (
          <Loader2 className="ui-spinner-sm text-text-muted" />
        ) : milestone.done ? (
          <CheckCircle className="h-4 w-4 text-status-positive/70 hover:text-status-positive transition-colors" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-border-strong hover:border-border-interactive transition-colors" />
        )}
      </button>
      {editing ? (
        <div className="flex flex-1 items-center gap-1">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename();
              if (e.key === "Escape") { setEditing(false); setEditTitle(milestone.title); }
            }}
            autoFocus
            className="flex-1 ui-input-tight text-xs"
          />
          {savingEdit && <Loader2 className="ui-spinner-xs shrink-0 text-text-muted" />}
        </div>
      ) : (
        <>
          <span
            onClick={() => setEditing(true)}
            className={`flex-1 cursor-text ${milestone.done ? "text-text-tertiary line-through" : "text-text-secondary"}`}
            title="Click to rename"
          >
            {milestone.title}
          </span>
          <button
            onClick={deleteMilestone}
            disabled={deleting}
            className="sm:opacity-0 sm:group-hover:opacity-100 ui-icon-btn transition-opacity shrink-0 p-1 rounded hover:text-status-negative text-text-muted disabled:opacity-50"
            title="Remove milestone"
          >
            {deleting ? <Loader2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
          </button>
        </>
      )}
    </div>
  );
}
