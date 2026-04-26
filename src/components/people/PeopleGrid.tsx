"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { PersonCard } from "./PersonCard";
import { PersonDetail } from "./PersonDetail";
import { type PersonWithAttributes } from "@/db/queries/people";
import { SORT_MODE, type SortMode } from "@/lib/constants/statuses";
import { type RelationshipHealth, HEALTH_DOT_COLOR, HEALTH_LABEL, RELATIONSHIP_HEALTH_VALUES, deriveRelationshipHealth } from "@/lib/utils";

const HEALTH_FILTERS = RELATIONSHIP_HEALTH_VALUES.map((value) => ({ value, label: HEALTH_LABEL[value] }));

const SORT_LABELS: Record<SortMode, string> = {
  [SORT_MODE.RECENT]: "Recent",
  [SORT_MODE.NAME]:   "A–Z",
  [SORT_MODE.HEALTH]: "Needs attention",
};

const SORT_ORDER: SortMode[] = Object.values(SORT_MODE);

export function PeopleGrid({
  initialPeople,
  initialTotal,
  initialHealthFilter = [],
}: {
  initialPeople: PersonWithAttributes[];
  initialTotal: number;
  initialHealthFilter?: RelationshipHealth[];
}) {
  const [people, setPeople] = useState(initialPeople);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>(SORT_MODE.RECENT);
  const [healthFilter, setHealthFilter] = useState<RelationshipHealth[]>(initialHealthFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  // Skip the first effect firing — SSR already rendered the initial data (including any URL-driven filters)
  const skipInitialFetch = useRef(true);

  const search = useCallback(
    async (q: string, s: SortMode, hf: RelationshipHealth[], newOffset: number, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          sort: s,
          limit: String(LIMIT),
          offset: String(newOffset),
        });
        if (hf.length > 0) params.set("health", hf.join(","));
        const res = await fetch(`/api/people?${params}`, { signal });
        const data = await res.json();
        if (signal?.aborted) return;
        if (newOffset === 0) {
          setPeople(data.people);
        } else {
          setPeople((prev) => [...prev, ...data.people]);
        }
        setTotal(data.total);
        setOffset(newOffset);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        throw err;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => search(query, sort, healthFilter, 0, ctrl.signal), 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, sort, healthFilter, search]);

  function toggleHealth(h: RelationshipHealth) {
    setHealthFilter((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    );
  }

  function cycleSort() {
    const idx = SORT_ORDER.indexOf(sort);
    setSort(SORT_ORDER[(idx + 1) % SORT_ORDER.length]);
  }

  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            placeholder="Search people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm md:text-base focus:outline-none focus:border-white/20 placeholder:text-white/30"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
            {total}
          </span>
        </div>
        <button
          onClick={cycleSort}
          className="flex items-center gap-1.5 px-3 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-white/50 hover:text-white/70 transition-colors shrink-0"
          title={`Sort: ${SORT_LABELS[sort]}`}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {SORT_LABELS[sort]}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {HEALTH_FILTERS.map(({ value, label }) => {
          const active = healthFilter.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggleHealth(value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                active
                  ? "border-white/30 bg-white/10 text-white/70"
                  : "border-white/10 bg-transparent text-white/30 hover:text-white/50 hover:border-white/20"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT_COLOR[value]}`} />
              {label}
            </button>
          );
        })}
        {healthFilter.length > 0 && (
          <button
            onClick={() => setHealthFilter([])}
            className="px-2.5 py-1 rounded-full text-xs border border-white/10 text-white/25 hover:text-white/50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            onClick={() => setSelectedId(person.id)}
            onLogged={(id, at) =>
              setPeople((prev) =>
                prev.map((p) =>
                  p.id === id
                    ? { ...p, lastInteraction: at, interactionCount: p.interactionCount + 1, health: deriveRelationshipHealth(at) }
                    : p,
                ),
              )
            }
          />
        ))}
      </div>

      {people.length < total && (
        <button
          onClick={() => search(query, sort, healthFilter, offset + LIMIT)}
          disabled={loading}
          className="w-full py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          {loading ? "Loading..." : `Load more (${people.length} of ${total})`}
        </button>
      )}

      {selectedId && (
        <PersonDetail personId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
