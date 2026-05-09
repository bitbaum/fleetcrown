"use client";

import { useEffect, useState } from "react";
import { X, Link2, Loader2 } from "lucide-react";
import { DeleteButton } from "@/components/ui/delete-button";
import { formatDistanceToNow } from "date-fns";
import { deriveRelationshipHealth, HEALTH_DOT_COLOR, HEALTH_LABEL } from "@/lib/utils";
import { InteractionsSection } from "./PersonInteractionsSection";
import { DetailAttrs } from "./PersonDetailAttrs";
import { ChannelsSection } from "./PersonChannelsSection";
import { Section } from "./PersonDetailHelpers";
import { parseAliases, type PersonDetailData } from "./person-detail-types";
import { Drawer } from "@/components/ui/modal";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { getJson, patchJson, deleteJson } from "@/lib/api/fetch";

export function PersonDetail({
  personId,
  onClose,
  onInteractionLogged,
  onDeleted,
}: {
  personId: string;
  onClose: () => void;
  onInteractionLogged?: (personId: string, at: Date) => void;
  onDeleted?: (personId: string) => void;
}) {
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [interactions, setInteractions] = useState<PersonDetailData["interactions"]>([]);
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string | null>(null);
  const nameEdit = useInlineEdit<string>("");
  const descEdit = useInlineEdit<string>("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [descSaving, setDescSaving] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<PersonDetailData>(`/api/people/${personId}`)
      .then((d) => {
        if (cancelled) return;
        setData(d); setInteractions(d.interactions); setDescription(d.description); setAttrs(d.attrs); setName(d.name);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  const commitName = async () => {
    const trimmed = nameEdit.draft.trim();
    if (!trimmed || trimmed === name) { nameEdit.cancel(); return; }
    setNameSaving(true);
    setNameError(null);
    try {
      const res = await patchJson(`/api/people/${personId}`, { name: trimmed });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setName(trimmed);
        nameEdit.cancel();
      } else {
        setNameError(json.error ?? "Failed to save");
      }
    } catch {
      setNameError("Network error — try again");
    } finally {
      setNameSaving(false);
    }
  };

  const commitDescription = async () => {
    const trimmed = descEdit.draft.trim();
    setDescSaving(true);
    setDescError(null);
    try {
      const res = await patchJson(`/api/people/${personId}`, { description: trimmed });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setDescription(trimmed || null);
        descEdit.cancel();
      } else {
        setDescError(json.error ?? "Failed to save");
      }
    } catch {
      setDescError("Network error — try again");
    } finally {
      setDescSaving(false);
    }
  };

  return (
    <Drawer onClose={onClose} size="md" surface="background" className="overflow-y-auto">
      <div className="sticky top-0 flex items-center justify-between border-b border-border-subtle bg-surface-page/95 p-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          {nameEdit.editing ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={nameEdit.draft}
                  onChange={(e) => { nameEdit.setDraft(e.target.value); setNameError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") { nameEdit.cancel(); setNameError(null); }
                  }}
                  autoFocus
                  className={`w-56 rounded-lg border bg-surface-overlay px-3 py-1.5 text-xl font-semibold text-text-primary outline-none transition-colors ${nameError ? "border-status-negative/60 focus:border-status-negative" : "border-border-default focus:border-accent-primary"}`}
                />
                {nameSaving && <Loader2 className="ui-spinner-sm shrink-0 text-text-tertiary" />}
              </div>
              {nameError && <p className="ui-error-xs">{nameError}</p>}
            </div>
          ) : (
            <h2
              className="cursor-text truncate text-2xl font-semibold text-text-primary transition-colors hover:text-accent-text"
              onClick={() => data && nameEdit.start(name)}
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
                className="flex shrink-0 items-center gap-1.5"
                title={lastDate ? `Last contact ${formatDistanceToNow(lastDate, { addSuffix: true })}` : "No interactions recorded"}
              >
                <div className={`h-2 w-2 rounded-full ${HEALTH_DOT_COLOR[health]}`} />
                <span className="text-xs text-text-tertiary">{HEALTH_LABEL[health]}</span>
              </div>
            );
          })()}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {data && (
            <DeleteButton
              onDelete={async () => {
                const res = await deleteJson(`/api/people/${personId}`);
                if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? "Failed to delete"); }
                onDeleted?.(personId);
                onClose();
              }}
              label="Delete?"
              triggerTitle="Delete person"
            />
          )}
          <button onClick={onClose} className="ui-btn-icon">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse p-5 text-text-tertiary">Loading...</div>
      ) : !data ? (
        <div className="p-5 text-text-tertiary">Person not found</div>
      ) : (
        <div className="space-y-7 p-5">
          {descEdit.editing ? (
            <div className="space-y-1.5">
              <textarea
                value={descEdit.draft}
                onChange={(e) => { descEdit.setDraft(e.target.value); setDescError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { descEdit.cancel(); setDescError(null); }
                  if (e.key === "Enter" && e.metaKey) commitDescription();
                }}
                autoFocus
                rows={3}
                placeholder="Add a note about this person…"
                className="min-h-28 w-full resize-none ui-input-compact leading-relaxed"
              />
              {descError && <p className="ui-error-xs">{descError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={commitDescription}
                  disabled={descSaving}
                  className="ui-btn-save"
                >
                  {descSaving ? <Loader2 className="ui-spinner-xs" /> : "Save"}
                </button>
                <button
                  onClick={() => { descEdit.cancel(); setDescError(null); }}
                  className="ui-link-subtle-button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => descEdit.start(description ?? "")}
              className="ui-card-shell w-full px-4 py-3 text-left text-base text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
              title="Click to edit notes"
            >
              {description ?? <span className="italic text-text-muted">Add a note…</span>}
            </button>
          )}

          <ChannelsSection personId={data.id} attrs={attrs} onUpdate={setAttrs} />
          <DetailAttrs personId={data.id} attrs={attrs} onUpdate={setAttrs} />

          {data.attrs["aliases"] && (
            <Section title="Aliases">
              <div className="flex flex-wrap gap-1.5">
                {parseAliases(data.attrs["aliases"]).map((alias) => (
                  <span key={alias} className="ui-badge">
                    {alias}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <InteractionsSection
            personId={data.id}
            interactions={interactions}
            onAdd={(ix) => {
              setInteractions((prev) => [ix, ...prev]);
              onInteractionLogged?.(personId, new Date(ix.occurredAt));
            }}
          />

          {data.relations.length > 0 && (
            <Section title="Connections">
              {data.relations.map((rel, i) => (
                <div key={i} className="flex items-center gap-2 ui-list-row">
                  <Link2 className="h-3.5 w-3.5 text-text-tertiary" />
                  <span className="text-text-secondary">{rel.type}</span>
                  <span className="text-text-primary">{rel.targetName}</span>
                  <span className="text-xs text-text-tertiary">({rel.targetType})</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </Drawer>
  );
}
