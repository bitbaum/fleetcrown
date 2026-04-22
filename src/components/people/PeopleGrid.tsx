"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { PersonCard } from "./PersonCard";
import { PersonDetail } from "./PersonDetail";
import type { PersonWithAttributes } from "@/db/queries/people";

type SortMode = "recent" | "name" | "health";

const SORT_LABELS: Record<SortMode, string> = {
  recent: "Recent",
  name: "A–Z",
  health: "Needs attention",
};

const SORT_ORDER: SortMode[] = ["recent", "name", "health"];

export function PeopleGrid({
  initialPeople,
  initialTotal,
}: {
  initialPeople: PersonWithAttributes[];
  initialTotal: number;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  // Skip the first effect firing — SSR already rendered the default (q="", sort="recent") data
  const skipInitialFetch = useRef(true);

  const search = useCallback(
    async (q: string, s: SortMode, newOffset = 0) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          sort: s,
          limit: String(LIMIT),
          offset: String(newOffset),
        });
        const res = await fetch(`/api/people?${params}`);
        const data = await res.json();
        if (newOffset === 0) {
          setPeople(data.people);
        } else {
          setPeople((prev) => [...prev, ...data.people]);
        }
        setTotal(data.total);
        setOffset(newOffset);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    const timer = setTimeout(() => search(query, sort, 0), 300);
    return () => clearTimeout(timer);
  }, [query, sort, search]);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            onClick={() => setSelectedId(person.id)}
          />
        ))}
      </div>

      {people.length < total && (
        <button
          onClick={() => search(query, sort, offset + LIMIT)}
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
