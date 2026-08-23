"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { cn } from "@/lib/utils";

/**
 * Quiet status pill in the app top bar. Three resting states:
 *  - subscribed  → ringing-bell, accent dot. Click to unsubscribe.
 *  - granted/default/denied → muted bell. Click to subscribe (or open OS settings).
 *  - unsupported → hidden entirely.
 */
export function NotificationsPill() {
  const push = usePushSubscription();

  if (push.status === "unsupported") return null;

  const isSubscribed = push.status === "subscribed";
  const isWorking    = push.status === "registering";
  const onClick = () => {
    if (isWorking) return;
    if (isSubscribed) void push.unsubscribe();
    else              void push.subscribe();
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
      className={cn(
        "ui-topbar-btn",
        isSubscribed && "text-accent-text",
      )}
      title={
        push.publicKeyMissing
          ? "Push not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY"
          : isSubscribed
            ? "Push notifications on (run finished · new feedback) — click to turn off"
            : push.status === "denied"
              ? "Permission denied in browser — enable in site settings"
              : "Enable push notifications"
      }
      aria-label={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
    >
      {isWorking ? <Loader2 className="h-4 w-4 animate-spin" />
        : isSubscribed ? <Bell className="h-4 w-4" />
        : <BellOff className="h-4 w-4" />}
    </button>
  );
}
