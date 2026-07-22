"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Rocket, MessagesSquare, Radio, Loader2 } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useBuilderPresence } from "@/hooks/use-builder-presence";
import { cn } from "@/lib/utils";
import { MESSAGE_TYPES, type AgentMessage, type MessageType } from "@/lib/agent-comms";

type CommsResp = { messages: AgentMessage[]; unavailable?: { code: string; message: string } };
type TabsResp = { tabs: string[]; unavailable?: { message: string } };
type RosterProject = { name: string; description: string };

// Protocol message type → tag colour. Escalation is negative so the captain
// can't miss it; result positive; question needs-attention; task is a dispatch.
const TYPE_TAG: Record<MessageType, string> = {
  escalation: "ui-tag-negative",
  result: "ui-tag-positive",
  question: "ui-tag-warning",
  task: "ui-tag-accent",
};
const TYPE_DOT: Record<MessageType, string> = {
  escalation: "bg-status-negative",
  result: "bg-status-positive",
  question: "bg-status-warning",
  task: "bg-accent-primary",
};

/** Collapse a name to its bus identity: "revamp-it" / "Fleetcrown" → "revampit" / "fleetcrown". */
function busName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Scratch zellij tabs ("Tab #3", "Tab 3") aren't real projects — keep them off the roster. */
function isScratchTab(tab: string): boolean {
  return /^tab\s*#?\d+$/i.test(tab.trim());
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums text-text-primary">{value}</span>
      <span className="text-micro uppercase tracking-wide text-text-tertiary">{label}</span>
    </span>
  );
}

export function AgentsCockpit({ registeredProjects }: { registeredProjects: RosterProject[] }) {
  const { data: comms, loading: commsLoading } = useFetch<CommsResp>("/api/agents/comms", { intervalMs: 10_000 });
  const { data: tabsData } = useFetch<TabsResp>("/api/control/open-tabs?channel=local", { intervalMs: 5_000 });
  const presence = useBuilderPresence();
  const [filter, setFilter] = useState<MessageType | "all">("all");

  const online = presence.builderPresence?.local ?? false;
  const messages = comms?.messages ?? [];

  // Which registered projects have a live agent tab open on the builder right now.
  const openSet = new Set((tabsData?.tabs ?? []).filter((t) => !isScratchTab(t)).map(busName));

  // Roster is REGISTERED projects only (scratch tabs excluded), active ones first.
  const roster = registeredProjects
    .map((p) => ({ ...p, open: openSet.has(busName(p.name)) }))
    .sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name));
  const activeCount = roster.filter((r) => r.open).length;

  // Type-filter chips: only offer types that are actually present in the feed.
  const presentTypes = MESSAGE_TYPES.filter((t) => messages.some((m) => m.type === t));
  const shown = filter === "all" ? messages : messages.filter((m) => m.type === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Fleet status strip ─────────────────────────────── */}
      <section className="ui-panel flex flex-wrap items-center gap-x-8 gap-y-3">
        <span className="inline-flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", online ? "bg-status-positive" : "bg-status-neutral")} />
          <span className="text-sm font-medium text-text-primary">{online ? "Builder online" : "Builder offline"}</span>
        </span>
        <Stat label="projects" value={roster.length} />
        <Stat label="active now" value={activeCount} />
        <Stat label="messages" value={messages.length} />
      </section>

      {/* ── Fleet roster ───────────────────────────────────── */}
      <section className="ui-panel flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <Radio className="h-4 w-4 text-text-muted" />
            <p className="ui-kicker">Fleet roster</p>
          </span>
          <span className="text-micro text-text-tertiary">
            {activeCount} active · {roster.length} projects
          </span>
        </div>

        {roster.length === 0 ? (
          <p className="text-sm text-text-muted">
            No registered projects yet. Add one on{" "}
            <Link href="/projects" className="text-accent-text underline-offset-2 hover:underline">
              Projects
            </Link>{" "}
            to command its agents from here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {roster.map((r) => (
              <li key={r.name} className="ui-card-shell flex items-center gap-3 px-3 py-2.5">
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", r.open ? "bg-status-positive" : "bg-status-neutral")}
                  title={r.open ? "Agent tab open on the builder" : "Idle"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{r.name}</p>
                  <p className="truncate text-micro text-text-muted">
                    {r.open ? "Agent tab open on the builder" : r.description || "Idle"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    href={`/terminal?tab=${encodeURIComponent(r.name)}`}
                    className="ui-btn-chip inline-flex items-center gap-1.5"
                    title={`Watch ${r.name} live`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Watch
                  </Link>
                  <Link
                    href={`/control?project=${encodeURIComponent(r.name)}`}
                    className="ui-btn-chip inline-flex items-center gap-1.5"
                    title={`Dispatch to ${r.name}`}
                  >
                    <Rocket className="h-3 w-3" />
                    Dispatch
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Coordination feed ──────────────────────────────── */}
      <section className="ui-panel flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-text-muted" />
            <p className="ui-kicker">Coordination</p>
          </span>
          {presentTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn("ui-chip-toggle", filter === "all" && "ui-chip-toggle-active")}
              >
                all
              </button>
              {presentTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilter(t)}
                  className={cn("ui-chip-toggle capitalize", filter === t && "ui-chip-toggle-active")}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {commsLoading && messages.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="ui-spinner-sm" /> Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <p className="max-w-prose text-sm leading-relaxed text-text-muted">
            No agent-to-agent messages yet. When your agents coordinate on parallel work — handing off
            tasks, asking questions, escalating a blocker — it streams here so you can captain the fleet
            without reading every terminal.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-surface-overlay">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", m.type ? TYPE_DOT[m.type] : "bg-status-neutral")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-nano tabular-nums text-text-muted" title={m.ts}>
                      {m.ts.slice(5)}
                    </span>
                    <span className="text-sm font-medium text-text-primary">
                      {m.from} <span className="text-text-muted">→</span> {m.to}
                    </span>
                    {m.type && <span className={cn("ui-tag", TYPE_TAG[m.type])}>{m.type}</span>}
                  </div>
                  {m.re && <p className="mt-0.5 truncate text-sm text-text-secondary">{m.re}</p>}
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
