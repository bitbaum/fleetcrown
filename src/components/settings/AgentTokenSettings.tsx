"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Plus, Trash2, Loader2, Terminal } from "lucide-react";
import { postJson, deleteJson } from "@/lib/api/fetch";
import { APP_NAME, APP_URL } from "@/config/brand";

type TokenMeta = {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
  prefix?: string;
};

type NewToken = { token: string; id: string; label: string };

export function AgentTokenSettings() {
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [revealed, setRevealed] = useState<NewToken | null>(null);

  useEffect(() => {
    fetch("/api/agent-tokens")
      .then((r) => r.json())
      .then((d: { tokens?: TokenMeta[] }) => setTokens(d.tokens ?? []))
      .catch(() => {});
  }, []);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const interactiveInitCommand = `curl -fsSL ${APP_URL}/api/agent/install | node - init --base-url ${APP_URL}`;

  const create = async () => {
    if (!label.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await postJson("/api/agent-tokens", { label: label.trim() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create token");
      setRevealed({ token: data.token, id: data.id, label: data.label });
      setTokens((prev) => [...prev, { id: data.id, label: data.label, lastUsedAt: null, createdAt: data.createdAt, prefix: data.prefix }]);
      setLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  // Per-key copy feedback so multiple Copy buttons in the same view can each
  // show their own check-mark without stealing the others' state.
  const copy = async (text: string, key: string = "default") => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      await deleteJson("/api/agent-tokens", { id });
      setTokens((prev) => prev.filter((t) => t.id !== id));
      if (revealed?.id === id) setRevealed(null);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="ui-settings-section">
      <h2 className="font-medium text-text-primary">Agent Tokens</h2>
      <p className="text-sm text-text-tertiary">
        Connect the {APP_NAME} background helper on any machine. Run the command below and paste the token when prompted — it installs and starts itself as a persistent service.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-surface-raised px-3 py-2 font-mono text-xs text-text-secondary">
          {interactiveInitCommand}
        </code>
        <button
          onClick={() => copy(interactiveInitCommand, "install")}
          className="ui-icon-action shrink-0 min-h-8 min-w-8 p-1.5"
          title="Copy install command"
        >
          {copiedKey === "install" ? <Check className="h-4 w-4 text-status-positive" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {/* Token creation form */}
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Label, e.g. macbook-pro"
          className="ui-input flex-1"
        />
        <button
          onClick={create}
          disabled={creating || !label.trim()}
          className="ui-btn-secondary gap-1.5 whitespace-nowrap"
        >
          {creating ? <Loader2 className="ui-spinner-sm" /> : <Plus className="h-3.5 w-3.5" />}
          Generate
        </button>
      </div>

      {error && <p className="ui-error">{error}</p>}

      {/* One-time reveal */}
      {revealed && (
        <div className="ui-callout-positive flex-col items-stretch gap-2">
          <p className="text-xs font-medium text-status-positive">
            Token generated — copy it now. It won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface-base px-3 py-2 font-mono text-xs text-text-primary">
              {revealed.token}
            </code>
            <button
              onClick={() => copy(revealed.token, "token")}
              className="ui-icon-action shrink-0 min-h-8 min-w-8 p-1.5"
              title="Copy token"
            >
              {copiedKey === "token" ? <Check className="h-4 w-4 text-status-positive" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-text-tertiary flex items-center gap-1">
            <Terminal className="h-3 w-3 shrink-0" />
            Or one-shot install (token pre-filled, no prompt):
          </p>
          {(() => {
            const oneShot = `curl -fsSL ${APP_URL}/api/agent/install | node - init --token ${revealed.token} --base-url ${APP_URL}`;
            return (
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-surface-base px-3 py-2 font-mono text-xs text-text-primary">
                  {oneShot}
                </code>
                <button
                  onClick={() => copy(oneShot, "oneshot")}
                  className="ui-icon-action shrink-0 min-h-8 min-w-8 p-1.5"
                  title="Copy install command with token pre-filled"
                >
                  {copiedKey === "oneshot" ? <Check className="h-4 w-4 text-status-positive" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 && (
        <div className="space-y-1.5">
          {tokens.map((t) => (
            <div key={t.id} className="ui-card-shell flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="truncate text-sm font-medium text-text-primary">{t.label}</p>
                  {t.prefix && (
                    <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary shrink-0" title="Token prefix — match this against the ck_… in your .env to identify the right token">
                      {t.prefix}
                    </code>
                  )}
                </div>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt
                    ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                    : " · never used"}
                </p>
              </div>
              <button
                onClick={() => remove(t.id)}
                disabled={deleting === t.id}
                className="ui-icon-action shrink-0 min-h-8 min-w-8 p-1.5 text-status-negative/60 hover:text-status-negative"
                title="Revoke token"
              >
                {deleting === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {tokens.length === 0 && !revealed && (
        <p className="text-sm text-text-secondary">No tokens yet. Generate one to connect an agent.</p>
      )}
    </section>
  );
}
