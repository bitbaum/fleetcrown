/**
 * Prints `name=value` for the private-zone unlock cookie, for automation.
 *
 * The prod smoke and the UI dogfood need /people, /habits, /money and /events.
 * Those sit behind the PIN gate, and a PIN is by design something only a human
 * holds — so the suite skipped them on every run and reported the skips as
 * failures, which looks like coverage and is not.
 *
 * The gate's real currency is an HMAC under AUTH_SECRET, not the PIN. Anything
 * holding AUTH_SECRET can already mint a session as any user (that is exactly
 * what print-session-token.ts does), so minting the unlock too grants no new
 * access — it only lets the tests see the half of the product they were blind
 * to. The PIN keeps guarding what it was built to guard: a person at a keyboard.
 *
 * Needs a session token and AUTH_SECRET; the user id comes from /api/me, so no
 * database and no SSH tunnel are required.
 *
 *   FLEETCROWN_SESSION_TOKEN=… npx tsx scripts/test/print-private-zone-cookie.ts
 */
import { config } from "dotenv";

import { smokeSessionToken } from "@/lib/brand-env";
import { privateZoneCookiePair } from "@/lib/private-zone-token";

config({ path: ".env.local", quiet: true });
config({ path: ".env.hetzner.local", quiet: true });

const BASE = (process.env.BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");

function sessionCookieName(): string {
  return BASE.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}

async function main() {
  const token = smokeSessionToken().trim();
  if (!token) throw new Error("No session — set FLEETCROWN_SESSION_TOKEN");
  if (!process.env.AUTH_SECRET?.trim())
    throw new Error("AUTH_SECRET is required to mint the unlock");

  const res = await fetch(`${BASE}/api/me`, {
    headers: { Cookie: `${sessionCookieName()}=${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`/api/me returned ${res.status} — session is not valid for ${BASE}`);
  const me = (await res.json()) as { id?: string };
  if (!me.id) throw new Error("/api/me returned no user id");

  process.stdout.write(privateZoneCookiePair(me.id));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
