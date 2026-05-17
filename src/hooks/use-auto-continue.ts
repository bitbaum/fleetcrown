"use client";

import { useCallback } from "react";
import { autoContinueKey } from "@/lib/control-storage";
import { postJson } from "@/lib/api/fetch";
import { useLocalStorageState } from "./use-local-storage-state";

const serialize = (v: boolean) => (v ? "on" : "off");
const deserialize = (raw: string) => raw !== "off";

export function useAutoContinue(tab: string) {
  const [enabled, setEnabled] = useLocalStorageState(
    autoContinueKey(tab),
    false,
    serialize,
    deserialize,
  );

  // Sync pause/resume to backend sentinel and cancel any open beacon popup.
  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      postJson("/api/control/auto-continue", { tab, enabled: next }).catch(() => {});
      if (!next) postJson("/api/beacon/cancel", { tab }).catch(() => {});
      return next;
    });
  }, [tab, setEnabled]);

  // Sync re-enable to /tmp sentinel so PyQt popup starts unpaused.
  const enable = useCallback(() => {
    setEnabled(true);
    postJson("/api/control/auto-continue", { tab, enabled: true }).catch(() => {});
  }, [tab, setEnabled]);

  return { enabled, toggle, enable };
}
