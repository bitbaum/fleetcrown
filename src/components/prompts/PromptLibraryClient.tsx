"use client";

import { useState } from "react";
import { Search, Star } from "lucide-react";
import { CATEGORY_META, type PromptTemplate, type PromptCategory } from "@/config/prompt-library";
import { PromptRow } from "./PromptRow";
import { FeaturedCard } from "./FeaturedCard";
import { CategoryBar, ALL_CATEGORIES } from "./CategoryBar";
import type { Project } from "./types";

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
  const categoriesWithTemplates = ALL_CATEGORIES.filter((cat) =>
    filtered.some((t) => t.category === cat),
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

      <CategoryBar active={activeCategory} templates={templates} onSelect={setActiveCategory} />

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
