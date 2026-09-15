"use client";

/**
 * The parts RepoPicker and RepoMultiPicker were each carrying their own copy
 * of: the language-colour map, the fetch of `/api/github/repos`, and the row
 * itself. The two pickers differ in what SELECTING means (one repo vs many),
 * which is the only thing they should differ in.
 *
 * The row takes a `lead` slot instead of a `multi` flag — the multi picker puts
 * a checkbox in front of the lock icon, the single picker puts nothing there,
 * and a slot says that without either component knowing about the other.
 */
import { useEffect, useState } from "react";
import { Lock, Star } from "lucide-react";
import type { ReactNode } from "react";
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

type ReposState = {
  repos: GitHubRepo[];
  /** null until the fetch settles — "unknown" is a real state both pickers render. */
  hasGithub: boolean | null;
  loading: boolean;
  error: string;
};

/** Load the signed-in user's repos once on mount. */
export function useGithubRepos(): ReposState {
  const [state, setState] = useState<ReposState>({
    repos: [],
    hasGithub: null,
    loading: true,
    error: "",
  });

  useEffect(() => {
    let live = true;
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((d: { repos?: GitHubRepo[]; hasGithub?: boolean; error?: string }) => {
        if (!live) return;
        setState({
          repos: d.repos ?? [],
          hasGithub: d.hasGithub ?? false,
          loading: false,
          error: d.error ?? "",
        });
      })
      .catch(() => {
        if (!live) return;
        setState({
          repos: [],
          hasGithub: false,
          loading: false,
          error: "Could not load repos. Check your GitHub connection.",
        });
      });
    return () => {
      live = false;
    };
  }, []);

  return state;
}

export function RepoRow({
  repo,
  selected,
  onClick,
  lead,
}: {
  repo: GitHubRepo;
  selected: boolean;
  onClick: () => void;
  /** Rendered before the private-repo lock. The multi picker's checkbox. */
  lead?: ReactNode;
}) {
  const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "ui-lang-default") : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-auth-selectable-card${selected ? " ui-auth-selectable-card-selected" : ""}`}
    >
      <div className="flex items-center gap-2">
        {lead}
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
}
