"use client";

import { useState } from "react";
import { Target, CheckCircle, Loader2, X, Plus, Check, FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow, isPast } from "date-fns";
import type { GoalWithChildren } from "@/db/queries/goals";
import { DeleteGoalButton } from "./DeleteGoalButton";

async function patchGoal(id: string, patch: Record<string, unknown>) {
  const res = await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update goal");
  return res.json();
}

function ProgressInput({
  goalId,
  initial,
  onUpdate,
}: {
  goalId: string;
  initial: number;
  onUpdate: (progress: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initial));
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    const n = Math.min(100, Math.max(0, parseInt(value) || 0));
    setSaving(true);
    try {
      await patchGoal(goalId, { progress: n });
      onUpdate(n);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (saving) {
    return <Loader2 className="h-3 w-3 animate-spin text-white/30" />;
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="w-12 bg-white/[0.06] border border-white/20 rounded px-1.5 py-0.5 text-xs text-white/80 text-right focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => { setValue(String(initial)); setEditing(true); }}
      className="text-xs text-white/40 hover:text-white/70 transition-colors tabular-nums"
      title="Click to edit progress"
    >
      {initial}%
    </button>
  );
}

function DateInput({
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
    d ? new Date(d).toISOString().split("T")[0] : "";

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toDateStr(initial));
  const [saving, setSaving] = useState(false);
  const currentDate = initial ? new Date(initial) : null;
  const overdue = currentDate && isPast(currentDate);

  const commit = async (newVal: string) => {
    const newDate = newVal ? new Date(newVal) : null;
    setSaving(true);
    try {
      await patchGoal(goalId, { targetDate: newDate ? newDate.toISOString() : null });
      onUpdate(newDate);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (saving) return <Loader2 className="h-3 w-3 animate-spin text-white/30" />;

  if (editing) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(value);
          if (e.key === "Escape") { setEditing(false); setValue(toDateStr(initial)); }
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
          onClick={() => { setValue(toDateStr(initial)); setEditing(true); }}
          className={`text-xs transition-colors hover:text-white/70 ${overdue ? "text-red-400" : "text-white/40"}`}
          title="Click to change deadline"
        >
          {overdue ? "Overdue" : "Due"} {formatDistanceToNow(currentDate, { addSuffix: true })}
        </button>
        <button
          onClick={() => commit("")}
          className="text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
          title="Clear deadline"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(""); setEditing(true); }}
      className="text-xs text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
      title="Set deadline"
    >
      Set deadline
    </button>
  );
}

type Milestone = { title: string; done: boolean; date?: string };

function AddMilestoneInline({
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
        className="flex items-center gap-1.5 text-xs text-white/20 hover:text-emerald-400 transition-colors mt-1"
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
        className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
      />
      <button
        onClick={save}
        disabled={!value.trim() || saving}
        className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 text-white transition-colors shrink-0"
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

function MilestoneRow({
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
          <CheckCircle className="h-3.5 w-3.5 text-green-400/70 hover:text-green-400 transition-colors" />
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

export function GoalCard({ goal, depth }: { goal: GoalWithChildren; depth: number }) {
  const [status, setStatus] = useState(goal.status ?? "active");
  const [progress, setProgress] = useState(goal.progress ?? 0);
  const [milestones, setMilestones] = useState<Milestone[]>(
    (goal.milestones as Milestone[]) ?? [],
  );
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

  const isCompleted = status === "completed";
  const milestoneDone = milestones.filter((m) => m.done).length;
  const milestoneTotal = milestones.length;
  const hasMilestones = milestoneTotal > 0;

  const toggleComplete = async () => {
    if (togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = isCompleted ? "active" : "completed";
    const newProgress = newStatus === "completed" ? 100 : progress;
    try {
      await patchGoal(goal.id, { status: newStatus, progress: newProgress });
      setStatus(newStatus);
      if (newStatus === "completed") setProgress(100);
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
              <Loader2 className="h-5 w-5 animate-spin text-white/30" />
            ) : isCompleted ? (
              <CheckCircle className="h-5 w-5 text-green-400 hover:text-green-300 transition-colors" />
            ) : depth === 0 ? (
              <Target className="h-5 w-5 text-emerald-400 hover:text-green-400 transition-colors" />
            ) : (
              <div className="h-4 w-4 rounded border border-white/25 hover:border-white/60 transition-colors mt-0.5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {editingTitle ? (
                savingTitle ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/30" />
                ) : (
                  <input
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleValue(goal.title); } }}
                    autoFocus
                    className={`bg-white/[0.06] border border-white/20 rounded px-2 py-0.5 focus:outline-none focus:border-white/35 ${depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium"}`}
                  />
                )
              ) : (
                <div
                  className={`cursor-text hover:text-white transition-colors ${depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium text-white/80"}`}
                  onClick={() => !isCompleted && setEditingTitle(true)}
                  title={isCompleted ? undefined : "Click to edit title"}
                >
                  {titleValue}
                </div>
              )}
              {status && status !== "active" && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/40">
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
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={commitDesc} disabled={savingDesc}
                    className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 text-white">
                    {savingDesc ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                  </button>
                  <button onClick={() => { setEditingDesc(false); setDescValue(description ?? ""); }}
                    className="p-1.5 text-white/25 hover:text-white/60">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => !isCompleted && (setDescValue(description ?? ""), setEditingDesc(true))}
                className={`text-xs md:text-sm mt-1 text-left w-full transition-colors ${
                  isCompleted ? "cursor-default" :
                  description ? "text-white/40 hover:text-white/60" : "text-white/15 hover:text-white/30 italic"
                }`}
                disabled={isCompleted}
                title={isCompleted ? undefined : "Click to edit description"}
              >
                {description ?? "Add a description…"}
              </button>
            )}
            {goal.entityName && (
              <div className="flex items-center gap-1 mt-1">
                <FolderKanban className="h-3 w-3 text-emerald-400/50" />
                <span className="text-xs text-emerald-400/60">{goal.entityName}</span>
              </div>
            )}

            {/* Progress bar */}
            {!isCompleted && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  {hasMilestones ? (
                    <span className="text-xs text-white/40">{progress}%</span>
                  ) : (
                    <ProgressInput goalId={goal.id} initial={progress} onUpdate={setProgress} />
                  )}
                  <DateInput
                    goalId={goal.id}
                    initial={targetDate}
                    onUpdate={setTargetDate}
                  />
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full transition-all"
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
                  <div className="text-xs text-white/30 mt-1">
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
        <div className="mt-2 ml-6 pl-5 border-l-2 border-emerald-500/20 space-y-2">
          {goal.children.map((child) => (
            <GoalCard key={child.id} goal={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
