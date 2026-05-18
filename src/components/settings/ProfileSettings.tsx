"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { patchJson, throwApiError } from "@/lib/api/fetch";
import { normalizeUsername } from "@/lib/username";

type Props = {
  user: { id: string; name: string; username: string; image: string; hasPassword: boolean };
};

export function ProfileSettings({ user }: Props) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = name !== user.name || username !== user.username;

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await patchJson("/api/me", { name, username: normalizeUsername(username) });
      if (!res.ok) await throwApiError(res, "Failed to save");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  // Password change state — only used when hasPassword is true
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
      <h2 className="font-medium text-text-primary">Profile</h2>

      {user.image && (
        <Image src={user.image} alt={name} width={48} height={48} className="h-12 w-12 rounded-full" />
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="ui-kicker">Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ui-input"
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <label className="ui-kicker">Username</label>
          <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-base px-3 py-2.5">
            <span className="text-sm text-text-tertiary">{typeof window !== "undefined" ? window.location.host : "cockpit.app"}/u/</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              placeholder="yourname"
            />
          </div>
          {username && (
            <Link
              href={`/u/${normalizeUsername(username)}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-xs text-accent-text hover:text-accent-hover transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View public profile
            </Link>
          )}
        </div>
      </div>

      {error && <p className="ui-error">{error}</p>}
      {saved && <p className="text-sm text-text-secondary">Saved.</p>}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="ui-btn-primary"
      >
        {saving && <Loader2 className="ui-spinner" />}
        Save changes
      </button>

      {user.hasPassword && (
        <div className="mt-6 border-t border-border-subtle pt-6 space-y-3">
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
    </section>
  );
}
