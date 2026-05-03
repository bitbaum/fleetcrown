"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { ADD_BUTTON_CLASS, FIELD_INPUT_CLASS_COMPACT } from "@/components/ui/form";
import { postJson } from "@/lib/api/fetch";
import type { EventRow } from "@/db/queries/events";

export function AddEventForm({ onCreated }: { onCreated: (event: EventRow) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName(""); setType(""); setUrl(""); setDeadline("");
    setCategory(""); setDescription(""); setError("");
  };

  const submit = async () => {
    if (!name.trim() || !type.trim()) {
      setError("Name and type are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await postJson("/api/events", { name, type, url, deadline, category, description });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      onCreated(data.event as EventRow);
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`${ADD_BUTTON_CLASS} pt-1`}
      >
        <Plus className="h-3.5 w-3.5" /> Add event
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 rounded-lg border border-white/10 bg-white/[0.02] space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-white/30">New Event</span>
        <button onClick={() => { setOpen(false); reset(); }} className="text-white/25 hover:text-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Event name *"
        autoFocus
        className={`w-full ${FIELD_INPUT_CLASS_COMPACT}`}
      />
      <div className="flex gap-2">
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Type * (e.g. workshop)"
          className={`flex-1 ${FIELD_INPUT_CLASS_COMPACT}`}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className={`flex-1 ${FIELD_INPUT_CLASS_COMPACT}`}
        />
      </div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (optional)"
          className={`flex-1 ${FIELD_INPUT_CLASS_COMPACT}`}
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className={FIELD_INPUT_CLASS_COMPACT}
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); reset(); } }}
        placeholder="Description (optional)"
        className={`w-full ${FIELD_INPUT_CLASS_COMPACT}`}
      />
      {error && <p className="text-xs text-status-negative">{error}</p>}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={submit}
          disabled={saving || !name.trim() || !type.trim()}
          className="ui-btn-confirm flex items-center gap-1.5 px-3 py-1.5 rounded disabled:opacity-30 text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
        <button onClick={() => { setOpen(false); reset(); }} className="text-xs text-white/30 hover:text-white/60">
          Cancel
        </button>
      </div>
    </div>
  );
}
