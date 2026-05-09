"use client";

import Image from "next/image";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { patchJson } from "@/lib/api/fetch";
import { normalizeUsername } from "@/lib/username";

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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
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
            <span className="text-sm text-text-tertiary">cockpit.app/u/</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              placeholder="yourname"
            />
          </div>
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
