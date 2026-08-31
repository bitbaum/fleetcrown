"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, Copy, Check, RefreshCw, X } from "lucide-react";
import { useClipboard } from "@/hooks/use-clipboard";
import type { UpdateState } from "./types";

/**
 * Update-available banner — closes the gap where electron-updater silently
 * fails on Linux .deb installs.
 *
 * Pre-v0.7.5: when a new desktop release shipped, electron-updater would
 * download the new .deb but could NOT apply it (needs sudo, Electron can't
 * escalate from userspace). The user saw nothing, kept running v0.7.0,
 * and we (the dev) had to manually message them "please dpkg -i this."
 * That's the bug the user surfaced on 2026-06-07.
 *
 * Now: when an update is detected, this banner appears at the top of every
 * /control page (and everywhere else on the app shell). It shows the new
 * version + the exact command/button needed to apply it, by install format:
 *   - AppImage / dmg / exe   → "Restart to install" button (autoUpdater.quitAndInstall)
 *   - .deb (the broken case) → exact `sudo dpkg -i <path>` with Copy button
 *   - unknown                → link to /releases with manual download
 *
 * Renders nothing outside Fleet Runner (no window.fleetRunner) or when
 * no update is pending. Dismissable per-session via sessionStorage so the
 * user can hide it and the banner only re-appears on the next version.
 */

import { UPDATE_BANNER_DISMISS_KEY as DISMISS_KEY } from "@/config/brand-storage";

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const { copied, copy } = useClipboard();
  const [installing, setInstalling] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const bridge = window.fleetRunner;
    if (
      typeof bridge?.getUpdateState !== "function" ||
      typeof bridge?.onUpdateState !== "function"
    ) {
      return;
    }
    let alive = true;
    void bridge.getUpdateState().then((s) => {
      if (alive) setState(s ?? null);
    });
    const unsubscribe = bridge.onUpdateState((s) => {
      setState(s ?? null);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  function onDismiss() {
    if (!state?.newVersion) return;
    try {
      window.sessionStorage.setItem(DISMISS_KEY, state.newVersion);
    } catch {
      /* private mode */
    }
    setDismissedVersion(state.newVersion);
  }

  function onCopy(text: string) {
    copy(text);
  }

  async function onRestartToInstall() {
    if (typeof window.fleetRunner?.quitAndInstall !== "function") return;
    setInstalling(true);
    try {
      await window.fleetRunner.quitAndInstall();
    } catch {
      setInstalling(false);
    }
  }

  // Nothing to show?
  if (!state || dismissedVersion === state.newVersion) return null;
  // Only show on the "downloaded" phase — at "available" we don't yet know
  // the downloaded file path or whether the update succeeded.
  if (state.phase !== "downloaded") return null;
  if (!state.newVersion) return null;

  const isDebInstall = state.installFormat === "deb";
  const debCommand = state.downloadedFile
    ? `sudo dpkg -i ${quoteIfNeeded(state.downloadedFile)}`
    : null;

  return (
    <div className="ui-update-banner" role="status" aria-live="polite">
      <ArrowUpCircle className="ui-update-banner-icon h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="ui-update-banner-text min-w-0 flex-1">
        <span className="font-medium">Fleet Runner v{state.newVersion} ready.</span>{" "}
        {isDebInstall && debCommand ? (
          <span className="text-text-secondary">
            Auto-install isn&apos;t available for .deb (Linux sudo policy). Run this in any
            terminal:
          </span>
        ) : state.installFormat === "appimage" ||
          state.installFormat === "dmg" ||
          state.installFormat === "exe" ? (
          <span className="text-text-secondary">Restart Fleet Runner to apply.</span>
        ) : (
          <span className="text-text-secondary">
            Visit{" "}
            <a href="/releases" className="ui-public-link">
              releases
            </a>{" "}
            to download.
          </span>
        )}
        {isDebInstall && debCommand && <code className="ui-update-banner-cmd">{debCommand}</code>}
      </div>

      <div className="ui-update-banner-actions">
        {isDebInstall && debCommand && (
          <button
            type="button"
            onClick={() => onCopy(debCommand)}
            className="ui-btn-ghost ui-btn-xs"
            title="Copy command"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
          </button>
        )}
        {(state.installFormat === "appimage" ||
          state.installFormat === "dmg" ||
          state.installFormat === "exe") && (
          <button
            type="button"
            onClick={onRestartToInstall}
            disabled={installing}
            className="ui-btn-primary ui-btn-xs"
          >
            <RefreshCw className={installing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            <span className="ml-1">{installing ? "Restarting…" : "Restart to install"}</span>
          </button>
        )}
        <a href="/releases" className="ui-btn-ghost ui-btn-xs" title="See what changed">
          Changelog
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="ui-btn-ghost ui-btn-xs"
          title="Dismiss (will reappear on next version)"
          aria-label="Dismiss update banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Quote a path for the user's shell if it contains spaces. dpkg + bash
 *  treat `/opt/Fleet Runner/file.deb` as 'opt/Fleet' + 'Runner/file.deb'
 *  without quotes. Single-quote escape is safest for paste-into-terminal. */
function quoteIfNeeded(path: string): string {
  if (!/\s/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
