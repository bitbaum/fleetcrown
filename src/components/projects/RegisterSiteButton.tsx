"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Server } from "lucide-react";
import { postJson } from "@/lib/api/fetch";

/**
 * Idempotent retry for Hetzner CD registration after kickoff left a repo
 * without a live URL (command-only / missing key / script failed).
 * POSTs /api/projects/[id]/register-cd — never invents a liveUrl.
 */
export function RegisterSiteButton({
  projectId,
  hasRepo,
  liveUrl,
  template = "nextjs-tailwind",
}: {
  projectId: string;
  hasRepo: boolean;
  liveUrl: string | null | undefined;
  template?: "nextjs-tailwind" | "bare";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasRepo || liveUrl) return null;

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/register-cd`, { template });
      const json = (await res.json()) as {
        ok?: boolean;
        registered?: boolean;
        liveUrl?: string | null;
        predictedLiveUrl?: string;
        command?: string | null;
        reason?: string | null;
        gate?: string | null;
        alreadyLive?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        return;
      }
      if (json.registered && json.liveUrl) {
        setMessage(`Registered — ${json.liveUrl}`);
      } else {
        const why = json.reason?.trim();
        const cmd = json.command?.trim();
        setMessage(why && cmd ? `${why} — ${cmd}` : why || cmd || "Registration did not complete.");
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <button
        type="button"
        className="ui-btn-ghost min-h-11 gap-1.5"
        onClick={() => void run()}
        disabled={busy}
        title="Register this repo for bitbaum CD (apps.conf + deploy secret + live URL)"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Server className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? "Registering…" : "Register site"}
      </button>
      {message && <span className="max-w-xl text-xs text-text-secondary">{message}</span>}
      {error && <span className="ui-error text-xs">{error}</span>}
    </span>
  );
}
