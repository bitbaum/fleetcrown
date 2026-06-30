"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { GitBranch } from "lucide-react";
import { normalizeUsername } from "@/lib/username";
import { postJson, patchJson, throwApiError, getJson } from "@/lib/api/fetch";
import { ROUTES } from "@/config/auth";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { APP_DOMAIN } from "@/config/brand";
import {
  AuthShell,
  AuthCard,
  AuthField,
  AuthInput,
  AuthSubmitButton,
  AuthHeading,
  AuthProgressBar,
  AuthPrefixField,
  AuthLoadingCenter,
} from "@/components/auth/AuthShell";
import { ConnectMachineStep } from "@/components/onboarding/ConnectMachineStep";
import { RepoPicker } from "@/components/onboarding/RepoPicker";
import type { GitHubRepo } from "@/app/api/github/repos/route";

type OnboardingStep = "username" | "project" | "connect";

type OnboardingBootstrap = {
  complete?: boolean;
  suggestedUsername?: string;
  isTeamInvitee?: boolean;
  isReturningUser?: boolean;
  projectCount?: number;
  needsSessionRefresh?: boolean;
};

function stepIndex(step: OnboardingStep): number {
  if (step === "username") return 0;
  if (step === "project") return 1;
  return 2;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [step, setStep] = useState<OnboardingStep>("username");
  const [isTeamInvitee, setIsTeamInvitee] = useState(false);
  const [username, setUsername] = useState("");
  const [projectName, setProjectName] = useState("");
  const [dirPath, setDirPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Hold the latest update() callback in a ref so the bootstrap effect can
  // call it without depending on its identity. Without this, every call to
  // update() triggers a session re-render → new update() reference → effect
  // re-fires → infinite loop of /api/onboarding pending requests (observed
  // 2026-06-05 during dogfood; 200+ requests in flight, all stuck pending).
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Sync JWT from DB (fixes migrated accounts with stale cookies).
        await updateRef.current();
        const data = await getJson<OnboardingBootstrap>("/api/onboarding");
        if (cancelled) return;

        if (data.complete && (data.projectCount ?? 0) > 0) {
          if (data.needsSessionRefresh) await updateRef.current();
          router.replace(ROUTES.APP_HOME);
          return;
        }
        if (data.complete && (data.projectCount ?? 0) === 0) {
          if (data.needsSessionRefresh) await updateRef.current();
          setStep(data.isTeamInvitee ? "connect" : "project");
          setIsTeamInvitee(data.isTeamInvitee ?? false);
          return;
        }

        if (data.isReturningUser) {
          const res = await postJson("/api/onboarding", {});
          if (res.ok) {
            await updateRef.current();
            router.replace(ROUTES.APP_HOME);
            return;
          }
          // Heal couldn't auto-finish (typically: no valid username was
          // suggestable — taken, or unsuggestable from name/email). Fall
          // through to the normal step so the user can pick one explicitly,
          // and surface the reason instead of bouncing back here forever.
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Pick a username to finish setup.");
        }

        if (data.suggestedUsername) {
          setUsername((prev) => prev || data.suggestedUsername || "");
        }
        if (data.isTeamInvitee) {
          setIsTeamInvitee(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load onboarding");
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // Intentionally empty deps: this is one-shot bootstrap. router is stable
    // from useRouter(); update() is held in a ref above. Adding either here
    // would re-fire the effect on every session change — the bug this fix
    // closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishOnboarding() {
    setSaving(true);
    setError("");
    try {
      const res = await postJson("/api/onboarding", {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to complete onboarding");
      }
      await update();
      router.push(ROUTES.APP_HOME);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function saveUsername() {
    if (!username.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await patchJson("/api/me", { username: normalizeUsername(username) });
      if (!res.ok) await throwApiError(res, "Failed to save username");
      await update();

      const status = await getJson<OnboardingBootstrap>("/api/onboarding");
      const teamInvitee = status.isTeamInvitee ?? false;
      setIsTeamInvitee(teamInvitee);
      setStep(teamInvitee ? "connect" : "project");
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
      setStep("connect");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (bootstrapping) {
    return (
      <AuthShell>
        <AuthLoadingCenter />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthProgressBar activeStep={stepIndex(step)} />

      {step === "username" ? (
        <>
          <AuthHeading
            title="Choose your handle"
            description={`Your public profile: ${APP_DOMAIN}/u/you`}
          />
          <AuthCard>
            <AuthField label="Username">
              <AuthPrefixField
                prefix={`${APP_DOMAIN}/u/`}
                value={username}
                onChange={setUsername}
                onEnter={saveUsername}
                placeholder="yourname"
              />
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
      ) : step === "project" ? (
        <>
          <AuthHeading
            title="Add your first project"
            description="What you'll launch agents on. Add more any time."
          />
          <AuthCard>
            <RepoPicker onSelect={handleRepoSelect} />

            {projectName && !showManual ? (
              <div className="space-y-3">
                <div className="ui-auth-confirmation-row">
                  <GitBranch className="h-4 w-4 ui-auth-icon-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="ui-auth-repo-name">{projectName}</p>
                    {gitUrl && <p className="ui-auth-repo-desc">{gitUrl}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="ui-auth-muted-link"
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

            <div className="ui-auth-row-actions">
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
                {saving ? "Saving…" : "Continue →"}
              </button>
            </div>
          </AuthCard>
        </>
      ) : (
        <>
          <AuthHeading
            title={EXECUTOR_COPY.onboarding.stepTitle}
            description={
              isTeamInvitee
                ? EXECUTOR_COPY.onboarding.stepDescriptionTeam
                : EXECUTOR_COPY.onboarding.stepDescription
            }
          />
          <AuthCard>
            <ConnectMachineStep
              saving={saving}
              onComplete={finishOnboarding}
              onSkip={finishOnboarding}
            />
            {error && <p className="ui-error mt-3">{error}</p>}
          </AuthCard>
        </>
      )}
    </AuthShell>
  );
}
