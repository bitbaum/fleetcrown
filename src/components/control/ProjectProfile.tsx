"use client";

import { useState } from "react";
import { ExternalLink, ChevronRight, Loader2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSIONS, interpolateDimensionPrompt } from "@/config/dimension-prompts";
import type { ProjectState } from "@/app/api/control/route";

const AGENTS = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "openclaw", label: "OpenClaw" },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

function MaturityDots({ maturity }: { maturity: string }) {
  const m = maturity.match(/^(\d+)/);
  if (!m) return <span className="text-sm text-text-secondary">{maturity}</span>;
  const n = parseInt(m[1], 10);
  const label = maturity.replace(/^\d+\/10\s*[-–]?\s*/, "").trim();
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-[3px] w-3 rounded-full transition-colors",
              i < n ? "bg-accent-text" : "bg-surface-overlay"
            )}
          />
        ))}
      </div>
      <span className="text-xs tabular-nums text-text-tertiary">{n}/10{label ? ` — ${label}` : ""}</span>
    </div>
  );
}

function StatusChip({ value }: { value: string }) {
  const v = value.toLowerCase();
  const active = v.includes("active") || v.includes("live") || v.includes("production");
  const warn = v.includes("pause") || v.includes("hold") || v.includes("slow");
  const cls = active
    ? "ui-tag ui-tag-positive"
    : warn
      ? "ui-tag ui-tag-warning"
      : "ui-tag ui-tag-neutral";
  return <span className={cls}>{value}</span>;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-x-4 items-baseline py-2.5 border-b border-border-subtle/50 last:border-0">
      <span className="ui-kicker shrink-0">{label}</span>
      <span className="text-sm leading-relaxed text-text-secondary">{children}</span>
    </div>
  );
}

function MetaSection({ profile }: { profile: NonNullable<ProjectState["profile"]> }) {
  const extraAttrs = Object.entries(profile.attrs).filter(
    ([k, v]) => v && !["mission", "stack", "status", "maturity", "url", "description"].includes(k)
  );

  return (
    <div className="px-5 pb-5 pt-4 space-y-5">
      {/* Description */}
      {profile.description && (
        <p className="text-[0.9375rem] leading-[1.65] text-text-secondary">{profile.description}</p>
      )}

      {/* Mission callout */}
      {profile.mission && (
        <div className="border-l-2 border-accent-primary/40 pl-4">
          <p className="ui-kicker mb-1.5">Mission</p>
          <p className="text-sm leading-relaxed text-text-primary">{profile.mission}</p>
        </div>
      )}

      {/* Core stats row */}
      {(profile.status || profile.maturity) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {profile.status && (
            <div className="flex items-center gap-2">
              <span className="ui-kicker">Status</span>
              <StatusChip value={profile.status} />
            </div>
          )}
          {profile.maturity && (
            <div className="flex items-center gap-2">
              <span className="ui-kicker">Maturity</span>
              <MaturityDots maturity={profile.maturity} />
            </div>
          )}
        </div>
      )}

      {/* URL */}
      {profile.url && (
        <a
          href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-accent-text hover:text-text-primary transition-colors"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          {profile.url.replace(/^https?:\/\//, "")}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      )}

      {/* Stack + extra attrs */}
      {(profile.stack || extraAttrs.length > 0) && (
        <div className="rounded-xl border border-border-subtle bg-surface-base overflow-hidden">
          {profile.stack && (
            <MetaRow label="Stack">{profile.stack}</MetaRow>
          )}
          {extraAttrs.map(([k, v]) => (
            <MetaRow key={k} label={k.replace(/_/g, " ")}>{v}</MetaRow>
          ))}
        </div>
      )}
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
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-surface-raised/40"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-base leading-none">{dimension.icon}</span>
          <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">{dimension.label}</span>
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-text-muted transition-transform duration-150", open && "rotate-90")} />
      </button>

      {open && (
        <div className="flex flex-wrap gap-2 px-5 pb-4 pt-1">
          {dimension.prompts.map((p) => {
            const rendered = interpolateDimensionPrompt(p.prompt, ctx);
            const uses = usageCounts.get(rendered) ?? 0;
            return (
              <button
                key={p.label}
                onClick={() => onRun(rendered)}
                disabled={isSending}
                className="min-h-[36px] rounded-xl border border-border-subtle bg-surface-base px-3.5 py-2 text-xs font-medium text-text-secondary transition-all hover:border-accent-primary/40 hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
              >
                {p.label}
                {uses > 0 && <span className="ml-2 text-[10px] text-text-muted">×{uses}</span>}
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
      <div className="flex items-center gap-3 border-t border-border-subtle px-5 py-3">
        <span className="ui-kicker shrink-0">Agent</span>
        <div className="flex gap-1.5">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => onSetAgent(localAgent === a.id ? null : a.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                activeAgent === a.id
                  ? "border-accent-primary/50 bg-accent-primary/10 text-accent-text"
                  : "border-border-subtle bg-surface-base text-text-tertiary hover:text-text-secondary hover:border-border-default"
              )}
            >
              {a.label}
              {a.id === globalAdapter && localAgent === null && (
                <span className="ml-1.5 opacity-40">✓</span>
              )}
            </button>
          ))}
        </div>
        {sending && <Loader2 className="ml-auto ui-spinner-sm text-text-muted" />}
      </div>

      {/* Project metadata */}
      {project.profile ? (
        <MetaSection profile={project.profile} />
      ) : (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-text-secondary">No profile — add metadata in the Projects view to enable full awareness.</p>
        </div>
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
