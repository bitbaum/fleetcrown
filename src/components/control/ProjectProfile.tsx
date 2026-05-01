"use client";

import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSIONS, interpolateDimensionPrompt } from "@/config/dimension-prompts";
import type { ProjectState } from "@/app/api/control/route";

const AGENTS = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "openclaw", label: "OpenClaw" },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

function MaturityBar({ maturity }: { maturity: string }) {
  const m = maturity.match(/^(\d+)/);
  if (!m) return <span className="text-sm text-text-secondary">{maturity}</span>;
  const n = parseInt(m[1], 10);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={cn("h-1.5 w-1.5 rounded-full", i < n ? "bg-indigo-400" : "bg-white/10")} />
        ))}
      </div>
      <span className="text-xs text-text-tertiary">{maturity.replace(/^\d+\/10\s*[-–]?\s*/, "")}</span>
    </div>
  );
}

function MetaSection({ profile }: { profile: NonNullable<ProjectState["profile"]> }) {
  const rows = [
    { key: "Mission", value: profile.mission },
    { key: "Stack", value: profile.stack },
    { key: "Status", value: profile.status },
    ...Object.entries(profile.attrs)
      .filter(([k]) => !["mission", "stack", "status", "maturity", "url", "description"].includes(k) && profile.attrs[k])
      .map(([k, v]) => ({ key: k.replace(/_/g, " "), value: v })),
  ].filter((r) => r.value);

  return (
    <div className="space-y-3 px-5 pb-4 pt-3">
      {profile.description && (
        <p className="text-sm leading-relaxed text-text-secondary">{profile.description}</p>
      )}
      {profile.url && (
        <a
          href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:text-text-primary"
        >
          {profile.url} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {profile.maturity && (
        <div>
          <p className="ui-kicker mb-1">Maturity</p>
          <MaturityBar maturity={profile.maturity} />
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(({ key, value }) => (
          <>
            <dt key={`k-${key}`} className="ui-kicker self-start pt-0.5 capitalize">{key}</dt>
            <dd key={`v-${key}`} className="text-sm leading-relaxed text-text-secondary">{value}</dd>
          </>
        ))}
      </dl>
    </div>
  );
}

function DimensionSection({
  dimension,
  project,
  usageCounts,
  isSending,
  onRun,
}: {
  dimension: (typeof DIMENSIONS)[number];
  project: ProjectState;
  usageCounts: Map<string, number>;
  isSending: boolean;
  onRun: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const ctx = {
    name: project.tab,
    path: project.dir,
    mission: project.profile?.mission,
    stack: project.profile?.stack,
    url: project.profile?.url,
  };

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <span className="flex items-center gap-2">
          <span>{dimension.icon}</span>
          <span className="font-medium">{dimension.label}</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {dimension.prompts.map((p) => {
            const rendered = interpolateDimensionPrompt(p.prompt, ctx);
            const uses = usageCounts.get(rendered) ?? 0;
            return (
              <button
                key={p.label}
                onClick={() => onRun(rendered)}
                disabled={isSending}
                className="group relative min-h-[44px] rounded-2xl border border-border-subtle bg-surface-base px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-accent-primary/40 hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
              >
                {p.label}
                {uses > 0 && (
                  <span className="ml-2 text-xs text-text-muted">×{uses}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjectProfile({
  project,
  globalAdapter,
  localAgent,
  onSetAgent,
  onRunPrompt,
}: {
  project: ProjectState;
  globalAdapter: string;
  localAgent: AgentId | null;
  onSetAgent: (agent: AgentId | null) => void;
  onRunPrompt: (prompt: string, agent: string) => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const activeAgent = localAgent ?? (globalAdapter as AgentId);

  // Build usage count map from logged history — prompt text → run count
  const usageCounts = new Map<string, number>();
  for (const r of project.recentCustomPrompts) {
    usageCounts.set(r.customPrompt, r.count);
  }

  const handleRun = async (prompt: string) => {
    setSending(true);
    try {
      await onRunPrompt(prompt, activeAgent);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {/* Agent selector */}
      <div className="flex items-center gap-2 border-t border-border-subtle px-5 py-3">
        <span className="ui-kicker shrink-0">Agent</span>
        <div className="flex flex-wrap gap-1.5">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => onSetAgent(localAgent === a.id ? null : a.id)}
              className={cn(
                "min-h-[36px] rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                activeAgent === a.id
                  ? "border-accent-primary/60 bg-accent-primary/10 text-accent-text"
                  : "border-border-subtle bg-surface-base text-text-secondary hover:text-text-primary"
              )}
            >
              {a.label}
              {a.id === globalAdapter && localAgent === null && (
                <span className="ml-1 text-text-muted">(default)</span>
              )}
            </button>
          ))}
        </div>
        {sending && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-text-muted" />}
      </div>

      {/* Project metadata */}
      {project.profile ? (
        <MetaSection profile={project.profile} />
      ) : (
        <p className="px-5 py-3 text-sm text-text-muted">No profile data — add this project to the DB to unlock full awareness.</p>
      )}

      {/* Dimension prompt sections */}
      {DIMENSIONS.map((dim) => (
        <DimensionSection
          key={dim.id}
          dimension={dim}
          project={project}
          usageCounts={usageCounts}
          isSending={sending}
          onRun={handleRun}
        />
      ))}
    </div>
  );
}
