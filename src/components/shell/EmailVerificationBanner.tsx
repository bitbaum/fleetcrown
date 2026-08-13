"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MailWarning, X } from "lucide-react";
import { ROUTES } from "@/config/auth";

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

  if (status !== "authenticated" || dismissed) return null;

  const email = session?.user?.email;
  const verified = session?.user?.emailVerified;
  if (!email || verified) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="ui-callout-accent mx-3 mb-2 mt-2 flex items-center gap-2 py-1.5 text-xs text-text-secondary sm:mx-4">
      <MailWarning className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-snug">
        Protect account recovery by verifying your email.
      </span>
      <Link href={ROUTES.VERIFY_EMAIL} className="inline-flex min-h-11 shrink-0 items-center font-medium text-text-primary underline underline-offset-2 sm:min-h-0">
        Verify email
      </Link>
      <button type="button" className="ui-btn-icon min-h-11 min-w-11 shrink-0" onClick={dismiss} aria-label="Dismiss email verification reminder">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
