"use client";

import { Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { usePrivateZone } from "@/hooks/use-private-zone";

export function PrivacySettings() {
  const { configured, unlocked, lock } = usePrivateZone();

  return (
    <div className="space-y-6">
      <div className="ui-settings-section">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Private zone</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            People, Goals, Habits, Events, Money, and Memory live behind a PIN gate.
            Once unlocked, the gate stays open for 30 minutes of activity.
          </p>
        </div>

        <div className="space-y-3">
          <StatusRow
            icon={configured ? ShieldCheck : ShieldOff}
            label="PIN protection"
            value={configured ? "Configured" : "Not configured"}
            tone={configured ? "positive" : "neutral"}
          />
          {configured && (
            <StatusRow
              icon={unlocked ? Lock : ShieldCheck}
              label="Status right now"
              value={unlocked ? "Unlocked" : "Locked"}
              tone={unlocked ? "warning" : "positive"}
            />
          )}
        </div>

        {configured && unlocked && (
          <button
            type="button"
            onClick={lock}
            className="ui-btn-secondary inline-flex items-center gap-2"
          >
            <Lock className="h-4 w-4" />
            Lock now
          </button>
        )}

        {!configured && (
          <p className="text-sm text-text-tertiary">
            Set the <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs">PRIVATE_ZONE_PIN_HASH</code> environment variable to enable PIN protection.
            In-app PIN management is on the roadmap.
          </p>
        )}
      </div>

      <div className="ui-settings-section">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Data</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Your private data — contacts, goals, habits, events, money, and the
            derived knowledge graph — lives on the same database as your account.
            Export and full deletion controls are on the roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: "positive" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "positive" ? "text-status-positive"
    : tone === "warning" ? "text-status-warning"
    : "text-text-tertiary";

  return (
    <div className="ui-list-item">
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className={`text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}
