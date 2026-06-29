"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Globe, Laptop, Wifi } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { EXECUTOR_COPY } from "@/config/executor-copy";

type Props = {
  saving: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

type OnboardingStatus = {
  runnerConnected: boolean;
  runnerLastPushedAt: string | null;
};

export function ConnectMachineStep({ saving, onComplete }: Props) {
  const { data: status } = useFetch<OnboardingStatus>("/api/onboarding", { intervalMs: 4000 });
  const [desktopOpen, setDesktopOpen] = useState(false);
  const connected = status?.runnerConnected ?? false;
  const copy = EXECUTOR_COPY.onboarding;

  return (
    <div className="space-y-4">
      <p className="ui-auth-body">{copy.intro}</p>

      <div className="ui-auth-inset-panel space-y-3 border-accent/30">
        <div className="flex items-center gap-2 font-medium text-text-primary">
          <Globe className="h-4 w-4 text-accent shrink-0" />
          {copy.browserPath.title}
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          {copy.browserPath.body}
        </p>
        <button
          type="button"
          onClick={onComplete}
          disabled={saving}
          className="ui-auth-submit-btn w-full"
        >
          {saving ? "Opening…" : copy.finishLabel}
        </button>
      </div>

      {connected && (
        <div className="ui-auth-status-banner">
          <Wifi className="h-4 w-4 shrink-0 text-status-positive" />
          {copy.connectedBanner}
          {status?.runnerLastPushedAt && (
            <span className="ui-auth-status-meta">· syncing</span>
          )}
        </div>
      )}

      <details
        className="rounded-lg border border-border-subtle bg-surface-raised/40"
        open={desktopOpen}
        onToggle={(e) => setDesktopOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-text-primary flex items-center gap-2">
          <Laptop className="h-4 w-4 text-text-secondary shrink-0" />
          {copy.desktopPath.title}
        </summary>
        <div className="space-y-3 border-t border-border-subtle px-4 py-3">
          <p className="text-sm text-text-secondary leading-relaxed">
            {copy.desktopPath.body}
          </p>
          <Link href={copy.desktopPath.href} className="ui-auth-submit-btn inline-flex gap-2">
            {copy.desktopPath.cta}
          </Link>
          <p className="text-micro text-text-muted">
            Same sign-in as the website — the desktop window loads your dashboard and keeps
            agents running in the background on this computer.
          </p>
        </div>
      </details>

      {connected && (
        <button
          type="button"
          onClick={onComplete}
          disabled={saving}
          className="ui-auth-secondary-btn w-full gap-2"
        >
          <Check className="h-4 w-4 text-status-positive" />
          {copy.finishLabel}
        </button>
      )}
    </div>
  );
}
