"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ArrowUpDown, Users } from "lucide-react";
import { PersonCard } from "./PersonCard";
import { PersonDetail } from "./PersonDetail";
import { type PersonWithAttributes } from "@/db/queries/people";
import { getJson } from "@/lib/api/fetch";
import { SORT_MODE, type SortMode } from "@/lib/constants/statuses";
import { type RelationshipHealth, HEALTH_DOT_COLOR, HEALTH_LABEL, RELATIONSHIP_HEALTH_VALUES, deriveRelationshipHealth } from "@/lib/utils";

const HEALTH_FILTERS = RELATIONSHIP_HEALTH_VALUES.map((value) => ({ value, label: HEALTH_LABEL[value] }));

const SORT_LABELS: Record<SortMode, string> = {
  [SORT_MODE.RECENT]: "Recent",
  [SORT_MODE.NAME]: "A–Z",
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
        const data = await getJson<{ people: PersonWithAttributes[]; total: number }>(`/api/people?${params}`, { signal });
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
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-border-default bg-surface-overlay py-3 pl-11 pr-16 text-base text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border-subtle bg-surface-base px-2 py-0.5 text-xs font-medium text-text-secondary">
            {total}
          </span>
        </div>
        <button
          onClick={cycleSort}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-border-default bg-surface-overlay px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
          title={`Sort: ${SORT_LABELS[sort]}`}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort: {SORT_LABELS[sort]}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {HEALTH_FILTERS.map(({ value, label }) => {
          const active = healthFilter.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggleHealth(value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-accent-primary bg-accent-muted text-accent-text"
                  : "border-border-default bg-surface-base text-text-secondary hover:bg-surface-raised hover:text-text-primary"
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
            className="inline-flex items-center rounded-full border border-border-default px-3 py-1.5 text-sm text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-secondary"
          >
            Clear
          </button>
        )}
      </div>

      {people.length === 0 ? (
        <div className="ui-panel flex flex-col items-center gap-3 py-14 text-center text-text-tertiary">
          <Users className="h-8 w-8" />
          <div className="text-base text-text-secondary">
            {query || healthFilter.length > 0
              ? "No people match your search"
              : "No people yet"}
          </div>
          {(query || healthFilter.length > 0) && (
            <button
              onClick={() => { setQuery(""); setHealthFilter([]); }}
              className="text-sm text-accent-text underline underline-offset-2 transition-colors hover:text-accent-hover"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      )}

      {people.length < total && (
        <button
          onClick={() => search(query, sort, healthFilter, offset + LIMIT)}
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-border-default bg-surface-overlay px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
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
