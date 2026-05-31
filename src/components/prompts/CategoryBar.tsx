"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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

  // Fourth horizontal-scroll surface in this codebase needing a mobile
  // affordance — Today SummaryBar (4cb018c), Settings tab strip (7ab36d6),
  // Projects status chips (0523927), now Prompts categories. Same pattern:
  // ui-scroll-fade-right mask + ChevronRight pinned to the right edge of
  // the relative wrapper, hidden on sm+ where chips wrap. Adds the fade
  // mask that was previously missing here too. Threshold of 4 chips
  // matches the pattern (1 All + 4 categories ≈ first overflow point).
  return (
    <div className="relative">
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
      {visibleCats.length >= 3 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-1 text-text-tertiary sm:hidden"
        >
          <ChevronRight className="h-4 w-4 drop-shadow-[0_0_4px_var(--surface-page)]" />
        </span>
      )}
    </div>
  );
}
