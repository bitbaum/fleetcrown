"use client";

import { useCallback, useEffect, useState } from "react";

type PushStatus =
  "unsupported" | "denied" | "default" | "granted" | "subscribed" | "registering" | "error";

type UsePushSubscriptionResult = {
  status: PushStatus;
  error: string | null;
  publicKeyMissing: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
};

const SW_PATH = "/sw.js";

/**
 * Manages the Web Push lifecycle for the current browser:
 *   1. Register the service worker at root scope.
 *   2. Check Notification permission.
 *   3. If granted, ensure a PushSubscription exists and is mirrored to the
 *      server (POST /api/push/subscribe). Idempotent on endpoint.
 *
 * Reads VAPID public key from NEXT_PUBLIC_VAPID_PUBLIC_KEY. When that's
 * missing the hook returns publicKeyMissing=true so the UI can hint at
 * what to configure rather than failing silently.
 */
export function usePushSubscription(): UsePushSubscriptionResult {
  const [status, setStatus] = useState<PushStatus>("default");
  const [error, setError] = useState<string | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";

  // On mount, discover current state without prompting for permission.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupported) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        // Register (no-op if already registered) so a fresh tab can be observed.
        const reg = await navigator.serviceWorker.register(SW_PATH);
        const perm = Notification.permission;
        if (cancelled) return;
        if (perm === "denied") {
          setStatus("denied");
          return;
        }
        if (perm === "default") {
          setStatus("default");
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "subscribed" : "granted");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Service worker registration failed.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      setStatus("unsupported");
      return;
    }
    if (!publicKey) {
      setError("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("registering");
    try {
      const perm =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm as PushStatus);
        return;
      }

      const reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: { endpoint: json.endpoint, keys: json.keys } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : `Subscribe failed (${res.status}).`,
        );
      }
      setStatus("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push subscription failed.");
      setStatus("error");
    }
  }, [isSupported, publicKey]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {
          /* best effort */
        });
        await sub.unsubscribe().catch(() => {
          /* ignore */
        });
      }
      setStatus(Notification.permission === "granted" ? "granted" : "default");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push unsubscribe failed.");
      setStatus("error");
    }
  }, [isSupported]);

  return { status, error, publicKeyMissing: !publicKey, subscribe, unsubscribe };
}

/** VAPID public key from base64url to a Uint8Array — required by PushManager.subscribe. */
function urlBase64ToUint8Array(base64UrlString: string): Uint8Array {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bin =
    typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
