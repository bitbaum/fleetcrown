"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Copy, Loader2, Terminal, Wifi } from "lucide-react";
import { getJson, postJson } from "@/lib/api/fetch";
import { APP_NAME, APP_URL } from "@/config/brand";

type Props = {
  saving: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

type OnboardingStatus = {
  daemonConnected: boolean;
  daemonLastPushedAt: string | null;
};

export function ConnectMachineStep({ saving, onComplete, onSkip }: Props) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"token" | "cmd" | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getJson<OnboardingStatus>("/api/onboarding");
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const id = setInterval(() => { void refreshStatus(); }, 4000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  async function generateToken() {
    setGenerating(true);
    setError("");
    try {
      const res = await postJson("/api/agent-tokens", { label: "My machine" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate token");
      setToken(data.token as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function copy(text: string, kind: "token" | "cmd") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  // @cockpit/agent isn't on npm yet and the repo is private, so the
  // npx form doesn't work for new customers. The cloud serves the CLI
  // itself from /api/agent/install — pipe it into node. When the npm
  // package ships, swap this back to the npx form.
  const initCommand = token
    ? `curl -fsSL ${APP_URL}/api/agent/install | node - init --token ${token} --base-url ${APP_URL}`
    : null;

  const connected = status?.daemonConnected ?? false;

  return (
    <div className="space-y-4">
      <p className="ui-auth-body">
        {APP_NAME} dispatches agents from your machine. Generate a token, run one command in your terminal,
        then start the daemon — or skip and set this up later in Settings.
      </p>

      <ol className="ui-auth-list">
        <li>
          Install{" "}
          <a href="https://zellij.dev/" target="_blank" rel="noopener noreferrer" className="ui-auth-link">
            Zellij
          </a>{" "}
          and at least one agent CLI (Claude, Cursor, Codex, …).
        </li>
        <li>Generate a token and run the init command below.</li>
        <li>
          Start the daemon:{" "}
          <code className="ui-auth-inline-code">./scripts/cockpit-daemon.sh</code>
        </li>
      </ol>

      {!token ? (
        <button
          type="button"
          onClick={generateToken}
          disabled={generating}
          className="ui-auth-submit-btn gap-2"
        >
          {generating ? <Loader2 className="ui-auth-spinner-sm" /> : <Terminal className="h-4 w-4" />}
          {generating ? "Generating…" : "Generate agent token"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="ui-auth-inset-panel">
            <p className="ui-auth-inset-label">Token (copy now — shown once)</p>
            <div className="flex items-center gap-2">
              <code className="ui-auth-mono">{token}</code>
              <button
                type="button"
                onClick={() => copy(token, "token")}
                className="ui-btn-icon shrink-0"
                aria-label="Copy token"
              >
                {copied === "token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {initCommand && (
            <div className="ui-auth-inset-panel">
              <p className="ui-auth-inset-label">Run on your machine</p>
              <div className="flex items-start gap-2">
                <code className="ui-auth-mono-wrap">{initCommand}</code>
                <button
                  type="button"
                  onClick={() => copy(initCommand, "cmd")}
                  className="ui-btn-icon shrink-0"
                  aria-label="Copy command"
                >
                  {copied === "cmd" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {connected && (
        <div className="ui-auth-status-banner">
          <Wifi className="h-4 w-4 shrink-0 text-status-positive" />
          Machine connected
          {status?.daemonLastPushedAt && (
            <span className="ui-auth-status-meta">· syncing</span>
          )}
        </div>
      )}

      {error && <p className="ui-error">{error}</p>}

      <div className="ui-auth-row-actions pt-1">
        <button
          type="button"
          onClick={onSkip}
          disabled={saving}
          className="ui-auth-secondary-btn flex-1"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={saving}
          className="ui-auth-submit-btn flex-1"
        >
          {saving ? "Saving…" : connected ? "Finish →" : "Continue →"}
        </button>
      </div>
    </div>
  );
}
