"use client";

import { useState } from "react";
import type { GoalWithChildren } from "@/db/queries/goals";
import { createGoal } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { Field, FIELD_INPUT_CLASS } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal-form";
import { useCreateMutation } from "@/hooks/use-create-mutation";

export function NewGoalButton({ goals }: { goals: GoalWithChildren[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [parentGoalId, setParentGoalId] = useState("");
  const { create, saving, error, setError } = useCreateMutation({
    request: createGoal,
    errorLabel: "goal",
  });

  const onReset = () => {
    setTitle(""); setDescription(""); setTargetDate(""); setParentGoalId(""); setError(null);
  };

  const onSubmit = () => create({
    title: title.trim(),
    description: description.trim() || undefined,
    targetDate: targetDate || undefined,
    parentGoalId: parentGoalId || undefined,
  });

  // Flatten goal tree for parent selector (exclude completed goals)
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
    <ModalForm
      triggerLabel="New Goal"
      title="New Goal"
      submitLabel="Create Goal"
      savingLabel="Creating…"
      size="md"
      canSubmit={!!title.trim()}
      saving={saving}
      error={error}
      onSubmit={onSubmit}
      onReset={onReset}
    >
      <Field label="Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
    </ModalForm>
  );
}
