"use client";

import { useState } from "react";
import {
  Search,
  Zap,
  Clock,
  Globe,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Copy,
  Check,
  X,
  Star,
} from "lucide-react";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import {
  PROMPT_TEMPLATES,
  CATEGORY_META,
  type PromptTemplate,
  type PromptCategory,
} from "@/config/prompt-library";

type Project = { id: string; name: string };

// ─── Schedule Modal ─────────────────────────────────────────────────────────

function ScheduleModal({
  template,
  projects,
  onClose,
}: {
  template: PromptTemplate;
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [schedule, setSchedule] = useState(template.suggestedSchedule ?? "0 9 * * 1");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const resolvedMessage =
    template.scope === "project" && projectName
      ? template.template.replaceAll("{{project_name}}", projectName)
      : template.template;

  const jobName =
    template.scope === "project" && projectName
      ? `${projectName} — ${template.name}`
      : template.name;

  const handleCreate = async () => {
    if (template.scope === "project" && !projectId) return;
    setSaving(true);
    await fetch("/api/crons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: jobName,
        scheduleExpr: schedule,
        message: resolvedMessage,
        ...(projectId ? { projectId, projectName } : {}),
      }),
    });
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Schedule Job</div>
          <button onClick={onClose} className="p-1 text-white/40 hover:text-white/70 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="text-xs text-white/50 bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
          <div className="font-medium text-white/70 mb-1">{template.name}</div>
          <div className="text-white/35">{template.description}</div>
        </div>

        {template.scope === "project" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                const p = projects.find((p) => p.id === e.target.value);
                setProjectId(e.target.value);
                setProjectName(p?.name ?? "");
              }}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
            >
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
            Schedule (cron)
          </label>
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 font-mono focus:outline-none focus:border-white/25"
            placeholder="0 9 * * 1"
          />
          <div className="text-[10px] text-white/25 mt-1">
            Examples: <code>0 9 * * 1</code> Mon 9am · <code>0 9 * * 1-5</code> Weekdays 9am · <code>0 18 * * 5</code> Fri 6pm
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={saving || done || (template.scope === "project" && !projectId)}
          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {done ? (
            <><Check className="h-4 w-4" /> Scheduled!</>
          ) : saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
          ) : (
            <><Clock className="h-4 w-4" /> Create Scheduled Job</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Run Modal ───────────────────────────────────────────────────────────────

function RunModal({
  template,
  projects,
  onClose,
}: {
  template: PromptTemplate;
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(
    template.scope === "global" ? "__global__" : "",
  );
  const [projectName, setProjectName] = useState("");
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resolvedMessage =
    template.scope === "project" && projectName
      ? template.template.replaceAll("{{project_name}}", projectName)
      : template.template;

  const canRun = template.scope === "global" || !!projectId;

  const handleRun = async () => {
    if (!canRun || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/ivy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: resolvedMessage }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data.text ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!running ? onClose : undefined} />
      <div className="relative w-full max-w-2xl bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10 shrink-0">
          <div>
            <div className="text-sm font-semibold">{template.name}</div>
            <div className="text-xs text-white/40 mt-0.5">{template.description}</div>
          </div>
          <button onClick={onClose} disabled={running} className="p-1 text-white/40 hover:text-white/70 rounded disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {/* Project selector */}
          {template.scope === "project" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase tracking-wider text-white/30">Project</label>
                {projectId && projectId !== "__global__" && (
                  <button
                    onClick={() => setShowProjectDetail(true)}
                    className="text-[10px] text-emerald-400/70 hover:text-emerald-400 transition-colors flex items-center gap-1"
                  >
                    <FolderOpen className="h-3 w-3" /> View project →
                  </button>
                )}
              </div>
              <select
                value={projectId}
                onChange={(e) => {
                  const p = projects.find((p) => p.id === e.target.value);
                  setProjectId(e.target.value);
                  setProjectName(p?.name ?? "");
                }}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25"
              >
                <option value="">— Select project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Prompt preview */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Prompt</div>
            <pre className="text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded-lg p-3 border border-white/[0.06] max-h-40 overflow-y-auto">
              {resolvedMessage}
            </pre>
          </div>

          {/* Result */}
          {(running || result || error) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 flex items-center justify-between">
                <span>Ivy&apos;s Response</span>
                {result && (
                  <button onClick={handleCopy} className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              {running && (
                <div className="flex items-center gap-2 text-xs text-white/40 p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  Ivy is working… (this may take up to 60s)
                </div>
              )}
              {error && (
                <div className="text-xs text-red-300/80 p-3 bg-red-500/[0.06] rounded-lg border border-red-500/20">
                  {error}
                </div>
              )}
              {result && (
                <pre className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                  {result}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 shrink-0">
          <button
            onClick={handleRun}
            disabled={!canRun || running}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {running ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
            ) : (
              <><Zap className="h-4 w-4" /> Run with Ivy</>
            )}
          </button>
        </div>
      </div>

      {/* Project detail overlay */}
      {showProjectDetail && projectId && projectId !== "__global__" && (
        <ProjectDetail
          projectId={projectId}
          onClose={() => setShowProjectDetail(false)}
        />
      )}
    </div>
  );
}

// ─── Template Card (compact row for category sections) ────────────────────────

function PromptRow({
  template,
  projects,
}: {
  template: PromptTemplate;
  projects: Project[];
}) {
  const [showRun, setShowRun] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[template.category];

  return (
    <>
      <div className="group flex flex-col gap-0 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.04] transition-colors">
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white/80 truncate">{template.name}</span>
              {template.scope === "global" ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/25 border border-white/[0.07] flex items-center gap-0.5 shrink-0">
                  <Globe className="h-2 w-2" /> global
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/25 border border-white/[0.07] flex items-center gap-0.5 shrink-0">
                  <FolderOpen className="h-2 w-2" /> project
                </span>
              )}
              {template.suggestedSchedule && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/20 border border-white/[0.06] flex items-center gap-0.5 shrink-0">
                  <Clock className="h-2 w-2" /> schedulable
                </span>
              )}
            </div>
            <div className="text-xs text-white/35 mt-0.5 leading-relaxed truncate">{template.description}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded text-white/20 hover:text-white/50 transition-colors"
              title="Preview prompt"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {template.suggestedSchedule && (
              <button
                onClick={() => setShowSchedule(true)}
                className="p-1.5 rounded text-white/20 hover:text-white/50 transition-colors"
                title="Schedule as cron job"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowRun(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
            >
              <Zap className="h-3 w-3" /> Run
            </button>
          </div>
        </div>

        {/* Expandable prompt preview */}
        {expanded && (
          <div className="px-4 pb-3 border-t border-white/[0.05] pt-3">
            <pre className="text-[11px] text-white/40 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded-lg p-2.5 border border-white/[0.05] max-h-36 overflow-y-auto">
              {template.template}
            </pre>
          </div>
        )}
      </div>

      {showRun && (
        <RunModal template={template} projects={projects} onClose={() => setShowRun(false)} />
      )}
      {showSchedule && (
        <ScheduleModal template={template} projects={projects} onClose={() => setShowSchedule(false)} />
      )}
    </>
  );
}

// ─── Featured Card (larger, for quick-access row) ─────────────────────────────

function FeaturedCard({
  template,
  projects,
}: {
  template: PromptTemplate;
  projects: Project[];
}) {
  const [showRun, setShowRun] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const meta = CATEGORY_META[template.category];

  return (
    <>
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.09] hover:border-white/[0.15] hover:bg-white/[0.06] transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${meta.color}`}>
              {meta.label}
            </span>
            <div className="text-sm font-semibold mt-1.5 leading-snug">{template.name}</div>
            <div className="text-xs text-white/40 mt-0.5 leading-relaxed line-clamp-2">{template.description}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-auto">
          <button
            onClick={() => setShowRun(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
          >
            <Zap className="h-3.5 w-3.5" /> Run now
          </button>
          {template.suggestedSchedule && (
            <button
              onClick={() => setShowSchedule(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-white/50 text-xs transition-colors border border-white/10"
              title="Schedule"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showRun && (
        <RunModal template={template} projects={projects} onClose={() => setShowRun(false)} />
      )}
      {showSchedule && (
        <ScheduleModal template={template} projects={projects} onClose={() => setShowSchedule(false)} />
      )}
    </>
  );
}

// ─── Category Tab Bar ─────────────────────────────────────────────────────────

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as PromptCategory[];

function CategoryBar({
  active,
  templates,
  onSelect,
}: {
  active: PromptCategory | "all";
  templates: PromptTemplate[];
  onSelect: (cat: PromptCategory | "all") => void;
}) {
  const counts = new Map(
    ALL_CATEGORIES.map((cat) => [cat, templates.filter((t) => t.category === cat).length])
  );

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect("all")}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          active === "all"
            ? "bg-white/10 border-white/20 text-white"
            : "bg-transparent border-white/[0.07] text-white/40 hover:text-white/70 hover:border-white/15"
        }`}
      >
        All ({templates.length})
      </button>
      {ALL_CATEGORIES.filter((cat) => (counts.get(cat) ?? 0) > 0).map((cat) => {
        const meta = CATEGORY_META[cat];
        const isActive = active === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelect(isActive ? "all" : cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              isActive ? meta.color : "bg-transparent border-white/[0.07] text-white/40 hover:text-white/70 hover:border-white/15"
            }`}
          >
            {meta.label} ({counts.get(cat)})
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PromptLibraryClient({
  templates,
  projects,
}: {
  templates: PromptTemplate[];
  projects: Project[];
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<PromptCategory | "all">("all");
  const [activeScope, setActiveScope] = useState<"all" | "global" | "project">("all");

  const isFiltered = search.length > 0 || activeCategory !== "all" || activeScope !== "all";

  const filtered = templates.filter((t) => {
    if (activeCategory !== "all" && t.category !== activeCategory) return false;
    if (activeScope !== "all" && t.scope !== activeScope) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.includes(q))
      );
    }
    return true;
  });

  const featured = templates.filter((t) => t.featured);

  // When not filtering, show featured section + category sections
  // When filtering, show flat list of results
  const categoriesWithTemplates = ALL_CATEGORIES.filter((cat) =>
    filtered.some((t) => t.category === cat)
  );

  return (
    <div className="space-y-6">
      {/* Search + scope filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
          />
        </div>
        <div className="flex gap-1.5 shrink-0">
          {(["all", "global", "project"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setActiveScope(scope)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                activeScope === scope
                  ? "bg-white/10 border-white/20 text-white/80"
                  : "bg-transparent border-white/[0.07] text-white/40 hover:text-white/60"
              }`}
            >
              {scope === "all" ? "All" : scope === "global" ? "🌐 Global" : "📁 Project"}
            </button>
          ))}
        </div>
      </div>

      {/* Category tab bar */}
      <CategoryBar
        active={activeCategory}
        templates={templates}
        onSelect={setActiveCategory}
      />

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-white/30">
          <Search className="h-8 w-8" />
          <div className="text-sm">No prompts match your filters</div>
        </div>
      ) : isFiltered ? (
        /* Filtered: flat list grouped by category */
        <div className="space-y-6">
          {categoriesWithTemplates.map((cat) => {
            const group = filtered.filter((t) => t.category === cat);
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-white/20">{group.length} prompt{group.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {group.map((t) => (
                    <PromptRow key={t.id} template={t} projects={projects} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* Default view: featured row + all categories */
        <div className="space-y-8">
          {/* Quick Access */}
          {featured.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-3.5 w-3.5 text-yellow-400/70" />
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Quick Access</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {featured.map((t) => (
                  <FeaturedCard key={t.id} template={t} projects={projects} />
                ))}
              </div>
            </section>
          )}

          {/* Category sections */}
          {ALL_CATEGORIES.filter((cat) => templates.some((t) => t.category === cat)).map((cat) => {
            const group = templates.filter((t) => t.category === cat);
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                  <button
                    onClick={() => setActiveCategory(cat)}
                    className="text-[10px] text-white/20 hover:text-white/50 transition-colors ml-auto"
                  >
                    filter →
                  </button>
                </div>
                <div className="space-y-2">
                  {group.map((t) => (
                    <PromptRow key={t.id} template={t} projects={projects} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
