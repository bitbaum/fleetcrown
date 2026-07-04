"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { ROUTES } from "@/config/auth";
import { postJson } from "@/lib/api/fetch";

const DISMISS_KEY = "fleetcrown-verify-email-dismiss";

/** Optional verification reminder — email is not required to use the app. */
export function EmailVerificationBanner() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (status !== "authenticated" || dismissed) return null;

  const email = session?.user?.email;
  const verified = session?.user?.emailVerified;
  if (!email || verified) return null;

  async function resend() {
    setSending(true);
    try {
      await postJson("/api/auth/resend-verification", { email });
      setSent(true);
    } catch {
      /* ignore — user can retry from Settings */
    } finally {
      setSending(false);
    }
  }

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="ui-callout-accent mx-3 mb-2 mt-2 flex items-start justify-between gap-3 sm:mx-4">
      <div className="min-w-0 text-sm leading-relaxed text-text-secondary">
        <p className="font-medium text-text-primary">Verify your email (optional)</p>
        <p className="mt-1">
          {sent
            ? "Verification link sent — check your inbox."
            : "Helps with account recovery. You can use FleetCrown without verifying."}
        </p>
        {!sent && (
          <button
            type="button"
            className="ui-btn-ghost ui-btn-xs mt-2"
            disabled={sending}
            onClick={() => void resend()}
          >
            {sending ? "Sending…" : "Resend link"}
          </button>
        )}
        {" "}
        <Link href={ROUTES.VERIFY_EMAIL} className="text-accent underline">
          Learn more
        </Link>
      </div>
      <button
        type="button"
        className="ui-btn-icon shrink-0"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
