"use client";

import { useState } from "react";
import { Check, Copy, Lightbulb } from "lucide-react";
import type { LinkSuggestion, LinkSuggestionKind } from "@/lib/atlas/suggest";

const KIND_LABEL: Record<LinkSuggestionKind, string> = {
  reciprocate: "Link back",
  "shared-audience": "Shared audience",
  orphan: "Unreachable",
};

/** The markup to paste. Kept next to the suggestion because "add a link" is
 *  only actionable if you do not have to go and write the anchor yourself. */
function snippetFor(suggestion: LinkSuggestion): string {
  return `<a href="${suggestion.toUrl ?? ""}">${suggestion.toName}</a>`;
}

export function LinkSuggestions({ suggestions }: { suggestions: LinkSuggestion[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(suggestion: LinkSuggestion) {
    const key = `${suggestion.fromProjectId}->${suggestion.toProjectId}`;
    try {
      await navigator.clipboard.writeText(snippetFor(suggestion));
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission). The
      // snippet is on screen either way, so this is not worth an error state.
    }
  }

  return (
    <section
      aria-labelledby="atlas-suggestions-title"
      className="rounded-2xl border border-border-subtle bg-surface-raised p-5"
    >
      <h2
        id="atlas-suggestions-title"
        className="flex items-center gap-2 text-base font-semibold text-text-primary"
      >
        <Lightbulb className="h-4 w-4 text-status-warning" aria-hidden />
        What to link next
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Each suggestion cites the observation behind it. Nothing here is inferred from what a
        project is called — only from links that already exist.
      </p>

      {suggestions.length === 0 ? (
        <p className="mt-4 text-sm text-text-tertiary">
          Nothing to suggest — either every site is already connected, or no site has been checked
          yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {suggestions.map((s) => {
            const key = `${s.fromProjectId}->${s.toProjectId}`;
            return (
              <li
                key={key}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border-subtle bg-surface-overlay p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-raised px-2 py-0.5 text-nano uppercase tracking-wide text-text-tertiary">
                      {KIND_LABEL[s.kind]}
                    </span>
                    <span className="truncate text-sm font-medium text-text-primary">
                      Add a link on {s.fromName} <span className="text-text-tertiary">→</span>{" "}
                      {s.toName}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{s.reason}</p>
                  <code className="mt-1.5 block truncate text-xs text-text-tertiary">
                    {snippetFor(s)}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(s)}
                  disabled={!s.toUrl}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-raised disabled:opacity-50"
                  aria-label={`Copy link snippet for ${s.toName}`}
                >
                  {copied === key ? (
                    <Check className="h-3.5 w-3.5 text-status-positive" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {copied === key ? "Copied" : "Copy"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
