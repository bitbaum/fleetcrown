"use client";

import { useState } from "react";
import { Target, CheckCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { GoalWithChildren } from "@/db/queries/goals";

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

type Milestone = { title: string; done: boolean; date?: string };

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
  const [togglingStatus, setTogglingStatus] = useState(false);

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
      <Card className={isCompleted ? "opacity-60" : ""}>
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
              <div className={depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium text-white/80"}>
                {goal.title}
              </div>
              {status && status !== "active" && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                  {status}
                </span>
              )}
            </div>
            {goal.description && (
              <div className="text-xs md:text-sm text-white/40 mt-1">{goal.description}</div>
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
                  {goal.targetDate && (
                    <span className="text-xs text-white/40">
                      Target: {formatDistanceToNow(new Date(goal.targetDate), { addSuffix: true })}
                    </span>
                  )}
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
            {milestoneTotal > 0 && (
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
                <div className="text-xs text-white/30 mt-1">
                  {milestoneDone}/{milestoneTotal} milestones
                </div>
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
