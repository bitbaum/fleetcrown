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
// Works only inside Fleet Runner (window.fleetRunner.peekTab → main process →
// zellij action dump-screen). Outside Fleet Runner the drawer shows an "open
// in Fleet Runner" prompt rather than silently failing.
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

  const fetchPeek = async () => {
    const bridge = window.fleetRunner;
    if (typeof bridge?.peekTab !== "function") {
      setError("Peek requires Fleet Runner v0.7.2 or newer. Update via Help → Check for Updates, or download the latest from fleetcrown-releases.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await bridge.peekTab(tab);
      if (result.ok) {
        setContent(result.content);
        setLastFetchedAt(Date.now());
        // Scroll to bottom so the most recent output is visible — that's
        // where the active agent state usually lives (prompt, current task,
        // last error). Skip on user-initiated scroll-up though.
        requestAnimationFrame(() => {
          if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
        });
      } else {
        setError(result.error || "Peek failed");
      }
    } catch (e) {
      setError((e as Error).message || "Peek failed");
    } finally {
      setLoading(false);
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

      <div className="flex-1 min-h-0 overflow-hidden bg-[#0a0a0a]">
        {error ? (
          <div className="p-6 text-sm text-text-secondary">
            <p className="font-medium text-status-warning">Couldn&apos;t peek this tab</p>
            <p className="mt-2 text-text-tertiary">{error}</p>
            <p className="mt-4 text-xs text-text-muted">
              Common reasons: the tab is no longer open in Zellij, Zellij isn&apos;t running on
              your machine, or this Fleet Runner build predates v0.7.2.
            </p>
          </div>
        ) : content === null ? (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Capturing screen…
          </div>
        ) : (
          <pre
            ref={preRef}
            className="h-full overflow-auto whitespace-pre p-4 font-mono text-xs leading-relaxed text-[#FAF8F5]"
          >
            {content}
          </pre>
        )}
      </div>
    </Drawer>
  );
}
