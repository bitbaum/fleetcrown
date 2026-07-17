/**
 * OAuth 1.0a "Sign in with X" — minimal, dependency-free implementation.
 *
 * Why this exists: X's OAuth 2.0 authorize endpoint (`/i/oauth2/authorize`)
 * returns 503 for Pay-Per-Use projects sitting at $0 credits (a known X-side
 * regression after the Free-tier deprecation). The legacy OAuth 1.0a
 * "Sign in with Twitter" flow (`/oauth/request_token` → `/oauth/authenticate`
 * → `/oauth/access_token`) still works for free, so login uses that instead.
 *
 * Auth.js v5 / @auth/core 0.41.2 dropped OAuth 1.0a support entirely, so the
 * 3-legged dance is hand-rolled here and bridged into a session via a
 * Credentials provider (see auth.ts `x-1a`). Endpoints: src/app/api/x-login/*.
 */
import crypto from "crypto";
import { HTTP_TIMEOUT_SHORT_MS } from "@/lib/constants/time";

const CONSUMER_KEY = process.env.X1_CONSUMER_KEY ?? "";
const CONSUMER_SECRET = process.env.X1_CONSUMER_SECRET ?? "";
const API = "https://api.x.com";

/** True when the X1 consumer credentials are configured (gates the UI button). */
export function x1Enabled(): boolean {
  return Boolean(CONSUMER_KEY && CONSUMER_SECRET);
}

// RFC 3986 percent-encoding (stricter than encodeURIComponent for OAuth).
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function sign(method: string, url: string, params: Record<string, string>, tokenSecret = ""): string {
  const paramStr = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join("&");
  const base = [method, enc(url), enc(paramStr)].join("&");
  const key = `${enc(CONSUMER_SECRET)}&${enc(tokenSecret)}`;
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

function authHeader(params: Record<string, string>): string {
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => `${enc(k)}="${enc(params[k])}"`)
      .join(", ")
  );
}

function baseOauth(): Record<string, string> {
  return {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
}

/** Step 1: obtain a request token. `callbackUrl` must be whitelisted in the X app. */
export async function requestToken(callbackUrl: string): Promise<{ oauth_token: string; oauth_token_secret: string }> {
  const url = `${API}/oauth/request_token`;
  const params: Record<string, string> = { ...baseOauth(), oauth_callback: callbackUrl };
  params.oauth_signature = sign("POST", url, params);
  // Login path — a hung X API must fail fast with a clear error, not stall the sign-in.
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(params) },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
  }).catch(() => {
    throw new Error("request_token timed out — X API unreachable");
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`request_token ${res.status}: ${text.slice(0, 200)}`);
  const p = new URLSearchParams(text);
  const oauth_token = p.get("oauth_token");
  const oauth_token_secret = p.get("oauth_token_secret");
  if (!oauth_token || !oauth_token_secret) throw new Error(`request_token malformed: ${text.slice(0, 200)}`);
  return { oauth_token, oauth_token_secret };
}

/** Step 3: exchange the verifier for an access token + the user's X id and handle. */
export async function accessToken(
  oauthToken: string,
  oauthTokenSecret: string,
  verifier: string,
): Promise<{ user_id: string; screen_name: string }> {
  const url = `${API}/oauth/access_token`;
  const params: Record<string, string> = { ...baseOauth(), oauth_token: oauthToken, oauth_verifier: verifier };
  params.oauth_signature = sign("POST", url, params, oauthTokenSecret);
  // Login path — fail fast (see requestToken).
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(params) },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
  }).catch(() => {
    throw new Error("access_token timed out — X API unreachable");
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`access_token ${res.status}: ${text.slice(0, 200)}`);
  const p = new URLSearchParams(text);
  const user_id = p.get("user_id");
  const screen_name = p.get("screen_name");
  if (!user_id || !screen_name) throw new Error(`access_token malformed: ${text.slice(0, 200)}`);
  return { user_id, screen_name };
}

// --- One-time login ticket (bridges the 1.0a callback → Credentials sign-in) ---
// Signed with AUTH_SECRET so only our callback route can mint a valid ticket;
// the Credentials provider verifies it before establishing a session.

type TicketData = { xId: string; handle: string };

// Never sign/verify with an empty or whitespace-corrupted key. A blank
// AUTH_SECRET would make tickets forgeable with a known (empty) key; a
// trailing "\n" (the recurring env-corruption bug) would make valid tickets
// silently fail to verify. Fail loud instead.
function ticketSecret(): string {
  const secret = (process.env.AUTH_SECRET ?? "").trim();
  if (!secret) throw new Error("AUTH_SECRET is required to sign X login tickets");
  return secret;
}

export function mintTicket(data: TicketData): string {
  const secret = ticketSecret();
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + 120 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTicket(ticket: string): TicketData | null {
  try {
    const secret = ticketSecret();
    const [payload, sig] = ticket.split(".");
    if (!payload || !sig) return null;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as TicketData & { exp: number };
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (!data.xId || !data.handle) return null;
    return { xId: data.xId, handle: data.handle };
  } catch {
    return null;
  }
}
