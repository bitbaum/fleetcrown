"use client";

import { useState } from "react";
import { Field, FIELD_INPUT_CLASS } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal-form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import type { CreatePersonInput } from "@/db/queries/people";

export function NewPersonButton({ onCreated }: { onCreated?: () => void } = {}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreatePersonInput>({
    request: (body) => postJson("/api/people", body),
    errorLabel: "person",
  });

  const onReset = () => { setName(""); setDescription(""); setError(null); };

  const onSubmit = async () => {
    const ok = await create({ name: name.trim(), description: description.trim() || undefined });
    if (ok) onCreated?.();
    return ok;
  };

  return (
    <ModalForm
      title="Add Person"
      submitLabel="Add Person"
      savingLabel="Adding…"
      canSubmit={!!name.trim()}
      saving={saving}
      error={error}
      onSubmit={onSubmit}
      onReset={onReset}
    >
      <Field label="Name" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          autoFocus
          className={FIELD_INPUT_CLASS}
        />
      </Field>
      <Field label="Notes">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Met at ETH conference"
          className={FIELD_INPUT_CLASS}
        />
      </Field>
    </ModalForm>
  );
}
