"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { FIELD_INPUT_CLASS_COMPACT } from "@/components/ui/form";
import { postJson } from "@/lib/api/fetch";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import type { CreateCommitmentInput } from "@/db/queries/today";

export function AddCommitmentButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [financialImpact, setFinancialImpact] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreateCommitmentInput>({
    request: (body) => postJson("/api/commitments", body),
    errorLabel: "commitment",
  });

  const reset = () => {
    setDescription("");
    setDueDate("");
    setFinancialImpact("");
    setError(null);
  };

  const submit = async () => {
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    const ok = await create({
      description,
      dueDate: dueDate || undefined,
      financialImpact: financialImpact || undefined,
    });
    if (ok) { reset(); setOpen(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-status-positive transition-colors mt-2"
      >
        <Plus className="h-3.5 w-3.5" /> Add commitment
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2">
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What did you commit to? *"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); reset(); } }}
        className={`w-full ${FIELD_INPUT_CLASS_COMPACT}`}
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={FIELD_INPUT_CLASS_COMPACT}
        />
        <input
          value={financialImpact}
          onChange={(e) => setFinancialImpact(e.target.value)}
          placeholder="Financial impact (optional)"
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); reset(); } }}
          className={`flex-1 ${FIELD_INPUT_CLASS_COMPACT}`}
        />
      </div>
      {error && <p className="text-xs text-status-negative">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || !description.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded ui-btn-confirm disabled:opacity-30 text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
