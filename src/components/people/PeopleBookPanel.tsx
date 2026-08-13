"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, postJson, throwApiError } from "@/lib/api/fetch";
import { BOOK_ATTR_LABEL, IMPORT_SOURCE_LABEL } from "@/config/book";

type Proposal = {
  id: string;
  type: string;
  title: string;
  reasoning: string | null;
  payload: Record<string, unknown> | null;
};

type Cluster = {
  key: string;
  reason: "email" | "phone" | "name";
  members: { id: string; name: string }[];
};

export function PeopleBookPanel({ onChanged }: { onChanged?: () => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [p, d] = await Promise.all([
      getJson<{ proposals: Proposal[] }>("/api/people/proposals"),
      getJson<{ clusters: Cluster[] }>("/api/people/duplicates"),
    ]);
    setProposals(p.proposals);
    setClusters(d.clusters);
  }, []);

  useEffect(() => { void refresh().catch(() => setError("Could not load book proposals")); }, [refresh]);

  async function decide(id: string, decision: "accept" | "discard") {
    setBusy(id);
    setError(null);
    try {
      const res = await postJson(`/api/people/proposals/${id}`, { decision });
      if (!res.ok) await throwApiError(res, "Failed");
      await refresh();
      if (decision === "accept") onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function merge(keepId: string, dropId: string) {
    setBusy(`merge:${dropId}`);
    setError(null);
    try {
      const res = await postJson("/api/people/merge", { keepId, dropId });
      if (!res.ok) await throwApiError(res, "Merge failed");
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    setBusy("import");
    setError(null);
    setImportNote(null);
    try {
      const text = await file.text();
      const res = await postJson("/api/people/import", { text, filename: file.name });
      const data = await res.json() as { ok?: boolean; error?: string; imported?: number; enrich?: number; skipped?: number; parsed?: number; source?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportNote(
        `${data.parsed} parsed from ${IMPORT_SOURCE_LABEL[data.source as keyof typeof IMPORT_SOURCE_LABEL] ?? data.source}. ${data.imported} new, ${data.enrich} enrichments, ${data.skipped} already current.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function scan() {
    setBusy("scan");
    setError(null);
    try {
      const res = await postJson("/api/people/proposals", {});
      const data = await res.json() as { ok?: boolean; proposed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setImportNote(`${data.proposed ?? 0} enrichment proposals from data already in the book.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,.vcard,.csv,.json,text/vcard,text/csv,application/json"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="ui-btn-chip"
        >
          {busy === "import" ? "Reading…" : "Import address book"}
        </button>
        <button type="button" onClick={() => void scan()} disabled={busy !== null} className="ui-btn-chip">
          {busy === "scan" ? "Scanning…" : "Propose enrichments"}
        </button>
      </div>
      <p className="text-xs text-text-tertiary">
        vCard, CSV, or contact-resolver JSON you already have. Accept or discard each row. Nothing is scraped. Nothing is sent.
      </p>
      {importNote && <p className="text-sm text-text-secondary">{importNote}</p>}
      {error && <p className="ui-error-xs">{error}</p>}

      {proposals.length > 0 && (
        <div className="space-y-2">
          <h2 className="ui-kicker">{proposals.length} to review</h2>
          {proposals.map((p) => {
            const field = typeof p.payload?.key === "string" ? BOOK_ATTR_LABEL[p.payload.key] ?? p.payload.key : null;
            const value = typeof p.payload?.value === "string" ? p.payload.value : null;
            return (
              <div key={p.id} className="ui-card-shell flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">{p.title}</div>
                  {value && <div className="truncate text-sm text-text-secondary">{field}: {value}</div>}
                  {p.reasoning && <p className="text-xs text-text-tertiary">{p.reasoning}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void decide(p.id, "accept")}
                    className="ui-btn-chip"
                  >
                    {busy === p.id ? "…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void decide(p.id, "discard")}
                    className="ui-link-subtle"
                  >
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {clusters.length > 0 && (
        <div className="space-y-2">
          <h2 className="ui-kicker">{clusters.length} possible duplicates</h2>
          {clusters.map((c) => (
            <div key={`${c.reason}:${c.key}`} className="ui-card-shell space-y-2 p-3">
              <p className="text-xs text-text-tertiary">
                Same {c.reason}{c.reason !== "name" ? ` (${c.key})` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {c.members.map((m, i) => (
                  <span key={m.id} className="text-sm text-text-primary">
                    {i > 0 && <span className="text-text-tertiary"> · </span>}
                    {m.name}
                  </span>
                ))}
              </div>
              {c.members.length >= 2 && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void merge(c.members[0]!.id, c.members[1]!.id)}
                  className="ui-btn-chip"
                >
                  Keep {c.members[0]!.name}, merge {c.members[1]!.name}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
