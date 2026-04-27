"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { INLINE_SAVE_CLASS } from "@/components/ui/form";
import { MaturityBar, StatusBadge } from "./project-badges";
import { useInlineEdit } from "@/hooks/use-inline-edit";

/** Inline-editable project name (h2 ↔ input). */
export function NameEditor({
  value,
  editable,
  onSave,
}: {
  value: string;
  editable: boolean;
  /** Should throw with a user-facing message on failure (e.g. duplicate name). */
  onSave: (next: string) => Promise<void>;
}) {
  const ie = useInlineEdit<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const commit = async () => {
    const trimmed = ie.draft.trim();
    if (!trimmed || trimmed === value) { ie.cancel(); return; }
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(trimmed);
      ie.cancel();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (ie.editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <input
            value={ie.draft}
            onChange={(e) => { ie.setDraft(e.target.value); setSaveError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { ie.cancel(); setSaveError(null); }
            }}
            autoFocus
            className={`text-base font-semibold bg-white/[0.06] border rounded px-2 py-0.5 focus:outline-none w-48 transition-colors ${saveError ? "border-red-400/60 focus:border-red-400" : "border-white/20 focus:border-white/35"}`}
          />
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40 shrink-0" />}
        </div>
        {saveError && <p className="text-xs text-red-400">{saveError}</p>}
      </div>
    );
  }

  return (
    <h2
      className={`text-base font-semibold truncate ${editable ? "cursor-text hover:text-white/80 transition-colors" : ""}`}
      onClick={editable ? () => ie.start(value) : undefined}
      title={editable ? "Click to rename" : undefined}
    >
      {value}
    </h2>
  );
}

/** Inline-editable description (button ↔ textarea + Save/Cancel). */
export function DescriptionEditor({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string) => Promise<void>;
}) {
  const ie = useInlineEdit<string>("");

  const commit = () => ie.commit(() => onSave(ie.draft.trim()));

  if (ie.editing) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <textarea
          value={ie.draft}
          onChange={(e) => ie.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") ie.cancel();
            if (e.key === "Enter" && e.metaKey) commit();
          }}
          autoFocus
          rows={2}
          placeholder="Add a description…"
          className="w-full bg-white/[0.04] border border-white/15 rounded px-2 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/30 resize-none transition-colors"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={commit}
            disabled={ie.saving}
            className={INLINE_SAVE_CLASS}
          >
            {ie.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </button>
          <button
            onClick={ie.cancel}
            className="text-xs text-white/30 hover:text-white/60 px-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => ie.start(value ?? "")}
      className="w-full text-left text-xs text-white/40 hover:text-white/60 mt-0.5 leading-relaxed transition-colors"
      title="Click to edit description"
    >
      {value ?? <span className="italic text-white/20">Add a description…</span>}
    </button>
  );
}

/** Inline-editable status pill. */
export function StatusEditor({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string) => Promise<void>;
}) {
  const ie = useInlineEdit<string>("");

  const commit = () => {
    const trimmed = ie.draft.trim();
    if (!trimmed) { ie.cancel(); return; }
    ie.commit(() => onSave(trimmed));
  };

  if (ie.editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          value={ie.draft}
          onChange={(e) => ie.setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") ie.cancel(); }}
          onBlur={commit}
          autoFocus
          placeholder="e.g. Production"
          className="bg-white/[0.06] border border-white/20 rounded px-2 py-0.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/35 w-36"
        />
        {ie.saving && <Loader2 className="h-3 w-3 animate-spin text-white/30 shrink-0" />}
      </div>
    );
  }

  return (
    <button onClick={() => ie.start(value ?? "")} title="Click to edit status" className="flex items-center">
      {value
        ? <StatusBadge value={value} />
        : <span className="text-[10px] text-white/20 hover:text-white/50 transition-colors border border-dashed border-white/15 rounded px-1.5 py-0.5">+ status</span>}
    </button>
  );
}

/** Inline-editable maturity score (1–10 slider). */
export function MaturityEditor({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string) => Promise<void>;
}) {
  const ie = useInlineEdit<number>(5);

  const start = () => {
    const match = value?.match(/^(\d+)\/10/);
    ie.start(match ? parseInt(match[1]) : 5);
  };

  if (ie.editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={10}
          value={ie.draft}
          onChange={(e) => ie.setDraft(Number(e.target.value))}
          className="w-24 accent-emerald-500"
        />
        <span className="text-[10px] text-white/50 w-8">{ie.draft}/10</span>
        <button
          onClick={() => ie.commit(() => onSave(`${ie.draft}/10`))}
          disabled={ie.saving}
          className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-[10px] transition-colors"
        >
          {ie.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </button>
        <button onClick={ie.cancel} className="text-[10px] text-white/30 hover:text-white/60">✕</button>
      </div>
    );
  }

  return (
    <button onClick={start} title="Click to edit maturity" className="flex items-center">
      {value
        ? <MaturityBar value={value} />
        : <span className="text-[10px] text-white/20 hover:text-white/50 transition-colors border border-dashed border-white/15 rounded px-1.5 py-0.5">+ maturity</span>}
    </button>
  );
}
