"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Lock, Star, Check } from "lucide-react";
import type { GitHubRepo } from "@/app/api/github/repos/route";
import { LinkGithubButton } from "./LinkGithubButton";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "ui-lang-ts",
  JavaScript: "ui-lang-js",
  Python:     "ui-lang-py",
  Go:         "ui-lang-go",
  Rust:       "ui-lang-rs",
  Ruby:       "ui-lang-rb",
  "C#":       "ui-lang-cs",
  Java:       "ui-lang-java",
};

type Props = {
  onSelectionChange: (selectedIds: number[]) => void;
  /** Optional filter — hide repos whose name matches this string (case-insensitive substring). */
  filter?: string;
};

export function RepoMultiPicker({ onSelectionChange, filter = "" }: Props) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [hasGithub, setHasGithub] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((d: { repos?: GitHubRepo[]; hasGithub?: boolean; error?: string }) => {
        if (d.error) setError(d.error);
        setRepos(d.repos ?? []);
        setHasGithub(d.hasGithub ?? false);
      })
      .catch(() => {
        setHasGithub(false);
        setError("Could not load repos. Check your GitHub connection.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Filtered view of repos.
  const visibleRepos = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return repos;
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(f) ||
        (r.description ?? "").toLowerCase().includes(f),
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
          const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "ui-lang-default") : null;
          return (
            <button
              key={repo.id}
              type="button"
              onClick={() => toggle(repo.id)}
              className={`ui-auth-selectable-card${isSelected ? " ui-auth-selectable-card-selected" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "bg-accent border-accent" : "border-border-default"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-3 w-3 text-accent-foreground" />}
                </span>
                {repo.private && <Lock className="ui-auth-icon-faint" />}
                <span className="ui-auth-repo-name">{repo.name}</span>
                {langColor && (
                  <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${langColor}`}>
                    {repo.language}
                  </span>
                )}
                {repo.stargazers_count > 0 && (
                  <span className="ui-auth-meta-inline">
                    <Star className="ui-auth-icon-faint" />
                    {repo.stargazers_count}
                  </span>
                )}
              </div>
              {repo.description && <p className="ui-auth-repo-desc">{repo.description}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
