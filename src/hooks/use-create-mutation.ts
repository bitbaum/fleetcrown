"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";

/**
 * Wraps the create-via-POST flow that every "New X" button shares: track
 * saving + error state, await the response, decode `{ ok, error }`, call
 * `router.refresh()` on success, and surface a typed error string.
 *
 * Fires a haptic tick at the start of every `create()` call — by this point
 * the caller has already passed its own validation gates (e.g. ModalForm's
 * canSubmit, AddCommitmentButton's description-required check), so the tick
 * only confirms valid submission attempts.
 *
 * Returns `{ create, saving, error, setError }` — `create(body)` resolves
 * to `true` on success so the caller can decide whether to close its modal.
 */
export function useCreateMutation<TBody>({
  request,
  errorLabel = "item",
}: {
  request: (body: TBody) => Promise<Response>;
  /** Used in the fallback error message: "Failed to create <errorLabel>". */
  errorLabel?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (body: TBody): Promise<boolean> => {
    haptic();
    setSaving(true);
    setError(null);
    try {
      const res = await request(body);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? `Failed to create ${errorLabel}`);
        return false;
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { create, saving, error, setError };
}
