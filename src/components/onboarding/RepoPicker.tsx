"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { GitHubRepo } from "@/app/api/github/repos/route";
import { RepoRow, useGithubRepos } from "./repo-list";

export function RepoPicker({ onSelect }: { onSelect: (repo: GitHubRepo) => void }) {
  const { repos, hasGithub, loading } = useGithubRepos();
  const [selected, setSelected] = useState<number | null>(null);

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
        {repos.map((repo) => (
          <RepoRow
            key={repo.id}
            repo={repo}
            selected={selected === repo.id}
            onClick={() => {
              setSelected(repo.id);
              onSelect(repo);
            }}
          />
        ))}
      </div>
    </div>
  );
}
