"use client";

import { ScrollAffordance } from "@/components/ui/scroll-affordance";
import {
  PROMPT_GROUPS,
  GROUP_META,
  groupForCategory,
  type PromptGroup,
  type PromptTemplate,
} from "@/config/prompt-library";

/** Top-level group filter: "All (n)" + one chip per group that has templates.
 *  Collapses the 14 fine-grained categories into a handful of scannable chips. */
export function GroupBar({
  active,
  templates,
  onSelect,
}: {
  active: PromptGroup | "all";
  templates: PromptTemplate[];
  onSelect: (group: PromptGroup | "all") => void;
}) {
  const counts = new Map<PromptGroup, number>();
  for (const t of templates) {
    const g = groupForCategory(t.category);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const visibleGroups = PROMPT_GROUPS.filter((g) => (counts.get(g) ?? 0) > 0);

  return (
    <ScrollAffordance childCount={visibleGroups.length + 1} threshold={4}>
      <div className="flex gap-2 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
        <button
          onClick={() => onSelect("all")}
          className={`shrink-0 ${active === "all" ? "ui-chip-filter-active" : "ui-chip-filter"}`}
        >
          All ({templates.length})
        </button>
        {visibleGroups.map((g) => (
          <button
            key={g}
            onClick={() => onSelect(active === g ? "all" : g)}
            className={`shrink-0 ${active === g ? "ui-chip-filter-active" : "ui-chip-filter"}`}
          >
            {GROUP_META[g].label} ({counts.get(g)})
          </button>
        ))}
      </div>
    </ScrollAffordance>
  );
}
