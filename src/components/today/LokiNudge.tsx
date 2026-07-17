"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import { HOUR_MS } from "@/lib/constants/time";

const CACHE_PREFIX = "fleetcrown-loki-nudge-v1:";
const CACHE_TTL_MS = HOUR_MS;

type CacheEntry = { composed: string; expiresAt: number };

function cacheKey(kind: string, title: string, context: string): string {
  // Stable enough — the focus content changes when any of these change.
  return `${CACHE_PREFIX}${kind}|${title}|${context}`;
}

function readCache(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.expiresAt < Date.now()) return null;
    return parsed.composed;
  } catch {
    return null;
  }
}

function writeCache(key: string, composed: string) {
  try {
    const entry: CacheEntry = { composed, expiresAt: Date.now() + CACHE_TTL_MS };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage failures shouldn't break the UI.
  }
}

/**
 * LokiNudge — upgrades a Watch focus from templated context to Loki-composed
 * prose. Server-rendered Watch shows the template line for instant signal,
 * then this component fetches a composed paragraph and replaces the line
 * once it arrives. Cached in localStorage for one hour so the same focus
 * doesn't re-call Groq on every navigation.
 *
 * If the compose endpoint is unavailable (no API key, rate-limited, timeout),
 * this renders nothing — the parent's template prose stays in place. Strict
 * enhancement, never a regression.
 */
export function LokiNudge({
  kind,
  title,
  context,
}: {
  kind: string;
  title: string;
  context: string;
}) {
  const [composed, setComposed] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const key = cacheKey(kind, title, context);
    const cached = readCache(key);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time (or prop-change) cache hydration; deferred render is fine for this enhancement
      setComposed(cached);
      setState("ready");
      return;
    }

    let cancelled = false;
    setState("loading");

    (async () => {
      try {
        const res = await postJson("/api/today/watch/compose", { kind, title, context });
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const data = (await res.json()) as { composed?: string };
        if (!data.composed) {
          if (!cancelled) setState("error");
          return;
        }
        if (cancelled) return;
        writeCache(key, data.composed);
        setComposed(data.composed);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, title, context]);

  if (state === "error" || state === "idle") return null;

  return (
    <div className="ui-loki-nudge">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-text" />
      <span className="ui-loki-nudge-text">
        {state === "ready" ? composed : <span className="ui-loki-nudge-shimmer">Loki is composing…</span>}
      </span>
    </div>
  );
}
