"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { PersonCard } from "./PersonCard";
import { PersonDetail } from "./PersonDetail";
import type { PersonWithAttributes } from "@/db/queries/people";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const search = useCallback(
    async (q: string, newOffset = 0) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, limit: String(LIMIT), offset: String(newOffset) });
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
    const timer = setTimeout(() => search(query, 0), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input
          type="text"
          placeholder="Search people..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/20 placeholder:text-white/30"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
          {total} people
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
          onClick={() => search(query, offset + LIMIT)}
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
