"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getJson, patchJson, throwApiError } from "@/lib/api/fetch";
import type { BeaconSettingsData } from "@/app/api/beacon-settings/route";
import { DEFAULT_BEACON_COUNTDOWN_S } from "@/lib/constants/control";
import { WHISPER_MODELS } from "@/config/beacon";

export function BeaconSettings() {
  const [data, setData] = useState<BeaconSettingsData | null>(null);
  const [countdown, setCountdown] = useState(DEFAULT_BEACON_COUNTDOWN_S);
  const [model, setModel] = useState("base");
  const [browserUi, setBrowserUi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJson<BeaconSettingsData>("/api/beacon-settings").then((d) => {
      setData(d);
      setCountdown(d.countdown_seconds);
      setModel(d.whisper_model);
      setBrowserUi(d.prefer_browser_ready_ui);
    }).catch(() => {});
  }, []);

  const dirty = data !== null && (
    countdown !== data.countdown_seconds ||
    model !== data.whisper_model ||
    browserUi !== data.prefer_browser_ready_ui
  );

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await patchJson("/api/beacon-settings", {
        countdown_seconds: countdown,
        whisper_model: model,
        prefer_browser_ready_ui: browserUi,
      });
      if (!res.ok) await throwApiError(res, "Failed to save");
      setData({ countdown_seconds: countdown, whisper_model: model, prefer_browser_ready_ui: browserUi });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ui-settings-section">
      <div>
        <h2 className="font-medium text-text-primary">Beacon</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Controls the popup and auto-continue behavior when an agent finishes a task.
        </p>
      </div>

      {data === null ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="ui-spinner" /> Loading…
        </div>
      ) : (
        <div className="space-y-5">
          {/* Web UI mode */}
          <div className="flex items-start gap-3">
            <div className="flex h-5 items-center pt-0.5">
              <input
                id="beacon-browser-ui"
                type="checkbox"
                checked={browserUi}
                onChange={(e) => setBrowserUi(e.target.checked)}
                className="h-4 w-4 rounded border-border-default accent-accent-primary cursor-pointer"
              />
            </div>
            <div className="space-y-0.5">
              <label htmlFor="beacon-browser-ui" className="text-sm font-medium text-text-primary cursor-pointer">
                Control panel only (skip popup)
              </label>
              <p className="text-xs text-text-muted">
                When enabled: no popup window opens — the Control panel&apos;s ReadyBanner handles auto-continue.
                When disabled (default): a web popup window opens with session summary, queue, and prompt choices.
              </p>
            </div>
          </div>

          {/* Countdown */}
          <div className="space-y-1.5">
            <label className="ui-kicker">Auto-continue countdown</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={5}
                max={300}
                value={countdown}
                onChange={(e) => setCountdown(Math.max(5, Math.min(300, parseInt(e.target.value) || DEFAULT_BEACON_COUNTDOWN_S)))}
                className="ui-input w-24 tabular-nums"
              />
              <span className="text-sm text-text-tertiary">seconds</span>
            </div>
            <p className="text-xs text-text-muted">
              How long the beacon waits before auto-submitting the primary action. Currently {countdown}s.
            </p>
          </div>

          {/* Whisper model */}
          <div className="space-y-1.5">
            <label className="ui-kicker">Voice transcription model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="ui-input"
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} — {m.note}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">
              Whisper model used when you speak into the beacon mic. Larger models are more accurate but slower.
              Model files are cached in <code className="text-text-secondary">~/.cache/whisper/</code>.
            </p>
          </div>
        </div>
      )}

      {error && <p className="ui-error">{error}</p>}
      {saved && <p className="text-sm text-text-secondary">Saved.</p>}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="ui-btn-primary"
      >
        {saving && <Loader2 className="ui-spinner" />}
        Save changes
      </button>
    </section>
  );
}
