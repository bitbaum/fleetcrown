"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { NAV } from "@/config/navigation";
import type { AgentMessage } from "@/lib/agent-comms";

type CommsResp = { messages: AgentMessage[] };

/**
 * The only Agents fact that earns space on Control: an unread escalation.
 * Renders nothing when the bus is quiet — no essay, no empty feed, no tab.
 */
export function AgentEscalations() {
  const { data } = useFetch<CommsResp>("/api/agents/comms");
  const items = (data?.messages ?? []).filter((m) => m.type === "escalation" && !m.read);
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border-subtle border-l-2 border-l-status-negative bg-surface-base px-4 py-3">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-negative" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-secondary">Agent escalation</p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {items.slice(0, 3).map((m) => (
            <li key={m.id} className="min-w-0">
              <Link
                href={`${NAV.control.href}?project=${encodeURIComponent(m.from)}`}
                className="block min-h-11 text-sm text-text-primary sm:min-h-0"
              >
                <span className="font-medium">{m.from}</span>
                <span className="text-text-muted"> → {m.to}</span>
                {(m.re || m.body) && (
                  <span className="mt-0.5 block truncate text-xs text-text-secondary">
                    {m.re || m.body}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
