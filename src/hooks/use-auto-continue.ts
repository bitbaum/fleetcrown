"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "@/lib/api/fetch";

/**
 * Per-project continuation permission persisted by the control API. A browser
 * may render the setting, but does not own operational authorization.
 */
export function useAutoContinue(tab: string) {
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson<{ enabled: boolean }>(`/api/control/auto-continue?tab=${encodeURIComponent(tab)}`)
      .then((result) => { if (!cancelled) setEnabled(result.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  const toggle = useCallback(async () => {
    if (saving) return;
    const previous = enabled;
    const next = !previous;
    setEnabled(next);
    setSaving(true);
    try {
      const response = await postJson("/api/control/auto-continue", { tab, enabled: next });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!next) await postJson("/api/beacon/cancel", { tab }).catch(() => undefined);
    } catch {
      setEnabled(previous);
    } finally {
      setSaving(false);
    }
  }, [enabled, saving, tab]);

  return { enabled, toggle, saving };
}
