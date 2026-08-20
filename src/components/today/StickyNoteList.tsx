"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { postJson, deleteJson } from "@/lib/api/fetch";

type Item = { id: string; body: string };

export function StickyNoteList({
  initial,
  hiddenCount,
}: {
  initial: Item[];
  hiddenCount: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postJson("/api/captures", { body });
      if (!res.ok) { setError("Failed to save"); return; }
      const data = (await res.json()) as { capture: Item };
      setItems((prev) => [data.capture, ...prev]);
      setDraft("");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const checkOff = async (id: string) => {
    const res = await deleteJson(`/api/captures/${id}`);
    if (res.ok) {
      setItems((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    }
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="py-2 text-sm text-text-tertiary">
          Nothing on your note. Tell Loki &ldquo;add … to my list&rdquo; — or type it here.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((c) => (
            <li key={c.id} className="group flex items-start gap-2">
              <button
                onClick={() => checkOff(c.id)}
                className="mt-0.5 p-1 rounded text-text-muted hover:text-status-positive transition-colors shrink-0"
                title="Done"
                aria-label={`Done: ${c.body}`}
              >
                <Check className="h-4 w-4" />
              </button>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
                {c.body}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && (
        <p className="text-xs text-text-muted">…and {hiddenCount} more</p>
      )}
      {error && <p className="ui-error-xs">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add to your list…"
          className="ui-input-tight flex-1 text-sm"
        />
        <button
          onClick={add}
          disabled={saving || !draft.trim()}
          className="ui-btn-icon"
          aria-label="Add"
        >
          {saving ? <Loader2 className="ui-spinner-xs" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
