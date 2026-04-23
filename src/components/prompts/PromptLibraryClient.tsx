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
  Star,
} from "lucide-react";
import { ScheduleModal } from "./ScheduleModal";
import { RunModal } from "./RunModal";
import {
  PROMPT_TEMPLATES,
  CATEGORY_META,
  type PromptTemplate,
  type PromptCategory,
} from "@/config/prompt-library";
import type { Project } from "./types";

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
