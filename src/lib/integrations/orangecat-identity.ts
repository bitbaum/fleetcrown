/**
 * OrangeCat identity bridge — per-user access tokens from "Login with OrangeCat".
 *
 * When a user signs in (or connects) with OrangeCat, the Auth.js adapter stores
 * the OIDC token set on their `accounts` row (provider = "orangecat"). Those
 * tokens carry the one-consent capability scopes (project.write,
 * timeline.write, …), so acting on OrangeCat AS THE USER means presenting that
 * access token — not the studio-wide ORANGECAT_API_KEY service key.
 *
 * OrangeCat rotates refresh tokens on every use (the old one is revoked), so a
 * successful refresh MUST persist both new tokens before returning; losing the
 * new refresh token strands the link until the user signs in again.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";

const ISSUER = process.env.ORANGECAT_OAUTH_ISSUER ?? "https://orangecat.ch";
/** Refresh when less than this many seconds of validity remain. */
const EXPIRY_SLACK_SECS = 60;

export interface OrangeCatLink {
  /** The user's OrangeCat actor id (OIDC sub). */
  actorId: string;
  /** A currently-valid access token for OC API calls. */
  accessToken: string;
}

/**
 * Resolve a valid OrangeCat access token for a FleetCrown user, refreshing
 * (with rotation) when expired. Returns null when the user has never linked
 * OrangeCat or the link is broken (revoked / failed refresh) — callers treat
 * null as "feature unavailable", never as an error.
 */
export async function getOrangeCatLink(userId: string): Promise<OrangeCatLink | null> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, "orangecat")),
  });
  if (!account?.access_token) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at > nowSecs + EXPIRY_SLACK_SECS) {
    return { actorId: account.providerAccountId, accessToken: account.access_token };
  }

  if (!account.refresh_token) return null;

  const clientId = process.env.ORANGECAT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ORANGECAT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(`${ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn("[orangecat-identity] token refresh failed", {
        userId,
        status: res.status,
      });
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;

    // Persist BEFORE returning — OC revoked the old refresh token the moment
    // it was used, so this write is what keeps the link alive.
    await db
      .update(accounts)
      .set({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? account.refresh_token,
        expires_at: data.expires_in ? nowSecs + data.expires_in : null,
      })
      .where(
        and(eq(accounts.provider, "orangecat"), eq(accounts.providerAccountId, account.providerAccountId)),
      );

    return { actorId: account.providerAccountId, accessToken: data.access_token };
  } catch (err) {
    console.warn("[orangecat-identity] token refresh errored", { userId, err });
    return null;
  }
}

/** True when the user has a linked OrangeCat actor (cheap column check). */
export async function isOrangeCatLinked(userId: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { orangecatActorId: true },
  });
  return Boolean(row?.orangecatActorId);
}
