"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { patchJson, throwApiError } from "@/lib/api/fetch";
import { normalizeUsername } from "@/lib/username";
import { APP_DOMAIN } from "@/config/brand";
import { Avatar } from "@/components/shared/Avatar";

type Props = {
  user: { id: string; name: string; username: string; image: string };
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

  return (
    <section className="ui-settings-section">
      <h2 className="font-medium text-text-primary">Profile</h2>

      <Avatar src={user.image} name={name} size="md" />

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
            {/* The full host is 26 characters of prefix. On a 390px phone that
                left ~120px for the field the user is actually here to edit,
                and the input overflowed the border. The domain is implied on
                your own settings page — the phone gets the path alone. */}
            <span className="shrink-0 text-sm text-text-tertiary">
              <span className="hidden sm:inline">{APP_DOMAIN}</span>/u/
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="ui-tap w-full min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted sm:text-sm"
              placeholder="yourname"
            />
          </div>
          {username && (
            <Link
              href={`/u/${normalizeUsername(username)}`}
              target="_blank"
              className="ui-tap inline-flex items-center gap-1 text-xs text-accent-text hover:text-accent-hover transition-colors"
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
