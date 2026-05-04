"use client";

import { useState } from "react";
import { Copy, Check, Plus, Loader2 } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import type { Invitation } from "@/db/schema";
import { INVITATION_EXPIRY_DAYS } from "@/lib/constants";

type Props = { invitations: Invitation[] };

export function TeamSettings({ invitations: initial }: Props) {
  const [invites, setInvites] = useState(initial);
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await postJson("/api/invitations", { email: email.trim() || undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create invitation");
      setInvites((prev) => [...prev, data]);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const inviteUrl = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : `/invite/${token}`;

  return (
    <section className="ui-panel p-6 space-y-5">
      <h2 className="font-medium text-text-primary">Team</h2>
      <p className="text-sm text-text-tertiary">
        Invite collaborators to access this Cockpit instance. Links expire after {INVITATION_EXPIRY_DAYS} days.
      </p>

      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Email (optional)"
          className="ui-input flex-1"
        />
        <button
          onClick={create}
          disabled={creating}
          className="ui-btn-secondary gap-1.5 whitespace-nowrap"
        >
          {creating ? <Loader2 className="ui-spinner-sm" /> : <Plus className="h-3.5 w-3.5" />}
          Create link
        </button>
      </div>

      {error && <p className="text-sm text-status-negative">{error}</p>}

      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((inv) => {
            const expired = new Date(inv.expiresAt) < new Date();
            const used = !!inv.usedAt;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-base px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate font-mono text-xs text-text-secondary">
                    {inviteUrl(inv.token).replace(/^https?:\/\//, "")}
                  </p>
                  {inv.email && (
                    <p className="text-xs text-text-tertiary mt-0.5">for {inv.email}</p>
                  )}
                </div>
                <span
                  className={`ui-tag shrink-0 ${
                    used ? "ui-tag-neutral" : expired ? "ui-tag-negative" : "ui-tag-positive"
                  }`}
                >
                  {used ? "used" : expired ? "expired" : "active"}
                </span>
                {!used && !expired && (
                  <button
                    onClick={() => copy(inv.token)}
                    className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
                    title="Copy link"
                  >
                    {copied === inv.token ? (
                      <Check className="h-4 w-4 text-status-positive" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {invites.length === 0 && (
        <p className="text-sm text-text-secondary">No invitations yet. Create a link to invite someone.</p>
      )}
    </section>
  );
}
