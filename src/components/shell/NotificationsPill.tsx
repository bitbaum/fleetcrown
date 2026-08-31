"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { cn } from "@/lib/utils";

/**
 * Quiet status pill in the app top bar. Three resting states:
 *  - subscribed  → ringing-bell, accent dot. Click to unsubscribe.
 *  - granted/default/denied → muted bell. Click to subscribe (or open OS settings).
 *  - unsupported / not configured → hidden entirely.
 */
export function NotificationsPill() {
  const push = usePushSubscription();

  // Hidden when the deployment has no VAPID key, exactly as when the browser
  // does not support push: from the user's side those are the same fact —
  // this button cannot work — and it used to render anyway, tapping through to
  // a guaranteed failure. Its hover text also read "set
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY", an environment variable shown to a person
  // who does not deploy the app and could not act on it. Configuring push is
  // an operator concern and belongs in the docs, not in the top bar.
  if (push.status === "unsupported" || push.publicKeyMissing) return null;

  const isSubscribed = push.status === "subscribed";
  const isWorking = push.status === "registering";
  const onClick = () => {
    if (isWorking) return;
    if (isSubscribed) void push.unsubscribe();
    else void push.subscribe();
  };

  // Icon-only — the bell on/off state communicates the same thing the text
  // label used to ("Notifications on" / "Notifications off"). Hover-tooltip
  // (title) carries the longer state explanation for users who need it. The
  // text-label version visually read as two elements (icon + word) for one
  // button; users called it out as confusing duplication.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isWorking}
      className={cn("ui-topbar-btn", isSubscribed && "text-accent-text")}
      title={
        isSubscribed
          ? "Notifications on (run finished · new feedback) — tap to turn off"
          : push.status === "denied"
            ? "Notifications blocked for this site — allow them in your browser settings"
            : "Turn on notifications"
      }
      aria-label={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
    >
      {isWorking ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSubscribed ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
    </button>
  );
}
