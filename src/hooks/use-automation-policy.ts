"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, patchJson } from "@/lib/api/fetch";
import type { BeaconSettingsData, AutoInjectMode } from "@/db/queries/beacon-settings";

/**
 * Global automatic-continuation policy. The server setting is authoritative;
 * defaulting to off prevents automatic dispatch before it has been loaded.
 */
export function useAutomationPolicy() {
  const [mode, setMode] = useState<AutoInjectMode>("off");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJson<BeaconSettingsData>("/api/beacon-settings")
      .then((settings) => setMode(settings.auto_inject_mode))
      .catch(() => {});
  }, []);

  const updateMode = useCallback(async (next: AutoInjectMode) => {
    const previous = mode;
    setMode(next);
    setSaving(true);
    try {
      const response = await patchJson("/api/beacon-settings", { auto_inject_mode: next });
      if (!response.ok) setMode(previous);
    } catch {
      setMode(previous);
    } finally {
      setSaving(false);
    }
  }, [mode]);

  return { mode, saving, updateMode };
}
