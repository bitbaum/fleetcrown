"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";

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
    start: (current: T) => {
      setDraft(current);
      setEditing(true);
    },
    /** Exit edit mode without saving. */
    cancel: () => setEditing(false),
    /**
     * Run the save action with saving-flag wrapping. Returns true on success,
     * false on failure. Exits edit mode only on success — leaves the editor
     * open on failure so the user can retry or cancel rather than silently
     * losing their input.
     */
    commit: async (action: () => Promise<void> | void): Promise<boolean> => {
      // Caller's equality / validation checks run before commit() is called
      // (see the usage example above — they short-circuit via ie.cancel()),
      // so the tick only fires on real save attempts.
      haptic();
      setSaving(true);
      try {
        await action();
        setEditing(false);
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
  };
}
