"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "@/lib/api/fetch";

/**
 * Per-project continuation permission persisted by the control API. A browser
 * may render the setting, but does not own operational authorization.
 */
export function useAutoContinue(tab: string) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson<{ enabled: boolean }>(`/api/control/auto-continue?tab=${encodeURIComponent(tab)}`)
      .then((result) => { if (!cancelled) setEnabled(result.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      postJson("/api/control/auto-continue", { tab, enabled: next }).catch(() => {
        setEnabled(current);
      });
      if (!next) postJson("/api/beacon/cancel", { tab }).catch(() => {});
      return next;
    });
  }, [tab]);

  return { enabled, toggle };
}
