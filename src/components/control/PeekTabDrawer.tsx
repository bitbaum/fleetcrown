"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, RefreshCw, X } from "lucide-react";
import { Drawer } from "@/components/ui/modal";

// Live snapshot of a Zellij tab's visible scrollback, rendered as a static
// terminal frame in a drawer. Pre-v0.7.2 the user could see tab names + state
// chips on /control but had to alt-tab into Zellij to see what the agent was
// actually saying. The Peek button bridges that gap with a one-click
// dump-screen round-trip (~200ms) — same disruption budget as a prompt
// injection, which users have already accepted as the cost of remote dispatch.
//
// Uses the fastest available runtime: Fleet Runner IPC when the desktop bridge
// exists, otherwise a pending_commands round-trip that the local daemon drains.
//
// Auto-refresh is opt-in: a re-peek every N seconds is useful for watching
// long-running agents, but stays off by default so we don't disrupt the user
// (each peek briefly flashes their Zellij to the target tab and back).

export function PeekTabDrawer({ tab, onClose }: { tab: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const requestSeq = useRef(0);

  const applyContent = (nextContent: string) => {
    setContent(nextContent);
    setLastFetchedAt(Date.now());
    requestAnimationFrame(() => {
      if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
    });
  };

  const fetchRemotePeek = async (seq: number) => {
    const enqueue = await fetch("/api/control/peek-tab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab }),
    });
    if (!enqueue.ok) {
      const body = await enqueue.json().catch(() => ({}));
      throw new Error(body.error || `Peek request failed (${enqueue.status})`);
    }
    const { peekId } = await enqueue.json() as { peekId?: string };
    if (!peekId) throw new Error("Peek request did not return an id");

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (seq !== requestSeq.current) return;
      const poll = await fetch(`/api/control/peek-tab/${peekId}`, { cache: "no-store" });
      if (!poll.ok) {
        const body = await poll.json().catch(() => ({}));
        throw new Error(body.error || `Peek poll failed (${poll.status})`);
      }
      const body = await poll.json() as { status: "pending" | "done" | "error"; content?: string; error?: string };
      if (body.status === "done") {
        applyContent(body.content ?? "");
        return;
      }
      if (body.status === "error") {
        throw new Error(body.error || "Peek failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("No local daemon or Fleet Runner claimed the peek request within 45s.");
  };

  const fetchPeek = async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    const bridge = window.fleetRunner;
    setLoading(true);
    setError(null);
    try {
      if (typeof bridge?.peekTab === "function") {
        const result = await bridge.peekTab(tab);
        if (seq !== requestSeq.current) return;
        if (result.ok) {
          applyContent(result.content);
        } else {
          setError(result.error || "Peek failed");
        }
      } else {
        await fetchRemotePeek(seq);
      }
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError((e as Error).message || "Peek failed");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!autoRefresh) return;
    // 3s cadence — fast enough to feel live during a working agent, slow
    // enough that the brief Zellij focus flash doesn't become annoying.
    const id = setInterval(() => { void fetchPeek(); }, 3_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, tab]);

  return (
    <Drawer onClose={onClose} size="xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
        <div className="min-w-0 flex items-center gap-2">
          <Eye className="h-4 w-4 text-accent-text" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">{tab}</h2>
            <p className="text-micro text-text-tertiary">
              {lastFetchedAt
                ? `Snapshot captured ${new Date(lastFetchedAt).toLocaleTimeString()}${autoRefresh ? " · auto-refresh on" : ""}`
                : "Capturing screen…"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={autoRefresh ? "ui-btn-primary ui-btn-xs" : "ui-btn-ghost ui-btn-xs"}
            title={autoRefresh ? "Stop auto-refresh" : "Re-peek every 3s"}
          >
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh"}
          </button>
          <button
            type="button"
            onClick={() => { void fetchPeek(); }}
            disabled={loading}
            className="ui-btn-ghost ui-btn-xs"
            title="Re-capture"
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          </button>
          <button type="button" onClick={onClose} className="ui-btn-ghost ui-btn-xs" title="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="ui-control-terminal-surface">
        {error ? (
          <div className="p-6 text-sm text-text-secondary">
            <p className="font-medium text-status-warning">Couldn&apos;t peek this tab</p>
            <p className="mt-2 text-text-tertiary">{error}</p>
            <p className="mt-4 text-xs text-text-muted">
              Common reasons: the tab is no longer open in Zellij, Zellij is not running on
              your machine, or neither Fleet Runner nor the local daemon is online.
            </p>
          </div>
        ) : content === null ? (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Capturing screen…
          </div>
        ) : (
          <pre ref={preRef} className="ui-control-terminal-frame">
            {content}
          </pre>
        )}
      </div>
    </Drawer>
  );
}
