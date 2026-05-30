import webpush from "web-push";

let configured = false;

/** Configure web-push with VAPID details. Safe to call repeatedly. */
export function configureWebPush(): { ok: boolean; reason?: string } {
  if (configured) return { ok: true };

  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return {
      ok: false,
      reason: "VAPID env vars missing — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.",
    };
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "VAPID configure failed";
    return { ok: false, reason: msg };
  }

  configured = true;
  return { ok: true };
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where notificationclick should land the user. */
  url?: string;
  /** Tag groups same-topic notifications so the OS stacks/replaces them. */
  tag?: string;
};

export type SendResult = {
  endpoint: string;
  ok: boolean;
  statusCode?: number;
};

export async function sendOne(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<SendResult> {
  const sub = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 });
    return { endpoint: subscription.endpoint, ok: true };
  } catch (err: unknown) {
    const statusCode = err && typeof err === "object" && "statusCode" in err
      ? Number((err as { statusCode: unknown }).statusCode)
      : undefined;
    return { endpoint: subscription.endpoint, ok: false, statusCode };
  }
}

/** Endpoints that returned 404/410 are dead — caller should GC. */
export function isDeadStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}
