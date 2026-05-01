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
        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
          active === "all"
            ? "border-accent-primary/30 bg-accent-muted text-text-primary"
            : "border-border-subtle bg-surface-overlay text-text-secondary hover:border-border-default hover:text-text-primary"
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
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
              isActive
                ? meta.color
                : "border-border-subtle bg-surface-overlay text-text-secondary hover:border-border-default hover:text-text-primary"
            }`}
          >
            {meta.label} ({counts.get(cat)})
          </button>
        );
      })}
    </div>
  );
}
