"use client";

import Link from "next/link";
import { useState } from "react";
import { handleConfirmSent, handleReject } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { mailtoHref, whatsappHref } from "@/lib/people-reach";
import { NAV } from "@/config/navigation";

export function MessageReachCard({
  actionId,
  name,
  personId,
  channel,
  address,
  body,
  profession,
}: {
  actionId: string;
  name: string;
  personId: string | null;
  channel: string | null;
  address: string | null;
  body: string;
  profession: string | null;
}) {
  const [state, setState] = useState<"open" | "sent" | "skipped">("open");
  const [error, setError] = useState<string | null>(null);

  const wa = channel === "whatsapp" && address ? whatsappHref(address, body) : null;
  const mail = channel === "email" && address ? mailtoHref(address, undefined, body) : null;
  const href = wa ?? mail;
  const sendLabel = wa ? "Open WhatsApp" : mail ? "Open email" : null;
  const profileHref = personId
    ? `${NAV.people.href}?open=${encodeURIComponent(personId)}`
    : NAV.people.href;

  async function confirmSent() {
    haptic();
    const res = await handleConfirmSent(actionId);
    if (!res.ok) {
      setError(res.error ?? "Could not log");
      return;
    }
    setState("sent");
  }

  async function skip() {
    haptic();
    await handleReject(actionId);
    setState("skipped");
  }

  if (state === "sent") {
    return <p className="text-sm text-text-secondary">Logged as sent to {name}.</p>;
  }
  if (state === "skipped") {
    return <p className="text-sm text-text-muted">Skipped.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <Link
          href={profileHref}
          className="text-sm font-medium text-text-primary underline-offset-2 hover:underline"
        >
          {name}
        </Link>
        {profession && <p className="text-xs text-text-secondary">{profession}</p>}
        {address && (
          <p className="mt-0.5 text-xs text-text-secondary">
            {channel ?? "channel"}: {address}
          </p>
        )}
        {!address && (
          <p className="mt-0.5 text-xs text-text-muted">No WhatsApp or email on file.</p>
        )}
      </div>
      {body && (
        <p className="whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-page px-3 py-2 text-sm text-text-primary">
          {body}
        </p>
      )}
      {error && <p className="ui-error-xs">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ui-btn-primary min-h-11 justify-center text-sm"
            onClick={() => haptic()}
          >
            {sendLabel}
          </a>
        )}
        <button type="button" onClick={() => void confirmSent()} className="ui-btn-secondary min-h-11 text-sm">
          I sent it
        </button>
        <button type="button" onClick={() => void skip()} className="ui-btn-ghost min-h-11 text-sm">
          Skip
        </button>
      </div>
    </div>
  );
}
