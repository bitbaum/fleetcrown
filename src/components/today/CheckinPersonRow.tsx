"use client";

import Link from "next/link";
import { useState } from "react";
import { handleApprove, handleReject } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { ACTION_COPY } from "@/config/action-copy";
import { NAV } from "@/config/navigation";
import { lastTalkLabel, reachChannels } from "@/lib/people-reach";

export type CheckinPerson = {
  actionId: string;
  name: string;
  personId: string | null;
  description: string | null;
  lastInteraction: Date | string | null;
  attrs: Record<string, string>;
};

export function CheckinPersonRow({ person }: { person: CheckinPerson }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"open" | "reminded" | "skipped">("open");
  const [error, setError] = useState<string | null>(null);

  const last = lastTalkLabel(
    person.lastInteraction ? new Date(person.lastInteraction) : null,
  );
  const channels = reachChannels(person.attrs);
  const profileHref = person.personId
    ? `${NAV.people.href}?open=${encodeURIComponent(person.personId)}`
    : NAV.people.href;

  async function remind() {
    haptic();
    setBusy(true);
    setError(null);
    try {
      const result = await handleApprove(person.actionId);
      if (result.error) {
        setError(result.error);
      } else {
        setState("reminded");
      }
    } catch {
      setError("Failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    haptic();
    setBusy(true);
    setError(null);
    try {
      await handleReject(person.actionId);
      setState("skipped");
    } catch {
      setError("Failed — try again");
    } finally {
      setBusy(false);
    }
  }

  if (state === "reminded") {
    return (
      <div className="flex flex-col gap-1 rounded-md bg-surface-base p-2.5">
        <p className="text-sm font-medium text-text-primary">{person.name}</p>
        <p className="text-xs text-text-secondary">{ACTION_COPY.checkin.reminded}</p>
        <Link href={profileHref} className="ui-link-subtle ui-tap text-sm">
          {ACTION_COPY.checkin.open} {person.name}
        </Link>
      </div>
    );
  }

  if (state === "skipped") {
    return (
      <p className="px-2.5 py-2 text-xs text-text-muted">Skipped {person.name}</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-base p-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Link
          href={profileHref}
          className="text-sm font-medium text-text-primary underline-offset-2 hover:underline"
        >
          {person.name}
        </Link>
        <p className="mt-0.5 text-xs text-text-secondary">{last}</p>
        {person.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-text-tertiary">{person.description}</p>
        )}
        {channels.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {channels.map((c) => (
              <li key={c.label} className="truncate text-xs text-text-secondary">
                {c.label}: {c.value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-text-muted">{ACTION_COPY.checkin.noChannel}</p>
        )}
        {error && <p className="ui-error-xs mt-1">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Link href={profileHref} className="ui-btn-secondary ui-tap text-xs">
          {ACTION_COPY.checkin.open}
        </Link>
        <button
          type="button"
          onClick={() => void remind()}
          disabled={busy}
          className="ui-btn-confirm-sm ui-tap"
        >
          {ACTION_COPY.checkin.remind}
        </button>
        <button
          type="button"
          onClick={() => void skip()}
          disabled={busy}
          className="ui-btn-ghost ui-tap text-xs"
        >
          {ACTION_COPY.checkin.skip}
        </button>
      </div>
    </div>
  );
}
