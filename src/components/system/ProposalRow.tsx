"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ExternalLink, Loader2 } from "lucide-react";
import type { FrontierProposalRow } from "@/db/schema";

/** One open self-improvement proposal with Accept (→ creates a roadmap goal)
 *  and Dismiss actions. The fleet drafted it; this is the human gate. */
export function ProposalRow({ proposal }: { proposal: FrontierProposalRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "accept" | "dismiss">(null);
  const [error, setError] = useState("");

  async function decide(action: "accept" | "dismiss") {
    setBusy(action);
    setError("");
    try {
      const res = await fetch(`/api/frontier/proposals/${proposal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch {
      setError("Failed — try again");
      setBusy(null);
    }
  }

  return (
    <li className="ui-card-shell-raised p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-text-primary">{proposal.title}</h4>
        <span
          className="ui-badge shrink-0"
          title="consensus score — the lowest across the judge panel"
        >
          {proposal.score}
        </span>
      </div>
      <p className="mb-2 text-xs leading-relaxed text-text-secondary">{proposal.rationale}</p>

      {proposal.verifierScores && proposal.verifierScores.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-micro uppercase tracking-wider text-text-muted">
            judged by
          </span>
          {proposal.verifierScores.map((v) => (
            <span
              key={v.model}
              className="rounded border border-border-subtle px-1.5 py-0.5 font-mono text-micro text-text-secondary"
            >
              {v.model} {v.score}
            </span>
          ))}
        </div>
      )}

      {proposal.sourceUrls.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {proposal.sourceUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-tap inline-flex items-center gap-1 font-mono text-micro uppercase tracking-wider text-text-muted hover:text-text-secondary"
            >
              <ExternalLink className="h-3 w-3" /> source
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="ui-btn-xs ui-btn-primary"
          disabled={busy !== null}
          onClick={() => decide("accept")}
        >
          {busy === "accept" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Accept → goal
        </button>
        <button
          type="button"
          className="ui-btn-xs ui-btn-ghost"
          disabled={busy !== null}
          onClick={() => decide("dismiss")}
        >
          {busy === "dismiss" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
          Dismiss
        </button>
        {error && <span className="ui-error-xs">{error}</span>}
      </div>
    </li>
  );
}
