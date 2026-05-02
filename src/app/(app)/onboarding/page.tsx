"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { normalizeUsername } from "@/lib/username";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"username" | "project">("username");
  const [username, setUsername] = useState("");
  const [projectName, setProjectName] = useState("");
  const [dirPath, setDirPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveUsername = async () => {
    if (!username.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalizeUsername(username) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save username");
      }
      setStep("project");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const saveProject = async (skip = false) => {
    setSaving(true);
    setError("");
    try {
      if (!skip && projectName.trim()) {
        await fetch("/api/user-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: projectName.trim(),
            dirPath: dirPath.trim() || undefined,
            gitUrl: gitUrl.trim() || undefined,
          }),
        });
      }
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardedAt: new Date().toISOString() }),
      });
      router.push("/today");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center gap-2">
          <div className={`h-1 flex-1 rounded-full bg-accent-primary`} />
          <div className={`h-1 flex-1 rounded-full ${step === "project" ? "bg-accent-primary" : "bg-surface-overlay"}`} />
        </div>

        {step === "username" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-text-primary">Choose your handle</h1>
              <p className="text-sm text-text-secondary">
                Your public profile URL:{" "}
                <span className="font-mono text-text-primary">cockpit.app/u/you</span>
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-base px-3 py-2.5">
                <span className="text-sm text-text-muted">cockpit.app/u/</span>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                  placeholder="yourname"
                  className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                onClick={saveUsername}
                disabled={saving || !username.trim()}
                className="ui-btn-primary w-full py-3"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === "project" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-text-primary">Add your first project</h1>
              <p className="text-sm text-text-secondary">
                This is what you&apos;ll launch AI agents on. You can add more later.
              </p>
            </div>

            <div className="space-y-3">
              <input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name (e.g. my-app)"
                className="ui-input"
              />
              <input
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                placeholder="Local path (e.g. /home/you/my-app) — optional"
                className="ui-input"
              />
              <input
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="GitHub URL — optional"
                className="ui-input"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => saveProject(true)}
                  disabled={saving}
                  className="ui-btn-secondary flex-1 py-3"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => saveProject(false)}
                  disabled={saving || !projectName.trim()}
                  className="ui-btn-primary flex-1 py-3"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Let&apos;s go →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
