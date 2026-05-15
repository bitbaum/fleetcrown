"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, ChevronRight, Loader2, Globe, History, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";
import { patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";
import { setAttr } from "@/lib/api/attrs";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";
import type { ProjectState } from "@/lib/control-types";
import type { DevLogEntry, UserProject } from "@/db/schema/user-projects";
import { DevLogList } from "@/components/shared/DevLogList";

type AgentEntry = { id: string; label: string; modelSuggestions: string[] };
type AgentId = string;

// Dimension display metadata — the order and icons live here in the UI layer
const DIMENSION_META: Record<string, { label: string; icon: string }> = {
  engineering: { label: "Engineering",  icon: "⚙" },
  product:     { label: "Product",      icon: "📦" },
  ux:          { label: "UX / Design",  icon: "🎨" },
  marketing:   { label: "Marketing",    icon: "📣" },
  content:     { label: "Content",      icon: "✍" },
  business:    { label: "Business",     icon: "💼" },
  deploy:      { label: "Deploy",       icon: "🚀" },
};

function interpolate(
  template: string,
  ctx: { name: string; path: string; mission?: string; stack?: string; url?: string },
): string {
  return template
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{path\}/g, ctx.path)
    .replace(/\{mission\}/g, ctx.mission ?? "not specified")
    .replace(/\{stack\}/g, ctx.stack ?? "not specified")
    .replace(/\{url\}/g, ctx.url ?? "not deployed yet");
}

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
  const cls = active ? "ui-tag ui-tag-positive" : warn ? "ui-tag ui-tag-warning" : "ui-tag ui-tag-neutral";
  return <span className={cls}>{value}</span>;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-y-1 border-b border-border-subtle/50 py-2.5 last:border-0 sm:grid-cols-[6rem_1fr] sm:items-baseline sm:gap-x-4">
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
    <div className="space-y-5 px-4 pb-5 pt-4 sm:px-5">
      {profile.description && (
        <p className="text-base leading-relaxed text-text-secondary">{profile.description}</p>
      )}
      {profile.mission && (
        <div className="border-l-2 border-accent-primary/40 pl-4">
          <p className="ui-kicker mb-1.5">Mission</p>
          <p className="text-sm leading-relaxed text-text-primary">{profile.mission}</p>
        </div>
      )}
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
      {(profile.stack || extraAttrs.length > 0) && (
        <div className="ui-panel overflow-hidden">
          {profile.stack && <MetaRow label="Stack">{profile.stack}</MetaRow>}
          {extraAttrs.map(([k, v]) => (
            <MetaRow key={k} label={k.replace(/_/g, " ")}>{v}</MetaRow>
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionSection({
  dimensionId,
  prompts,
  project,
  usageCounts,
  isSending,
  onRun,
}: {
  dimensionId: string;
  prompts: AgentPrompt[];
  project: ProjectState;
  usageCounts: Map<string, number>;
  isSending: boolean;
  onRun: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = DIMENSION_META[dimensionId];
  if (!meta || prompts.length === 0) return null;

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
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-raised/40 sm:px-5"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-base leading-none">{meta.icon}</span>
          <span className="text-sm font-medium text-text-secondary">{meta.label}</span>
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-text-muted transition-transform duration-150", open && "rotate-90")} />
      </button>

      {open && (
        <div className="flex flex-wrap gap-2 px-4 pb-4 pt-1 sm:px-5">
          {prompts.map((p) => {
            const rendered = interpolate(p.prompt, ctx);
            const uses = usageCounts.get(rendered) ?? 0;
            return (
              <button
                key={p.key}
                onClick={() => onRun(rendered)}
                disabled={isSending}
                className="min-h-10 rounded-xl border border-border-subtle bg-surface-base px-3.5 py-2 text-xs font-medium text-text-secondary transition-all hover:border-accent-primary/40 hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
              >
                {p.icon} {p.label}
                {uses > 0 && <span className="ml-2 text-micro text-text-tertiary">×{uses}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotesSection({ projectId, project }: { projectId: string; project: UserProject | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const value = draft ?? project?.notes ?? "";

  const persist = useCallback(async (text: string) => {
    setSaving(true);
    try {
      await patchJson(`/api/user-projects/${projectId}`, { notes: text || undefined });
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }, [projectId]);

  const handleChange = (text: string) => {
    setDraft(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(text), 900);
  };

  const handleBlur = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (draft !== null) persist(draft);
  };

  if (!project) return null;

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-raised/40 sm:px-5"
      >
        <span className="flex items-center gap-2.5">
          <StickyNote className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-sm font-medium text-text-secondary">Notes</span>
          {project.notes && <span className="h-1.5 w-1.5 rounded-full bg-accent-text/50" />}
        </span>
        <span className="flex items-center gap-2">
          {saving && <Loader2 className="h-3 w-3 animate-spin text-text-muted" />}
          <ChevronRight className={cn("h-3.5 w-3.5 text-text-muted transition-transform duration-150", open && "rotate-90")} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 sm:px-5">
          <textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="Free-form notes, context, or reminders for this project…"
            rows={5}
            className="w-full resize-y rounded-xl border border-border-subtle bg-surface-base px-3.5 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent-primary/50 focus:outline-none focus:ring-1 focus:ring-accent-primary/20"
          />
        </div>
      )}
    </div>
  );
}

function DevLogSection({ entries }: { entries: DevLogEntry[] }) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-raised/40 sm:px-5"
      >
        <span className="flex items-center gap-2.5">
          <History className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-sm font-medium text-text-secondary">Dev Log</span>
          <span className="ml-1 text-xs text-text-muted">({entries.length})</span>
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-text-muted transition-transform duration-150", open && "rotate-90")} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 sm:px-5">
          <DevLogList entries={entries} />
        </div>
      )}
    </div>
  );
}

function RemoveSection({ projectId, onRemoved }: { projectId: string; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await deleteJson(`/api/user-projects/${projectId}`);
      if (!res.ok) await throwApiError(res, "Failed to remove");
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
      setRemoving(false);
    }
  };

  return (
    <div className="border-t border-border-subtle px-4 py-3 sm:px-5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-tertiary">Remove from control panel?</span>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-status-negative transition-colors hover:opacity-80 disabled:opacity-50"
          >
            {removing ? <Loader2 className="ui-spinner-xs" /> : "Remove"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null); }}
            className="text-text-muted transition-colors hover:text-text-secondary"
          >
            Cancel
          </button>
          {error && <p className="ui-error-xs w-full">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-status-negative"
        >
          <Trash2 className="h-3 w-3" />
          Remove from control panel
        </button>
      )}
    </div>
  );
}

function QuickProfileForm({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [mission, setMission] = useState("");
  const [stack, setStack] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAny = mission.trim() || stack.trim() || url.trim();

  const handleSave = async () => {
    if (!hasAny || saving) return;
    setSaving(true);
    setError(null);
    try {
      const base = `/api/projects/${projectId}`;
      await Promise.all([
        mission.trim() ? setAttr(base, "mission", mission.trim()) : null,
        stack.trim() ? setAttr(base, "stack", stack.trim()) : null,
        url.trim() ? setAttr(base, "url", url.trim()) : null,
      ]);
      onSaved();
    } catch {
      setError("Failed to save — try again");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pb-5 pt-3 sm:px-5">
      <div className="space-y-2.5">
        <div>
          <p className="ui-kicker mb-1.5">Mission</p>
          <input
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="One sentence: what this project does and for whom"
            className="ui-input w-full"
          />
        </div>
        <div>
          <p className="ui-kicker mb-1.5">Stack</p>
          <input
            value={stack}
            onChange={(e) => setStack(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="e.g. Next.js · TypeScript · PostgreSQL"
            className="ui-input w-full"
          />
        </div>
        <div>
          <p className="ui-kicker mb-1.5">URL</p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="https://…"
            className="ui-input w-full"
          />
        </div>
      </div>
      {error && <p className="ui-error-xs">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !hasAny}
          className="ui-btn-primary gap-1.5"
        >
          {saving ? <Loader2 className="ui-spinner-sm" /> : null}
          {saving ? "Saving…" : "Save profile"}
        </button>
        <Link
          href={`/projects?open=${projectId}`}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Full editor in Projects →
        </Link>
      </div>
    </div>
  );
}

export function ProjectProfile({
  project,
  globalAdapter,
  localAgent,
  availableAgents,
  onSetAgent,
  onRunPrompt,
  onDeleted,
  onProfileSaved,
}: {
  project: ProjectState;
  globalAdapter: string;
  localAgent: AgentId | null;
  availableAgents: AgentEntry[];
  onSetAgent: (agent: AgentId | null) => void;
  onRunPrompt: (prompt: string, agent: string) => Promise<void>;
  onDeleted?: () => void;
  onProfileSaved?: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [localModel, setLocalModel] = useState<string | null>(project.modelPref ?? null);
  const activeAgent = localAgent ?? (project.agentPref as AgentId | null) ?? (globalAdapter as AgentId);

  const persistAgentPref = (agentId: AgentId | null) => {
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { agentPref: agentId ?? undefined }).catch(() => {});
    }
    onSetAgent(agentId);
  };

  const persistModelPref = (model: string | null) => {
    setLocalModel(model);
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { modelPref: model ?? undefined }).catch(() => {});
    }
  };

  const { data: allPrompts } = useFetch<AgentPrompt[]>("/api/prompts/agent");
  const { data: userProject } = useFetch<UserProject>(project.id ? `/api/user-projects/${project.id}` : null);
  const devLogEntries = useMemo<DevLogEntry[]>(() => {
    if (!userProject?.devLog) return [];
    return [...userProject.devLog].reverse().slice(0, 12);
  }, [userProject]);

  // Group dimension prompts by dimensionId, ordered by DIMENSION_META insertion order
  const dimensionGroups = useMemo(() => {
    if (!allPrompts) return [];
    const byDim = new Map<string, AgentPrompt[]>();
    for (const p of allPrompts) {
      if (!p.dimensionId || p.style === "internal") continue;
      if (!byDim.has(p.dimensionId)) byDim.set(p.dimensionId, []);
      byDim.get(p.dimensionId)!.push(p);
    }
    return Object.keys(DIMENSION_META).filter((id) => byDim.has(id)).map((id) => ({
      id,
      prompts: byDim.get(id)!,
    }));
  }, [allPrompts]);

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
      <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <span className="ui-kicker shrink-0">Agent</span>
        <div className="flex flex-wrap gap-1.5">
          {availableAgents.map((a) => (
            <button
              key={a.id}
              onClick={() => persistAgentPref(localAgent === a.id ? null : a.id as AgentId)}
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

      {/* Model selector — shows suggestions for the active agent */}
      {(() => {
        const agentEntry = availableAgents.find((a) => a.id === activeAgent);
        const suggestions = agentEntry?.modelSuggestions ?? [];
        if (suggestions.length === 0) return null;
        const activeModel = localModel ?? suggestions[0];
        return (
          <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <span className="ui-kicker shrink-0">Model</span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((m) => (
                <button
                  key={m}
                  onClick={() => persistModelPref(m === suggestions[0] ? null : m)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    activeModel === m
                      ? "border-accent-primary/50 bg-accent-primary/10 text-accent-text"
                      : "border-border-subtle bg-surface-base text-text-tertiary hover:text-text-secondary hover:border-border-default"
                  )}
                >
                  {m}
                  {m === suggestions[0] && <span className="ml-1.5 opacity-40">default</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Project metadata */}
      {project.profile ? (
        <MetaSection profile={project.profile} />
      ) : project.projectId ? (
        <div className="border-t border-border-subtle">
          <div className="px-4 pt-3 sm:px-5">
            <p className="text-xs text-text-tertiary">
              No profile yet — add context so agents know what this project is about.
            </p>
          </div>
          <QuickProfileForm
            projectId={project.projectId}
            onSaved={() => onProfileSaved?.()}
          />
        </div>
      ) : (
        <div className="px-4 py-6 text-center sm:px-5">
          <p className="text-sm text-text-secondary">
            No profile — add metadata in the Projects view to enable full awareness.
          </p>
        </div>
      )}

      {/* Dimension prompt sections — loaded from ~/.config/agent-prompts.json */}
      {dimensionGroups.map(({ id, prompts }) => (
        <DimensionSection
          key={id}
          dimensionId={id}
          prompts={prompts}
          project={project}
          usageCounts={usageCounts}
          isSending={sending}
          onRun={handleRun}
        />
      ))}

      {/* Per-project notes / scratchpad */}
      {project.id && <NotesSection projectId={project.id} project={userProject} />}

      {/* Dev log — appended automatically when beacon sessions end */}
      {project.id && <DevLogSection entries={devLogEntries} />}

      {project.id && onDeleted && (
        <RemoveSection projectId={project.id} onRemoved={onDeleted} />
      )}
    </div>
  );
}
