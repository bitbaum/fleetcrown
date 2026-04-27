"use client";

import { useState } from "react";
import { Field, FIELD_INPUT_CLASS } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal-form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import type { CreateProjectInput } from "@/db/queries/projects";

export function NewProjectButton() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreateProjectInput>({
    request: (body) => postJson("/api/projects", body),
    errorLabel: "project",
  });

  const onReset = () => { setName(""); setDescription(""); setError(null); };

  const onSubmit = () => create({ name: name.trim(), description: description.trim() || undefined });

  return (
    <ModalForm
      title="Add Project"
      submitLabel="Add Project"
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
          placeholder="e.g. OrangeCat"
          autoFocus
          className={FIELD_INPUT_CLASS}
        />
      </Field>
      <Field label="Description">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Bitcoin marketplace"
          className={FIELD_INPUT_CLASS}
        />
      </Field>
    </ModalForm>
  );
}
