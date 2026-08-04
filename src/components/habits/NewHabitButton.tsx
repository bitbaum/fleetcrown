"use client";

import { useAiForm } from "@fleet/ai-forms/react";
import { ModalForm } from "@/components/ui/modal-form";
import { Field } from "@/components/ui/form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { HABIT_FORM } from "@/config/ai-forms";

export function NewHabitButton() {
  const form = useAiForm({
    target: HABIT_FORM.key,
    fields: HABIT_FORM.fields,
    // A default, not user intent — HABIT_FORM marks it overridable so a fill
    // may replace it when the description implies a different cadence.
    initialValues: { frequency: HABIT_FREQUENCY.DAILY },
  });
  const { create, saving, error, setError } = useCreateMutation({
    request: (body: { title: string; frequency: HabitFrequency }) =>
      postJson("/api/habits", body),
    errorLabel: "habit",
  });

  const onReset = () => { form.reset(); setError(null); };
  const onSubmit = () => create({
    title: form.text("title").trim(),
    frequency: form.text("frequency") as HabitFrequency,
  });

  return (
    <ModalForm
      triggerLabel="New Habit"
      title="New Habit"
      submitLabel="Create Habit"
      savingLabel="Creating…"
      size="sm"
      canSubmit={!!form.text("title").trim()}
      saving={saving}
      error={error}
      onSubmit={onSubmit}
      onReset={onReset}
      assist={form}
      assistPlaceholder="Describe the habit and I'll fill this in…"
    >
      <Field label="Name" required aiTouched={form.isAiTouched("title")}>
        <input
          value={form.text("title")}
          onChange={(e) => form.setValue("title", e.target.value)}
          placeholder="What do you want to build consistently?"
          autoFocus
          className="ui-input"
        />
      </Field>

      <Field label="Frequency" aiTouched={form.isAiTouched("frequency")}>
        <select
          value={form.text("frequency")}
          onChange={(e) => form.setValue("frequency", e.target.value)}
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
