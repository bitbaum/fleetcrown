"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X, Check, Loader2, Search } from "lucide-react";
import { CHANNEL_NAMES } from "@/config/channels";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";
import { getJson, postJson } from "@/lib/api/fetch";
import { INLINE_SAVE_CLASS } from "@/components/ui/form";
import { toLocalDateStr } from "@/lib/dates";
import { INTERACTION_DIRECTION, SORT_MODE } from "@/lib/constants/statuses";

type PersonResult = { id: string; name: string };

export function LogConversationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PersonResult | null>(null);
  const [channel, setChannel] = useState(CHANNEL_NAMES[0] ?? "whatsapp");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setNote("");
    setDone(false);
    setOpen(false);
  };

  // Debounced search with AbortController so a slow earlier response
  // can't clobber a faster later one when the user types continuously.
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await getJson<{ people?: PersonResult[] }>(
          `/api/people?q=${encodeURIComponent(query)}&limit=6&sort=${SORT_MODE.RECENT}`,
          { signal: ctrl.signal },
        );
        if (!ctrl.signal.aborted) setResults(data.people ?? []);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        throw err;
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await postJson(`/api/people/${selected.id}/interactions`, {
        channel,
        direction: INTERACTION_DIRECTION.OUTBOUND,
        summary: note || undefined,
        occurredAt: toLocalDateStr(new Date()),
      });
      setDone(true);
      setTimeout(() => { reset(); router.refresh(); }, 1200);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-full px-3 py-1.5 transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Log a conversation
      </button>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Log a conversation</span>
        <button onClick={reset} className="text-text-muted hover:text-text-secondary transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {done ? (
        <div className="flex items-center gap-1.5 text-xs text-status-positive py-1">
          <Check className="h-3.5 w-3.5" />
          Logged with {selected?.name}
        </div>
      ) : selected ? (
        /* Channel + note step */
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary font-medium">{selected.name}</span>
            <button
              onClick={() => { setSelected(null); setQuery(""); }}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              change
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={FIELD_INPUT_CLASS_TIGHT}
            >
              {CHANNEL_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
              placeholder="Brief note (optional)"
              autoFocus
              className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className={INLINE_SAVE_CLASS}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors px-1">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Person search step */
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") reset(); }}
              placeholder="Search person…"
              className="w-full pl-6 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-white/25"
            />
            {searching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-text-muted" />}
          </div>
          {results.length > 0 && (
            <div className="space-y-0.5">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setQuery(""); setResults([]); }}
                  className="w-full text-left px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] rounded transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {query.trim() && !searching && results.length === 0 && (
            <div className="text-xs text-text-muted px-2 py-1">No results</div>
          )}
        </div>
      )}
    </div>
  );
}
