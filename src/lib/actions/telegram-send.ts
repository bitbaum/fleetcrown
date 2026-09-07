import { TELEGRAM_CHAT_ID } from "@/lib/constants";

export type SendResult = { ok: boolean; messageId?: string; error?: string };

const TELEGRAM_API = "https://api.telegram.org";

/**
 * the operator's own Telegram chat id — the ONLY allowed recipient in the self-only phase.
 * Sourced through constants' envAlias, which reads APP_TELEGRAM_CHAT_ID /
 * FLEETCROWN_TELEGRAM_CHAT_ID / COCKPIT_TELEGRAM_CHAT_ID — never the bare
 * TELEGRAM_CHAT_ID, which is worth stating because setting the bare name
 * configures nothing and looks like it worked. Null when unset => no allowed
 * recipient => every send is blocked (fail-closed; we never guess a target).
 */
export function selfTelegramTarget(): string | null {
  return TELEGRAM_CHAT_ID?.trim() ? TELEGRAM_CHAT_ID.trim() : null;
}

/**
 * Self-only allowlist guardrail. In this slice Loki may send to the operator HIMSELF only.
 * A requested target is allowed iff it is empty (defaults to self) or equals the
 * configured self chat id. Any other recipient is refused until the allowlist is
 * deliberately widened — directly bounds the blast radius (no spamming real contacts).
 *
 * Enforced inside sendTelegramMessage below, not by its callers. It used to be a
 * caller obligation stated in a docblock, and NO caller performed it — the blast
 * radius was held closed only by the accident that all eight call sites pass
 * selfTelegramTarget(). The first flow that lets a recipient be requested would
 * have inherited an unguarded send.
 */
export function isAllowedTelegramTarget(requested: string | null | undefined): boolean {
  const self = selfTelegramTarget();
  if (!self) return false; // no self target configured => nothing is allowed
  const r = (requested ?? "").trim();
  if (!r) return true; // empty => default to self
  return r === self;
}

/**
 * Deterministic Telegram send via the Telegram Bot API directly (no OpenClaw) —
 * the same @AnthropigBot identity Loki uses, and the same path ivy-health.sh uses,
 * so it works even when the OpenClaw gateway is down and regardless of OS user.
 *
 * The self-only allowlist is enforced HERE. Callers used to be told to check it
 * first and none did; a rule that lives in a docblock is a rule nobody runs. An
 * empty chatId resolves to the operator's own chat, which is what
 * isAllowedTelegramTarget has always meant by "empty => default to self".
 *
 * Fail-closed: with TELEGRAM_CHAT_ID unset there is no allowed recipient, so
 * every send is refused rather than guessed at.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<SendResult> {
  if (!isAllowedTelegramTarget(chatId)) {
    return { ok: false, error: "recipient not allowed — self-only allowlist" };
  }
  // Safe after the guard: it only admits the self target or an empty string.
  const target = chatId.trim() || (selfTelegramTarget() as string);
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: "no TELEGRAM_BOT_TOKEN configured" };
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: target, text }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `telegram api ${res.status}` };
    }
    const id = data.result?.message_id;
    return { ok: true, messageId: id != null ? String(id) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
