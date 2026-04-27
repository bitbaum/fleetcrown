"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, FIELD_INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ui/form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import type { CreatePersonInput } from "@/db/queries/people";

export function NewPersonButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreatePersonInput>({
    request: (body) => postJson("/api/people", body),
    errorLabel: "person",
  });

  const close = () => {
    setName(""); setDescription(""); setError(null);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    const ok = await create({
      name: name.trim(),
      description: description.trim() || undefined,
    });
    if (ok) close();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>

      {open && (
        <Modal onClose={close} size="sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Add Person</div>
            <button onClick={close} className="p-1 text-white/40 hover:text-white/70 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
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
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className={PRIMARY_BUTTON_CLASS}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
            ) : (
              <><Plus className="h-4 w-4" /> Add Person</>
            )}
          </button>
        </Modal>
      )}
    </>
  );
}
