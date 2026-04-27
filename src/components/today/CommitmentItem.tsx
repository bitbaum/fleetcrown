"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pencil, X, Check, Loader2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { FulfillCommitmentButton } from "./FulfillCommitmentButton";
import { DeleteCommitmentButton } from "./DeleteCommitmentButton";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";
import { patchJson } from "@/lib/api/fetch";

type CommitmentItemProps = {
  id: string;
  description: string;
  dueDate: Date | null;
  financialImpact: string | null;
};

export function CommitmentItem({ id, description, dueDate, financialImpact }: CommitmentItemProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(description);
  const [date, setDate] = useState(dueDate ? format(new Date(dueDate), "yyyy-MM-dd") : "");
  const [impact, setImpact] = useState(financialImpact ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOverdue = dueDate && new Date(dueDate) < new Date();

  const save = async () => {
    if (!desc.trim()) { setError("Description required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await patchJson(`/api/commitments/${id}`, {
        description: desc,
        dueDate: date || null,
        financialImpact: impact || null,
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to save");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDesc(description);
    setDate(dueDate ? format(new Date(dueDate), "yyyy-MM-dd") : "");
    setImpact(financialImpact ?? "");
    setError("");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex gap-3 items-start">
        <div className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5 min-w-0">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
            className="w-full bg-white/[0.04] border border-white/15 rounded px-2 py-1 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:border-white/30"
          />
          <div className="flex gap-1.5">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD_INPUT_CLASS_TIGHT}
            />
            <input
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              placeholder="Financial impact"
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving || !desc.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/70 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-medium transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button onClick={cancel} className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60">
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3 items-start">
      {isOverdue ? (
        <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      ) : (
        <div className="h-4 w-4 rounded-full border border-white/20 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm md:text-base line-clamp-2">{description}</div>
        {dueDate && (
          <div className={`text-xs md:text-sm ${isOverdue ? "text-red-400" : "text-white/40"}`}>
            {isOverdue ? "Overdue" : "Due"}{" "}
            {formatDistanceToNow(new Date(dueDate), { addSuffix: true })}
          </div>
        )}
        {financialImpact && (
          <div className="text-xs md:text-sm text-amber-400/70">{financialImpact}</div>
        )}
      </div>
      <div className="flex gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          title="Edit commitment"
          className="p-1.5 rounded text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <FulfillCommitmentButton commitmentId={id} />
        <DeleteCommitmentButton commitmentId={id} />
      </div>
    </div>
  );
}
