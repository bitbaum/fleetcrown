"use client";

// Auto-suggest the user's top-N most-recent GitHub repos for one-click
// bulk import. Renders only when:
//   - the user has 0 FleetCrown projects (gated by the caller)
//   - the user has a GitHub OAuth account linked (hasGithub=true)
//   - at least 1 owner-affiliated repo exists
//
// One click → POST /api/projects/bulk-from-github with the suggested IDs
// → /control refreshes → projects appear. The cards in EmptyStateWelcome
// stay as the "pick something else" alternatives.
//
// Designed to make the empty-state useful instead of asking the user to
// type a name into a manual form — the "we already know your work" moment.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2 } from "lucide-react";
import type { GitHubRepo } from "@/app/api/github/repos/route";

const SUGGESTED_COUNT = 5;

export function GitHubRepoSuggestions() {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [hasGithub, setHasGithub] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((d: { repos?: GitHubRepo[]; hasGithub?: boolean }) => {
        setRepos((d.repos ?? []).slice(0, SUGGESTED_COUNT));
        setHasGithub(d.hasGithub ?? false);
      })
      .catch(() => setHasGithub(false))
      .finally(() => setLoading(false));
  }, []);

  // No GitHub linked → don't render. Loading state hidden too — we don't
  // want a flash of "Loading suggestions" then it vanishes. The card-grid
  // empty state below handles users without GitHub.
  if (loading || !hasGithub || repos.length === 0) return null;

  async function importSuggested() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/bulk-from-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoIds: repos.map((r) => r.id) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Import failed (HTTP ${res.status})`);
        return;
      }
      // Force a server refetch so /control's projects list repopulates
      // without a hard reload.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="ui-card-shell-raised p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <GitBranch className="h-5 w-5 text-accent mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">
            Import your {repos.length} most recent GitHub repos?
          </div>
          <p className="text-sm text-text-muted mt-0.5">
            One click pulls them in as FleetCrown projects. Pick others or add manually below if you want different ones.
          </p>
        </div>
      </div>

      {/* Compact list — names only, no descriptions, to keep scan-time
          minimum-reading. The user already knows what's in their repos. */}
      <ul className="grid gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {repos.map((r) => (
          <li key={r.id} className="text-text-secondary truncate" title={r.full_name}>
            <span className="text-text-tertiary">•</span> {r.name}
          </li>
        ))}
      </ul>

      {error && (
        <p className="text-xs text-status-warning">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={importSuggested}
          disabled={importing}
          className="ui-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {importing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Importing…
            </>
          ) : (
            <>Import all {repos.length}</>
          )}
        </button>
        <a
          href="/control/import"
          className="ui-btn-ghost text-sm"
        >
          Pick different ones →
        </a>
      </div>
    </section>
  );
}
