"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep]           = useState<"username" | "project">("username");
  const [username, setUsername]   = useState("");
  const [projectName, setProjectName] = useState("");
  const [dirPath, setDirPath]     = useState("");
  const [gitUrl, setGitUrl]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

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
            description="What you'll launch agents on. You can add more later."
          />
          <AuthCard>
            <AuthField label="Project name">
              <AuthInput
                autoFocus
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
