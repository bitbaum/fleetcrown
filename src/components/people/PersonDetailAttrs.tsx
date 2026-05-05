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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const detailAttrs = Object.entries(attrs).filter(
    ([k]) => !isChannelAttrKey(k) && k !== "aliases",
  );

  const saveEdit = async (key: string) => {
    if (!editValue.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await setAttr(`/api/people/${personId}`, key, editValue.trim());
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }
      onUpdate({ ...attrs, [key]: editValue.trim() });
      setEditingKey(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    if (!newKey.trim() || !newValue.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await setAttr(`/api/people/${personId}`, newKey.trim(), newValue.trim());
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }
      const normalizedKey = newKey.trim().toLowerCase().replace(/\s+/g, "_");
      onUpdate({ ...attrs, [normalizedKey]: newValue.trim() });
      setNewKey("");
      setNewValue("");
      setAddingNew(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const deleteAttr = async (key: string) => {
    setDeletingKey(key);
    setDeleteError(null);
    try {
      const res = await removeAttr(`/api/people/${personId}`, key);
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to delete");
      }
      const next = { ...attrs };
      delete next[key];
      onUpdate(next);
      setEditingKey(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <Section title="Details">
      {detailAttrs.map(([key, value]) => (
        <div key={key} className="group flex justify-between gap-3 ui-list-row">
          <span className="shrink-0 text-text-secondary">{formatKey(key)}</span>
          {editingKey === key ? (
            <div className="flex flex-1 flex-col items-end gap-1">
              <div className="flex w-full items-center justify-end gap-1">
                <input
                  value={editValue}
                  onChange={(e) => { setEditValue(e.target.value); setSaveError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(key);
                    if (e.key === "Escape") { setEditingKey(null); setSaveError(null); }
                  }}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-border-default bg-surface-overlay px-2 py-1 text-right text-xs text-text-primary outline-none transition-colors focus:border-accent-primary"
                />
                <button
                  onClick={() => saveEdit(key)}
                  disabled={saving}
                  className="ui-btn-icon-accent p-1"
                >
                  {saving ? <Loader2 className="ui-spinner-2xs" /> : <Save className="h-2.5 w-2.5" />}
                </button>
                <button onClick={() => { setEditingKey(null); setSaveError(null); }} className="shrink-0 ui-btn-icon">
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
              {saveError && <p className="text-[10px] text-status-negative">{saveError}</p>}
              {deleteError && <p className="text-[10px] text-status-negative">{deleteError}</p>}
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-right text-text-primary">{value}</span>
              <button
                onClick={() => { setEditValue(value); setEditingKey(key); }}
                className="shrink-0 ui-hover-reveal ui-btn-icon"
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
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <input
              value={newKey}
              onChange={(e) => { setNewKey(e.target.value); setSaveError(null); }}
              placeholder="key"
              className="w-20 ui-input-tight"
            />
            <input
              value={newValue}
              onChange={(e) => { setNewValue(e.target.value); setSaveError(null); }}
              placeholder="value"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNew();
                if (e.key === "Escape") { setAddingNew(false); setNewKey(""); setNewValue(""); setSaveError(null); }
              }}
              autoFocus
              className="flex-1 ui-input-tight"
            />
            <button
              onClick={saveNew}
              disabled={!newKey.trim() || !newValue.trim() || saving}
              className="ui-btn-icon-accent p-1.5"
            >
              {saving ? <Loader2 className="ui-spinner-xs" /> : <Save className="h-3 w-3" />}
            </button>
            <button onClick={() => { setAddingNew(false); setNewKey(""); setNewValue(""); setSaveError(null); }} className="ui-btn-icon">
              <X className="h-3 w-3" />
            </button>
          </div>
          {saveError && <p className="text-xs text-status-negative">{saveError}</p>}
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="ui-btn-add mt-0.5"
        >
          <Plus className="h-3 w-3" /> Add detail
        </button>
      )}
    </Section>
  );
}
