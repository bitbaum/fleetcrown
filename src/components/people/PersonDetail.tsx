"use client";

import { useEffect, useState } from "react";
import { X, Link2, Loader2 } from "lucide-react";
import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import { DeleteButton } from "@/components/ui/delete-button";
import { formatDistanceToNow } from "date-fns";
import { deriveRelationshipHealth, HEALTH_DOT_COLOR, HEALTH_LABEL } from "@/lib/constants/people";
import { InteractionsSection } from "./PersonInteractionsSection";
import { DetailAttrs } from "./PersonDetailAttrs";
import { ChannelsSection } from "./PersonChannelsSection";
import { Section } from "./PersonDetailHelpers";
import { parseAliases, type PersonDetailData } from "./person-detail-types";
import { isChannelAttrKey } from "@/config/channels";
import { Drawer } from "@/components/ui/modal";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { getJson, patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";

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
    <Drawer onClose={onClose} size="md" surface="background">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface-page/95 p-4 sm:p-5 backdrop-blur">
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
                  className={`w-full max-w-xs rounded-lg border bg-surface-overlay px-3 py-1.5 text-xl font-semibold text-text-primary outline-none transition-colors sm:w-56 ${nameError ? "border-status-negative/60 focus:border-status-negative" : "border-border-default focus:border-accent-primary"}`}
                />
                {nameSaving && <Loader2 className="ui-spinner-sm shrink-0 text-text-tertiary" />}
              </div>
              {nameError && <p className="ui-error-xs">{nameError}</p>}
            </div>
          ) : loading && !name ? (
            <div className="h-7 w-36 animate-pulse rounded-lg bg-border-default" />
          ) : (
            <h2
              className="cursor-text truncate text-2xl font-semibold text-text-primary transition-colors hover:text-accent-text"
              onClick={() => data && nameEdit.start(name)}
              title="Click to rename"
            >
              {name}
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
          {data && (() => {
            const profession = attrs["profession"] ?? attrs["role"];
            const location = attrs["location"] ?? attrs["home_location"];
            const lastInt = interactions[0] ? new Date(interactions[0].occurredAt) : null;
            const prompt = [
              `Person: ${name}`,
              profession && `Role: ${profession}`,
              location && `Location: ${location}`,
              description && `Notes: ${description}`,
              lastInt
                ? `Last contact: ${formatDistanceToNow(lastInt, { addSuffix: true })} (${interactions.length} total interactions)`
                : "No recorded interactions",
              interactions.length > 0 && `Recent interactions: ${interactions.slice(0, 3).map((i) => `${i.channel} ${i.direction}`).join(", ")}`,
              "",
              "What do you know about this person from my knowledge graph? What would be a good next step with them?",
            ].filter(Boolean).join("\n");
            return (
              <LokiDispatchButton
                prompt={prompt}
                title="Ask Loki about this person"
                className="ui-btn-icon text-text-muted hover:text-status-positive"
              />
            );
          })()}
          {data && (
            <DeleteButton
              onDelete={async () => {
                const res = await deleteJson(`/api/people/${personId}`);
                if (!res.ok) await throwApiError(res, "Failed to delete");
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
        <div className="ui-drawer-body animate-pulse space-y-7 p-4 sm:p-5">
          <div className="space-y-2">
            <div className="h-2.5 w-20 rounded bg-surface-raised" />
            <div className="h-3 w-full rounded bg-surface-raised" />
            <div className="h-3 w-3/4 rounded bg-surface-overlay" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-16 rounded bg-surface-raised" />
                <div className="h-3 w-24 rounded bg-surface-overlay" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-2.5 w-28 rounded bg-surface-raised" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 rounded-xl bg-surface-raised" />
            ))}
          </div>
        </div>
      ) : !data ? (
        <div className="ui-drawer-body p-4 sm:p-5 text-text-tertiary">Person not found</div>
      ) : (
        <div className="ui-drawer-body space-y-7 p-4 sm:p-5">
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

          {!Object.keys(attrs).some(isChannelAttrKey) && (
            <p className="text-sm text-text-secondary">
              No way to reach them on file. Add an email, phone, or chat below — without that this is only a name.
            </p>
          )}

          <InteractionsSection
            personId={data.id}
            interactions={interactions}
            onAdd={(ix) => {
              setInteractions((prev) => [ix, ...prev]);
              onInteractionLogged?.(personId, new Date(ix.occurredAt));
            }}
          />

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
