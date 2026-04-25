"use client";

import { CATEGORY_META, type PromptCategory, type PromptTemplate } from "@/config/prompt-library";

export const ALL_CATEGORIES = Object.keys(CATEGORY_META) as PromptCategory[];

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
              isActive
                ? meta.color
                : "bg-transparent border-white/[0.07] text-white/40 hover:text-white/70 hover:border-white/15"
            }`}
          >
            {meta.label} ({counts.get(cat)})
          </button>
        );
      })}
    </div>
  );
}
