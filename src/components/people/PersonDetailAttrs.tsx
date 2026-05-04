"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { setAttr, removeAttr } from "@/lib/api/attrs";
import { isChannelAttrKey } from "@/config/channels";
import { EmptyState } from "@/components/ui/empty-state";
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
        <div key={key} className="group flex justify-between gap-3 rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm">
          <span className="shrink-0 text-text-secondary">{formatKey(key)}</span>
          {editingKey === key ? (
            <div className="flex flex-1 items-center justify-end gap-1">
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(key);
                  if (e.key === "Escape") setEditingKey(null);
                }}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-border-default bg-surface-overlay px-2 py-1 text-right text-xs text-text-primary outline-none transition-colors focus:border-accent-primary"
              />
              <button
                onClick={() => saveEdit(key)}
                disabled={saving}
                className="shrink-0 rounded-lg bg-accent-primary p-1 text-text-inverted disabled:opacity-30 hover:bg-accent-hover"
              >
                {saving ? <Loader2 className="ui-spinner-2xs" /> : <Save className="h-2.5 w-2.5" />}
              </button>
              <button onClick={() => setEditingKey(null)} className="shrink-0 ui-btn-icon">
                <X className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={() => deleteAttr(key)}
                disabled={deletingKey === key}
                className="shrink-0 ui-btn-icon hover:text-status-negative"
                title="Delete attribute"
              >
                {deletingKey === key ? <Loader2 className="ui-spinner-2xs" /> : <Trash2 className="h-2.5 w-2.5" />}
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-right text-text-primary">{value}</span>
              <button
                onClick={() => { setEditValue(value); setEditingKey(key); }}
                className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 ui-btn-icon"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      ))}
      {detailAttrs.length === 0 && !addingNew && (
        <EmptyState>No details yet</EmptyState>
      )}
      {addingNew ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="key"
            className="w-20 ui-input-tight"
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
            className="flex-1 ui-input-tight"
          />
          <button
            onClick={saveNew}
            disabled={!newKey.trim() || !newValue.trim() || saving}
            className="shrink-0 rounded-lg bg-accent-primary p-1.5 text-text-inverted disabled:opacity-30 hover:bg-accent-hover"
          >
            {saving ? <Loader2 className="ui-spinner-xs" /> : <Save className="h-3 w-3" />}
          </button>
          <button onClick={() => { setAddingNew(false); setNewKey(""); setNewValue(""); }} className="ui-btn-icon">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="mt-0.5 flex items-center gap-1.5 text-xs text-text-tertiary transition-colors hover:text-accent-text"
        >
          <Plus className="h-3 w-3" /> Add detail
        </button>
      )}
    </Section>
  );
}
