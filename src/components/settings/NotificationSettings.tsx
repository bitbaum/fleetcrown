"use client";

import { useEffect, useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DIGEST_CADENCES, type DigestCadence } from "@/db/schema/notification-preferences";

const CADENCE_LABEL: Record<DigestCadence, string> = {
  none:    "Off",
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
};

const CADENCE_DESCRIPTION: Record<DigestCadence, string> = {
  none:    "Don't send digest emails.",
  daily:   "One email each morning summarizing the last 24 hours.",
  weekly:  "One email a week summarizing the last 7 days.",
  monthly: "One email a month summarizing the last 30 days.",
};

export function NotificationSettings() {
  const [cadence, setCadence] = useState<DigestCadence>("none");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<DigestCadence | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCadence(d.emailDigestCadence ?? "none");
        setLastSentAt(d.lastDigestSentAt ?? null);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  async function pick(next: DigestCadence) {
    if (next === cadence || saving) return;
    setSaving(next);
    setError(null);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDigestCadence: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setCadence(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="ui-settings-section">
      <div className="flex items-start gap-3">
        <Mail className="h-5 w-5 text-text-secondary mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-text-primary">Activity digest emails</h2>
          <p className="text-sm text-text-tertiary">
            Reader-friendly summaries of what your fleet has been doing. Opt in for the cadence you want; opt out any time.
          </p>
        </div>
      </div>

      <div className="grid gap-2 mt-4">
        {DIGEST_CADENCES.map((c) => {
          const active = cadence === c;
          const busy = saving === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              disabled={!loaded || saving !== null}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-accent-primary/40 bg-accent-muted"
                  : "border-border-subtle bg-surface-overlay hover:border-border-default",
                (!loaded || saving !== null) && "opacity-70 cursor-wait",
              )}
            >
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border-default flex items-center justify-center">
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin text-text-secondary" />
                ) : active ? (
                  <Check className="h-3 w-3 text-accent-primary" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{CADENCE_LABEL[c]}</p>
                <p className="text-xs text-text-tertiary">{CADENCE_DESCRIPTION[c]}</p>
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-status-negative mt-3">{error}</p>}
      {lastSentAt && cadence !== "none" && (
        <p className="text-xs text-text-tertiary mt-3">
          Last digest sent {new Date(lastSentAt).toLocaleString()}.
        </p>
      )}
      {!lastSentAt && cadence !== "none" && (
        <p className="text-xs text-text-tertiary mt-3">
          Next digest will arrive within 24 hours of the cron tick at 07:00 UTC.
        </p>
      )}
    </Card>
  );
}
