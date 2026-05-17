"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Plus, Trash2, Loader2, Terminal } from "lucide-react";
import { postJson, deleteJson } from "@/lib/api/fetch";

type TokenMeta = {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
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
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const create = async () => {
    if (!label.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await postJson("/api/agent-tokens", { label: label.trim() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create token");
      setRevealed({ token: data.token, id: data.id, label: data.label });
      setTokens((prev) => [...prev, { id: data.id, label: data.label, lastUsedAt: null, createdAt: data.createdAt }]);
      setLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        Authenticate the Cockpit agent daemon on any machine. Run{" "}
        <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-secondary">
          npx @cockpit/agent init
        </code>{" "}
        and paste the token when prompted.
      </p>

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
        <div className="rounded-xl border border-status-positive/30 bg-status-positive/5 p-4 space-y-2">
          <p className="text-xs font-medium text-status-positive">
            Token generated — copy it now. It won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface-base px-3 py-2 font-mono text-xs text-text-primary">
              {revealed.token}
            </code>
            <button
              onClick={() => copy(revealed.token)}
              className="ui-icon-action shrink-0 min-h-8 min-w-8 p-1.5"
              title="Copy token"
            >
              {copied ? <Check className="h-4 w-4 text-status-positive" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-text-tertiary">
            <Terminal className="mr-1 inline-block h-3 w-3" />
            <code className="font-mono">npx @cockpit/agent init --token {revealed.token.slice(0, 12)}…</code>
          </p>
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 && (
        <div className="space-y-1.5">
          {tokens.map((t) => (
            <div key={t.id} className="ui-card-shell flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{t.label}</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {t.lastUsedAt
                    ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                    : `Created ${new Date(t.createdAt).toLocaleDateString()} · never used`}
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
