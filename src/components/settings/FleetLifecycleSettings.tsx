"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getJson } from "@/lib/api/fetch";
import type { FleetLifecycleSettings as Settings } from "@/db/schema/users";

type Response = { settings: Required<Settings> };

const DEFAULTS: Required<Settings> = {
  autoRestore: true,
  restoreMode: "fresh-spawn",
  sessionName: "fleet",
  autoStartAtLogin: true,
};

export function FleetLifecycleSettings() {
  const [loaded, setLoaded] = useState<Required<Settings> | null>(null);
  const [autoRestore, setAutoRestore] = useState(DEFAULTS.autoRestore);
  const [restoreMode, setRestoreMode] = useState<Settings["restoreMode"]>(DEFAULTS.restoreMode);
  const [sessionName, setSessionName] = useState(DEFAULTS.sessionName);
  const [autoStartAtLogin, setAutoStartAtLogin] = useState(DEFAULTS.autoStartAtLogin);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    getJson<Response>("/api/settings/fleet-lifecycle")
      .then((d) => {
        setLoaded(d.settings);
        setAutoRestore(d.settings.autoRestore);
        setRestoreMode(d.settings.restoreMode);
        setSessionName(d.settings.sessionName);
        setAutoStartAtLogin(d.settings.autoStartAtLogin);
      })
      .catch(() => setLoadError(true));
  }, []);

  const dirty = loaded !== null && (
    autoRestore !== loaded.autoRestore ||
    restoreMode !== loaded.restoreMode ||
    sessionName !== loaded.sessionName ||
    autoStartAtLogin !== loaded.autoStartAtLogin
  );

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const resp = await fetch("/api/settings/fleet-lifecycle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { autoRestore, restoreMode, sessionName, autoStartAtLogin },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as Response;
      setLoaded(data.settings);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ui-settings-section">
      <div>
        <h2 className="font-medium text-text-primary">Fleet Lifecycle</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          How Fleet Runner brings your zellij fleet back after a restart, and what it does with stale sessions.
          These knobs apply on the next Fleet Runner boot.
        </p>
      </div>

      {loadError ? (
        <p className="ui-error">Failed to load Fleet Lifecycle settings — check that the server is reachable.</p>
      ) : loaded === null ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="ui-spinner" /> Loading…
        </div>
      ) : (
        <div className="space-y-8">

          {/* ─── Restoration ─── */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Restoration</h3>

            <div className="space-y-2">
              <label className="ui-kicker">When Fleet Runner starts</label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setAutoRestore(true)}
                  className={[
                    "text-left rounded-lg border p-3 transition-colors",
                    autoRestore
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-default bg-surface-base hover:border-border-interactive",
                  ].join(" ")}
                >
                  <div className="font-medium text-sm text-text-primary">Restore my fleet automatically</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    Spawn zellij + every agent from my last snapshot the moment Fleet Runner boots. Zero clicks after PC restart.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRestore(false)}
                  className={[
                    "text-left rounded-lg border p-3 transition-colors",
                    !autoRestore
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-default bg-surface-base hover:border-border-interactive",
                  ].join(" ")}
                >
                  <div className="font-medium text-sm text-text-primary">Show a Restore Fleet button</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    Don&apos;t touch zellij on boot. One-click restore from the tray when you&apos;re ready.
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="ui-kicker">When zellij has an exited session</label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setRestoreMode("fresh-spawn")}
                  className={[
                    "text-left rounded-lg border p-3 transition-colors",
                    restoreMode === "fresh-spawn"
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-default bg-surface-base hover:border-border-interactive",
                  ].join(" ")}
                >
                  <div className="font-medium text-sm text-text-primary">Start fresh from my snapshot</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    Discard zellij&apos;s resurrect file. Agents auto-resume from their own session files — the press-ENTER prompt never fires. Recommended.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreMode("leave-alone")}
                  className={[
                    "text-left rounded-lg border p-3 transition-colors",
                    restoreMode === "leave-alone"
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-default bg-surface-base hover:border-border-interactive",
                  ].join(" ")}
                >
                  <div className="font-medium text-sm text-text-primary">Leave zellij&apos;s resurrection alone</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    Preserve zellij&apos;s built-in resurrect. You&apos;ll press ENTER per pane when you attach.
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* ─── Identity ─── */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Identity</h3>

            <div className="space-y-2">
              <label className="ui-kicker" htmlFor="fleet-session-name">Session name</label>
              <input
                id="fleet-session-name"
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="ui-input max-w-xs"
                placeholder="fleet"
                maxLength={48}
                pattern="[A-Za-z0-9_-]+"
              />
              <p className="text-xs text-text-muted">
                The zellij session Fleet Runner owns. Letters, numbers, hyphens, underscores. Default <code className="font-mono">fleet</code>.
              </p>
            </div>
          </div>

          {/* ─── Startup ─── */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Startup</h3>

            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoStartAtLogin}
                  onChange={(e) => setAutoStartAtLogin(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium text-sm text-text-primary">Auto-start Fleet Runner at login</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    macOS Login Items, Linux systemd user unit, Windows startup. Combined with auto-restore: PC boots, fleet is back.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* ─── Save ─── */}
          <div className="flex items-center gap-3 pt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="ui-btn-primary"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="text-xs text-status-positive">Saved.</span>}
            {error && <span className="text-xs text-status-negative">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
