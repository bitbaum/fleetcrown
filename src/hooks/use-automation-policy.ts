"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, patchJson } from "@/lib/api/fetch";
import type { BeaconSettingsData } from "@/db/queries/beacon-settings";
import type { AutoInjectMode } from "@/config/beacon";
import { DEFAULT_BEACON_COUNTDOWN_S } from "@/lib/constants/control";

/**
 * Global automatic-continuation policy. The server setting is authoritative;
 * defaulting to off prevents automatic dispatch before it has been loaded.
 */
export function useAutomationPolicy() {
  const [mode, setMode] = useState<AutoInjectMode>("off");
  const [countdownSeconds, setCountdownSeconds] = useState(DEFAULT_BEACON_COUNTDOWN_S);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJson<BeaconSettingsData>("/api/beacon-settings")
      .then((settings) => {
        setMode(settings.auto_inject_mode);
        setCountdownSeconds(settings.countdown_seconds);
      })
      .catch(() => {});
  }, []);

  const updateMode = useCallback(async (next: AutoInjectMode) => {
    if (saving) return;
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
  }, [mode, saving]);

  return { mode, countdownSeconds, saving, updateMode };
}
