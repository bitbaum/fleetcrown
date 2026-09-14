"use client";

import { useState } from "react";
import { patchJson, postJson, throwApiError } from "@/lib/api/fetch";
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";

/**
 * Row-level feedback actions, shared by the per-project inbox section and the
 * cross-project /feedback inbox. All routes are id-scoped, so the hook needs
 * no project context — the caller only supplies how to reload its list.
 */
export function useFeedbackActions(refetch: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which row the error belongs to. "Already working on this — open Control
  // to watch" used to render at the top of a page whose rows each fill a
  // phone screen, so the reader saw a red line about a button they pressed
  // four screens further down. The row that failed shows its own failure.
  const [errorId, setErrorId] = useState<string | null>(null);

  async function act(id: string, run: () => Promise<Response>, fallback: string) {
    setBusyId(id);
    setError(null);
    setErrorId(null);
    try {
      const res = await run();
      if (!res.ok) await throwApiError(res, fallback);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
      setErrorId(id);
    } finally {
      setBusyId(null);
    }
  }

  const dispatchFix = (id: string, note?: string) =>
    act(
      id,
      () => postJson(`/api/feedback/${id}/dispatch`, note ? { note } : {}),
      "Could not queue the fix",
    );

  const setStatus = (id: string, status: FeedbackStatus) =>
    act(id, () => patchJson(`/api/feedback/${id}`, { status }), "Update failed");

  const resolve = (id: string) => setStatus(id, FEEDBACK_STATUS.RESOLVED);
  const archive = (id: string) => setStatus(id, FEEDBACK_STATUS.ARCHIVED);
  const reopen = (id: string) => setStatus(id, FEEDBACK_STATUS.NEW);

  const feature = (id: string, featured: boolean) =>
    act(id, () => patchJson(`/api/feedback/${id}`, { featured }), "Update failed");

  return {
    busyId,
    error,
    /** The row `error` belongs to; null when the failure was not row-scoped. */
    errorId,
    // A caller reporting its own, non-row failure (Synthesize, Implement all)
    // must not leave a stale row id pointing the message at the wrong card.
    setError: (message: string | null) => {
      setError(message);
      setErrorId(null);
    },
    act,
    dispatchFix,
    setStatus,
    resolve,
    archive,
    reopen,
    feature,
  };
}
