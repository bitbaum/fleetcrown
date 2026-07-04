"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api/fetch";

export type BuilderPresenceSnapshot = {
  runnerConnected: boolean | null;
  runtimeAvailable: boolean;
  builderPresence: { cloud: boolean; local: boolean; any: boolean } | null;
};

const EMPTY: BuilderPresenceSnapshot = {
  runnerConnected: null,
  runtimeAvailable: false,
  builderPresence: null,
};

/** Lightweight poll for executor honesty chips (Control, Loki, Terminal). */
export function useBuilderPresence(pollMs = 15_000): BuilderPresenceSnapshot {
  const [snapshot, setSnapshot] = useState<BuilderPresenceSnapshot>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getJson<{
          runnerConnected?: boolean | null;
          runtimeAvailable?: boolean;
          builderPresence?: { cloud: boolean; local: boolean; any: boolean } | null;
        }>("/api/builder/presence");
        if (cancelled) return;
        setSnapshot({
          runnerConnected: data.runnerConnected ?? data.builderPresence?.any ?? null,
          runtimeAvailable: data.runtimeAvailable === true,
          builderPresence: data.builderPresence ?? null,
        });
      } catch {
        if (!cancelled) setSnapshot(EMPTY);
      }
    }

    void load();
    const id = window.setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return snapshot;
}
