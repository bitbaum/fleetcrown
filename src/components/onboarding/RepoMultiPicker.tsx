"use client";

import { useState, useMemo } from "react";
import { Loader2, Check } from "lucide-react";
import { LinkGithubButton } from "./LinkGithubButton";
import { RepoRow, useGithubRepos } from "./repo-list";

type Props = {
  onSelectionChange: (selectedIds: number[]) => void;
  /** Optional filter — hide repos whose name matches this string (case-insensitive substring). */
  filter?: string;
};

export function RepoMultiPicker({ onSelectionChange, filter = "" }: Props) {
  const { repos, hasGithub, loading, error } = useGithubRepos();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Filtered view of repos.
  const visibleRepos = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return repos;
    return repos.filter(
      (r) => r.name.toLowerCase().includes(f) || (r.description ?? "").toLowerCase().includes(f),
    );
  }, [repos, filter]);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(Array.from(next));
      return next;
    });
  }

  function selectAll() {
    const all = new Set(visibleRepos.map((r) => r.id));
    setSelectedIds(all);
    onSelectionChange(Array.from(all));
  }

  function selectNone() {
    setSelectedIds(new Set());
    onSelectionChange([]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="ui-auth-spinner-sm" />
      </div>
    );
  }

  if (hasGithub === false) {
    return (
      <div className="ui-empty-page space-y-4">
        <div>
          <p className="ui-page-subtitle">No GitHub account linked yet.</p>
          <p className="ui-text-muted">
            Connect your GitHub here and you&apos;ll come right back to this page with your repos
            listed — no need to sign out.
          </p>
        </div>
        <LinkGithubButton callbackUrl="/control/import" />
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="ui-empty-page">
        <p className="ui-page-subtitle">No repos found.</p>
        <p className="ui-text-muted">{error || "GitHub returned no repositories you own."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">
          {selectedIds.size} of {visibleRepos.length} selected
          {filter && visibleRepos.length !== repos.length && (
            <> ({repos.length - visibleRepos.length} hidden by filter)</>
          )}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={selectAll} className="ui-btn-ghost ui-btn-xs">
            Select all
          </button>
          <button type="button" onClick={selectNone} className="ui-btn-ghost ui-btn-xs">
            Clear
          </button>
        </div>
      </div>

      <div className="ui-auth-repo-scroll">
        {visibleRepos.map((repo) => {
          const isSelected = selectedIds.has(repo.id);
          return (
            <RepoRow
              key={repo.id}
              repo={repo}
              selected={isSelected}
              onClick={() => toggle(repo.id)}
              lead={
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "border-accent-warm bg-accent-warm" : "border-border-default"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-3 w-3 text-on-accent" />}
                </span>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
