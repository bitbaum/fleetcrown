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
};

declare global {
  interface Window {
    fleetRunner?: Partial<FleetRunnerBridge>;
  }
}

export {};
