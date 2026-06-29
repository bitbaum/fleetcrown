"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, patchJson, postJson } from "@/lib/api/fetch";
import type { BeaconSettingsData } from "@/db/queries/beacon-settings";
import type { AutoInjectMode } from "@/config/beacon";
import { DEFAULT_AUTO_INJECT_MODE, DEFAULT_BEACON_COUNTDOWN_S } from "@/lib/constants/control";
import { FLEETCROWN_REFRESH_EVENT } from "@/lib/client-events";
import type { FleetKickResult } from "@/lib/fleet-kick";

/**
 * Global automatic-continuation policy. The server setting is authoritative;
 * seed from DEFAULT_AUTO_INJECT_MODE until /api/beacon-settings loads.
 * Refetches on FLEETCROWN_REFRESH_EVENT so per-project overrides and
 * settings-page edits stay in sync with /control.
 */
export function useAutomationPolicy() {
  const [mode, setMode] = useState<AutoInjectMode>(DEFAULT_AUTO_INJECT_MODE);
  const [countdownSeconds, setCountdownSeconds] = useState(DEFAULT_BEACON_COUNTDOWN_S);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    getJson<BeaconSettingsData>("/api/beacon-settings")
      .then((settings) => {
        setMode(settings.auto_inject_mode);
        setCountdownSeconds(settings.countdown_seconds);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(FLEETCROWN_REFRESH_EVENT, reload);
    return () => window.removeEventListener(FLEETCROWN_REFRESH_EVENT, reload);
  }, [reload]);

  const updateMode = useCallback(async (next: AutoInjectMode): Promise<FleetKickResult | null> => {
    if (saving) return null;
    const previous = mode;
    setMode(next);
    setSaving(true);
    try {
      const response = await patchJson("/api/beacon-settings", { auto_inject_mode: next });
      if (!response.ok) {
        setMode(previous);
        return null;
      }
      window.dispatchEvent(new CustomEvent(FLEETCROWN_REFRESH_EVENT));

      if (previous === "off" && next === "on") {
        const kickRes = await postJson("/api/control/fleet-kick", { source: "play_button" });
        if (kickRes.ok) {
          return (await kickRes.json()) as FleetKickResult;
        }
      }
      return null;
    } catch {
      setMode(previous);
      return null;
    } finally {
      setSaving(false);
    }
  }, [mode, saving]);

  return { mode, countdownSeconds, saving, updateMode };
}
