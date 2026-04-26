"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { setAttr, removeAttr } from "@/lib/api/attrs";
import { isChannelAttrKey } from "@/config/channels";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";
import { Section } from "./PersonDetailHelpers";
import { formatKey } from "./person-detail-types";

export function DetailAttrs({
  personId,
  attrs,
  onUpdate,
}: {
  personId: string;
  attrs: Record<string, string>;
  onUpdate: (updated: Record<string, string>) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const detailAttrs = Object.entries(attrs).filter(
    ([k]) => !isChannelAttrKey(k) && k !== "aliases",
  );

  const saveEdit = async (key: string) => {
    if (!editValue.trim() || saving) return;
    setSaving(true);
    try {
      await setAttr(`/api/people/${personId}`, key, editValue.trim());
      onUpdate({ ...attrs, [key]: editValue.trim() });
    } finally {
      setSaving(false);
      setEditingKey(null);
    }
  };

  const saveNew = async () => {
    if (!newKey.trim() || !newValue.trim() || saving) return;
    setSaving(true);
    try {
      await setAttr(`/api/people/${personId}`, newKey.trim(), newValue.trim());
      const normalizedKey = newKey.trim().toLowerCase().replace(/\s+/g, "_");
      onUpdate({ ...attrs, [normalizedKey]: newValue.trim() });
      setNewKey("");
      setNewValue("");
      setAddingNew(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteAttr = async (key: string) => {
    setDeletingKey(key);
    try {
      await removeAttr(`/api/people/${personId}`, key);
      const next = { ...attrs };
      delete next[key];
      onUpdate(next);
      setEditingKey(null);
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <Section title="Details">
      {detailAttrs.map(([key, value]) => (
        <div key={key} className="group flex justify-between gap-2 text-sm">
          <span className="text-white/50 shrink-0">{formatKey(key)}</span>
          {editingKey === key ? (
            <div className="flex items-center gap-1 flex-1 justify-end">
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(key);
                  if (e.key === "Escape") setEditingKey(null);
                }}
                autoFocus
                className="flex-1 min-w-0 bg-white/[0.04] border border-white/10 rounded px-2 py-0.5 text-xs text-white/80 focus:outline-none focus:border-white/25 text-right"
              />
              <button
                onClick={() => saveEdit(key)}
                disabled={saving}
                className="p-1 rounded bg-emerald-600/70 hover:bg-emerald-600 disabled:opacity-30 text-white shrink-0"
              >
                {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
              </button>
              <button onClick={() => setEditingKey(null)} className="p-1 text-white/25 hover:text-white/60 shrink-0">
                <X className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={() => deleteAttr(key)}
                disabled={deletingKey === key}
                className="p-1 text-white/15 hover:text-red-400 transition-colors shrink-0"
                title="Delete attribute"
              >
                {deletingKey === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-right truncate">{value}</span>
              <button
                onClick={() => { setEditValue(value); setEditingKey(key); }}
                className="sm:opacity-0 sm:group-hover:opacity-100 p-0.5 text-white/20 hover:text-white/60 transition-all shrink-0"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      ))}
      {detailAttrs.length === 0 && !addingNew && (
        <div className="text-sm text-white/30">No details yet</div>
      )}
      {addingNew ? (
        <div className="flex gap-1.5 items-center pt-0.5">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="key"
            className={`w-20 ${FIELD_INPUT_CLASS_TIGHT}`}
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveNew();
              if (e.key === "Escape") { setAddingNew(false); setNewKey(""); setNewValue(""); }
            }}
            autoFocus
            className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
          />
          <button
            onClick={saveNew}
            disabled={!newKey.trim() || !newValue.trim() || saving}
            className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 text-white shrink-0"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </button>
          <button onClick={() => { setAddingNew(false); setNewKey(""); setNewValue(""); }} className="p-1 text-white/25 hover:text-white/60">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1.5 text-xs text-white/20 hover:text-emerald-400 transition-colors mt-0.5"
        >
          <Plus className="h-3 w-3" /> Add detail
        </button>
      )}
    </Section>
  );
}
