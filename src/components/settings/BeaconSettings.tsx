"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getJson, patchJson, throwApiError } from "@/lib/api/fetch";
import type { BeaconSettingsData } from "@/db/queries/beacon-settings";
import {
  DEFAULT_BEACON_COUNTDOWN_S,
  MIN_BEACON_COUNTDOWN_S,
  MAX_BEACON_COUNTDOWN_S,
  DEFAULT_BEACON_MIN_IDLE_S,
  MAX_BEACON_MIN_IDLE_S,
} from "@/lib/constants/control";
import { WHISPER_MODELS, TRANSCRIPTION_PROVIDERS, POPUP_MODES, AUTO_INJECT_MODES, type AutoInjectMode } from "@/config/beacon";

export function BeaconSettings() {
  const [data, setData]         = useState<BeaconSettingsData | null>(null);
  const [popupMode, setPopupMode]   = useState("web");
  const [countdown, setCountdown]   = useState(DEFAULT_BEACON_COUNTDOWN_S);
  const [minIdle, setMinIdle]       = useState(DEFAULT_BEACON_MIN_IDLE_S);
  const [model, setModel]           = useState("base");
  const [provider, setProvider]     = useState("auto");
  const [autoInjectMode, setAutoInjectMode] = useState<AutoInjectMode>("queue_only");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [loadError, setLoadError]   = useState(false);

  useEffect(() => {
    getJson<BeaconSettingsData>("/api/beacon-settings").then((d) => {
      setData(d);
      setPopupMode(d.popup_mode);
      setCountdown(d.countdown_seconds);
      setMinIdle(d.min_idle_seconds);
      setModel(d.whisper_model);
      setProvider(d.transcription_provider);
      setAutoInjectMode(d.auto_inject_mode);
    }).catch(() => setLoadError(true));
  }, []);

  const dirty = data !== null && (
    popupMode !== data.popup_mode ||
    countdown !== data.countdown_seconds ||
    minIdle !== data.min_idle_seconds ||
    model !== data.whisper_model ||
    provider !== data.transcription_provider ||
    autoInjectMode !== data.auto_inject_mode
  );

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await patchJson("/api/beacon-settings", {
        popup_mode: popupMode,
        countdown_seconds: countdown,
        min_idle_seconds: minIdle,
        whisper_model: model,
        transcription_provider: provider,
        auto_inject_mode: autoInjectMode,
      });
      if (!res.ok) await throwApiError(res, "Failed to save");
      setData({ popup_mode: popupMode, countdown_seconds: countdown, min_idle_seconds: minIdle, whisper_model: model, transcription_provider: provider, auto_inject_mode: autoInjectMode });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const selectedMode = POPUP_MODES.find((m) => m.value === popupMode) ?? POPUP_MODES[0];

  return (
    <section className="ui-settings-section">
      <div>
        <h2 className="font-medium text-text-primary">Beacon</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Controls the popup and auto-continue behavior when an agent finishes a task.
          Settings are stored per account and apply across all your sessions.
        </p>
      </div>

      {loadError ? (
        <p className="ui-error">Failed to load beacon settings — check that the server is reachable and try reloading.</p>
      ) : data === null ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="ui-spinner" /> Loading…
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Auto-inject mode ── */}
          <div className="space-y-2">
            <label className="ui-kicker">Auto-inject mode</label>
            <div className="grid grid-cols-2 gap-2">
              {AUTO_INJECT_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setAutoInjectMode(m.value)}
                  className={[
                    "text-left rounded-lg border p-3 transition-colors",
                    autoInjectMode === m.value
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-default bg-surface-base hover:border-border-interactive",
                  ].join(" ")}
                >
                  <div className="font-medium text-sm text-text-primary">{m.label}</div>
                  <div className="mt-1 text-xs text-text-tertiary">{m.description}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted">
              Decides what gets injected when a session ends and the queue/handoff combine to suggest a next move. Strategist is the default and uses Groq; switch to Queue only if you want strictly explicit prompts, or Off to dispatch every prompt by hand.
            </p>
          </div>

          {/* ── Popup mode ── */}
          <div className="space-y-2">
            <label className="ui-kicker">Popup mode</label>
            <div className="grid grid-cols-2 gap-2">
              {POPUP_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPopupMode(m.value)}
                  className={[
                    "text-left rounded-lg border p-3 transition-colors",
                    popupMode === m.value
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-default bg-surface-base hover:border-border-interactive",
                  ].join(" ")}
                >
                  <div className="font-medium text-sm text-text-primary">{m.label}</div>
                  <div className="mt-1 text-xs text-text-tertiary">{m.description}</div>
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-raised p-3 space-y-1">
              <p className="text-xs text-status-positive">
                <span className="font-semibold">Advantage — </span>{selectedMode.pros}
              </p>
              <p className="text-xs text-text-muted">
                <span className="font-semibold">Trade-off — </span>{selectedMode.cons}
              </p>
            </div>
          </div>

          {/* ── Idle gate ── */}
          <div className="space-y-1.5">
            <label className="ui-kicker">Show popup after idle</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={MAX_BEACON_MIN_IDLE_S}
                value={minIdle}
                onChange={(e) => setMinIdle(Math.max(0, Math.min(MAX_BEACON_MIN_IDLE_S, parseInt(e.target.value) || 0)))}
                className="ui-input w-24 tabular-nums"
              />
              <span className="text-sm text-text-tertiary">seconds</span>
            </div>
            <p className="text-xs text-text-muted">
              {minIdle === 0
                ? "Always show — popup fires every time a session ends regardless of keyboard activity."
                : `Skip popup if you've been active in the last ${minIdle}s — only show when idle.`}
            </p>
          </div>

          {/* ── Countdown ── */}
          <div className="space-y-1.5">
            <label className="ui-kicker">Auto-continue countdown</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={MIN_BEACON_COUNTDOWN_S}
                max={MAX_BEACON_COUNTDOWN_S}
                value={countdown}
                onChange={(e) => setCountdown(Math.max(MIN_BEACON_COUNTDOWN_S, Math.min(MAX_BEACON_COUNTDOWN_S, parseInt(e.target.value) || DEFAULT_BEACON_COUNTDOWN_S)))}
                className="ui-input w-24 tabular-nums"
              />
              <span className="text-sm text-text-tertiary">seconds</span>
            </div>
            <p className="text-xs text-text-muted">
              How long the beacon waits before auto-submitting the primary action. Currently {countdown}s.
            </p>
          </div>

          {/* ── Transcription provider ── */}
          <div className="space-y-1.5">
            <label className="ui-kicker">Transcription provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="ui-input"
            >
              {TRANSCRIPTION_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} — {p.note}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">
              Force local Whisper when Groq is rate-limited, or force Groq when local runtime is unavailable.
            </p>
          </div>

          {/* ── Whisper model ── */}
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
              Whisper model used when provider is Local or Auto with runtime available. Larger models are more accurate but slower.
              Cached in <code className="text-text-secondary">~/.cache/whisper/</code>.
            </p>
          </div>
        </div>
      )}

      {error && <p className="ui-error">{error}</p>}
      {saved && <p className="text-sm text-status-positive">Saved.</p>}

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
