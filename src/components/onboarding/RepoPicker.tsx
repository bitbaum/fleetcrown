"use client";

import { useState, useEffect } from "react";
import { Loader2, Lock, Star } from "lucide-react";
import type { GitHubRepo } from "@/app/api/github/repos/route";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "ui-lang-ts",
  JavaScript: "ui-lang-js",
  Python: "ui-lang-py",
  Go: "ui-lang-go",
  Rust: "ui-lang-rs",
  Ruby: "ui-lang-rb",
  "C#": "ui-lang-cs",
  Java: "ui-lang-java",
};

export function RepoPicker({ onSelect }: { onSelect: (repo: GitHubRepo) => void }) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [hasGithub, setHasGithub] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((d: { repos?: GitHubRepo[]; hasGithub?: boolean }) => {
        setRepos(d.repos ?? []);
        setHasGithub(d.hasGithub ?? false);
      })
      .catch(() => setHasGithub(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="ui-auth-loading py-8">
        <Loader2 className="ui-auth-spinner-sm" />
      </div>
    );
  }

  if (!hasGithub || repos.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="ui-auth-repo-hint">Your GitHub repos — pick one to start</p>
      <div className="ui-auth-repo-scroll">
        {repos.map((repo) => {
          const isSelected = selected === repo.id;
          const langColor = repo.language
            ? (LANG_COLORS[repo.language] ?? "ui-lang-default")
            : null;
          return (
            <button
              key={repo.id}
              type="button"
              onClick={() => {
                setSelected(repo.id);
                onSelect(repo);
              }}
              className={`ui-auth-selectable-card${isSelected ? " ui-auth-selectable-card-selected" : ""}`}
            >
              <div className="flex items-center gap-2">
                {repo.private && <Lock className="ui-auth-icon-faint" />}
                <span className="ui-auth-repo-name">{repo.name}</span>
                {langColor && (
                  <span
                    className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${langColor}`}
                  >
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
