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
        {APP_NAME} lets you control AI agents (Grok, Claude, etc.) running on *your* machine from this website.
        We&apos;ll get your computer connected in a few guided steps — or skip and do it later in Settings.
      </p>

      <div className="space-y-4">
        <div>
          <p className="ui-auth-inset-label mb-2">1. Install Zellij (the terminal multiplexer)</p>
          <p className="text-sm text-text-secondary">
            Follow the official instructions at{" "}
            <a href="https://zellij.dev/" target="_blank" rel="noopener noreferrer" className="ui-auth-link">
              zellij.dev
            </a>. It only takes a minute on most systems.
          </p>
        </div>

        <div>
          <p className="ui-auth-inset-label mb-2">2. Choose and install your first AI coding CLI</p>
          <p className="text-sm text-text-secondary mb-3">
            Pick one. We&apos;ll give you the exact command to run in your terminal.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { id: "grok", label: "Grok (xAI)", cmd: "curl -fsSL https://x.ai/cli/install.sh | bash" },
              { id: "claude", label: "Claude Code (Anthropic)", cmd: "curl -fsSL https://claude.ai/install.sh | bash" },
              { id: "cursor", label: "Cursor Agent", cmd: "curl https://cursor.com/install -fsS | bash" },
              { id: "gemini", label: "Gemini CLI (Google)", cmd: "See https://ai.google.dev/gemini-api/docs/cli for install" },
            ].map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(a.cmd);
                  // In a real flow we could track choice and show the command prominently
                }}
                className="ui-auth-secondary-btn text-left p-3 h-auto flex flex-col items-start"
              >
                <span className="font-medium">{a.label}</span>
                <span className="text-[10px] text-text-muted mt-1 font-mono break-all">{a.cmd}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            After the helper connects, Control page install buttons can open a dedicated terminal tab and run these installers for you.
          </p>
        </div>
      </div>

      <ol className="ui-auth-list">
        <li>Generate a token below and run the one-line installer. It installs and starts the Cockpit helper as a background service.</li>
        <li>After that, agent launches, repairs, and tab controls happen from this website.</li>
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
