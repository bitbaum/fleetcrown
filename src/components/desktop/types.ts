/**
 * Shared types for the Fleet Runner IPC bridge.
 *
 * The desktop preload (`desktop/src/preload/index.ts`) exposes
 * `window.fleetRunner`; both `FleetRunnerAutoMint` and `FleetRunnerStatusPill`
 * read from it. Centralizing the declaration here avoids the conflicting
 * `Window` augmentations the two components would otherwise produce.
 *
 * Every property is optional — older shipped builds of the desktop app may
 * be missing newer methods. Callers must defensively check before invoking.
 */
export type PollerState = "idle" | "connecting" | "connected" | "error";

export type PollerStatus = {
  state: PollerState;
  baseUrl: string;
  lastPollAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  tokenPrefix: string | null;
  commandsHandled: number;
  commandsRejected: number;
};

/** Result of the v0.6.0 `getInstalledCLIs` IPC scan. */
export type InstalledCLIs = {
  zellij: boolean;
  agents: Record<string, boolean>;
};

/** Single entry returned by the v0.6.0 `getLocalDevProjects` IPC walker. */
export type LocalDevProject = {
  name: string;
  path: string;
  mtimeMs: number;
  remoteUrl: string | null;
};

export type FleetRunnerBridge = {
  ping: () => Promise<string>;
  getRuntimeStatus: () => Promise<unknown>;
  getProjects: () => Promise<unknown>;
  dispatchIntent: (args: { projectKey: string; intent: string; queueHead?: string }) => Promise<unknown>;
  getCurrentState: () => Promise<unknown>;
  saveToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  loadToken: () => Promise<string | null>;
  clearToken: () => Promise<{ ok: boolean; error?: string }>;
  getConfigDir: () => Promise<string>;
  getPollerStatus: () => Promise<PollerStatus>;
  onPollerStatus: (cb: (status: PollerStatus) => void) => () => void;
  /** Local prerequisite scan — true if the named binary is on the user's PATH.
   *  Added in Fleet Runner v0.6.0; older builds won't expose this method. */
  getInstalledCLIs: () => Promise<InstalledCLIs>;
  /** Cursor-style "recent local projects" — walks the user's dev folder
   *  roots (default ~/dev, ~/code, ~/Code, ~/Projects) for git repos and
   *  returns them sorted by recency. Used by the web app to surface
   *  an "Import these N local repos" CTA on /control. v0.6.0+. */
  getLocalDevProjects: () => Promise<{ projects: LocalDevProject[] }>;
  /** Capture a snapshot of what's visible in a Zellij tab right now. Returns
   *  the screen content as plain text (ANSI stripped). v0.7.2+. */
  peekTab: (tab: string) => Promise<{ ok: true; content: string } | { ok: false; error: string }>;
};

declare global {
  interface Window {
    fleetRunner?: Partial<FleetRunnerBridge>;
  }
}

export {};
