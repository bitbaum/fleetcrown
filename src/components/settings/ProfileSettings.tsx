"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { patchJson, throwApiError } from "@/lib/api/fetch";
import { normalizeUsername } from "@/lib/username";
import { APP_DOMAIN } from "@/config/brand";

type Props = {
  user: { id: string; name: string; username: string; image: string };
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function ProfileSettings({ user }: Props) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [imgFailed, setImgFailed] = useState(false);
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

  return (
    <section className="ui-settings-section">
      <h2 className="font-medium text-text-primary">Profile</h2>

      {user.image && !imgFailed ? (
        <Image
          src={user.image}
          alt={name}
          width={48}
          height={48}
          className="h-12 w-12 rounded-full"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent-text"
          aria-label={`Avatar for ${name}`}
        >
          {getInitials(name)}
        </div>
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
            <span className="text-sm text-text-tertiary">{typeof window !== "undefined" ? window.location.host : APP_DOMAIN}/u/</span>
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
    </section>
  );
}
