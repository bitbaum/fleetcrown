"use client";

import { usePoll } from "@/hooks/use-poll";
import { useBuilderPresence, type BuilderPresenceSnapshot } from "@/hooks/use-builder-presence";
import type { BuilderChannel } from "@/lib/event-stream-types";

export type TerminalTabsState = {
  tabs: string[];
  loading: boolean;
  /** Set when the account may not use this builder at all. */
  gatedMessage: string | null;
  /** True when this builder is allowed but not currently connected. */
  offline: boolean;
  /**
   * The presence snapshot this hook already polls for `offline`. Returned so a
   * caller that also needs it does not mount a SECOND poller against the same
   * endpoint — TerminalSurface did, and /terminal hit /api/builder/presence
   * twice per interval for one page.
   */
  presence: BuilderPresenceSnapshot;
};

/**
 * Open agent tabs for one builder channel, plus the two states that must never
 * be collapsed into "empty": *gated* (this account cannot use this builder) and
 * *offline* (allowed, but nothing is connected right now). An online-but-idle
 * builder is a fourth, different thing, and reporting it as gated is what made
 * a working fleet look broken.
 */
export function useTerminalTabs(channel: BuilderChannel): TerminalTabsState {
  const { data, loading } = usePoll<{ tabs: string[]; unavailable?: { code: string; message: string } }>(
    `/api/control/open-tabs?channel=${channel}`,
    5000,
  );
  const presence = useBuilderPresence();
  const connected = channel === "cloud" ? presence.builderPresence?.cloud : presence.builderPresence?.local;

  return {
    tabs: data?.tabs ?? [],
    loading,
    gatedMessage: data?.unavailable?.message ?? null,
    offline: connected === false,
    presence,
  };
}
