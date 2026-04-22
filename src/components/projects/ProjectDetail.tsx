"use client";

import { useEffect, useState } from "react";
import {
  X, Globe, GitBranch, AlertTriangle, ShieldAlert, Bot, Plus, Save, Pencil,
  Users, MessageSquare, ChevronDown, ChevronUp, Loader2,
  ToggleLeft, ToggleRight, Target, CheckCircle, Zap,
} from "lucide-react";
import { MaturityBar, StatusBadge } from "./project-badges";

// ─── Types ────────────────────────────────────────────────────────────────────

type Milestone = { title: string; done: boolean };

type LinkedGoal = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  progress: number | null;
  targetDate: string | null;
  milestones: Milestone[] | null;
};

type LinkedJob = {
  id: string;
  name: string;
  message: string;
  enabled: boolean;
  schedule: string;
  lastStatus?: string;
  consecutiveErrors?: number;
};

type ProjectData = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  source: string | null;
  attrs: Record<string, string>;
  relations: Array<{ type: string; strength: number | null; targetId: string; targetName: string; targetType: string }>;
  interactions: Array<{ channel: string; direction: string; summary: string | null; occurredAt: string }>;
  linkedJobs: LinkedJob[];
  linkedGoals: LinkedGoal[];
};

type Tab = "overview" | "prompts" | "goals";

// Keys shown as quick-links in header
const LINK_ATTRS = ["production_url", "repo", "github_repo", "url"];
// Issue keys rendered as warning cards
const ISSUE_ATTRS = ["broken_features", "security_vulnerability", "deployment_issue"];
// Keys with dedicated rendering (not shown in generic grid)
// "description" is shown in the panel header, "owner" shown as badge
const RESERVED = [...LINK_ATTRS, ...ISSUE_ATTRS, "status", "maturity", "description", "owner"];

// Suggested attrs to prompt the user to fill in if missing
const SUGGESTED_ATTRS: { key: string; label: string; placeholder: string }[] = [
  { key: "mission",   label: "Mission",   placeholder: "Why this project exists" },
  { key: "vision",    label: "Vision",    placeholder: "Where it's going in 3 years" },
  { key: "customers", label: "Customers", placeholder: "Who uses this and why" },
  { key: "stack",     label: "Stack",     placeholder: "Tech stack used" },
  { key: "next_step", label: "Next Step", placeholder: "Single most important next action" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddAttrInline({
  projectId,
  presetKey,
  presetPlaceholder,
  initialValue,
  onSaved,
  onCancel,
}: {
  projectId: string;
  presetKey?: string;
  presetPlaceholder?: string;
  initialValue?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [key, setKey] = useState(presetKey ?? "");
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!key.trim() || !value.trim() || saving) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}/attrs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSaving(false);
    setValue("");
    if (!presetKey) setKey("");
    onSaved();
  };

  return (
    <div className="flex gap-2 items-center">
      {!presetKey && (
        <input
          placeholder="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-24 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
        />
      )}
      <input
        placeholder={presetPlaceholder ?? "value"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel?.(); }}
        autoFocus
        className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
      />
      {onCancel && (
        <button onClick={onCancel} className="p-1.5 rounded text-white/25 hover:text-white/60 transition-colors shrink-0">
          <X className="h-3 w-3" />
        </button>
      )}
      <button
        onClick={save}
        disabled={!key.trim() || !value.trim() || saving}
        className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 text-white shrink-0 transition-colors"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </button>
    </div>
  );
}

function JobRow({
  job,
  onToggle,
}: {
  job: LinkedJob;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasError = (job.consecutiveErrors ?? 0) > 0;

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasError ? "bg-red-500" : job.enabled ? "bg-emerald-500" : "bg-white/20"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white/80 truncate">{job.name}</div>
          <div className="text-[10px] text-white/30 font-mono mt-0.5">{job.schedule}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(job.id, !job.enabled); }}
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            {job.enabled
              ? <ToggleRight className="h-4 w-4 text-emerald-500" />
              : <ToggleLeft className="h-4 w-4" />}
          </button>
          {expanded ? <ChevronUp className="h-3 w-3 text-white/20" /> : <ChevronDown className="h-3 w-3 text-white/20" />}
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-wider mt-2.5 mb-1.5">Prompt</div>
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded p-2.5 max-h-48 overflow-y-auto">
            {job.message}
          </pre>
          {hasError && (
            <div className="mt-2 text-[10px] text-red-400/70 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {job.consecutiveErrors} consecutive error{(job.consecutiveErrors ?? 0) > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewJobForm({
  projectId,
  projectName,
  onCreated,
}: {
  projectId: string;
  projectName: string;
  onCreated: (job: LinkedJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${projectName} — `);
  const [schedule, setSchedule] = useState("0 9 * * 1");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !schedule.trim() || !message.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/crons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scheduleExpr: schedule, message, projectId, projectName }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      onCreated({
        id: data.job.id, name: data.job.name,
        message: data.job.payload.message, enabled: data.job.enabled,
        schedule: data.job.schedule.expr, consecutiveErrors: 0,
      });
      setOpen(false);
      setMessage("");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-white/35 hover:text-emerald-400 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> New autopilot job for this project
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider">New Autopilot Job</div>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25" />
      <input placeholder="Cron (e.g. 0 9 * * 1 = Mon 9am)" value={schedule} onChange={(e) => setSchedule(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25" />
      <textarea placeholder="Prompt / instructions for Ivy…" value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-2 text-xs text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/25" />
      <button onClick={create} disabled={!name.trim() || !schedule.trim() || !message.trim() || saving}
        className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Create Job
      </button>
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function AttrRow({
  label,
  value,
  projectId,
  attrKey,
  onReload,
  placeholder,
}: {
  label: string;
  value: string;
  projectId: string;
  attrKey: string;
  onReload: () => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="py-1">
        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{label}</div>
        <AddAttrInline
          projectId={projectId}
          presetKey={attrKey}
          presetPlaceholder={placeholder ?? label}
          initialValue={value}
          onSaved={() => { setEditing(false); onReload(); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  const isUrl = value.startsWith("http");
  return (
    <div className="group flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] text-white/30 uppercase tracking-wider w-24 shrink-0 pt-0.5 leading-relaxed">{label}</span>
      <div className="flex-1 min-w-0 flex items-start gap-1.5">
        {isUrl ? (
          <a href={value} target="_blank" rel="noreferrer"
            className="text-xs text-white/60 hover:text-white/85 underline underline-offset-2 break-all leading-relaxed">
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-xs text-white/75 leading-relaxed break-words">{value}</span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-all shrink-0 mt-0.5"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function OverviewTab({
  data,
  projectId,
  onReload,
}: {
  data: ProjectData;
  projectId: string;
  onReload: () => void;
}) {
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const attrs = data.attrs;

  // All attrs except reserved ones (links/issues/status/maturity shown in header)
  const displayAttrs = Object.entries(attrs).filter(([k]) => !RESERVED.includes(k));

  // Which suggested attrs are missing
  const missingSuggested = SUGGESTED_ATTRS.filter(({ key }) => !attrs[key]);

  // Label map for suggested attrs
  const suggestedLabel: Record<string, string> = Object.fromEntries(
    SUGGESTED_ATTRS.map(({ key, label }) => [key, label])
  );
  const suggestedPlaceholder: Record<string, string> = Object.fromEntries(
    SUGGESTED_ATTRS.map(({ key, placeholder }) => [key, placeholder])
  );

  return (
    <div className="space-y-5">
      {/* Issues — most critical, shown first */}
      {ISSUE_ATTRS.some((k) => attrs[k]) && (
        <div className="space-y-2">
          {attrs["security_vulnerability"] && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] p-3">
              <div className="flex items-center gap-1.5 text-red-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Security Risk
              </div>
              <p className="text-xs text-red-300/70 leading-relaxed">{attrs["security_vulnerability"]}</p>
            </div>
          )}
          {attrs["broken_features"] && (
            <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-yellow-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Broken Features
              </div>
              <p className="text-xs text-yellow-300/70 leading-relaxed">{attrs["broken_features"]}</p>
            </div>
          )}
          {attrs["deployment_issue"] && (
            <div className="rounded-lg border border-orange-500/25 bg-orange-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-orange-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Deployment Issue
              </div>
              <p className="text-xs text-orange-300/70 leading-relaxed">{attrs["deployment_issue"]}</p>
            </div>
          )}
        </div>
      )}

      {/* All present attributes */}
      {displayAttrs.length > 0 ? (
        <div>
          {displayAttrs.map(([key, value]) => (
            <AttrRow
              key={key}
              label={suggestedLabel[key] ?? key.replace(/_/g, " ")}
              value={value}
              projectId={projectId}
              attrKey={key}
              onReload={onReload}
              placeholder={suggestedPlaceholder[key]}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/25 italic">No details recorded yet.</p>
      )}

      {/* Missing suggested fields — collapsed by default */}
      {missingSuggested.length > 0 && (
        <div>
          {showEmpty ? (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-white/20 mb-2">Add missing context</div>
              {missingSuggested.map(({ key, label, placeholder }) => (
                <div key={key}>
                  {addingKey === key ? (
                    <div className="py-1">
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{label}</div>
                      <AddAttrInline
                        projectId={projectId}
                        presetKey={key}
                        presetPlaceholder={placeholder}
                        onSaved={() => { setAddingKey(null); setShowEmpty(false); onReload(); }}
                        onCancel={() => setAddingKey(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingKey(key)}
                      className="flex items-center gap-1.5 w-full text-left py-1.5 text-xs text-white/25 hover:text-white/50 transition-colors"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      <span className="font-medium text-white/35">{label}</span>
                      <span className="text-white/20 italic ml-1">— {placeholder}</span>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setShowEmpty(false)} className="text-[10px] text-white/20 hover:text-white/40 transition-colors mt-1">
                Collapse
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowEmpty(true)}
              className="flex items-center gap-1.5 text-xs text-white/20 hover:text-white/45 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {missingSuggested.map((s) => s.label.toLowerCase()).join(", ")}
            </button>
          )}
        </div>
      )}

      {/* Custom attribute */}
      {addingKey === "__custom__" ? (
        <div className="pt-1">
          <AddAttrInline
            projectId={projectId}
            onSaved={() => { setAddingKey(null); onReload(); }}
            onCancel={() => setAddingKey(null)}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddingKey("__custom__")}
          className="flex items-center gap-1.5 text-xs text-white/20 hover:text-emerald-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add custom attribute
        </button>
      )}

      {/* People relations */}
      {data.relations.filter((r) => r.targetType === "person").length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 mb-2 font-medium">
            <Users className="h-3 w-3" /> People
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.relations
              .filter((r) => r.targetType === "person")
              .map((r, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white/55">
                  {r.targetName}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {data.interactions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 mb-2 font-medium">
            <MessageSquare className="h-3 w-3" /> Recent Activity
          </div>
          <div className="space-y-3">
            {data.interactions.map((i, idx) => (
              <div key={idx} className="text-xs">
                <div className="text-white/25 mb-0.5">
                  {i.channel} · {new Date(i.occurredAt).toLocaleDateString()}
                </div>
                {i.summary && <p className="text-white/50 leading-relaxed">{i.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromptsTab({
  data,
  projectId,
  jobs,
  setJobs,
}: {
  data: ProjectData;
  projectId: string;
  jobs: LinkedJob[];
  setJobs: React.Dispatch<React.SetStateAction<LinkedJob[]>>;
}) {
  const toggleJob = async (id: string, enabled: boolean) => {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, enabled } : j));
    await fetch("/api/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">
        <Bot className="h-3.5 w-3.5" />
        Autopilot Jobs {jobs.length > 0 && <span className="text-white/20 normal-case">({jobs.length})</span>}
      </div>

      {jobs.length === 0 ? (
        <p className="text-xs text-white/25">No autopilot jobs linked to this project yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onToggle={toggleJob} />
          ))}
        </div>
      )}

      <NewJobForm
        projectId={projectId}
        projectName={data.name}
        onCreated={(job) => setJobs((prev) => [...prev, job])}
      />

      {/* Quick link to prompts library */}
      <a
        href="/prompts"
        className="flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors"
      >
        <Zap className="h-3.5 w-3.5" /> Browse Prompt Library →
      </a>
    </div>
  );
}

function GoalsTab({ goals: initialGoals, projectId }: { goals: LinkedGoal[]; projectId: string }) {
  const [linked, setLinked] = useState<LinkedGoal[]>(initialGoals);
  const [linking, setLinking] = useState(false);
  const [allGoals, setAllGoals] = useState<Array<{ id: string; title: string; entityId: string | null }>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  const openLink = async () => {
    setLinking(true);
    setSelectedId("");
    const res = await fetch("/api/goals");
    const data = await res.json();
    // Exclude already-linked goals
    const linkedIds = new Set(linked.map((g) => g.id));
    setAllGoals((data.goals ?? []).filter((g: { id: string }) => !linkedIds.has(g.id)));
  };

  const handleLink = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`/api/goals/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: projectId }),
      });
      const chosen = allGoals.find((g) => g.id === selectedId);
      if (chosen) {
        setLinked((prev) => [...prev, { id: chosen.id, title: chosen.title, description: null, status: "active", progress: 0, targetDate: null, milestones: null }]);
      }
      setLinking(false);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (goalId: string) => {
    await fetch(`/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: null }),
    });
    setLinked((prev) => prev.filter((g) => g.id !== goalId));
  };

  return (
    <div className="space-y-3">
      {linked.map((goal) => {
        const progress = goal.progress ?? 0;
        const milestones = goal.milestones ?? [];
        const done = milestones.filter((m) => m.done).length;
        const isCompleted = goal.status === "completed";
        return (
          <div key={goal.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 group">
            <div className="flex items-start gap-2.5">
              {isCompleted
                ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                : <Target className="h-4 w-4 text-emerald-500/50 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-white/85">{goal.title}</div>
                  <button
                    onClick={() => handleUnlink(goal.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all ml-auto shrink-0"
                    title="Unlink from project"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {goal.description && (
                  <p className="text-[11px] text-white/40 mt-0.5">{goal.description}</p>
                )}
                {!isCompleted && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-white/30 mb-1">
                      <span>{progress}%</span>
                      {milestones.length > 0 && <span>{done}/{milestones.length} milestones</span>}
                    </div>
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progress >= 80 ? "bg-emerald-500" : progress >= 50 ? "bg-yellow-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.max(progress, 1)}%` }}
                      />
                    </div>
                  </div>
                )}
                {milestones.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        {m.done
                          ? <CheckCircle className="h-3 w-3 text-emerald-500/60 shrink-0" />
                          : <div className="h-3 w-3 rounded-full border border-white/20 shrink-0" />}
                        <span className={m.done ? "text-white/25 line-through" : "text-white/55"}>{m.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {linked.length === 0 && !linking && (
        <p className="text-xs text-white/25 pt-1">No goals linked to this project.</p>
      )}

      {linking ? (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            autoFocus
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/25"
          >
            <option value="">— Select a goal —</option>
            {allGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <button
            onClick={handleLink}
            disabled={!selectedId || saving}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-medium transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
          </button>
          <button onClick={() => setLinking(false)} className="px-2 py-1.5 text-xs text-white/30 hover:text-white/60">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={openLink}
          className="flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Link existing goal
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [tab, setTab] = useState<Tab>("overview");

  const reload = () => {
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d: ProjectData) => {
        setData(d);
        setJobs(d.linkedJobs ?? []);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [projectId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const attrs = data?.attrs ?? {};
  const description = data?.description ?? attrs["description"] ?? null;
  const owner = attrs["owner"] ?? null;
  const prodUrl = attrs["production_url"] ?? attrs["url"];
  const repo = attrs["repo"] ?? attrs["github_repo"];
  const hasIssues = ["security_vulnerability", "broken_features", "deployment_issue"].some((k) => attrs[k]);
  const jobCount = jobs.length;
  const goalCount = data?.linkedGoals.length ?? 0;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "prompts",  label: "Prompts",  badge: jobCount || undefined },
    { id: "goals",    label: "Goals",    badge: goalCount || undefined },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[#0c0e14] border-l border-white/10 flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="shrink-0 bg-[#0c0e14] border-b border-white/10">
          {/* Top row: name + links + close */}
          <div className="flex items-start gap-3 px-5 pt-4 pb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold truncate">
                  {loading ? "Loading…" : (data?.name ?? "Not found")}
                </h2>
                {owner && (
                  <span className="text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 shrink-0">{owner}</span>
                )}
              </div>
              {description && (
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed line-clamp-2">
                  {description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {prodUrl && (
                <a href={prodUrl.startsWith("http") ? prodUrl : `https://${prodUrl}`}
                  target="_blank" rel="noreferrer"
                  className="p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors" title="Live site">
                  <Globe className="h-4 w-4" />
                </a>
              )}
              {repo && (
                <a href={repo.startsWith("http") ? repo : `https://github.com/${repo}`}
                  target="_blank" rel="noreferrer"
                  className="p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors" title="Repository">
                  <GitBranch className="h-4 w-4" />
                </a>
              )}
              <button onClick={onClose}
                className="ml-1 p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Status + Maturity row */}
          {data && (attrs["status"] || attrs["maturity"]) && (
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
              {attrs["status"] && <StatusBadge value={attrs["status"]} />}
              {attrs["maturity"] && <MaturityBar value={attrs["maturity"]} />}
              {hasIssues && (
                <span className="flex items-center gap-1 text-[10px] text-red-400/70 ml-auto">
                  <AlertTriangle className="h-3 w-3" /> Issues detected
                </span>
              )}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex border-t border-white/[0.06]">
            {TABS.map(({ id, label, badge }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                  tab === id
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-white/40 hover:text-white/70 hover:border-white/20"
                }`}
              >
                {label}
                {badge !== undefined && badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    tab === id ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/30"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          ) : !data ? (
            <p className="text-sm text-white/30">Project not found</p>
          ) : tab === "overview" ? (
            <OverviewTab data={data} projectId={projectId} onReload={reload} />
          ) : tab === "prompts" ? (
            <PromptsTab data={data} projectId={projectId} jobs={jobs} setJobs={setJobs} />
          ) : (
            <GoalsTab goals={data.linkedGoals} projectId={data.id} />
          )}
        </div>
      </div>
    </div>
  );
}
