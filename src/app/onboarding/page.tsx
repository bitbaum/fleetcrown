"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, GitBranch, Star, Lock } from "lucide-react";
import { normalizeUsername } from "@/lib/username";
import { postJson, patchJson, throwApiError } from "@/lib/api/fetch";
import {
  AuthShell,
  AuthCard,
  AuthField,
  AuthInput,
  AuthSubmitButton,
  AuthHeading,
} from "@/components/auth/AuthShell";
import type { GitHubRepo } from "@/app/api/github/repos/route";

// ── Repo picker ───────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500/20 text-blue-300",
  JavaScript: "bg-yellow-500/20 text-yellow-300",
  Python: "bg-green-500/20 text-green-300",
  Go: "bg-cyan-500/20 text-cyan-300",
  Rust: "bg-orange-500/20 text-orange-300",
  Ruby: "bg-red-500/20 text-red-300",
  "C#": "bg-purple-500/20 text-purple-300",
  Java: "bg-amber-500/20 text-amber-300",
};

function RepoPicker({
  onSelect,
}: {
  onSelect: (repo: GitHubRepo) => void;
}) {
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (!hasGithub || repos.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40">Your GitHub repos — pick one to start</p>
      <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
        {repos.map((repo) => {
          const isSelected = selected === repo.id;
          const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "bg-white/10 text-white/50") : null;
          return (
            <button
              key={repo.id}
              type="button"
              onClick={() => {
                setSelected(repo.id);
                onSelect(repo);
              }}
              className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all ${
                isSelected
                  ? "border-white/30 bg-white/10"
                  : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-center gap-2">
                {repo.private && <Lock className="h-3 w-3 shrink-0 text-white/30" />}
                <span className="truncate text-sm font-medium text-white/80">{repo.name}</span>
                {langColor && (
                  <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${langColor}`}>
                    {repo.language}
                  </span>
                )}
                {repo.stargazers_count > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-white/30">
                    <Star className="h-3 w-3" />
                    {repo.stargazers_count}
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="mt-1 truncate text-xs text-white/35">{repo.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep]               = useState<"username" | "project">("username");
  const [username, setUsername]       = useState("");
  const [projectName, setProjectName] = useState("");
  const [dirPath, setDirPath]         = useState("");
  const [gitUrl, setGitUrl]           = useState("");
  const [showManual, setShowManual]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  async function saveUsername() {
    if (!username.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await patchJson("/api/me", { username: normalizeUsername(username) });
      if (!res.ok) await throwApiError(res, "Failed to save username");
      await update();
      setStep("project");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function handleRepoSelect(repo: GitHubRepo) {
    setProjectName(repo.name);
    setGitUrl(repo.html_url);
    setShowManual(false);
  }

  async function saveProject(skip = false) {
    setSaving(true);
    setError("");
    try {
      if (!skip && projectName.trim()) {
        await postJson("/api/user-projects", {
          name: projectName.trim(),
          dirPath: dirPath.trim() || undefined,
          gitUrl: gitUrl.trim() || undefined,
        });
      }
      await patchJson("/api/me", { onboardedAt: new Date().toISOString() });
      await update();
      router.push("/today");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell>
      {/* Step progress */}
      <div className="mb-8 flex items-center gap-1.5">
        <div className="h-0.5 flex-1 rounded-full bg-white/50" />
        <div className={`h-0.5 flex-1 rounded-full transition-all ${step === "project" ? "bg-white/50" : "bg-white/[0.12]"}`} />
      </div>

      {step === "username" ? (
        <>
          <AuthHeading
            title="Choose your handle"
            description="Your public profile: cockpit.app/u/you"
          />
          <AuthCard>
            <AuthField label="Username">
              <div className="ui-auth-input flex items-center gap-0 !py-0">
                <span className="shrink-0 py-3 text-sm text-white/30 select-none">cockpit.app/u/</span>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                  placeholder="yourname"
                  className="flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/[0.20]"
                />
              </div>
            </AuthField>
            {error && <p className="ui-error">{error}</p>}
            <AuthSubmitButton
              loading={saving}
              disabled={!username.trim()}
              label="Continue →"
              loadingLabel="Saving…"
              onClick={saveUsername}
            />
          </AuthCard>
        </>
      ) : (
        <>
          <AuthHeading
            title="Add your first project"
            description="What you'll launch agents on. Add more any time."
          />
          <AuthCard>
            <RepoPicker onSelect={handleRepoSelect} />

            {/* Selected repo confirmation or manual entry */}
            {projectName && !showManual ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.14] bg-white/[0.06] px-3.5 py-3">
                  <GitBranch className="h-4 w-4 shrink-0 text-white/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/80">{projectName}</p>
                    {gitUrl && <p className="truncate text-xs text-white/35">{gitUrl}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="text-xs text-white/30 transition-colors hover:text-white/55"
                >
                  Enter details manually instead
                </button>
              </div>
            ) : (
              showManual || !projectName ? (
                <div className="space-y-3">
                  <AuthField label="Project name">
                    <AuthInput
                      autoFocus={showManual}
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="e.g. my-app"
                    />
                  </AuthField>
                  <AuthField label="Local path (optional)">
                    <AuthInput
                      value={dirPath}
                      onChange={(e) => setDirPath(e.target.value)}
                      placeholder="/home/you/my-app"
                    />
                  </AuthField>
                  <AuthField label="GitHub URL (optional)">
                    <AuthInput
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      placeholder="https://github.com/you/my-app"
                    />
                  </AuthField>
                </div>
              ) : null
            )}

            {error && <p className="ui-error">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => saveProject(true)}
                disabled={saving}
                className="ui-auth-secondary-btn flex-1"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => saveProject(false)}
                disabled={saving || !projectName.trim()}
                className="ui-auth-submit-btn flex-1"
              >
                {saving ? "Saving…" : "Let's go →"}
              </button>
            </div>
          </AuthCard>
        </>
      )}
    </AuthShell>
  );
}
