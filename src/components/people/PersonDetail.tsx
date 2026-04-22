"use client";

import { useEffect, useState, useCallback } from "react";
import { X, MessageCircle, Link2, Plus, Loader2, Trash2, Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { CHANNEL_CONFIG } from "@/config/channels";
import { formatDistanceToNow } from "date-fns";
import { deriveRelationshipHealth, HEALTH_DOT_COLOR, type RelationshipHealth } from "@/lib/utils";

const CHANNELS = ["whatsapp", "telegram", "email", "phone", "in-person", "other"] as const;
type Channel = typeof CHANNELS[number];

type PersonDetailData = {
  id: string;
  name: string;
  type: string;
  externalId: string | null;
  description: string | null;
  attrs: Record<string, string>;
  relations: Array<{
    type: string;
    strength: number | null;
    targetId: string;
    targetName: string;
    targetType: string;
  }>;
  interactions: Array<{
    channel: string;
    direction: string;
    summary: string | null;
    occurredAt: string;
  }>;
};

const HEALTH_LABEL: Record<RelationshipHealth, string> = {
  active:  "active",
  fading:  "fading",
  stale:   "stale",
  unknown: "no interactions",
};

export function PersonDetail({
  personId,
  onClose,
}: {
  personId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [interactions, setInteractions] = useState<PersonDetailData["interactions"]>([]);
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [name, setName] = useState<string>("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/people/${personId}`)
      .then((res) => res.json())
      .then((d: PersonDetailData) => { setData(d); setInteractions(d.interactions); setDescription(d.description); setAttrs(d.attrs); setName(d.name); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [personId]);

  const commitName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if ((await res.json()).ok) setName(trimmed);
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

  const commitDescription = async () => {
    const trimmed = descValue.trim();
    setSavingDesc(true);
    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });
      if ((await res.json()).ok) setDescription(trimmed || null);
    } finally {
      setSavingDesc(false);
      setEditingDesc(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/people/${personId}`, { method: "DELETE" });
      onClose();
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/10 overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") { setEditingName(false); setNameValue(name); }
                  }}
                  onBlur={commitName}
                  autoFocus
                  className="text-lg font-semibold bg-white/[0.06] border border-white/20 rounded px-2 py-0.5 focus:outline-none focus:border-white/35 w-48"
                />
                {savingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40 shrink-0" />}
              </div>
            ) : (
              <h2
                className="text-lg font-semibold truncate cursor-text hover:text-white/80 transition-colors"
                onClick={() => data && (setNameValue(name), setEditingName(true))}
                title="Click to rename"
              >
                {name || (data?.name ?? "Loading...")}
              </h2>
            )}
            {data && (() => {
              const lastDate = interactions[0] ? new Date(interactions[0].occurredAt) : null;
              const health = deriveRelationshipHealth(lastDate);
              return (
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  title={lastDate ? `Last contact ${formatDistanceToNow(lastDate, { addSuffix: true })}` : "No interactions recorded"}
                >
                  <div className={`h-2 w-2 rounded-full ${HEALTH_DOT_COLOR[health]}`} />
                  <span className="text-xs text-white/30">{HEALTH_LABEL[health]}</span>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {data && (confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-white/40">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors px-1 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors px-1"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-white/5 transition-colors"
                title="Delete person"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ))}
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-white/30 animate-pulse">Loading...</div>
        ) : !data ? (
          <div className="p-4 text-white/30">Person not found</div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Description — click to edit */}
            {editingDesc ? (
              <div className="space-y-1.5">
                <textarea
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setEditingDesc(false); setDescValue(description ?? ""); }
                    if (e.key === "Enter" && e.metaKey) commitDescription();
                  }}
                  autoFocus
                  rows={3}
                  placeholder="Add a note about this person…"
                  className="w-full bg-white/[0.04] border border-white/15 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/30 resize-none transition-colors"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={commitDescription}
                    disabled={savingDesc}
                    className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    {savingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditingDesc(false); setDescValue(description ?? ""); }}
                    className="text-xs text-white/30 hover:text-white/60 px-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setDescValue(description ?? ""); setEditingDesc(true); }}
                className="w-full text-left text-sm text-white/40 hover:text-white/60 transition-colors"
                title="Click to edit notes"
              >
                {description ?? <span className="italic text-white/20">Add a note…</span>}
              </button>
            )}

            {/* Channels */}
            <Section title="Channels">
              {Object.entries(data.attrs)
                .filter(([k]) => k.startsWith("channel:"))
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <ChannelIcon channel={key} />
                    <span className="text-white/70">{key.replace("channel:", "")}</span>
                    <span className="text-white/40 font-mono text-xs truncate">{formatChannelValue(value)}</span>
                  </div>
                ))}
            </Section>

            {/* Attributes */}
            <DetailAttrs personId={data.id} attrs={attrs} onUpdate={setAttrs} />

            {/* Aliases */}
            {data.attrs["aliases"] && (
              <Section title="Aliases">
                <div className="flex flex-wrap gap-1.5">
                  {parseAliases(data.attrs["aliases"]).map((alias) => (
                    <span
                      key={alias}
                      className="px-2 py-0.5 text-xs bg-white/10 rounded-full text-white/60"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent Interactions */}
            <InteractionsSection personId={data.id} interactions={interactions} onAdd={(ix) => setInteractions((prev) => [ix, ...prev])} />

            {/* Relations */}
            {data.relations.length > 0 && (
              <Section title="Connections">
                {data.relations.map((rel, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Link2 className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-white/50">{rel.type}</span>
                    <span>{rel.targetName}</span>
                    <span className="text-xs text-white/30">({rel.targetType})</span>
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Interaction = PersonDetailData["interactions"][number];

function InteractionsSection({
  personId,
  interactions: list,
  onAdd,
}: {
  personId: string;
  interactions: Interaction[];
  onAdd: (ix: Interaction) => void;
}) {
  const [logging, setLogging] = useState(false);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const handleLog = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/people/${personId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, direction, summary: summary || undefined, occurredAt }),
      });
      const data = await res.json();
      if (data.ok) {
        onAdd({ channel, direction, summary: summary || null, occurredAt });
        setLogging(false);
        setSummary("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Recent Activity">
      {list.length === 0 && !logging && (
        <div className="text-sm text-white/30">No interactions recorded</div>
      )}
      {list.map((ix, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${ix.direction === "inbound" ? "text-blue-400/60" : "text-emerald-400/60"}`}>
              {ix.direction === "inbound" ? "←" : "→"}
            </span>
            <span className="text-white/50">{ix.channel}</span>
            {ix.summary && <span className="text-xs text-white/30 truncate max-w-[140px]">{ix.summary}</span>}
          </div>
          <span className="text-xs text-white/30 shrink-0">
            {new Date(ix.occurredAt).toLocaleDateString("de-CH")}
          </span>
        </div>
      ))}

      {logging ? (
        <div className="mt-2 space-y-2 pt-2 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
            >
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
              className="bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
            >
              <option value="outbound">→ out</option>
              <option value="inbound">← in</option>
            </select>
          </div>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief note (optional)"
            onKeyDown={(e) => { if (e.key === "Enter") handleLog(); if (e.key === "Escape") setLogging(false); }}
            autoFocus
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
            />
            <button
              onClick={handleLog}
              disabled={saving}
              className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </button>
            <button onClick={() => setLogging(false)} className="text-xs text-white/30 hover:text-white/60 px-1">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setLogging(true)}
          className="flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Log interaction
        </button>
      )}
    </Section>
  );
}

function DetailAttrs({
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
  const [addingNew, setAddingNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const detailAttrs = Object.entries(attrs).filter(
    ([k]) => !k.startsWith("channel:") && k !== "aliases",
  );

  const saveEdit = async (key: string) => {
    if (!editValue.trim() || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/people/${personId}/attrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue.trim() }),
      });
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
      await fetch(`/api/people/${personId}/attrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
      });
      const normalizedKey = newKey.trim().toLowerCase().replace(/\s+/g, "_");
      onUpdate({ ...attrs, [normalizedKey]: newValue.trim() });
      setNewKey("");
      setNewValue("");
      setAddingNew(false);
    } finally {
      setSaving(false);
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
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-right truncate">{value}</span>
              <button
                onClick={() => { setEditValue(value); setEditingKey(key); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-white/20 hover:text-white/60 transition-all shrink-0"
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
            className="w-20 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
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
            className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return <MessageCircle className="h-3.5 w-3.5 text-white/30" />;
  const Icon = config.icon;
  return <Icon className={`h-3.5 w-3.5 ${config.color}`} />;
}

function parseAliases(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [raw];
  }
}

// "relationship_to_george" → "Relationship to george"
function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Strip storage format prefixes from channel values: "e164:+41763217721" → "+41763217721"
function formatChannelValue(value: string): string {
  return value.replace(/^e164:/, "");
}
