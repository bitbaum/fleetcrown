import { TELEGRAM_CHAT_ID } from "@/lib/constants";

export type SendResult = { ok: boolean; messageId?: string; error?: string };

const TELEGRAM_API = "https://api.telegram.org";

/**
 * George's own Telegram chat id — the ONLY allowed recipient in the self-only phase.
 * Sourced from TELEGRAM_CHAT_ID (env, via constants). Null when unset => no allowed
 * recipient => every send is blocked (fail-closed; we never guess a target).
 */
export function selfTelegramTarget(): string | null {
  return TELEGRAM_CHAT_ID?.trim() ? TELEGRAM_CHAT_ID.trim() : null;
}

/**
 * Self-only allowlist guardrail. In this slice Loki may send to George HIMSELF only.
 * A requested target is allowed iff it is empty (defaults to self) or equals the
 * configured self chat id. Any other recipient is refused until the allowlist is
 * deliberately widened — directly bounds the blast radius (no spamming real contacts).
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
 * The caller is responsible for the self-only allowlist check BEFORE calling this.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: "no TELEGRAM_BOT_TOKEN configured" };
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
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
