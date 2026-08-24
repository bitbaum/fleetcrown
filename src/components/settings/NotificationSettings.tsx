"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DIGEST_CADENCES, type DigestCadence } from "@/db/schema/notification-preferences";
import { COMMS_COPY, DIGEST_CADENCE_COPY } from "@/config/comms";
import { usePushSubscription } from "@/hooks/use-push-subscription";

export function NotificationSettings() {
  return (
    <div className="space-y-6">
      <PushSettingsCard />
      <DigestSettingsCard />
    </div>
  );
}

function PushSettingsCard() {
  const push = usePushSubscription();
  const isSubscribed = push.status === "subscribed";
  const isWorking = push.status === "registering";
  const blocked = push.status === "unsupported" || push.publicKeyMissing || push.status === "denied";

  return (
    <Card className="ui-settings-section">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 text-text-secondary" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-text-primary">{COMMS_COPY.pushSettingsTitle}</h2>
          <p className="text-sm text-text-tertiary">{COMMS_COPY.pushSettingsBody}</p>
        </div>
      </div>

      <div className="mt-4">
        {push.status === "unsupported" ? (
          <p className="text-sm text-text-tertiary">{COMMS_COPY.pushUnsupported}</p>
        ) : push.publicKeyMissing ? (
          <p className="text-sm text-text-tertiary">{COMMS_COPY.pushNotConfigured}</p>
        ) : push.status === "denied" ? (
          <p className="text-sm text-text-tertiary">{COMMS_COPY.pushDenied}</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (isWorking) return;
              if (isSubscribed) void push.unsubscribe();
              else void push.subscribe();
            }}
            disabled={isWorking || blocked}
            className={isSubscribed ? "ui-btn-secondary gap-1.5" : "ui-btn-save gap-1.5"}
          >
            {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {isSubscribed ? COMMS_COPY.pushOn : COMMS_COPY.pushEnable}
          </button>
        )}
        {push.error && <p className="mt-2 text-xs text-status-negative">{push.error}</p>}
      </div>
    </Card>
  );
}

function DigestSettingsCard() {
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
          <h2 className="text-base font-semibold text-text-primary">{COMMS_COPY.digestSettingsTitle}</h2>
          <p className="text-sm text-text-tertiary">
            {COMMS_COPY.digestSettingsBody}
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
                <p className="text-sm font-medium text-text-primary">{DIGEST_CADENCE_COPY[c].label}</p>
                <p className="text-xs text-text-tertiary">{DIGEST_CADENCE_COPY[c].description}</p>
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
