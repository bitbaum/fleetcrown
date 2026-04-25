"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import type { GoalWithChildren } from "@/db/queries/goals";
import { createGoal, type CreateGoalBody } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { Modal } from "@/components/ui/modal";
import { Field, FIELD_INPUT_CLASS } from "@/components/ui/form";
import { useCreateMutation } from "@/hooks/use-create-mutation";

export function NewGoalButton({ goals }: { goals: GoalWithChildren[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [parentGoalId, setParentGoalId] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreateGoalBody>({
    request: createGoal,
    errorLabel: "goal",
  });

  const close = () => {
    setTitle(""); setDescription(""); setTargetDate(""); setParentGoalId("");
    setError(null);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    const ok = await create({
      title: title.trim(),
      description: description.trim() || undefined,
      targetDate: targetDate || undefined,
      parentGoalId: parentGoalId || undefined,
    });
    if (ok) close();
  };

  // Flatten goal tree for parent selector
  const flatGoals: Array<{ id: string; title: string; depth: number }> = [];
  function flatten(list: GoalWithChildren[], depth: number) {
    for (const g of list) {
      if (g.status !== GOAL_STATUS.COMPLETED) {
        flatGoals.push({ id: g.id, title: g.title, depth });
        flatten(g.children, depth + 1);
      }
    }
  }
  flatten(goals, 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Goal
      </button>

      {open && (
        <Modal onClose={close} size="md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">New Goal</div>
            <button onClick={close} className="p-1 text-white/40 hover:text-white/70 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleCreate(); }}
                placeholder="What are you working toward?"
                autoFocus
                className={FIELD_INPUT_CLASS}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context or motivation"
                rows={2}
                className={`${FIELD_INPUT_CLASS} resize-none`}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Target Date">
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className={FIELD_INPUT_CLASS}
                />
              </Field>

              {flatGoals.length > 0 && (
                <Field label="Parent Goal">
                  <select
                    value={parentGoalId}
                    onChange={(e) => setParentGoalId(e.target.value)}
                    className={FIELD_INPUT_CLASS}
                  >
                    <option value="">— None —</option>
                    {flatGoals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {"  ".repeat(g.depth)}{g.depth > 0 ? "↳ " : ""}{g.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

          <button
            onClick={handleCreate}
            disabled={saving || !title.trim()}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              <><Plus className="h-4 w-4" /> Create Goal</>
            )}
          </button>
        </Modal>
      )}
    </>
  );
}
