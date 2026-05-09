"use client";

import { useCallback } from "react";
import { autoContinueKey } from "@/lib/control-storage";
import { useLocalStorageState } from "./use-local-storage-state";

const serialize = (v: boolean) => (v ? "on" : "off");
const deserialize = (raw: string) => raw !== "off";

export function useAutoContinue(tab: string) {
  const [enabled, setEnabled] = useLocalStorageState(
    autoContinueKey(tab),
    true,
    serialize,
    deserialize,
  );

  const toggle = useCallback(() => setEnabled((v) => !v), [setEnabled]);
  const enable = useCallback(() => setEnabled(true), [setEnabled]);

  return { enabled, toggle, enable };
}
