"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, MessagesSquare, Loader2 } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useBuilderPresence } from "@/hooks/use-builder-presence";
import { cn } from "@/lib/utils";
import type { AgentMessage, MessageType } from "@/lib/agent-comms";

type CommsResp = { messages: AgentMessage[]; unavailable?: { code: string; message: string } };
type TabsResp = { tabs: string[]; unavailable?: { message: string } };

// Protocol message type → tag colour. Escalation is negative so the captain
// can't miss it; result positive; question needs-attention; task is a dispatch.
const TYPE_TAG: Record<MessageType, string> = {
  escalation: "ui-tag-negative",
  result: "ui-tag-positive",
  question: "ui-tag-warning",
  task: "ui-tag-accent",
};

/** Collapse a tab name to its bus identity: "revamp-it" / "Fleetcrown" → "revampit" / "fleetcrown". */
function busName(tab: string): string {
  return tab.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** PROTOCOL timestamps are "YYYY-MM-DD HH:MM" in local time. */
function tsToMs(ts: string): number {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return 0;
  const [, y, mo, d, h, mi] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi).getTime();
}

const ACTIVE_WINDOW_MS = 20 * 60 * 1000;

export function AgentsCockpit() {
  const { data: comms, loading: commsLoading } = useFetch<CommsResp>("/api/agents/comms", { intervalMs: 10_000 });
  const { data: tabsData } = useFetch<TabsResp>("/api/control/open-tabs?channel=local", { intervalMs: 5_000 });
  const presence = useBuilderPresence();

  const messages = comms?.messages ?? [];
  const tabs = tabsData?.tabs ?? [];

  // Clock ticks in an effect (Date.now() is impure — never call it in render).
  // Starts at 0 so first paint is deterministic; the effect fills it in immediately.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now()); // eslint-disable-line react-hooks/set-state-in-effect
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Last message touching each agent (as sender or recipient), by bus name.
  const lastByAgent = new Map<string, AgentMessage>();
  for (const m of messages) {
    for (const who of [m.from, m.to]) {
      if (!lastByAgent.has(who)) lastByAgent.set(who, m); // messages are already reverse-chrono
    }
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* ── Roster ─────────────────────────────────────────── */}
      <section className="ui-panel flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="ui-kicker">Agents</p>
          <span className="inline-flex items-center gap-1.5 text-micro text-text-muted">
            <span className={cn("h-2 w-2 rounded-full", presence.builderPresence?.local ? "bg-status-positive" : "bg-status-neutral")} />
            {presence.builderPresence?.local ? "builder online" : "builder offline"}
          </span>
        </div>

        {tabs.length === 0 ? (
          <p className="text-sm text-text-muted">
            {tabsData?.unavailable?.message ?? "No agent tabs open on this machine."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tabs.map((tab) => {
              const last = lastByAgent.get(busName(tab));
              const active = last ? now - tsToMs(last.ts) < ACTIVE_WINDOW_MS : false;
              return (
                <li key={tab} className="ui-card-shell flex items-center gap-3 px-3 py-2">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", active ? "bg-status-positive" : "bg-status-neutral")}
                    title={active ? "Active in the last 20 min" : "Idle"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{tab}</p>
                    <p className="truncate text-micro text-text-muted">
                      {last ? `${last.from} → ${last.to} · ${last.re || last.body.slice(0, 48)}` : "no messages yet"}
                    </p>
                  </div>
                  <Link
                    href={`/terminal?tab=${encodeURIComponent(tab)}`}
                    className="ui-btn-chip inline-flex shrink-0 items-center gap-1.5"
                    title={`Watch ${tab} live`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Watch
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Comms feed ─────────────────────────────────────── */}
      <section className="ui-panel flex min-h-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-text-muted" />
          <p className="ui-kicker">Comms feed</p>
        </div>

        {comms?.unavailable ? (
          <p className="text-sm text-text-muted">{comms.unavailable.message}</p>
        ) : commsLoading && messages.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="ui-spinner-sm" /> Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-text-muted">No inter-agent messages yet.</p>
        ) : (
          <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            {messages.map((m) => (
              <li key={m.id} className="ui-card-shell px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {m.type && <span className={cn("ui-tag", TYPE_TAG[m.type])}>{m.type}</span>}
                    <span className="truncate text-xs font-medium text-text-secondary">
                      {m.from} <span className="text-text-muted">→</span> {m.to}
                    </span>
                  </span>
                  <span className="shrink-0 text-nano tabular-nums text-text-muted" title={m.ts}>
                    {m.ts.slice(5)}
                    {m.read && <span className="ml-1.5 text-status-positive">read</span>}
                  </span>
                </div>
                {m.re && <p className="mt-0.5 truncate text-xs text-text-primary">{m.re}</p>}
                <p className="mt-0.5 line-clamp-2 text-micro text-text-muted">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
