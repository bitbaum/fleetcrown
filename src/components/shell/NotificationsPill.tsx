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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isWorking}
      className={cn(
        "ui-topbar-pill",
        isSubscribed && "ui-topbar-pill-active",
      )}
      title={
        push.publicKeyMissing
          ? "Push not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY"
          : isSubscribed
            ? "Push notifications on — click to turn off"
            : push.status === "denied"
              ? "Permission denied in browser — enable in site settings"
              : "Enable push notifications"
      }
      aria-label={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
    >
      {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : isSubscribed ? <Bell className="h-3.5 w-3.5" />
        : <BellOff className="h-3.5 w-3.5" />}
      <span className="ui-topbar-pill-label">
        {isSubscribed ? "Notifications on" : "Notifications off"}
      </span>
    </button>
  );
}
