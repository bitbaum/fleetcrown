"use client";

import { useState } from "react";
import { Loader2, GitBranch, X as XIcon, Globe, Trash2 } from "lucide-react";
import { patchJson, deleteJson } from "@/lib/api/fetch";
import { useFetch } from "@/hooks/use-fetch";

type ConnectedAccount = { provider: string; providerAccountId: string };

const PROVIDER_META: Record<string, { label: string; icon: React.ElementType }> = {
  github:  { label: "GitHub",  icon: GitBranch },
  google:  { label: "Google",  icon: Globe     },
  twitter: { label: "Twitter/X", icon: XIcon   },
};

function ConnectedAccountsSection({ hasPassword }: { hasPassword: boolean }) {
  const { data, refetch } = useFetch<{ accounts: ConnectedAccount[] }>("/api/me/connected-accounts");
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedAccounts = data?.accounts ?? [];

  const disconnect = async (provider: string) => {
    setDisconnecting(provider);
    setError(null);
    try {
      const res = await deleteJson(`/api/me/connected-accounts/${provider}`);
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to disconnect");
        return;
      }
      refetch();
    } catch {
      setError("Network error — try again");
    } finally {
      setDisconnecting(null);
    }
  };

  if (!data) return <div className="h-8 w-40 animate-pulse rounded bg-border-default" />;

  return (
    <div className="space-y-2">
      {connectedAccounts.length === 0 && (
        <p className="text-sm text-text-muted">No OAuth providers connected.</p>
      )}
      {connectedAccounts.map(({ provider }) => {
        const meta = PROVIDER_META[provider] ?? { label: provider, icon: Globe };
        const Icon = meta.icon;
        const isOnly = connectedAccounts.length === 1 && !hasPassword;
        return (
          <div key={provider} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-base px-3 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
            <span className="flex-1 text-sm text-text-primary">{meta.label}</span>
            <span className="text-xs text-status-positive">Connected</span>
            <button
              onClick={() => disconnect(provider)}
              disabled={!!disconnecting || isOnly}
              title={isOnly ? "Set a password before disconnecting your only sign-in method" : `Disconnect ${meta.label}`}
              className="ml-2 p-1 rounded text-text-muted hover:text-status-negative/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label={`Disconnect ${meta.label}`}
            >
              {disconnecting === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        );
      })}
      {error && <p className="ui-error-xs">{error}</p>}
    </div>
  );
}

type Props = {
  user: { email: string | null; hasPassword: boolean };
};

export function AccountSettings({ user }: Props) {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSaved, setPwdSaved] = useState(false);

  const pwdMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;
  const pwdTooShort = newPwd.length > 0 && newPwd.length < 8;
  const canSavePwd = !!currentPwd && newPwd.length >= 8 && newPwd === confirmPwd;

  const savePassword = async () => {
    setPwdSaving(true);
    setPwdError("");
    setPwdSaved(false);
    try {
      const res = await patchJson("/api/me/password", { currentPassword: currentPwd, newPassword: newPwd });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to change password");
      }
      setPwdSaved(true);
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      setTimeout(() => setPwdSaved(false), 4000);
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <section className="ui-settings-section">
      <h2 className="font-medium text-text-primary">Account</h2>

      {/* Email */}
      <div className="space-y-1.5">
        <label className="ui-kicker">Email address</label>
        <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-raised px-3 py-2.5">
          <span className="flex-1 text-sm text-text-secondary">{user.email ?? "No email set"}</span>
          <span className="text-xs text-text-muted">Read-only</span>
        </div>
      </div>

      {/* Connected OAuth accounts */}
      <div className="space-y-2">
        <label className="ui-kicker">Connected accounts</label>
        <ConnectedAccountsSection hasPassword={user.hasPassword} />
      </div>

      {/* Password */}
      {user.hasPassword && (
        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Change password</h3>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <label className="ui-kicker">Current password</label>
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => { setCurrentPwd(e.target.value); setPwdError(""); }}
                autoComplete="current-password"
                className="ui-input"
                placeholder="Your current password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="ui-kicker">New password</label>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => { setNewPwd(e.target.value); setPwdError(""); }}
                autoComplete="new-password"
                className={`ui-input ${pwdTooShort ? "border-status-negative/50" : ""}`}
                placeholder="At least 8 characters"
              />
              {pwdTooShort && <p className="ui-error-xs">At least 8 characters required</p>}
            </div>
            <div className="space-y-1.5">
              <label className="ui-kicker">Confirm new password</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); setPwdError(""); }}
                autoComplete="new-password"
                className={`ui-input ${pwdMismatch ? "border-status-negative/50" : ""}`}
                placeholder="Repeat new password"
              />
              {pwdMismatch && <p className="ui-error-xs">Passwords don&apos;t match</p>}
            </div>
          </div>
          {pwdError && <p className="ui-error">{pwdError}</p>}
          {pwdSaved && <p className="text-sm text-status-positive">Password updated.</p>}
          <button
            onClick={savePassword}
            disabled={pwdSaving || !canSavePwd}
            className="ui-btn-secondary"
          >
            {pwdSaving && <Loader2 className="ui-spinner" />}
            Update password
          </button>
        </div>
      )}

      {/* Danger zone */}
      <div className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-medium text-status-negative/80 mb-2">Danger zone</h3>
        <p className="text-xs text-text-muted mb-3">
          Account deletion requires cancelling any active subscriptions. Contact support to proceed.
        </p>
        <button
          disabled
          className="text-xs text-status-negative/50 border border-status-negative/20 rounded-lg px-3 py-1.5 cursor-not-allowed"
          title="Contact support to delete your account"
        >
          Delete account
        </button>
      </div>
    </section>
  );
}
