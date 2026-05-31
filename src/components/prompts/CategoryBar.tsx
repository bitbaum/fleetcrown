"use client";

import { cn } from "@/lib/utils";
import { ScrollAffordance } from "@/components/ui/scroll-affordance";
import { ALL_CATEGORIES, CATEGORY_META, type PromptCategory, type PromptTemplate } from "@/config/prompt-library";

/** Filter chips: "All (n)" + one chip per category that has at least one template. */
export function CategoryBar({
  active,
  templates,
  onSelect,
}: {
  active: PromptCategory | "all";
  templates: PromptTemplate[];
  onSelect: (cat: PromptCategory | "all") => void;
}) {
  const counts = new Map(
    ALL_CATEGORIES.map((cat) => [cat, templates.filter((t) => t.category === cat).length]),
  );
  const visibleCats = ALL_CATEGORIES.filter((cat) => (counts.get(cat) ?? 0) > 0);

  return (
    <ScrollAffordance childCount={visibleCats.length + 1} threshold={4}>
      <div className="flex gap-2 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
        <button
          onClick={() => onSelect("all")}
          className={`shrink-0 ${active === "all" ? "ui-chip-filter-active" : "ui-chip-filter"}`}
        >
          All ({templates.length})
        </button>
        {visibleCats.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = active === cat;
          return (
            <button
              key={cat}
              onClick={() => onSelect(isActive ? "all" : cat)}
              className={isActive
                ? cn("shrink-0 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors", meta.color)
                : "shrink-0 ui-chip-filter"
              }
            >
              {meta.label} ({counts.get(cat)})
            </button>
          );
        })}
      </div>
    </ScrollAffordance>
  );
}
