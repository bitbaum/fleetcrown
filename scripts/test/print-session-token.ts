/**
 * Prints a session cookie value for automation (dogfood, curl).
 * Resolution order matches authenticated-smoke.ts (env → credentials → jwt-mint).
 */
import { config } from "dotenv";
import { smokeSessionToken } from "@/lib/brand-env";

config({ path: ".env.local", quiet: true });
config({ path: ".env.hetzner.local", quiet: true });

const BASE = (process.env.BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");

function sessionCookieName(): string {
  return BASE.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}

async function tryMintJwt(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) return null;
  const hetznerPassword = process.env.FLEETCROWN_DB_PASSWORD;
  const hetznerHost = process.env.HETZNER_IP;
  const isProd = BASE.includes("fleetcrown.orangecat.ch") || BASE.includes("orangecat.ch");
  const dbUrl =
    isProd && hetznerPassword && hetznerHost
      ? `postgres://fleetcrown:${encodeURIComponent(hetznerPassword)}@${hetznerHost}:5432/fleetcrown?sslmode=require`
      : process.env.DATABASE_URL;
  if (!dbUrl) return null;

  const postgres = (await import("postgres")).default;
  const sql = postgres(dbUrl, { max: 1 });
  try {
    const rows = await sql`
      SELECT id, email, name, username, onboarded_at
      FROM users
      WHERE is_default = true OR email IS NOT NULL
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `;
    const u = rows[0] as
      | {
          id: string;
          email: string | null;
          name: string | null;
          username: string | null;
          onboarded_at: Date | null;
        }
      | undefined;
    if (!u?.id) return null;

    const { encode } = await import("@auth/core/jwt");
    const token = await encode({
      token: {
        id: u.id,
        email: u.email,
        name: u.name,
        username: u.username,
        onboardedAt: u.onboarded_at,
        onboardingComplete: Boolean(u.username && u.onboarded_at),
        sub: u.id,
      },
      secret,
      salt: sessionCookieName(),
    });

    const probe = await fetch(`${BASE}/api/me`, {
      headers: { Cookie: `${sessionCookieName()}=${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    return probe.ok ? token : null;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

async function main() {
  const fromEnv = smokeSessionToken().trim();
  if (fromEnv) {
    process.stdout.write(fromEnv);
    return;
  }
  const minted = await tryMintJwt();
  if (!minted) {
    throw new Error("No session — set FLEETCROWN_SESSION_TOKEN or AUTH_SECRET + HETZNER_IP");
  }
  process.stdout.write(minted);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
