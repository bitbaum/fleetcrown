"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface Props {
  /** Trigger button label shown next to Plus icon. Default: "Add". */
  triggerLabel?: string;
  /** Modal header title. */
  title: string;
  /** Submit button text when idle. */
  submitLabel: string;
  /** Submit button text while saving. Default: "Saving…". */
  savingLabel?: string;
  /** Modal width. Default: "sm". */
  size?: "sm" | "md" | "lg";
  /** Disables submit button (e.g. required field is empty). */
  canSubmit: boolean;
  saving: boolean;
  error: string | null;
  /**
   * Called on submit. Return true to close + reset; false to keep modal open
   * (leaving the error state for useCreateMutation to populate).
   */
  onSubmit: () => Promise<boolean>;
  /**
   * Called whenever the modal closes — both on success and on manual dismiss.
   * Use this to reset local field state and clear errors.
   */
  onReset: () => void;
  /** Form fields rendered inside the modal. */
  children: React.ReactNode;
}

export function ModalForm({
  triggerLabel = "Add",
  title,
  submitLabel,
  savingLabel = "Saving…",
  size = "sm",
  canSubmit,
  saving,
  error,
  onSubmit,
  onReset,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  const close = () => {
    setOpen(false);
    onReset();
  };

  const handleSubmit = async () => {
    const ok = await onSubmit();
    if (ok) close();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ui-btn-confirm"
      >
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </button>

      {open && (
        <Modal onClose={close} size={size}>
          {/* form: Enter in any <input> submits natively; textarea doesn't */}
          <form
            onSubmit={(e) => { e.preventDefault(); if (canSubmit && !saving) handleSubmit(); }}
            className="contents"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{title}</div>
              <button type="button" onClick={close} className="p-1 text-text-tertiary hover:text-text-secondary rounded">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">{children}</div>

            {error && (
              <div className="ui-box-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="ui-btn-submit"
            >
              {saving ? (
                <><Loader2 className="ui-spinner" /> {savingLabel}</>
              ) : (
                <><Plus className="h-4 w-4" /> {submitLabel}</>
              )}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
