"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Check, Loader2, Trash2 } from "lucide-react";
import { getJson, postJson } from "@/lib/api/fetch";
import type { Capture } from "@/db/schema";

type CaptureItem = Pick<Capture, "id" | "body" | "createdAt">;

export function QuickCaptureButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<CaptureItem[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
      getJson<{ captures: CaptureItem[] }>("/api/captures")
        .then((d) => setRecent(d.captures ?? []))
        .catch(() => {});
    }
  }, [open]);

  const reset = () => {
    setBody("");
    setDone(false);
    setError(null);
    setOpen(false);
  };

  const save = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postJson("/api/captures", { body: trimmed });
      if (!res.ok) { setError("Failed to save"); return; }
      const data = (await res.json()) as { capture: CaptureItem };
      setDone(true);
      setRecent((prev) => [data.capture, ...prev]);
      setBody("");
      setTimeout(() => { setDone(false); }, 1500);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/captures/${id}`, { method: "DELETE" });
    if (res.ok) setRecent((prev) => prev.filter((c) => c.id !== id));
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-surface-raised hover:bg-surface-overlay border border-border-subtle rounded-full px-3 py-1.5 transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        Capture a thought
      </button>
    );
  }

  return (
    <div className="bg-surface-base border border-border-subtle rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Quick capture</span>
        <button onClick={reset} className="text-text-muted hover:text-text-secondary transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") reset();
        }}
        placeholder="What's on your mind?"
        rows={3}
        className="w-full ui-input-tight resize-none text-sm leading-relaxed"
      />

      {error && <p className="ui-error-xs">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !body.trim()}
          className="ui-btn-save"
        >
          {saving ? (
            <Loader2 className="ui-spinner-xs" />
          ) : done ? (
            <Check className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {done ? "Saved" : "Save"}
        </button>
        <span className="text-xs text-text-muted">⌘↵</span>
        <button onClick={reset} className="ui-btn-text-cancel ml-auto">
          Cancel
        </button>
      </div>

      {recent.length > 0 && (
        <div className="pt-1 border-t border-border-subtle space-y-1.5">
          <p className="text-xs text-text-muted">Recent</p>
          {recent.slice(0, 5).map((c) => (
            <div
              key={c.id}
              className="group flex items-start gap-2 text-xs text-text-secondary"
            >
              <span className="flex-1 leading-relaxed line-clamp-2">{c.body}</span>
              <button
                onClick={() => remove(c.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-status-negative"
                aria-label="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
