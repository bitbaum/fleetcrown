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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="ui-input pl-12"
          />
        </div>
        <div className="flex gap-1.5 shrink-0">
          {(["all", "global", "project"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setActiveScope(scope)}
              className={activeScope === scope ? "ui-chip-filter-active" : "ui-chip-filter"}
            >
              {scope === "all" ? "All" : scope === "global" ? "Global" : "Project"}
            </button>
          ))}
        </div>
      </div>

      <CategoryBar active={activeCategory} templates={templates} onSelect={setActiveCategory} />

      {filtered.length === 0 ? (
        <div className="ui-panel-raised flex flex-col items-center gap-3 py-12 text-center text-text-secondary">
          <Search className="h-8 w-8 text-text-muted" />
          <div className="text-lg font-medium text-text-primary">No prompts match your filters</div>
          <div className="max-w-xl text-base text-text-secondary">
            Try a broader search or clear one of the active filters.
          </div>
        </div>
      ) : isFiltered ? (
        <div className="space-y-6">
          {categoriesWithTemplates.map((cat) => {
            const group = filtered.filter((t) => t.category === cat);
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`ui-chip ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-sm text-text-tertiary">
                    {group.length} prompt{group.length !== 1 ? "s" : ""}
                  </span>
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
                <Star className="h-4 w-4 text-status-warning/80" />
                <span className="ui-kicker text-text-secondary">Quick Access</span>
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
                  <span className={`ui-chip ${meta.color}`}>
                    {meta.label}
                  </span>
                  <button
                    onClick={() => setActiveCategory(cat)}
                    className="ml-auto text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    Filter
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
