"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MailWarning, X } from "lucide-react";
import { ROUTES } from "@/config/auth";
import { postJson } from "@/lib/api/fetch";

// localStorage (not sessionStorage): an OPTIONAL reminder that the user chose to
// dismiss shouldn't reappear in every new tab. Dismiss once, gone for good.
const DISMISS_KEY = "fleetcrown-verify-email-dismiss";

/** Optional verification reminder — email is not required to use the app. One
 *  calm line so it never outranks the actual page content beneath it. */
export function EmailVerificationBanner() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
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
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="ui-callout-accent mx-3 mb-2 mt-2 flex items-center gap-2 py-1.5 text-xs text-text-secondary sm:mx-4">
      <MailWarning className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
      <span className="min-w-0 flex-1 truncate">
        {sent ? "Verification link sent — check your inbox." : "Verify your email for account recovery (optional)."}
      </span>
      {!sent && (
        <button type="button" className="ui-btn-ghost ui-btn-xs shrink-0" disabled={sending} onClick={() => void resend()}>
          {sending ? "Sending…" : "Resend"}
        </button>
      )}
      <Link href={ROUTES.VERIFY_EMAIL} className="shrink-0 text-accent underline">
        Learn more
      </Link>
      <button type="button" className="ui-btn-icon shrink-0" onClick={dismiss} aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
