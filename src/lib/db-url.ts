/**
 * SSOT for Postgres connection URLs — vendor-neutral.
 *
 * Any hosted Postgres (Neon, Supabase pooler, self-hosted PgBouncer on
 * Hetzner) uses the same two env vars:
 *
 *   DATABASE_URL       — direct session (migrations, LISTEN/NOTIFY, drizzle-kit)
 *   DATABASE_POOL_URL  — pooled session for app queries (Vercel serverless)
 *
 * Local dev: set DATABASE_URL only (pool URL falls back to the same value).
 *
 * Legacy Neon names are still read for backward compatibility:
 *   NEON_DATABASE_URL_DIRECT → direct
 *   NEON_DATABASE_URL        → pool
 */

const LEGACY_DIRECT = () =>
  trimEnv(process.env.NEON_DATABASE_URL_DIRECT);

const LEGACY_POOL = () => trimEnv(process.env.NEON_DATABASE_URL);

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** Pooled URL for runtime queries (serverless-safe). */
export function getDatabasePoolUrl(): string {
  const url =
    trimEnv(process.env.DATABASE_POOL_URL) ??
    LEGACY_POOL() ??
    trimEnv(process.env.DATABASE_URL);
  if (!url) {
    throw new Error(
      "DATABASE_POOL_URL or DATABASE_URL is required (legacy: NEON_DATABASE_URL)",
    );
  }
  return url;
}

/**
 * Direct URL for DDL, LISTEN/NOTIFY, and migrations.
 * Never falls back to a pool URL — poolers break those features.
 */
export function getDatabaseDirectUrl(): string | undefined {
  return trimEnv(process.env.DATABASE_URL) ?? LEGACY_DIRECT();
}
