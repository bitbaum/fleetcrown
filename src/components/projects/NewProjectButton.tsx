"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal-form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import type { CreateProjectInput } from "@/db/queries/projects";

interface Props {
  /** Open the create dialog immediately on mount (deep link: /projects?new=1). */
  autoOpen?: boolean;
  /** Prefill the name field (deep link: /projects?new=1&name=…). */
  initialName?: string;
}

export function NewProjectButton({ autoOpen = false, initialName = "" }: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreateProjectInput>({
    request: (body) => postJson("/api/projects", body),
    errorLabel: "project",
  });

  // Deep-link params are one-shot: strip them from the URL so a reload or
  // back-navigation doesn't reopen the dialog after the user dismissed it.
  useEffect(() => {
    if (!autoOpen) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    url.searchParams.delete("name");
    window.history.replaceState(null, "", url.toString());
  }, [autoOpen]);

  const onReset = () => { setName(""); setDescription(""); setError(null); };

  const onSubmit = () => create({ name: name.trim(), description: description.trim() || undefined });

  return (
    <ModalForm
      title="Add Project"
      submitLabel="Add Project"
      savingLabel="Adding…"
      defaultOpen={autoOpen}
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
          className="ui-input"
        />
      </Field>
      <Field label="Description">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Bitcoin marketplace"
          className="ui-input"
        />
      </Field>
    </ModalForm>
  );
}
