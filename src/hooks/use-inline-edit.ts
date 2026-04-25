"use client";

import { useState } from "react";

/**
 * Shared state machine for inline-edit toggles (display ↔ <input>).
 * Tracks `editing`, a typed `draft`, and a `saving` flag. Validation /
 * transform / equality checks stay at the call site — this hook only
 * owns the lifecycle.
 *
 * Usage:
 *   const ie = useInlineEdit<string>("");
 *   const handleCommit = () => {
 *     const trimmed = ie.draft.trim();
 *     if (!trimmed || trimmed === value) { ie.cancel(); return; }
 *     ie.commit(() => onSave(trimmed));
 *   };
 *   if (ie.editing) return <input value={ie.draft} onChange={(e) => ie.setDraft(e.target.value)} ... />;
 *   return <h2 onClick={() => ie.start(value)}>{value}</h2>;
 */
export function useInlineEdit<T>(initial: T) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(initial);
  const [saving, setSaving] = useState(false);

  return {
    editing,
    draft,
    saving,
    setDraft,
    /** Enter edit mode, seeding the draft with `current`. */
    start: (current: T) => { setDraft(current); setEditing(true); },
    /** Exit edit mode without saving. */
    cancel: () => setEditing(false),
    /**
     * Run the save action with saving-flag wrapping. Exits edit mode
     * after the action resolves (success or error).
     */
    commit: async (action: () => Promise<void> | void) => {
      setSaving(true);
      try { await action(); } finally {
        setSaving(false);
        setEditing(false);
      }
    },
  };
}
