"use client";

import { useState } from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Field } from "@/components/ui/form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";

export function NewHabitButton() {
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>(HABIT_FREQUENCY.DAILY);
  const { create, saving, error, setError } = useCreateMutation({
    request: (body: { title: string; frequency: HabitFrequency }) =>
      postJson("/api/habits", body),
    errorLabel: "habit",
  });

  const onReset = () => { setTitle(""); setFrequency(HABIT_FREQUENCY.DAILY); setError(null); };
  const onSubmit = () => create({ title: title.trim(), frequency });

  return (
    <ModalForm
      triggerLabel="New Habit"
      title="New Habit"
      submitLabel="Create Habit"
      savingLabel="Creating…"
      size="sm"
      canSubmit={!!title.trim()}
      saving={saving}
      error={error}
      onSubmit={onSubmit}
      onReset={onReset}
    >
      <Field label="Name" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to build consistently?"
          autoFocus
          className="ui-input"
        />
      </Field>

      <Field label="Frequency">
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
          className="ui-input"
        >
          {Object.values(HABIT_FREQUENCY).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </Field>
    </ModalForm>
  );
}
