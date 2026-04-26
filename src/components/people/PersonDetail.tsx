"use client";

import { useEffect, useState } from "react";
import { X, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { patchJson, deleteJson } from "@/lib/api/fetch";

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
  const [description, setDescription] = useState<string | null>(null);
  const nameEdit = useInlineEdit<string>("");
  const descEdit = useInlineEdit<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/people/${personId}`)
      .then((res) => res.json())
      .then((d: PersonDetailData) => {
        if (cancelled) return;
        setData(d); setInteractions(d.interactions); setDescription(d.description); setAttrs(d.attrs); setName(d.name);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  const commitName = () => {
    const trimmed = nameEdit.draft.trim();
    if (!trimmed || trimmed === name) { nameEdit.cancel(); return; }
    nameEdit.commit(async () => {
      const res = await patchJson(`/api/people/${personId}`, { name: trimmed });
      if ((await res.json()).ok) setName(trimmed);
    });
  };

  const commitDescription = () => {
    const trimmed = descEdit.draft.trim();
    descEdit.commit(async () => {
      const res = await patchJson(`/api/people/${personId}`, { description: trimmed });
      if ((await res.json()).ok) setDescription(trimmed || null);
    });
  };

  return (
    <Drawer onClose={onClose} size="md" surface="background" className="overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            {nameEdit.editing ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameEdit.draft}
                  onChange={(e) => nameEdit.setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") nameEdit.cancel();
                  }}
                  onBlur={commitName}
                  autoFocus
                  className="text-lg font-semibold bg-white/[0.06] border border-white/20 rounded px-2 py-0.5 focus:outline-none focus:border-white/35 w-48"
                />
                {nameEdit.saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40 shrink-0" />}
              </div>
            ) : (
              <h2
                className="text-lg font-semibold truncate cursor-text hover:text-white/80 transition-colors"
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
            {data && (
              <DeleteButton
                onDelete={async () => {
                  await deleteJson(`/api/people/${personId}`);
                  onClose();
                  router.refresh();
                }}
                label="Delete?"
                triggerTitle="Delete person"
              />
            )}
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
            {descEdit.editing ? (
              <div className="space-y-1.5">
                <textarea
                  value={descEdit.draft}
                  onChange={(e) => descEdit.setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") descEdit.cancel();
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
                    disabled={descEdit.saving}
                    className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    {descEdit.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </button>
                  <button
                    onClick={descEdit.cancel}
                    className="text-xs text-white/30 hover:text-white/60 px-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => descEdit.start(description ?? "")}
                className="w-full text-left text-sm text-white/40 hover:text-white/60 transition-colors"
                title="Click to edit notes"
              >
                {description ?? <span className="italic text-white/20">Add a note…</span>}
              </button>
            )}

            <ChannelsSection personId={data.id} attrs={attrs} onUpdate={setAttrs} />
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
    </Drawer>
  );
}
